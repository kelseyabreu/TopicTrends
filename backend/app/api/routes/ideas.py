from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List
from datetime import datetime
import uuid

from app.models.schemas import Idea, IdeaSubmit
from app.core.database import db
from app.api.routes.sessions import get_session_by_id
from app.services.clustering import process_clusters

# Create router
router = APIRouter(tags=["ideas"])

# Routes
@router.post("/sessions/{session_id}/ideas")
async def submit_idea(
    session_id: str,
    idea: IdeaSubmit,
    background_tasks: BackgroundTasks
):
    """Submit a new idea to a session"""
    # Validate session exists
    session = await get_session_by_id(session_id)

    # Validate verification if required
    if session["require_verification"] and not idea.verified:
        raise HTTPException(
            status_code=400,
            detail="Verification required for this session"
        )

    # Create idea with string ID instead of UUID object
    idea_id = uuid.uuid4()
    idea_data = {
        "_id": str(idea_id),  # Convert UUID to string
        "session_id": session_id,
        "text": idea.text,
        "user_id": idea.user_id,
        "verified": idea.verified,
        "verification_method": idea.verification_method,
        "timestamp": datetime.utcnow(),
        "cluster_id": None  # Will be assigned during processing
    }

    await db.ideas.insert_one(idea_data)

    # Increment idea count
    await db.sessions.update_one(
        {"_id": session_id},
        {"$inc": {"idea_count": 1}}
    )

    # Trigger cluster processing in background
    background_tasks.add_task(process_clusters, session_id)

    return {"id": str(idea_id), "message": "Idea submitted successfully"}

@router.get("/sessions/{session_id}/ideas", response_model=List[Idea])
async def get_session_ideas(session_id: str):
    """Get all ideas for a session"""
    # Validate session exists
    await get_session_by_id(session_id)

    # Get ideas
    ideas = await db.ideas.find({"session_id": session_id}).to_list(length=None)
    # Convert _id and handle potential datetime before returning
    return [Idea(id=idea["_id"], **{k: v for k, v in idea.items() if k != '_id'}) for idea in ideas]