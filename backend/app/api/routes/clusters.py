from fastapi import APIRouter, HTTPException
from typing import List

from app.models.schemas import Cluster
from app.core.database import db
from app.api.routes.sessions import get_session_by_id

# Create router
router = APIRouter(tags=["clusters"])

# Routes
@router.get("/sessions/{session_id}/clusters", response_model=List[Cluster])
async def get_session_clusters(session_id: str):
    """Get all clusters for a session"""
    # Validate session exists
    await get_session_by_id(session_id)

    # Get clusters
    clusters = await db.clusters.find({"session_id": session_id}).to_list(length=None)
    # Convert _id and ensure nested ideas/timestamps are handled by Pydantic response_model
    results = []
    for cluster in clusters:
        # Reconstruct nested Ideas to ensure Pydantic validation/serialization
        nested_ideas = [
            {
                "id": idea_data["id"],
                "text": idea_data["text"],
                "user_id": idea_data["user_id"],
                "verified": idea_data["verified"],
                # Assuming timestamp in DB is datetime or ISO string parseable by Pydantic
                "timestamp": idea_data["timestamp"],
                "cluster_id": cluster["_id"] # Add cluster_id
            }
            for idea_data in cluster.get("ideas", [])
        ]
        results.append(
             Cluster(
                id=cluster["_id"],
                representative_idea_id=cluster["representative_idea_id"], # Use corrected field name
                representative_text=cluster["representative_text"],
                count=cluster["count"],
                ideas=nested_ideas
            )
        )
    return results