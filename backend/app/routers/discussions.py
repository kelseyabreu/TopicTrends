from fastapi import APIRouter, HTTPException, status, Depends, Response, Request, BackgroundTasks
from typing import List, Annotated
import uuid
from datetime import datetime, timezone
import base64
import io
import qrcode
import logging

from app.models.schemas import Discussion, DiscussionCreate, EmbedToken
from app.core.database import get_db
from app.core.config import settings
# Import security functions and dependencies
from app.services.auth import (
    verify_token_cookie,
    create_participation_token,
    verify_csrf_dependency,
    verify_api_key
)

# Rate Limiting
from app.core.limiter import limiter

# Agglomerative With Outliers clustering function
from app.services.genkit.agglomerative_clustering import cluster_ideas_into_topics

# Query executor for standardized pagination
from app.services.query_executor import create_discussion_query_executor

logger = logging.getLogger(__name__)
router = APIRouter(tags=["discussions"])

# Create discussion query executor for standardized pagination
discussion_query_executor = create_discussion_query_executor()


# Helper functions
def generate_qr_code(url: str) -> str:
    """Generate a QR code as base64 string"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10, 
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"

async def get_discussion_by_id_internal(discussion_id: str):
    """Internal helper to fetch discussion, used by other functions."""
    db = await get_db()
    discussion = await db.discussions.find_one({"_id": discussion_id})
    if not discussion:
        logger.warning(f"Discussion not found for ID: {discussion_id}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found")
    # logger.debug(f"Discussion found for ID: {discussion_id}") # Reduce noise
    return discussion

async def fetch_all_discussions_internal():
    """Internal helper to fetch all discussions"""
    db= await get_db()
    cursor = db.discussions.find().sort("created_at", -1) # Add sorting
    discussions = await cursor.to_list(length=None) # Fetch all, consider pagination later
    # logger.debug(f"Fetched {len(discussions)} discussions.") # Reduce noise
    return discussions


# --- Routes ---

@router.post("/discussions", response_model=Discussion, dependencies=[Depends(verify_csrf_dependency)])
@limiter.limit(settings.DISCUSSION_CREATE_RATE_LIMIT)
async def create_discussion(
    request: Request,
    discussion: DiscussionCreate,
    current_user: Annotated[dict, Depends(verify_token_cookie)],
    db=Depends(get_db)
):
    """Create a new discussion"""
    user_id = str(current_user["_id"])
    logger.info(f"User {user_id} creating discussion: {discussion.title}")

    discussion_id = str(uuid.uuid4())
    join_link = f"{settings.FRONTEND_URL}/discussion/{discussion_id}"
    qr_code = generate_qr_code(join_link)
    now = datetime.now(timezone.utc)

    discussion_data = {
        "_id": discussion_id,
        "title": discussion.title,
        "prompt": discussion.prompt,
        "require_verification": discussion.require_verification,
        "creator_id": user_id,
        "created_at": now,
        "last_activity": now,
        "idea_count": 0,
        "topic_count": 0,
        "join_link": join_link,
        "qr_code": qr_code,
    }

    # --- Insert discussion ---
    try:
        await db.discussions.insert_one(discussion_data)
        logger.info(f"Discussion {discussion_id} created by user {user_id}")
    except Exception as e:
        logger.error(f"Error creating discussion for {discussion_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to initialize discussion components.")

    # Map _id to id for the response model
    discussion_data["id"] = discussion_data["_id"]

    return Discussion(**discussion_data)


@router.get("/discussions/{discussion_id}", response_model=Discussion)
@limiter.limit(settings.DISCUSSION_READ_RATE_LIMIT)
async def get_discussion_details(
    request: Request, 
    discussion_id: str
):
    """Get discussion details by ID"""
    discussion = await get_discussion_by_id_internal(discussion_id)
    # Map _id to id for response
    discussion["id"] = str(discussion["_id"])
    # Ensure fields expected by Pydantic model are present
    discussion.setdefault("idea_count", 0)
    discussion.setdefault("topic_count", 0)
    discussion.setdefault("join_link", "")
    discussion.setdefault("qr_code", "")
    discussion.setdefault("last_activity", discussion.get("created_at"))
    return Discussion(**discussion)


@router.get("/discussions", response_model=None)
@limiter.limit(settings.DISCUSSION_READ_RATE_LIMIT)
async def get_discussions(
    request: Request,
    # The params_dependency handles all query parameter parsing and validation
    # This includes pagination, sorting, filtering, etc.
):
    """
    Get discussions with advanced filtering, sorting, and pagination.

    This endpoint supports:
    - Pagination with page and page_size
    - Sorting with sort and sort_dir
    - Filtering with multiple operators (eq, ne, gt, lt, in, etc.)
    - Text search across relevant fields
    - Field projection to limit returned data

    Example queries:
    - `/api/discussions?page=1&page_size=20&sort=created_at&sort_dir=desc`
    - `/api/discussions?filter.title.regex=feedback&filter.require_verification=true`
    - `/api/discussions?search=community&sort=last_activity&sort_dir=desc`
    """
    params = await discussion_query_executor.query_service.get_query_parameters_dependency()(request)
    result = await discussion_query_executor.execute(params=params)
    return result.to_tanstack_response()


@router.delete("/discussions/{discussion_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_csrf_dependency)])
@limiter.limit(settings.DISCUSSION_DELETE_RATE_LIMIT)
async def delete_discussion(
    request: Request,
    discussion_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)],
    db=Depends(get_db)
):
    """
    Delete a discussion and associated data (Requires auth cookie + CSRF token).
    TODO: Add permission check (only creator or admin can delete).
    """
    user_id = str(current_user["_id"])
    logger.info(f"User {user_id} attempting to delete discussion {discussion_id}")

    discussion = await get_discussion_by_id_internal(discussion_id)

    # --- PERMISSION CHECK (EXAMPLE - NEEDS REFINEMENT) ---
    # if str(discussion.get("creator_id")) != user_id and not current_user.get("is_admin", False):
    #     logger.warning(f"User {user_id} forbidden to delete discussion {discussion_id} (not creator/admin).")
    #     raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to delete this discussion.")
    # --- END PERMISSION CHECK ---

    idea_delete_result = await db.ideas.delete_many({"discussion_id": discussion_id})
    logger.info(f"Deleted {idea_delete_result.deleted_count} ideas for discussion {discussion_id}")

    topic_delete_result = await db.topics.delete_many({"discussion_id": discussion_id})
    logger.info(f"Deleted {topic_delete_result.deleted_count} topics for discussion {discussion_id}")

    discussion_delete_result = await db.discussions.delete_one({"_id": discussion_id})
    if discussion_delete_result.deleted_count == 0:
        logger.warning(f"Discussion {discussion_id} not found during final delete step by user {user_id}.")
        # Should have been caught by get_discussion_by_id_internal, but check anyway
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found.")

    logger.info(f"Successfully deleted discussion {discussion_id} by user {user_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Participation Token Endpoints (Protected by API Key) ---

@router.post("/discussions/{discussion_id}/initiate-anonymous", response_model=EmbedToken, dependencies=[Depends(verify_api_key)])
@limiter.limit(settings.TOKEN_GEN_RATE_LIMIT)
async def initiate_anonymous_session(
    request: Request,
    discussion_id: str):
    """Generates a participation token (Requires valid X-API-Key header)."""
    await get_discussion_by_id_internal(discussion_id) # Ensure discussion exists
    anonymous_user_id = f"anon_{uuid.uuid4().hex[:12]}" # Shorter anon ID
    token = create_participation_token(discussion_id, anonymous_user_id)
    logger.info(f"Initiated anonymous session (PT) for discussion {discussion_id} via API key.")
    return EmbedToken(participation_token=token)


@router.get("/discussions/{discussion_id}/embed-token", response_model=EmbedToken, dependencies=[Depends(verify_api_key)])
@limiter.limit(settings.TOKEN_GEN_RATE_LIMIT)
async def get_embed_token(
    request: Request, # Need request for limiter
    discussion_id: str):
    """Generates a participation token for embedding (Requires valid X-API-Key header)."""
    await get_discussion_by_id_internal(discussion_id) # Ensure discussion exists
    anonymous_user_id = f"embed_{uuid.uuid4().hex[:12]}" # Shorter anon ID
    token = create_participation_token(discussion_id, anonymous_user_id)
    logger.info(f"Generated embed token (PT) for discussion {discussion_id} via API key.")
    return EmbedToken(participation_token=token)

@router.post("/discussions/{discussion_id}/cluster", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(verify_csrf_dependency)])
@limiter.limit("10/minute") 
async def trigger_discussion_clustering(
    request: Request,
    discussion_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict, Depends(verify_token_cookie)], # Ensure only logged-in users can trigger
    db=Depends(get_db) # Keep db dependency if needed for validation
):
    """
    Manually triggers the clustering of all ideas
    for the specified discussion. Runs as a background task.
    """
    user_id = str(current_user["_id"])
    logger.info(f"User {user_id} manually triggered clustering for discussion {discussion_id}")

    # 1. Validate discussion exists (already done by get_discussion_by_id_internal if called)
    # Optionally add permission checks here (e.g., only creator can cluster)
    discussion = await get_discussion_by_id_internal(discussion_id)
    # if discussion.get("creator_id") != user_id:
    #     raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the discussion creator can trigger clustering.")

    # 2. Add Big Bang clustering task to background
    background_tasks.add_task(_trigger_bigbang_clustering, discussion_id=discussion_id)

    return {"message": "Idea grouping process initiated."}


async def _trigger_bigbang_clustering(discussion_id: str):
    """Background task to trigger Big Bang clustering with consistency management."""
    try:
        from app.services.clustering_coordinator import ClusteringCoordinator
        coordinator = ClusteringCoordinator()

        # Set consistency lock
        await coordinator.set_consistency_lock(discussion_id)

        # Perform Big Bang clustering
        result = await coordinator.process_bigbang_clustering(discussion_id)

        # Process any queued ideas
        await coordinator.process_queued_ideas(discussion_id)

        # Clear consistency lock
        await coordinator.clear_consistency_lock(discussion_id)

        logger.info(f"Big Bang clustering completed for discussion {discussion_id}: {len(result)} topics created")

    except Exception as e:
        logger.error(f"Big Bang clustering failed for discussion {discussion_id}: {e}")
        # Ensure lock is cleared on error
        try:
            coordinator = ClusteringCoordinator()
            await coordinator.clear_consistency_lock(discussion_id)
        except Exception as cleanup_error:
            logger.error(f"Failed to clear consistency lock after error: {cleanup_error}")