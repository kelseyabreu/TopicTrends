from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List, Dict, Any, Annotated
import logging
from app.core.limiter import limiter
from app.core.config import settings
from app.core.database import get_db
from app.services.auth import verify_token_cookie
from datetime import datetime, timezone

# Set up logger
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me/ideas")
@limiter.limit("50/minute")
async def get_current_user_ideas(
    request: Request,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """Get all ideas submitted by the current authenticated user."""
    user_id = str(current_user["_id"])
    db = await get_db()
    
    try:
        # Fetch all ideas by this user
        ideas_cursor = db.ideas.find({"user_id": user_id})
        ideas_list = await ideas_cursor.to_list(None)
        
        # Extract unique discussion IDs
        discussion_ids = set(idea.get("discussion_id") for idea in ideas_list if idea.get("discussion_id"))
        
        # Fetch all related discussions in one query
        discussions_cursor = db.discussions.find({"_id": {"$in": list(discussion_ids)}})
        discussions_list = await discussions_cursor.to_list(None)
        
        # Map discussions by ID for easier access
        discussions_map = {str(d["_id"]): d for d in discussions_list}
        
        # Process ideas to match expected format
        processed_ideas = []
        for idea in ideas_list:
            idea_id = str(idea["_id"])
            processed_idea = {
                "id": idea_id,
                "text": idea.get("text", ""),
                "user_id": user_id,
                "verified": idea.get("verified", False),
                "timestamp": idea.get("timestamp", datetime.now(timezone.utc)).isoformat(),
                "topic_id": idea.get("topic_id"),
                "discussion_id": idea.get("discussion_id"),
                "submitter_display_id": idea.get("submitter_display_id", current_user.get("username", "Anonymous")),
                "intent": idea.get("intent"),
                "sentiment": idea.get("sentiment"),
                "specificity": idea.get("specificity"),
                "keywords": idea.get("keywords", []),
                "related_topics": idea.get("related_topics", []),
                "on_topic": idea.get("on_topic")
            }
            processed_ideas.append(processed_idea)
            
        # Process discussions to match expected format
        processed_discussions = []
        for d_id, discussion in discussions_map.items():
            processed_discussion = {
                "id": d_id,
                "title": discussion.get("title", "Untitled Discussion"),
                "prompt": discussion.get("prompt", ""),
                "require_verification": discussion.get("require_verification", False),
                "idea_count": discussion.get("idea_count", 0),
                "topic_count": discussion.get("topic_count", 0),
                "creator_id": discussion.get("creator_id"),
                "created_at": discussion.get("created_at", datetime.now(timezone.utc)).isoformat(),
                "last_activity": discussion.get("last_activity", datetime.now(timezone.utc)).isoformat() if discussion.get("last_activity") else None,
                "join_link": discussion.get("join_link"),
                "qr_code": None 
            }
            processed_discussions.append(processed_discussion)
            
        logger.info(f"User {user_id} fetched {len(processed_ideas)} ideas across {len(processed_discussions)} discussions")
        
        return {
            "ideas": processed_ideas,
            "discussions": processed_discussions
        }
        
    except Exception as e:
        logger.error(f"Error fetching ideas for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve user ideas."
        )