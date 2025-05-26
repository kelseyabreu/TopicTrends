# app/api/analytics.py

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from app.core.database import get_db
from app.services.auth import verify_token_cookie
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/participation")
async def get_participation_metrics(
    discussion_id: str,
    db = Depends(get_db),
    current_user: dict = Depends(verify_token_cookie)
):
    """Get participation metrics for a discussion"""
    try:
        # Get total ideas count
        total_ideas = await db.ideas.count_documents({"discussion_id": discussion_id})
        
        # Get unique participants using aggregation
        pipeline = [
            {"$match": {"discussion_id": discussion_id}},
            {"$group": {"_id": "$user_id"}},
            {"$count": "unique_users"}
        ]
        result = await db.ideas.aggregate(pipeline).to_list(1)
        unique_users = result[0]["unique_users"] if result else 0
        
        # Count unique anonymous users
        anon_pipeline = [
            {"$match": {"discussion_id": discussion_id, "anonymous_user_id": {"$ne": None}}},
            {"$group": {"_id": "$anonymous_user_id"}},
            {"$count": "unique_anon_users"}
        ]
        anon_result = await db.ideas.aggregate(anon_pipeline).to_list(1)
        unique_anon_users = anon_result[0]["unique_anon_users"] if anon_result else 0
        
        # Total unique participants (registered + anonymous)
        total_unique_participants = unique_users + unique_anon_users
        
        # Get verified vs anonymous counts
        verified_count = await db.ideas.count_documents({
            "discussion_id": discussion_id,
            "user_id": {"$ne": None}
        })
        
        anonymous_count = await db.ideas.count_documents({
            "discussion_id": discussion_id,
            "user_id": None
        })
        
        # Calculate ideas per user
        ideas_per_user = total_ideas / total_unique_participants if total_unique_participants > 0 else 0
        
        return {
            "total_ideas": total_ideas,
            "unique_participants": total_unique_participants,
            "ideas_per_user": round(ideas_per_user, 2),
            "verified_ideas": verified_count,
            "anonymous_ideas": anonymous_count,
            "verified_ratio": round(verified_count / total_ideas, 2) if total_ideas > 0 else 0
        }
    except Exception as e:
        logger.error(f"Error getting participation metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get participation metrics")

@router.get("/topics")
async def get_topic_analytics(
    discussion_id: str,
    db = Depends(get_db),
    current_user: dict = Depends(verify_token_cookie)
):
    """Get topic distribution and clustering metrics"""
    try:
        # Get all topics for the discussion
        topics = await db.topics.find(
            {"discussion_id": discussion_id},
            {"_id": 1, "representative_text": 1, "count": 1}
        ).to_list(None)
        
        # Format topic distribution data
        topic_distribution = []
        for topic in topics:
            topic_distribution.append({
                "topic_id": str(topic["_id"]),
                "topic": topic.get("representative_text", "Untitled Topic"),
                "idea_count": topic.get("count", 0)
            })
        
        # Sort by idea count descending
        topic_distribution.sort(key=lambda x: x["idea_count"], reverse=True)
        
        # Get unclustered ideas count
        unclustered_count = await db.ideas.count_documents({
            "discussion_id": discussion_id,
            "topic_id": None
        })
        
        # Get total ideas
        total_ideas = await db.ideas.count_documents({"discussion_id": discussion_id})
        
        # Calculate average ideas per topic
        total_topics = len(topic_distribution)
        avg_ideas_per_topic = (total_ideas - unclustered_count) / total_topics if total_topics > 0 else 0
        
        return {
            "topic_distribution": topic_distribution,
            "total_topics": total_topics,
            "unclustered_ideas": unclustered_count,
            "unclustered_ratio": round(unclustered_count / total_ideas, 2) if total_ideas > 0 else 0,
            "avg_ideas_per_topic": round(avg_ideas_per_topic, 2)
        }
    except Exception as e:
        logger.error(f"Error getting topic analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get topic analytics")

