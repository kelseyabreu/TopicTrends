from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, Request, status, Header
from typing import List, Annotated, Optional
import uuid
import secrets
from datetime import datetime, timezone
import logging

# Assume these are correctly defined/imported
from app.core.database import get_db
from app.core.socketio import sio
from app.models.schemas import Idea, IdeaSubmit, Discussion # Import Discussion model
from app.models.user_schemas import User # Pydantic User model
# Legacy background_ai_processes removed - using optimized batch processor
# Import security functions and constants
from app.services.auth import (
    get_optional_current_user,
    verify_token_cookie,
    verify_participation_token,
    verify_csrf_dependency,
    check_csrf_manual,
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    csrf_exception
)

from app.services.query_executor import create_idea_query_executor
idea_query_executor = create_idea_query_executor(
    response_model=Idea  
)

# Import discussion helper from discussions router
from app.routers.discussions import get_discussion_by_id_internal

# --- Rate Limiting ---
from app.core.limiter import limiter
from app.core.config import settings

logger = logging.getLogger(__name__)
from app.models.schemas import Idea, IdeaSubmit, IdeaStatus, BulkIdeaSubmit
from app.services.batch_processor import idea_processing_service

# Create router
router = APIRouter(tags=["ideas"])


# Routes
@router.get("/ideas/{idea_id}", response_model=Idea)
@limiter.limit("200/minute")
async def get_idea_by_id(
    request: Request,
    idea_id:str
    ):
    """Get an idea by its ID"""
    db = await get_db()
    idea = await db.ideas.find_one({"_id": idea_id})
    if idea is None:
        raise HTTPException(status_code=404, detail="Idea not found")
    # Map _id and ensure structure matches Pydantic model
    idea["id"] = str(idea["_id"])
    idea.setdefault("user_id", None) # Handle potential missing fields
    idea.setdefault("verified", False)
    idea.setdefault("embedding", None)
    idea.setdefault("topic_id", None)
    idea.setdefault("intent", None)
    idea.setdefault("keywords", [])
    idea.setdefault("sentiment", None)
    idea.setdefault("specificity", None)
    idea.setdefault("related_topics", [])
    idea.setdefault("on_topic", None)
    idea.setdefault("anonymous_user_id", None)
    idea.setdefault("submitter_display_id", "anonymous")
    idea.setdefault("status", IdeaStatus.COMPLETED)  # Default for existing ideas
    return Idea(**idea)


