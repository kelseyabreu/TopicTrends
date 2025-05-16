from app.core.database import get_db
from app.models.ai_schemas import FormattedIdea
from app.models.schemas import Discussion, Idea
from app.services.genkit.flows.format_idea import format_idea_flow
from app.services.genkit.embedders.idea_embedder import embed_idea
from app.core.socketio import sio
from app.services.genkit.centroid_clustering import CentroidClustering
import logging
logger = logging.getLogger(__name__)

async def _get_discussion_by_id(discussion_id: str) -> Discussion | None:
    """Retrieve discussion by ID and return as a Discussion object"""
    try:
        print(f"_get_discussion_by_id: {discussion_id}")
        db = await get_db()
        try:
            discussion_data = await db.discussions.find_one({"_id": discussion_id})
            
            if discussion_data:
                try:
                    # Convert MongoDB _id to id for Pydantic model compatibility
                    discussion_data["id"] = discussion_data["_id"]
                    del discussion_data["_id"]  # Remove the original _id field
                    
                    return Discussion(**discussion_data)  # Convert to Discussion type
                except Exception as conversion_error:
                    logger.error(f"Error converting discussion data: {str(conversion_error)}")
                    print(f"Error converting discussion data: {str(conversion_error)}")
                    raise RuntimeError(f"Failed to convert discussion data: {str(conversion_error)}") from conversion_error
            return None
            
        except Exception as db_error:
            logger.error(f"Database error while fetching discussion: {str(db_error)}")
            print(f"Database error while fetching discussion: {str(db_error)}")
            raise RuntimeError(f"Failed to fetch discussion from database: {str(db_error)}") from db_error
            
    except Exception as e:
        logger.error(f"Unexpected error in _get_discussion_by_id: {str(e)}")
        print(f"Unexpected error in _get_discussion_by_id: {str(e)}")
        raise RuntimeError(f"Failed to get discussion: {str(e)}") from e


async def _upsert_formatted_idea(idea: dict, formatted_idea: FormattedIdea):
    """ Function to upsert formatted idea into the database"""
    db = await get_db()
    
    # Create a copy of the original idea dict
    combined_idea = idea.copy()
    
    # Update with formatted idea data
    formatted_data = dict(formatted_idea)
    print(f'Updating with combined idea: {combined_idea}')
    combined_idea.update(formatted_data)
    
    # Add embedding to the combined data
    # Get text from formatted_idea directly since it's a FormattedIdea object
    idea_text = combined_idea.get("text") if combined_idea else None
    print(f'Text being embedded: {idea_text}')  # Debug print
    combined_idea["embedding"] = await embed_idea(idea_text)
    # TODO: Optimize embeddings for saving in the database
    
    logging.info("Saving combined idea with ID: %s", combined_idea["_id"])
    
    await db.ideas.update_one(
        {"_id": idea["_id"]},
        {"$set": combined_idea},
        upsert=True
    )
    await find_ideas_main_idea(combined_idea, combined_idea["discussion_id"])

async def find_ideas_main_idea(idea: dict, discussion_id: str):
    clustering = CentroidClustering(similarity_threshold=0.65) 
    await clustering.process_idea(
        embedding=idea['embedding'],
        idea=idea,
        discussion_id=discussion_id
    )

async def process_idea(idea_data:dict, discussion_id: str):
    """
    Process an idea using a generative AI model.
    """
    try:
        # Validate input data
        if not idea_data.get("text"):
            raise ValueError("Idea text cannot be empty")

        try:
            # Format the idea using the discussion's title and description
            discussion: Discussion = await _get_discussion_by_id(discussion_id)
            print(f"The Gotten Discussion: {discussion.id}")

            if not discussion:
                raise ValueError(f"Discussion with ID {discussion_id} not found")

            try:
                # Format the idea
                formatted_idea: FormattedIdea = await format_idea_flow(
                    idea_data["text"], 
                    f"Title:{discussion.title} - Description: {discussion.prompt}",
                )
                print(f"FormattedIdea? {formatted_idea}")

                try:
                    # Save and process the formatted idea
                    await _upsert_formatted_idea(idea_data, formatted_idea)
                except Exception as db_error:
                    logger.error(f"Database error while upserting idea: {str(db_error)}")
                    raise RuntimeError(f"Failed to save idea to database: {str(db_error)}") from db_error

            except Exception as format_error:
                logger.error(f"Error formatting idea: {str(format_error)}")
                raise RuntimeError(f"Failed to format idea: {str(format_error)}") from format_error

        except ValueError as ve:
            # Re-raise ValueError for discussion not found
            raise
        except Exception as discussion_error:
            logger.error(f"Error retrieving discussion: {str(discussion_error)}")
            raise RuntimeError(f"Failed to retrieve discussion: {str(discussion_error)}") from discussion_error

    except ValueError as ve:
        # Handle validation errors
        logger.error(f"Validation error: {str(ve)}")
        raise
    except Exception as e:
        # Handle any unexpected errors
        logger.error(f"Unexpected error processing idea: {str(e)}")
        raise RuntimeError(f"Failed to process idea: {str(e)}") from e

