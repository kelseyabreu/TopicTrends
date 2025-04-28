from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from typing import List
import uuid
from datetime import datetime
import logging
logger = logging.getLogger(__name__)

from app.routers.discussions import get_discussion_by_id
from app.core.database import get_db
from app.models.schemas import Idea, IdeaSubmit
from app.services.genkit.ai import cluster_ideas_into_topics, background_ai_processes

# Create router
router = APIRouter(tags=["ideas"])


# Routes
@router.post("/discussions/{discussion_id}/ideas")
async def submit_idea(
        discussion_id: str,
        idea: IdeaSubmit,
        background_tasks: BackgroundTasks
):
    """Submit a new idea to a discussion"""
    db = await get_db()
    # Validate discussion exists

    discussion = await get_discussion_by_id(discussion_id)
    logging.info("Submitting idea for discussion %s", discussion_id)

    # Validate verification if required
    if discussion["require_verification"] and not idea.verified:
        raise HTTPException(
            status_code=400,
            detail="Verification required for this discussion"
        )

    # Create idea with string ID instead of UUID object
    idea_id = uuid.uuid4()
    idea_data = {
        "_id": str(idea_id),  # Convert UUID to string
        "discussion_id": discussion_id,
        "text": idea.text,
        "user_id": idea.user_id,
        "verified": idea.verified,
        "verification_method": idea.verification_method,
        "timestamp": datetime.now(),
        "topic_id": None  # Will be assigned during processing
    }

    await db.ideas.insert_one(idea_data)
    logging.info("Idea submitted with ID: %s", idea_id)

    # Increment idea count
    await db.discussions.update_one(
        {"_id": discussion_id},
        {"$inc": {"idea_count": 1}}
    )

    # Trigger topic processing in the background
    background_tasks.add_task(background_ai_processes, discussion_id, idea_data)

    return {"id": str(idea_id), "message": "Idea submitted successfully"}


@router.get("/discussions/{discussion_id}/ideas", response_model=List[Idea])
async def get_discussion_ideas(discussion_id: str):
    """Get all ideas for a discussion"""
    db = await get_db()
    
    # Validate discussion exists
    await get_discussion_by_id(discussion_id)

    # Get ideas
    ideas = await db.ideas.find({"discussion_id": discussion_id}).to_list(length=None)
    # Convert _id and handle potential datetime before returning
    return [Idea(id=idea["_id"], **{k: v for k, v in idea.items() if k != '_id'}) for idea in ideas]