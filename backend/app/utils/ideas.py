from app.core.database import db
from typing import List, Dict, Any

from app.models.schemas import Idea

async def get_idea_by_id(idea_id: str) -> Idea:
    """Helper function to fetch ideas for a given discussion ID from the database."""
    ideas = await db.ideas.findOne({"id": idea_id})
    return ideas


async def get_ideas_by_discussion_id(discussion_id: str) -> list:
    """Helper function to fetch all ideas for a given discussion ID from the database."""
    # Get ideas
    # ideas = await db.ideas.find({"discussion_id": discussion_id}).to_list(length=None)
    # Convert _id and handle potential datetime before returning
    # return [Idea(id=idea["_id"], **{k: v for k, v in idea.items() if k != '_id'}) for idea in ideas]
    return await db.ideas.find({"discussion_id": discussion_id}).to_list(length=None)
