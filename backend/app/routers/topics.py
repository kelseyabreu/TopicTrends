from fastapi import APIRouter, BackgroundTasks, Body, Depends
from typing import List
from app.services.genkit.ai import cluster_ideas_into_topics
from app.services.genkit.cluster import _map_ideas_for_output
from app.models.schemas import Topic, TopicIdPayload
from app.core.database import get_db
from app.routers.discussions import get_discussion_by_id_internal
import logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["topics"])

# Routes
@router.get("/discussions/{discussion_id}/topics", response_model=List[Topic])
async def get_discussion_topics(discussion_id: str, db=Depends(get_db)):
    """
    Get all topics for a discussion, dynamically fetching associated ideas
    for each topic instead of relying on embedded data.
    """
    logger.info(f"Fetching topics for discussion {discussion_id}")
    # 1. Validate discussion exists
    await get_discussion_by_id_internal(discussion_id)

    # 2. Fetch all topic documents for the discussion
    topic_docs = await db.topics.find({"discussion_id": discussion_id}).sort("_id", 1).to_list(length=None)

    results = []
    default_topic_id = f"{discussion_id}_new" # Define default ID

    # 3. Iterate through topic documents and fetch their associated ideas
    for topic_doc in topic_docs:
        topic_id = str(topic_doc["_id"])
        logger.debug(f"Processing topic: {topic_id} ('{topic_doc.get('representative_text')}')")

        # Fetch ideas belonging to this specific topic_id from the 'ideas' collection
        ideas_cursor = db.ideas.find({"topic_id": topic_id}).sort("timestamp", 1) # Sort ideas chronologically
        ideas_list = await ideas_cursor.to_list(length=None) # Fetch all ideas for this topic

        # 4. Map fetched ideas to the required output format
        # Use the existing helper function if suitable, ensure it maps _id correctly
        nested_ideas_data = _map_ideas_for_output(ideas_list)

        # 5. Construct the final Topic object using fetched data
        # Use the helper function for mapping topic doc to schema dict
        topic_data_for_pydantic = {
            "id": topic_id,
            "representative_idea_id": str(topic_doc.get("representative_idea_id")) if topic_doc.get("representative_idea_id") else None,
            "representative_text": topic_doc.get("representative_text", "Untitled Topic"),
            "count": len(ideas_list), # Use the *actual* count of fetched ideas
            "ideas": nested_ideas_data # Use the dynamically fetched & mapped ideas
        }

        try:
            # Validate and create the Pydantic model instance
            topic_model = Topic(**topic_data_for_pydantic)
            results.append(topic_model) # Add the validated model to results
        except Exception as e:
             logger.error(f"Pydantic validation failed for topic {topic_id} in get_discussion_topics: {e}. Skipping topic.", exc_info=True)
             # Skip adding this topic if validation fails

    # 6. Sort the final list (e.g., 'New Ideas' first, then by idea count)
    results.sort(key=lambda t: (
        0 if t.id == default_topic_id else 1, 
        -t.count 
    ))

    logger.info(f"Finished fetching and processing {len(results)} topics for discussion {discussion_id}")
    # FastAPI will handle serializing the list of Pydantic models
    return results


@router.post("/topics", response_model=List[dict]) 
async def create_topics(
        payload: TopicIdPayload, # Expect JSON object
        background_tasks: BackgroundTasks, # Keep BackgroundTasks import
        # Note: Drill-down clustering usually shouldn't run in background
        # Consider making this synchronous for drill-down.
):
    """
    Drill-down into an existing topic to generate sub-topics.
    Accepts {"topic_id": "..."} in the request body.
    Returns the generated sub-topic data without persisting it fully.
    """
    topic_id = payload.topic_id
    logger.info(f"Received request to drill-down cluster topic_id: {topic_id}")

    # Call clustering logic for drill-down (persist_results=False)
    # This call is synchronous in this implementation.
    sub_topic_results = await cluster_ideas_into_topics(topic_id=topic_id, persist_results=False)

    if sub_topic_results is None: # Handle potential errors from clustering
         logger.error(f"Sub-topic generation failed for topic_id: {topic_id}")
         # Return an empty list or raise an appropriate HTTP error
         # Returning empty list might be preferred by frontend expecting a list
         return []
         # Or raise HTTPException(status_code=500, detail="Sub-topic generation failed.")

    # Check if the result indicates an error (based on the example in generate_topic_results error handling)
    if sub_topic_results and isinstance(sub_topic_results, list) and len(sub_topic_results) > 0 and sub_topic_results[0].get("error"):
        logger.error(f"Sub-topic generation returned an error for {topic_id}: {sub_topic_results[0]['error']}")
        # Return empty list or raise
        return []
        # Or raise HTTPException(status_code=500, detail=sub_topic_results[0]['error'])


    # --- Return the list directly, matching response_model=List[dict] ---
    logger.info(f"Returning {len(sub_topic_results)} generated sub-topics for topic {topic_id}")
    return sub_topic_results
