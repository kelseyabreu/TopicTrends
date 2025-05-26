from fastapi import APIRouter, Depends, HTTPException, status, Request, Header, BackgroundTasks
from typing import List, Optional, Dict, Any, Literal, Annotated

from app.services.auth import get_optional_current_user, verify_token_cookie, verify_participation_token, check_csrf_manual
from app.services.interaction import interaction_service
from app.models.interaction_schemas import InteractionEvent, InteractionStateResponse, UserState,TrendingEntityResponseItem,SavedEntityResponseItem, Metrics, TimeWindowMetricsContainer
from app.core.limiter import limiter 
from app.core.config import settings 
from app.models.query_models import InteractionQueryParameters
from app.services.query_executor import create_interaction_query_executor
from app.services.auth import verify_csrf_dependency


import logging
logger = logging.getLogger(__name__)

# Create a reusable dependency
interaction_query_executor = create_interaction_query_executor(
    response_model=InteractionEvent
)

router = APIRouter(prefix="/interaction", tags=["Interaction"])

def get_client_info_dict(request: Request) -> Dict[str, str]:
    # Basic IP hashing for privacy, consider more robust methods for production
    # For real production, use a proper secure hashing library e.g. hashlib
    # and ensure you comply with privacy regulations like GDPR.
    # This is a placeholder.
    ip_address = request.client.host if request.client else "unknown"
    try:
        # This is NOT a secure hash, just for MVP demonstration.
        # Replace with something like hashlib.sha256(ip_address.encode()).hexdigest()
        ip_hash = str(hash(ip_address)) 
    except Exception:
        ip_hash = "unknown_hash"

    return {
        "ip_hash": ip_hash,
        "user_agent": request.headers.get("User-Agent", "unknown"),
        "referrer": request.headers.get("Referer", "unknown")
    }

async def get_user_identifiers(
    current_user_data: Optional[dict], 
    x_participation_token: Optional[str]
) -> tuple[Optional[str], Optional[str]]:
    user_id: Optional[str] = None
    anonymous_id: Optional[str] = None

    if current_user_data:
        user_id = str(current_user_data["_id"])
    elif x_participation_token:
        pt_payload = verify_participation_token(x_participation_token)
        if pt_payload:
            anonymous_id = pt_payload.get("anon_user_id")
            # It's important that this anon_user_id is consistent for the token
    
    return user_id, anonymous_id

# --- Interaction Endpoints (Like, Pin, View, Saves) ---

