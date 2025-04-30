from app.core.database import get_db
from app.models.ai_schemas import FormattedIdea
from app.models.schemas import Discussion
from app.services.genkit.flows.format_idea import format_idea_flow
from app.core.socketio import sio


async def _get_discussion_by_id(discussion_id: str) -> Discussion | None:
    """Retrieve discussion by ID and return as a Discussion object"""
    print(f"_get_discussion_by_id: {discussion_id}")
    db = await get_db()
    discussion_data = await db.discussions.find_one({"_id": discussion_id})

    if discussion_data:
        # Convert MongoDB _id to id for Pydantic model compatibility
        discussion_data["id"] = discussion_data["_id"]
        del discussion_data["_id"]  # Remove the original _id field

        return Discussion(**discussion_data)  # Convert to Discussion type
    return None


async def _upsert_formatted_idea(idea, formatted_idea: FormattedIdea):
    """ Function to upsert formatted idea into the database"""
    # This function should insert or update the formatted idea in the database
    db = await get_db()

    await db.ideas.update_one(
        {"_id": idea["_id"]},
        {"$set": formatted_idea},
        upsert=True
    )


async def process_idea(idea_data, discussion_id: str):
    """
    Process an idea using a generative AI model.
    """
    if not idea_data["text"]:
        raise ValueError("Idea text cannot be empty")

    # Format the idea using the discussion's title and description
    discussion = await _get_discussion_by_id(discussion_id)
    print(f"The Gotten Discussion: {discussion}")

    # Make sure discussion was found
    if not discussion:
        raise ValueError(f"Discussion with ID {discussion_id} not found")

    formatted_idea: FormattedIdea = await format_idea_flow(idea_data["text"], f"Title:{discussion.title} - Description: {discussion.prompt}")
    # await sio.emit(
    #     "idea_processed",
    #     {"idea_id": idea["id"], "formatted_idea": formatted_idea.model_dump()},
    #     room=discussion_id
    # )

    return await _upsert_formatted_idea(idea_data, formatted_idea)

