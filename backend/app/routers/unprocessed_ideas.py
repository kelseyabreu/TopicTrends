"""
Unprocessed Ideas API endpoints.

Provides endpoints for viewing and managing ideas stuck in the processing pipeline.
"""

from fastapi import APIRouter, Depends, Request
from app.services.unprocessed_ideas_service import UnprocessedIdeasService
from app.core.limiter import limiter
from app.core.config import settings
from app.services.auth import verify_token_cookie
from typing import Annotated

router = APIRouter(tags=["unprocessed-ideas"])

@router.get("/discussions/{discussion_id}/unprocessed-ideas")
@limiter.limit(settings.DEFAULT_RATE_LIMIT)
async def get_unprocessed_ideas(
    request: Request,
    discussion_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """
    Get paginated unprocessed ideas analysis with categorization following TanStack standards.

    Returns ideas categorized by processing stage:
    - needs_embedding: Ideas without AI embeddings
    - needs_clustering: Ideas with embeddings but no topic assignment

    Supports standard query parameters:
    - page: Page number (1-indexed)
    - page_size: Number of items per page
    - sort: Sort field (timestamp, status, etc.)
    - sort_dir: Sort direction (asc, desc)
    - search: Search term
    - filter.*: Various filter conditions
    """
    # Extract query parameters using the standardized service pattern
    from app.services.query_service import MongoDBQueryService
    from app.models.query_models import IdeaQueryParameters

    # Create a query service for ideas to handle parameter extraction
    query_service = MongoDBQueryService.for_ideas()
    params = await query_service.get_query_parameters_dependency()(request)

    # Use the service with extracted parameters
    service = UnprocessedIdeasService()
    return await service.get_unprocessed_ideas_with_params(discussion_id, params)

@router.post("/discussions/{discussion_id}/retry-embeddings")
@limiter.limit("10/minute")  # Limit retry attempts to prevent abuse
async def retry_embeddings(
    request: Request,
    discussion_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """
    Retry embedding generation for all ideas that need embeddings.
    
    Resets processing status and queues ideas for background processing.
    """
    service = UnprocessedIdeasService()
    return await service.retry_embeddings(discussion_id)

@router.post("/discussions/{discussion_id}/retry-clustering")
@limiter.limit("10/minute")  # Limit retry attempts to prevent abuse
async def retry_clustering(
    request: Request,
    discussion_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """
    Retry clustering for all ideas that have embeddings but no topic assignment.

    Resets processing status and triggers Real-Time clustering.
    """
    service = UnprocessedIdeasService()
    return await service.retry_clustering(discussion_id)

@router.post("/discussions/{discussion_id}/retry-selected-embeddings")
@limiter.limit("20/minute")  # Higher limit for individual processing
async def retry_selected_embeddings(
    request: Request,
    discussion_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """
    Retry embedding generation for specific selected ideas.

    Body should contain: {"idea_ids": ["id1", "id2", ...]}
    """
    body = await request.json()
    idea_ids = body.get("idea_ids", [])

    if not idea_ids:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No idea IDs provided")

    service = UnprocessedIdeasService()
    return await service.retry_embeddings(discussion_id, idea_ids)

@router.post("/discussions/{discussion_id}/retry-selected-clustering")
@limiter.limit("20/minute")  # Higher limit for individual processing
async def retry_selected_clustering(
    request: Request,
    discussion_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """
    Retry clustering for specific selected ideas.

    Body should contain: {"idea_ids": ["id1", "id2", ...]}
    """
    body = await request.json()
    idea_ids = body.get("idea_ids", [])

    if not idea_ids:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No idea IDs provided")

    service = UnprocessedIdeasService()
    return await service.retry_clustering(discussion_id, idea_ids)

@router.post("/discussions/{discussion_id}/retry-failed")
@limiter.limit("10/minute")  # Limit retry attempts to prevent abuse
async def retry_failed(
    request: Request,
    discussion_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """
    Retry processing for all failed ideas.

    Resets processing status and queues ideas for background processing.
    """
    service = UnprocessedIdeasService()
    return await service.retry_failed_ideas(discussion_id)

@router.post("/discussions/{discussion_id}/clear-clustering-lock")
@limiter.limit("5/minute")  # Lower limit for admin-type operations
async def clear_clustering_lock(
    request: Request,
    discussion_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """
    Clear stuck Big Bang clustering lock that prevents Real-Time processing.

    Use this when ideas are stuck being queued during Big Bang clustering
    but no actual Big Bang clustering is running.
    """
    service = UnprocessedIdeasService()
    return await service.clear_stuck_clustering_lock(discussion_id)