@router.post("/{entity_type:str}/{entity_id:str}/{action:str}", response_model=InteractionEvent)
@limiter.limit("120/minute")
async def record_interaction(
    request: Request,
    entity_type: Literal["discussion", "topic", "idea"],
    entity_id: str,
    action: Literal["like", "unlike", "pin", "unpin", "save","unsave","view"],
    background_tasks: BackgroundTasks,
    current_user_data: Optional[dict] = Depends(get_optional_current_user), # Optional auth
    x_participation_token: Optional[str] = Header(None)
):
    """
    Generic endpoint to record an interaction.
    Handles CSRF for authenticated state-changing actions (like, unlike, pin, unpin, save, unsave).
    """
    if entity_type not in ["discussion", "topic", "idea"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid entity type.")
    
    user_id, anonymous_id = await get_user_identifiers(current_user_data, x_participation_token)

    if not user_id and not anonymous_id and action != "view": # Anonymous can only view without token
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication or participation token required for this action.")

    # CSRF Check for authenticated users on state-changing actions
    if user_id and action in ["like", "unlike", "pin", "unpin","save","unsave"]:
        try:
            await check_csrf_manual(request) # Manually invoke CSRF check
        except HTTPException as e:
            # check_csrf_manual raises its own specific HTTPException
            raise e 
            
    # Restriction: Only authenticated users can like/pin or unlike/unpin
    if action in ["like", "unlike", "pin", "unpin","save","unsave"] and not user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only authenticated users can perform this action.")

    client_info = get_client_info_dict(request)

    try:
        event = await interaction_service.record_event_and_update_models(
            background_tasks=background_tasks,
            entity_id=entity_id,
            entity_type=entity_type,
            action_type=action,
            user_id=user_id,
            anonymous_id=anonymous_id,
            client_info_dict=client_info
        )
        # For MVP, we return the event. Client might then re-fetch state or metrics.
        return event 
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error recording interaction {action} for {entity_type} {entity_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to record interaction.")


@router.get("/{entity_type:str}/{entity_id:str}/state", response_model=InteractionStateResponse)
@limiter.limit("200/minute")
async def get_interaction_state(
    request: Request,
    entity_type: Literal["discussion", "topic", "idea"],
    entity_id: str,
    current_user_data: Optional[dict] = Depends(get_optional_current_user),
    x_participation_token: Optional[str] = Header(None)
):
    if entity_type not in ["discussion", "topic", "idea"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid entity type.")

    metrics = await interaction_service.get_entity_metrics(entity_id)
    
    user_id, anonymous_id = await get_user_identifiers(current_user_data, x_participation_token)
    user_identifier = user_id or anonymous_id
    
    user_state = await interaction_service.get_user_interaction_state(entity_id, user_identifier)
    
    return InteractionStateResponse(
        metrics=metrics,
        user_state=user_state,
        can_like=bool(user_id),
        can_pin=bool(user_id),
        can_save=bool(user_id) 
    )

@router.get("/{entity_type:str}/{entity_id:str}/time-metrics", response_model=Optional[TimeWindowMetricsContainer])
@limiter.limit("60/minute")
async def get_entity_time_window_metrics(
    request: Request,
    entity_type: Literal["discussion", "topic", "idea"], # For validation, not used in query here
    entity_id: str
):
    if entity_type not in ["discussion", "topic", "idea"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid entity type.")
    return await interaction_service.get_entity_time_window_metrics(entity_id)


@router.get("/me/pinned", response_model=List[SavedEntityResponseItem])
@limiter.limit("60/minute")
async def get_my_pinned_entities(
    request: Request,
    current_user_data: dict = Depends(verify_token_cookie), # Requires authentication
    entity_type: Optional[Literal["discussion", "topic", "idea"]] = None,
    limit: int = 50,
    skip: int = 0
):
    user_id = str(current_user_data["_id"])
    pinned_items = await interaction_service.get_pinned_entities_for_user(
        user_id=user_id, entity_type=entity_type, limit=limit, skip=skip
    )
    # Pinned_items is List[Dict[str, Any]] with entity_id and entity_type
    # For MVP, we just return IDs and types. Frontend can fetch full details if needed.
    return [SavedEntityResponseItem(**item) for item in pinned_items]

@router.get("/me/saved", response_model=List[SavedEntityResponseItem])
@limiter.limit("60/minute")
async def get_my_saved_entities(
    request: Request,
    current_user_data: dict = Depends(verify_token_cookie), # Requires authentication
    entity_type: Optional[Literal["discussion", "topic", "idea"]] = None,
    limit: int = 50,
    skip: int = 0
):
    user_id = str(current_user_data["_id"])
    saved_items = await interaction_service.get_saved_entities_for_user(
        user_id=user_id, entity_type=entity_type, limit=limit, skip=skip
    )
    return [SavedEntityResponseItem(**item) for item in saved_items]

@router.get("/trending/{entity_type:str}", response_model=List[TrendingEntityResponseItem])
@limiter.limit("30/minute")
async def get_trending(
    request: Request,
    entity_type: Literal["discussion", "topic", "idea"],
    limit: int = 10,
    hours_window: int = 24
):
    if entity_type not in ["discussion", "topic", "idea"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid entity type.")
    if not (1 <= hours_window <= 7*24): # Limit window, e.g., 1 hour to 1 week
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hours window out of allowed range.")
    if not (1 <= limit <= 50):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Limit out of allowed range.")

    trending_results = await interaction_service.get_trending_entities(
        entity_type=entity_type, limit=limit, hours_window=hours_window
    )
    # The service method already projects to a structure matching TrendingEntityResponseItem
    return [TrendingEntityResponseItem(**item) for item in trending_results]

@router.get("/", response_model=None) 
@limiter.limit(settings.HIGH_RATE_LIMIT)
async def get_interactions(
    request: Request,
    current_user: Annotated[dict, Depends(verify_token_cookie)],
    # The params_dependency handles all query parameter parsing and validation
    # This includes pagination, sorting, filtering, etc.
):
    """
    Get interaction events with advanced filtering, sorting, and pagination.
    
    This endpoint supports:
    - Pagination with page and page_size
    - Sorting with sort and sort_dir
    - Filtering with multiple operators (eq, ne, gt, lt, in, etc.)
    - Text search across relevant fields
    - Field projection to limit returned data
    
    Example queries:
    - `/api/interactions?page=1&page_size=20&sort=timestamp&sort_dir=desc`
    - `/api/interactions?filter.entity_type=discussion&filter.action_type=view`
    - `/api/interactions?filter.timestamp.gte=2025-01-01T00:00:00Z`
    """
    params = await interaction_query_executor.query_service.get_query_parameters_dependency()(request)
    result = await interaction_query_executor.execute(params=params)
    
    return result.to_tanstack_response()


# Get interactions related to a specific entity
@router.get("/entity/{entity_type}/{entity_id}")
@limiter.limit(settings.DEFAULT_RATE_LIMIT)
async def get_entity_interactions(
    request: Request,
    entity_type: str,
    entity_id: str,
    current_user: Annotated[dict, Depends(verify_token_cookie)]
):
    """
    Get interactions for a specific entity.
    
    This endpoint supports all standard query parameters and applies
    an additional filter for the specified entity type and ID.
    """
    params = await interaction_query_executor.query_service.get_query_parameters_dependency()(request)
    return await interaction_query_executor.execute(
        params=params,
        additional_filter={
            "entity_id": entity_id,
            "entity_type": entity_type
        }
    )