@router.post("/discussions/{discussion_id}/ideas", response_model=Idea)
@limiter.limit(settings.IDEA_SUBMIT_RATE_LIMIT) # Apply rate limiting per settings
async def submit_idea(
    request: Request,
    discussion_id: str,
    idea_payload: IdeaSubmit,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    # Optional header for anonymous participation token
    x_participation_token: Annotated[str | None, Header(alias="X-Participation-Token")] = None
):
    """
    Submit an idea to a specific discussion.
    Triggers a background AI task for idea formatting.
    """

    # --- 1. Validate Discussion ---
    # Ensures the target discussion exists before proceeding
    discussion_doc = await get_discussion_by_id_internal(discussion_id)
    # Convert DB doc to Pydantic model for type safety and easy field access
    discussion_doc["id"] = str(discussion_doc["_id"])
    discussion = Discussion(**discussion_doc)

    # --- 2. Determine User Identity & Verification ---
    authenticated_user_data: dict | None = None # Holds user data if logged in via cookie
    authenticated_user_id: str | None = None    # Database ID of the logged-in user
    anonymous_user_id: str | None = None        # ID from a valid participation token
    is_verified_submission: bool = False        # Flag indicating if submission is from logged-in user
    submitter_display_id: str = "anonymous"     # Default display name for the submitter

    # --- Attempt Cookie Authentication ---
    access_token = request.cookies.get("access_token")
    if access_token:
        try:
            # Verify the HttpOnly access token (raises 401 if invalid/expired)
            authenticated_user_data = await verify_token_cookie(access_token=access_token)
            # Manually check CSRF token for this state-changing POST request (raises 403 if mismatch/missing)
            await check_csrf_manual(request)

            # If both checks pass, set authenticated user details
            authenticated_user_id = str(authenticated_user_data["_id"])
            is_verified_submission = True # Logged-in users are considered verified
            submitter_display_id = authenticated_user_data.get("username", authenticated_user_id) # Prefer username
            logger.debug(f"Idea submission by authenticated user: {authenticated_user_id}")

        except HTTPException as e:
            # Immediately fail if CSRF check fails
            if e.status_code == status.HTTP_403_FORBIDDEN:
                logger.warning(f"CSRF check failed for authenticated submission to {discussion_id}")
                raise e # Re-raise the specific CSRF exception
            # If token is invalid (401), don't raise yet; allow fallback to participation token
            elif e.status_code == status.HTTP_401_UNAUTHORIZED:
                logger.debug(f"Auth cookie invalid/expired for submission to {discussion_id}, checking for PT.")
                authenticated_user_data = None # Nullify potentially invalid data
            else:
                # Re-raise other unexpected HTTP errors from verification steps
                raise e
        except Exception as e:
            # Catch any other unexpected errors during cookie/CSRF verification
            logger.error(f"Unexpected error verifying auth cookie or CSRF for {discussion_id}: {e}", exc_info=True)
            authenticated_user_data = None # Ensure clean state on unexpected error

    # --- Attempt Participation Token Authentication (if cookie auth failed/absent) ---
    if not authenticated_user_id and x_participation_token:
        pt_payload = verify_participation_token(x_participation_token) # Returns payload if valid, None otherwise
        # Check if token is valid AND belongs to the current discussion
        if pt_payload and pt_payload.get("discussion_id") == discussion_id:
            anonymous_user_id = pt_payload.get("anon_user_id") # Extract anonymous ID
            is_verified_submission = False # Anonymous users are not verified
            submitter_display_id = anonymous_user_id # Display the anonymous ID
            logger.debug(f"Idea submission by anonymous user (PT): {anonymous_user_id}")
        elif pt_payload:
            # Log if token was valid but for a different discussion
            logger.warning(f"PT discussion_id mismatch: token({pt_payload.get('discussion_id')}) != url({discussion_id})")
        else:
            # Log if token was invalid or expired
            logger.warning(f"Invalid or expired participation token received for {discussion_id}.")
        # In case of mismatch or invalid PT, execution falls through to the authorization check below

    # --- 3. Authorization Check ---
    # Ensure that *either* a logged-in user OR a valid anonymous user ID was identified
    if not authenticated_user_id and not anonymous_user_id:
        logger.warning(f"Unauthorized idea submission attempt for discussion {discussion_id}.")
        # Provide clearer error details based on what was attempted
        detail = "Authentication required. Please login or provide a valid participation token."
        if access_token: detail = "Your session may have expired. Please login again."
        elif x_participation_token: detail = "Your participation token is invalid or expired."
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)

    # --- 4. Permission Check (Verification Requirement) ---
    # Check if the discussion requires users to be logged in (verified)
    if discussion.require_verification and not is_verified_submission:
        logger.warning(f"Submission blocked for anonymous user (Verification Required) on {discussion_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This discussion requires participants to be logged in.",
        )

    # --- 5. Content Validation ---
    idea_text = idea_payload.text.strip() # Remove leading/trailing whitespace
    if not idea_text: # Check for empty idea
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Idea text cannot be empty")
    # Enforce maximum length TODO: This could probably be handled in the pydantic model, remove?
    MAX_IDEA_LENGTH = 500 # Consider making this configurable via settings
    if len(idea_text) > MAX_IDEA_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Idea text too long (max {MAX_IDEA_LENGTH} characters)"
        )

    # --- 6. Prepare Idea Document for Database ---
    idea_id = str(uuid.uuid4()) # Generate unique ID for the idea
    now_utc = datetime.now(timezone.utc) # Get current timestamp

    idea_data = {
        "_id": idea_id,                         # Internal DB ID
        "discussion_id": discussion_id,
        "text": idea_text,
        "user_id": authenticated_user_id,       # DB ID of authenticated user (or None)
        "anonymous_user_id": anonymous_user_id, # ID from participation token (or None)
        "verified": is_verified_submission,     # Boolean flag based on auth method
        "submitter_display_id": submitter_display_id, # Username or anonymous ID
        "timestamp": now_utc,
        "topic_id": None,
        # Initialize processing status
        "status": IdeaStatus.PENDING,
        # Initialize AI-populated fields to null/empty states
        "embedding": None,
        "intent": None,
        "keywords": [],
        "sentiment": None,
        "specificity": None,
        "related_topics": [],
        "on_topic": None,
        # Initialize rating fields
        "average_rating": None,
        "rating_count": 0,
        "rating_distribution": {str(i): 0 for i in range(11)}
    }

