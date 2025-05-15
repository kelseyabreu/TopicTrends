from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List, Dict, Any, Annotated
import logging
from app.core.limiter import limiter
from app.core.config import settings
from app.core.database import get_db
from app.services.auth import verify_token_cookie
from datetime import timedelta, datetime, timezone

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

@router.get("/me/discussions")
@limiter.limit("50/minute")
async def get_current_user_discussions(
    request: Request,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """Get all discussions created by the current authenticated user."""
    user_id = str(current_user["_id"])
    db = await get_db()
    
    try:
        # Fetch discussions created by this user
        discussions_cursor = db.discussions.find({"creator_id": user_id})
        discussions_list = await discussions_cursor.to_list(None)
        
        # Process discussions to match expected format
        processed_discussions = []
        for discussion in discussions_list:
            processed_discussion = {
                "id": str(discussion["_id"]),
                "title": discussion.get("title", "Untitled Discussion"),
                "prompt": discussion.get("prompt", ""),
                "require_verification": discussion.get("require_verification", False),
                "idea_count": discussion.get("idea_count", 0),
                "topic_count": discussion.get("topic_count", 0),
                "creator_id": discussion.get("creator_id"),
                "created_at": discussion.get("created_at", datetime.now(timezone.utc)).isoformat(),
                "last_activity": discussion.get("last_activity", discussion.get("created_at")).isoformat() if discussion.get("last_activity") else None,
                "join_link": discussion.get("join_link"),
                "qr_code": None  # Don't send QR code data to reduce payload size
            }
            processed_discussions.append(processed_discussion)
            
        logger.info(f"User {user_id} fetched {len(processed_discussions)} discussions they created")
        
        return {
            "discussions": processed_discussions
        }
        
    except Exception as e:
        logger.error(f"Error fetching discussions for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve user discussions."
        )

@router.get("/me/stats")
@limiter.limit("50/minute")
async def get_current_user_stats(
    request: Request,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """Get participation statistics for the current authenticated user."""
    user_id = str(current_user["_id"])
    db = await get_db()
    
    try:
        # Get count of ideas submitted by this user
        ideas_count = await db.ideas.count_documents({"user_id": user_id})
        
        # Get count of discussions created by this user
        created_discussions_count = await db.discussions.count_documents({"creator_id": user_id})
        
        # Get count of discussions participated in
        ideas_cursor = db.ideas.find({"user_id": user_id}, {"discussion_id": 1})
        ideas_list = await ideas_cursor.to_list(None)
        participated_discussions = set(idea.get("discussion_id") for idea in ideas_list if idea.get("discussion_id"))
        participated_discussions_count = len(participated_discussions)
        
        # Get count of ideas that have been clustered
        clustered_ideas_count = await db.ideas.count_documents({
            "user_id": user_id,
            "topic_id": {"$exists": True, "$ne": None}
        })
        
        clustering_rate = round((clustered_ideas_count / ideas_count) * 100) if ideas_count > 0 else 0
        
        # Get activity over time (ideas submitted per day)
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$project": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}
            }},
            {"$group": {
                "_id": "$date",
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        activity_cursor = db.ideas.aggregate(pipeline)
        activity_data = await activity_cursor.to_list(None)
        
        stats = {
            "total_ideas": ideas_count,
            "clustered_ideas": clustered_ideas_count,
            "clustering_rate": clustering_rate,
            "created_discussions": created_discussions_count,
            "participated_discussions": participated_discussions_count,
            "activity_by_date": {item["_id"]: item["count"] for item in activity_data}
        }
        
        logger.info(f"Generated statistics for user {user_id}")
        return stats
        
    except Exception as e:
        logger.error(f"Error generating stats for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate user statistics."
        )

@router.get("/me/engagement")
@limiter.limit("30/minute")
async def get_current_user_engagement(
    request: Request,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """Get engagement analytics for the current authenticated user."""
    user_id = str(current_user["_id"])
    db = await get_db()
    
    try:
        # Get all discussions the user has visited (from ideas collection)
        ideas_cursor = db.ideas.find({"user_id": user_id})
        ideas_list = await ideas_cursor.to_list(None)
        
        # Extract discussion IDs and timestamps
        user_discussions = {}
        for idea in ideas_list:
            discussion_id = idea.get("discussion_id")
            if not discussion_id:
                continue
                
            # Track first idea timestamp per discussion
            timestamp = idea.get("timestamp")
            if isinstance(timestamp, str):
                try:
                    timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                except:
                    timestamp = None
            
            if discussion_id not in user_discussions or (
                timestamp and user_discussions[discussion_id]["first_idea_time"] > timestamp
            ):
                user_discussions[discussion_id] = {
                    "first_idea_time": timestamp,
                    "ideas_count": 0
                }
            
            user_discussions[discussion_id]["ideas_count"] += 1
        
        # Get all discussions to calculate participation rate
        # We'll consider a "browsed" discussion to be any discussion created by someone else
        # that the user has viewed (this would require client-side tracking, so for now
        # we'll use a simpler metric: all discussions in the system vs. participated discussions)
        all_discussions_count = await db.discussions.count_documents({})
        participated_discussions_count = len(user_discussions)
        
        participation_rate = round((participated_discussions_count / max(all_discussions_count, 1)) * 100, 1)
        
        # Get the user's first access time for each discussion
        # This would ideally come from a "views" or "visits" collection that tracks when users first
        # view a discussion, but since that's not currently implemented, we'll estimate from
        # the created_at timestamp of discussions created by the user, and for other discussions,
        # we'll use the first idea timestamp minus a small buffer (assuming they viewed it shortly before submitting)
        
        # First get discussions created by the user
        created_discussions_cursor = db.discussions.find(
            {"creator_id": user_id},
            {"_id": 1, "created_at": 1}
        )
        created_discussions = await created_discussions_cursor.to_list(None)
        
        for disc in created_discussions:
            disc_id = str(disc["_id"])
            if disc_id in user_discussions:
                user_discussions[disc_id]["first_view_time"] = disc.get("created_at")
        
        # For discussions not created by the user, estimate view time as 5 minutes before first idea
        for disc_id, disc_data in user_discussions.items():
            if "first_view_time" not in disc_data and disc_data["first_idea_time"]:
                disc_data["first_view_time"] = disc_data["first_idea_time"] - timedelta(minutes=5)
        
        # Calculate average response time (time between viewing and first idea)
        response_times = []
        for disc_data in user_discussions.values():
            if disc_data.get("first_view_time") and disc_data.get("first_idea_time"):
                # Calculate time difference in minutes
                time_diff = (disc_data["first_idea_time"] - disc_data["first_view_time"]).total_seconds() / 60
                if time_diff >= 0:  # Only include positive time differences
                    response_times.append(time_diff)
        
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        # Generate activity heatmap data (ideas per day)
        # Group ideas by day and count
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$project": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}
            }},
            {"$group": {
                "_id": "$date",
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        activity_cursor = db.ideas.aggregate(pipeline)
        activity_by_day = await activity_cursor.to_list(None)
        
        # Format activity data for heatmap
        # Create a structure with year, month, day, and count
        heatmap_data = []
        for item in activity_by_day:
            try:
                date_parts = item["_id"].split("-")
                if len(date_parts) == 3:
                    year, month, day = date_parts
                    heatmap_data.append({
                        "date": item["_id"],
                        "year": int(year),
                        "month": int(month),
                        "day": int(day),
                        "count": item["count"]
                    })
            except Exception as e:
                logger.warning(f"Error parsing date {item['_id']}: {e}")
        
        # Calculate max count for scaling heatmap intensity
        max_count = max([item["count"] for item in heatmap_data]) if heatmap_data else 1
        
        # Return engagement data
        engagement_data = {
            "participation_rate": participation_rate,
            "participated_discussions": participated_discussions_count,
            "total_discussions": all_discussions_count,
            "avg_response_time_minutes": round(avg_response_time, 1),
            "activity_heatmap": {
                "data": heatmap_data,
                "max_count": max_count
            }
        }
        
        logger.info(f"Generated engagement analytics for user {user_id}")
        return engagement_data
        
    except Exception as e:
        logger.error(f"Error generating engagement analytics for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate engagement analytics."
        )