@router.get("/realtime")
async def get_realtime_metrics(
    discussion_id: str,
    db = Depends(get_db),
    current_user: dict = Depends(verify_token_cookie)
):
    """Get real-time engagement metrics"""
    try:
        now = datetime.now(timezone.utc)
        last_hour = now - timedelta(hours=1)
        last_24h = now - timedelta(hours=24)
        
        # Active users in last hour (handle both registered and anonymous)
        active_users_pipeline = [
            {"$match": {
                "discussion_id": discussion_id,
                "timestamp": {"$gte": last_hour}
            }},
            {"$group": {
                "_id": {
                    "$cond": [
                        {"$ne": ["$user_id", None]},
                        "$user_id",
                        "$anonymous_user_id"
                    ]
                }
            }},
            {"$match": {"_id": {"$ne": None}}},  # Filter out null IDs
            {"$count": "active_users"}
        ]
        active_users_result = await db.ideas.aggregate(active_users_pipeline).to_list(1)
        active_users = active_users_result[0]["active_users"] if active_users_result else 0
        
        # Ideas in last hour
        recent_ideas = await db.ideas.count_documents({
            "discussion_id": discussion_id,
            "timestamp": {"$gte": last_hour}
        })
        
        # Hourly submission rate (last 24h) - Fixed to include all hours
        hourly_pipeline = [
            {"$match": {
                "discussion_id": discussion_id,
                "timestamp": {"$gte": last_24h}
            }},
            {"$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%dT%H:00:00Z",
                        "date": "$timestamp",
                        "timezone": "UTC"  # Ensure UTC timezone
                    }
                },
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}},
            {"$project": {
                "hour": "$_id",
                "ideas": "$count",
                "_id": 0
            }}
        ]
        hourly_data = await db.ideas.aggregate(hourly_pipeline).to_list(None)
        
        # Fill in missing hours with 0 ideas
        if hourly_data:
            # Generate all hours in the last 24h
            all_hours = []
            current_hour = last_24h.replace(minute=0, second=0, microsecond=0)
            while current_hour <= now:
                all_hours.append(current_hour.strftime("%Y-%m-%dT%H:00:00Z"))
                current_hour += timedelta(hours=1)
            
            # Create a map of existing data
            hourly_map = {item["hour"]: item["ideas"] for item in hourly_data}
            
            # Fill in missing hours
            complete_hourly_data = []
            for hour in all_hours:
                complete_hourly_data.append({
                    "hour": hour,
                    "ideas": hourly_map.get(hour, 0)
                })
            hourly_data = complete_hourly_data
        
        # Find peak hour
        peak_hour = max(hourly_data, key=lambda x: x['ideas']) if hourly_data else None
        
        # Calculate submission rate per hour
        submission_rate = recent_ideas  # Already represents ideas in the last hour
        
        return {
            "active_users_last_hour": active_users,
            "ideas_last_hour": recent_ideas,
            "submission_rate_per_hour": submission_rate,
            "hourly_breakdown": hourly_data,
            "peak_activity": peak_hour
        }
    except Exception as e:
        logger.error(f"Error getting realtime metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get realtime metrics")

@router.get("/interactions")
async def get_interaction_metrics(
    discussion_id: str,
    db = Depends(get_db),
    current_user: dict = Depends(verify_token_cookie)
):
    """Get interaction metrics (views, likes, pins, saves)"""
    try:
        # First get all idea IDs for this discussion
        idea_ids = await db.ideas.distinct("_id", {"discussion_id": discussion_id})
        
        if not idea_ids:
            return {
                "total_views": 0,
                "total_likes": 0,
                "total_pins": 0,
                "total_saves": 0,
                "avg_views_per_idea": 0,
                "like_rate": 0,
                "pin_rate": 0,
                "save_rate": 0
            }
        
        # Get interaction counts by type using aggregation
        interaction_pipeline = [
            {"$match": {"entity_id": {"$in": idea_ids}, "entity_type": "idea"}},
            {"$group": {
                "_id": "$action_type",
                "count": {"$sum": 1}
            }}
        ]
        
        interactions = await db.interaction_events.aggregate(interaction_pipeline).to_list(None)
        
        # Convert to dict for easy access
        interaction_counts = {item["_id"]: item["count"] for item in interactions}
        
        # Get total ideas count
        total_ideas = len(idea_ids)
        
        # Extract counts
        total_views = interaction_counts.get('view', 0)
        total_likes = interaction_counts.get('like', 0) - interaction_counts.get('unlike', 0)
        total_pins = interaction_counts.get('pin', 0) - interaction_counts.get('unpin', 0)
        total_saves = interaction_counts.get('save', 0) - interaction_counts.get('unsave', 0)
        
        # Ensure non-negative values
        total_likes = max(0, total_likes)
        total_pins = max(0, total_pins)
        total_saves = max(0, total_saves)
        
        return {
            "total_views": total_views,
            "total_likes": total_likes,
            "total_pins": total_pins,
            "total_saves": total_saves,
            "avg_views_per_idea": round(total_views / total_ideas, 2) if total_ideas > 0 else 0,
            "like_rate": round(total_likes / total_views, 3) if total_views > 0 else 0,
            "pin_rate": round(total_pins / total_views, 3) if total_views > 0 else 0,
            "save_rate": round(total_saves / total_views, 3) if total_views > 0 else 0
        }
    except Exception as e:
        logger.error(f"Error getting interaction metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get interaction metrics")