# --- 7. Insert Idea into Database ---
    try:
        await db.ideas.insert_one(idea_data)
        logger.info(f"Idea {idea_id} saved for discussion {discussion_id}.")

        # --- WebSocket Events Handled by Batch Processor ---
        # Individual WebSocket events removed - batch processor handles all real-time updates

    except Exception as e:
        logger.error(f"Database error saving idea {idea_id} for discussion {discussion_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save idea.")
    
        # --- 8. Update Discussion and Topic Counts ---
    # This is done after successfully saving the idea; errors here are logged but don't fail the request.
    try:
        # Increment total idea count and update last activity timestamp for the discussion
        update_discussion_result = await db.discussions.update_one(
            {"_id": discussion_id},
            {"$inc": {"idea_count": 1}, "$set": {"last_activity": now_utc}}
        )
        # Log warnings if the updates didn't modify any documents (e.g., ID mismatch)
        if update_discussion_result.modified_count == 0:
             logger.warning(f"Failed to update counts/activity for discussion {discussion_id} (document not found or no change needed)")
    except Exception as e:
        # Log database errors during count updates but allow the request to succeed since the idea is saved
        logger.error(f"Database error updating counts for discussion {discussion_id}: {e}", exc_info=True)

    # --- 9. Queue for Batch Processing ---
    # Queue the idea for efficient batch processing instead of individual processing
    await idea_processing_service.queue_idea(str(idea_data["_id"]), discussion_id)

    # --- 9.5. Immediate WebSocket Event for Real-Time Feedback ---
    # Emit immediate event so frontend knows idea was submitted
    from app.core.socketio import sio
    await sio.emit('idea_submitted', {
        'discussion_id': discussion_id,
        'idea': {
            'id': str(idea_data["_id"]),
            'text': idea_data["text"],
            'status': idea_data["status"],
            'timestamp': idea_data["timestamp"].isoformat()
        }
    }, room=discussion_id)

    # --- 10. Prepare and Return API Response ---
    # Map the internal '_id' field to 'id' for the response payload, matching the Pydantic model.
    idea_data["id"] = idea_data["_id"]
    # Return the created idea data, validated and serialized by the 'Idea' Pydantic model.
    return Idea(**idea_data)


@router.post("/discussions/{discussion_id}/ideas/bulk", response_model=List[Idea])
@limiter.limit("10/minute")  # More restrictive rate limit for bulk operations
async def submit_ideas_bulk(
    request: Request,
    discussion_id: str,
    bulk_payload: BulkIdeaSubmit,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    x_participation_token: Annotated[str | None, Header(alias="X-Participation-Token")] = None
):
    """
    Submit multiple ideas to a specific discussion in bulk.
    Optimized for batch processing with immediate response.
    """
    # Validate discussion exists
    discussion = await get_discussion_by_id_internal(discussion_id)

    # Validate bulk submission size
    if len(bulk_payload.ideas) == 0:
        raise HTTPException(status_code=400, detail="No ideas provided")

    if len(bulk_payload.ideas) > 1000:
        raise HTTPException(status_code=400, detail="Too many ideas in bulk submission")

    # Process authentication similar to single idea submission
    authenticated_user_id = None
    anonymous_user_id = None
    is_verified_submission = False
    submitter_display_id = "anonymous"

    try:
        current_user_data = await get_optional_current_user(request)
        if current_user_data:
            authenticated_user_id = current_user_data.get("user_id")
            submitter_display_id = current_user_data.get("username", "authenticated")
            is_verified_submission = True
    except Exception:
        pass

    # Handle participation token for anonymous users
    if not authenticated_user_id and x_participation_token:
        try:
            token_data = verify_participation_token(x_participation_token, discussion_id)
            anonymous_user_id = token_data.get("anonymous_user_id")
            submitter_display_id = anonymous_user_id or "anonymous"
        except Exception:
            pass

    # Check discussion verification requirements
    if discussion.require_verification and not is_verified_submission:
        raise HTTPException(
            status_code=403,
            detail="This discussion requires user verification to submit ideas"
        )

    # Prepare bulk ideas for database insertion
    now_utc = datetime.utcnow()
    ideas_to_insert = []
    created_ideas = []

    for idea_submit in bulk_payload.ideas:
        idea_text = idea_submit.text.strip()
        if not idea_text:
            continue  # Skip empty ideas

        idea_id = str(uuid.uuid4())

        idea_data = {
            "_id": idea_id,
            "discussion_id": discussion_id,
            "text": idea_text,
            "user_id": authenticated_user_id,
            "anonymous_user_id": anonymous_user_id,
            "verified": is_verified_submission,
            "submitter_display_id": submitter_display_id,
            "timestamp": now_utc,
            "topic_id": None,
            "status": IdeaStatus.PENDING,
            # Initialize AI-populated fields
            "embedding": None,
            "intent": None,
            "keywords": [],
            "sentiment": None,
            "specificity": None,
            "related_topics": [],
            "on_topic": None,
            # Initialize rating fields
            "average_rating": None,
            "rating_count": 0,
            "rating_distribution": {str(i): 0 for i in range(11)}
        }

        ideas_to_insert.append(idea_data)

        # Prepare response data
        response_idea = idea_data.copy()
        response_idea["id"] = response_idea["_id"]
        created_ideas.append(Idea(**response_idea))

    if not ideas_to_insert:
        raise HTTPException(status_code=400, detail="No valid ideas to submit")

    # Bulk insert to database
    try:
        await db.ideas.insert_many(ideas_to_insert)
        logger.info(f"Bulk inserted {len(ideas_to_insert)} ideas to discussion {discussion_id}")
    except Exception as e:
        logger.error(f"Error bulk inserting ideas: {e}")
        raise HTTPException(status_code=500, detail="Failed to save ideas")

    # Queue all ideas for batch processing
    for idea_data in ideas_to_insert:
        await idea_processing_service.queue_idea(str(idea_data["_id"]), discussion_id)

    # Send immediate WebSocket notification for bulk submission
    try:
        await sio.emit(
            'ideas_bulk_submitted',
            {
                'discussion_id': discussion_id,
                'count': len(created_ideas),
                'ideas': [idea.dict() for idea in created_ideas]
            },
            room=discussion_id
        )
        logger.info(f"Emitted bulk submission event for {len(created_ideas)} ideas")
    except Exception as e:
        logger.error(f"Failed to emit bulk submission event: {e}")

    return created_ideas


