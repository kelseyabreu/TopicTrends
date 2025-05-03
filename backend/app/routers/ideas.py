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
from app.services.genkit.ai import background_ai_processes # Keep background task
# Import security functions and constants
from app.services.auth import (
    verify_token_cookie,
    verify_participation_token,
    check_csrf_manual,
    CSRF_COOKIE_NAME, 
    CSRF_HEADER_NAME, 
    csrf_exception 
)

# Import discussion helper from discussions router
from app.routers.discussions import get_discussion_by_id_internal

# --- Rate Limiting ---
from app.core.limiter import limiter
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ideas"])


# Routes
@router.get("/ideas/{idea_id}", response_model=Idea)
@limiter.limit("200/minute") # Limit idea reads
async def get_idea_by_id(
    request: Request, # Need request for limiter
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

    Handles authentication via HttpOnly cookie (with CSRF) or Participation Token header.
    Assigns the new idea to the discussion's default 'New Ideas' topic.
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
    # Enforce maximum length
    MAX_IDEA_LENGTH = 500 # Consider making this configurable via settings
    if len(idea_text) > MAX_IDEA_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Idea text too long (max {MAX_IDEA_LENGTH} characters)"
        )

    # --- 6. Prepare Idea Document for Database ---
    idea_id = str(uuid.uuid4()) # Generate unique ID for the idea
    now_utc = datetime.now(timezone.utc) # Get current timestamp
    # Define the standard ID for the discussion's default 'New Ideas' topic
    default_topic_id = f"{discussion_id}_new"

    idea_data = {
        "_id": idea_id,                         # Internal DB ID
        "discussion_id": discussion_id,
        "text": idea_text,
        "user_id": authenticated_user_id,       # DB ID of authenticated user (or None)
        "anonymous_user_id": anonymous_user_id, # ID from participation token (or None)
        "verified": is_verified_submission,     # Boolean flag based on auth method
        "submitter_display_id": submitter_display_id, # Username or anonymous ID
        "timestamp": now_utc,
        "topic_id": default_topic_id,           # Assign to the 'New Ideas' topic
        # Initialize AI-populated fields to null/empty states
        "embedding": None,
        "intent": None,
        "keywords": [],
        "sentiment": None,
        "specificity": None,
        "related_topics": [],
        "on_topic": None
    }

# --- 7. Insert Idea into Database ---
    try:
        await db.ideas.insert_one(idea_data)
        logger.info(f"Idea {idea_id} saved to default topic {default_topic_id} for discussion {discussion_id}.")

        try:
            # Prepare data matching the Idea Pydantic model for the client
            idea_for_client_dict = {
                "id": idea_data["_id"], 
                "text": idea_data["text"],
                "user_id": idea_data["user_id"],
                "anonymous_user_id": idea_data["anonymous_user_id"],
                "verified": idea_data["verified"],
                "submitter_display_id": idea_data["submitter_display_id"],
                "timestamp": idea_data["timestamp"].isoformat(), # Already datetime object
                "embedding": None, # Don't send embedding
                "topic_id": idea_data["topic_id"],
                "intent": idea_data["intent"],
                "keywords": idea_data["keywords"],
                "sentiment": idea_data["sentiment"],
                "specificity": idea_data["specificity"],
                "related_topics": idea_data["related_topics"],
                "on_topic": idea_data["on_topic"]
            }
            # Optionally validate with Pydantic model before sending, though dict is fine
            # idea_pydantic = Idea(**idea_for_client_dict)

            await sio.emit(
                'new_idea',
                {
                    'discussion_id': discussion_id,
                    'idea': idea_for_client_dict # Send the dict matching Idea schema
                 },
                room=discussion_id # Target only clients in this discussion room
            )
            logger.info(f"Emitted 'new_idea' event for idea {idea_id} to room {discussion_id}")
        except Exception as emit_error:
            logger.error(f"Failed to emit 'new_idea' event for idea {idea_id}: {emit_error}", exc_info=True)
        # --- END WebSocket EMIT ---

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
        # Increment the count field for the 'New Ideas' topic specifically
        update_topic_result = await db.topics.update_one(
             {"_id": default_topic_id},
             {"$inc": {"count": 1}} # Increment the counter for the default topic
        )
        # Log warnings if the updates didn't modify any documents (e.g., ID mismatch)
        if update_discussion_result.modified_count == 0:
             logger.warning(f"Failed to update counts/activity for discussion {discussion_id} (document not found or no change needed)")
        if update_topic_result.modified_count == 0:
            logger.warning(f"Failed to update count for default topic {default_topic_id} (document not found or no change needed)")
    except Exception as e:
        # Log database errors during count updates but allow the request to succeed since the idea is saved
        logger.error(f"Database error updating counts for discussion {discussion_id} / topic {default_topic_id}: {e}", exc_info=True)

    # --- 9. Trigger Background AI Task (Formatting Only) ---
    # Schedule the AI processing (like formatting, keyword extraction) to run after the response is sent.
    # Pass the full idea_data dictionary, including the '_id', to the background task.
    background_tasks.add_task(background_ai_processes, discussion_id=discussion_id, idea_data=idea_data)

    # --- 10. Prepare and Return API Response ---
    # Map the internal '_id' field to 'id' for the response payload, matching the Pydantic model.
    idea_data["id"] = idea_data["_id"]
    # Return the created idea data, validated and serialized by the 'Idea' Pydantic model.
    return Idea(**idea_data)


@router.get("/discussions/{discussion_id}/ideas", response_model=List[Idea])
@limiter.limit(settings.DISCUSSION_READ_RATE_LIMIT)
async def get_discussion_ideas(
    request: Request, # Need request for limiter
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
        results.append(Idea(**idea_doc))

    return results