@router.get("/trending")
async def get_trending_metrics(
    discussion_id: str,
    hours: int = 24,
    db = Depends(get_db),
    current_user: dict = Depends(verify_token_cookie)
):
    """Get trending topics and ideas"""
    try:
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        # Trending topics (most new ideas in time period)
        trending_topics_pipeline = [
            {"$match": {
                "discussion_id": discussion_id,
                "topic_id": {"$ne": None},
                "timestamp": {"$gte": cutoff_time}
            }},
            {"$group": {
                "_id": "$topic_id",
                "recent_ideas": {"$sum": 1}
            }},
            {"$sort": {"recent_ideas": -1}},
            {"$limit": 5}
        ]
        
        trending_topic_results = await db.ideas.aggregate(trending_topics_pipeline).to_list(None)
        
        # Get topic details for trending topics
        trending_topics = []
        for result in trending_topic_results:
            topic = await db.topics.find_one({"_id": result["_id"]})
            if topic:
                trending_topics.append({
                    "topic_id": str(topic["_id"]),
                    "topic": topic.get("representative_text", "Untitled Topic"),
                    "recent_ideas": result["recent_ideas"]
                })
        
        # Trending ideas (most interactions in time period)
        # First get idea IDs for this discussion
        idea_ids = await db.ideas.distinct("_id", {"discussion_id": discussion_id})
        
        trending_ideas_pipeline = [
            {"$match": {
                "entity_id": {"$in": idea_ids},
                "entity_type": "idea",
                "timestamp": {"$gte": cutoff_time}
            }},
            {"$group": {
                "_id": "$entity_id",
                "interaction_count": {"$sum": 1}
            }},
            {"$sort": {"interaction_count": -1}},
            {"$limit": 10}
        ]
        
        trending_idea_results = await db.interaction_events.aggregate(trending_ideas_pipeline).to_list(None)
        
        # Get idea details for trending ideas
        trending_ideas = []
        for result in trending_idea_results:
            idea = await db.ideas.find_one({"_id": result["_id"]})
            if idea:
                trending_ideas.append({
                    "idea_id": str(idea["_id"]),
                    "content": idea.get("text", "")[:100],  # First 100 chars
                    "interactions": result["interaction_count"]
                })
        
        return {
            "trending_topics": trending_topics,
            "trending_ideas": trending_ideas,
            "time_period_hours": hours
        }
    except Exception as e:
        logger.error(f"Error getting trending metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get trending metrics")

@router.get("/summary")
async def get_analytics_summary(
    discussion_id: str,
    db = Depends(get_db),
    current_user: dict = Depends(verify_token_cookie)
):
    """Get comprehensive summary of all analytics"""
    try:
        # Verify discussion exists
        discussion = await db.discussions.find_one({"_id": discussion_id})
        if not discussion:
            raise HTTPException(status_code=404, detail="Discussion not found")
        
        # Get all metrics in parallel for better performance
        participation = await get_participation_metrics(discussion_id, db, current_user)
        topics = await get_topic_analytics(discussion_id, db, current_user)
        realtime = await get_realtime_metrics(discussion_id, db, current_user)
        interactions = await get_interaction_metrics(discussion_id, db, current_user)
        trending = await get_trending_metrics(discussion_id, 24, db, current_user)
        
        return {
            "participation": participation,
            "topics": topics,
            "realtime": realtime,
            "interactions": interactions,
            "trending": trending,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting analytics summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to get analytics summary")