@router.get("/discussions/{discussion_id}/ideas", response_model=List[Idea])
@limiter.limit(settings.DISCUSSION_READ_RATE_LIMIT)
async def get_discussion_ideas(
    request: Request,
    discussion_id: str,
    db=Depends(get_db)
    ):
    """Get all ideas for a discussion"""
    await get_discussion_by_id_internal(discussion_id) # Validate discussion exists

    ideas_cursor = db.ideas.find({"discussion_id": discussion_id}).sort("timestamp", 1)
    ideas_list = await ideas_cursor.to_list(length=None) # Fetch all for now

    # Convert DB docs to Pydantic models, ensuring all fields
    results = []
    for idea_doc in ideas_list:
        idea_doc["id"] = str(idea_doc["_id"])
        idea_doc.setdefault("user_id", None)
        idea_doc.setdefault("verified", False)
        idea_doc.setdefault("embedding", None)
        idea_doc.setdefault("topic_id", None)
        idea_doc.setdefault("intent", None)
        idea_doc.setdefault("keywords", [])
        idea_doc.setdefault("sentiment", None)
        idea_doc.setdefault("specificity", None)
        idea_doc.setdefault("related_topics", [])
        idea_doc.setdefault("on_topic", None)
        idea_doc.setdefault("anonymous_user_id", None)
        idea_doc.setdefault("submitter_display_id", "anonymous") # Add default
        idea_doc.setdefault("status", IdeaStatus.COMPLETED)  # Default for existing ideas
        # Add rating fields defaults
        idea_doc.setdefault("average_rating", None)
        idea_doc.setdefault("rating_count", 0)
        idea_doc.setdefault("rating_distribution", {str(i): 0 for i in range(11)})
        results.append(Idea(**idea_doc))

    return results

@router.get("/ideas", response_model=None)
@router.get("/ideas/", response_model=None)
@limiter.limit(settings.HIGH_RATE_LIMIT)
async def get_all_ideas(
    request: Request,
    current_user: Annotated[dict, Depends(verify_token_cookie)],
    # The params_dependency handles all query parameter parsing and validation
    # This includes pagination, sorting, filtering, etc.
):
    """Get ideas with searching, pagination, filtering, and sorting."""
    params = await idea_query_executor.query_service.get_query_parameters_dependency()(request)
    result =  await idea_query_executor.execute(params=params)
    return result.to_tanstack_response()


# Rate idea endpoint removed - now handled by /interaction/idea/{idea_id}/rate