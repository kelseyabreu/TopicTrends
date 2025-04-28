from fastapi import APIRouter, BackgroundTasks, Body, Depends
from typing import List
from app.services.genkit.ai import cluster_ideas_into_topics
from app.models.schemas import Topic
from app.core.database import get_db
from app.routers.discussions import get_discussion_by_id
import logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["topics"])

# Routes
@router.get("/discussions/{discussion_id}/topics", response_model=List[Topic])
async def get_discussion_topics(discussion_id: str):
    """Get all topics for a discussion"""
    db = await get_db()
    # Validate discussion exists
    await get_discussion_by_id(discussion_id)

    # Get topics
    topics = await db.topics.find({"discussion_id": discussion_id}).to_list(length=None)
    # Convert _id and ensure nested ideas/timestamps are handled by Pydantic response_model
    results = []
    for topic in topics:
        # Reconstruct nested Ideas to ensure Pydantic validation/serialization
        nested_ideas = [
            {
                "id": idea_data["id"],
                "text": idea_data["text"],
                "user_id": idea_data["user_id"],
                "verified": idea_data["verified"],
                # Assuming timestamp in DB is datetime or ISO string parseable by Pydantic
                "timestamp": idea_data["timestamp"],
                "topic_id": topic["_id"], # Add topic_id
                #These are properties added by the LLM
                "on_topic": idea_data.get("on_topic", None),
                "keywords": idea_data.get("keywords", []),
                "intent": idea_data.get("intent", None),
                "sentiment": idea_data.get("sentiment", None),
                "specificity": idea_data.get("specificity", None),
                "related_topics": idea_data.get("related_topics", [])
            }
            for idea_data in topic.get("ideas", [])
        ]
        results.append(
             Topic(
                id=topic["_id"],
                representative_idea_id=topic["representative_idea_id"], # Use corrected field name
                representative_text=topic["representative_text"],
                count=topic["count"],
                ideas=nested_ideas
            )
        )
    logging.info("Fetched %d topics for discussion %s", len(topics), discussion_id)
    return results


@router.post("/topics")
async def create_topics(
        background_tasks: BackgroundTasks,
        topic_id: str = Body(..., description="Topic ID to create subtopics from")
):
    """
    Creates new subtopics one level deeper from an existing topic.
    
    This endpoint takes a topic ID and clusters its ideas into new subtopics
    at a deeper hierarchical level, processing the clustering in the background.
    
    TODO: Modify to accept a list of idea IDs in the payload for custom clustering.
    
    Args:
        topic_id: ID of the parent topic to create subtopics from
        
    Returns:
        A confirmation message that the clustering process has started along with the clustering results
    """

    # Add the clustering task to background tasks
    # background_tasks.add_task(cluster_ideas_into_topics, None, topic_id, False)

    return {
        "status": "processing",
        "message": f"Grouping process started for topic ${topic_id}",
        "data": await cluster_ideas_into_topics(None, topic_id, False)
    }