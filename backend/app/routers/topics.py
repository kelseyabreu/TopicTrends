from fastapi import APIRouter, BackgroundTasks, Body, Depends, Request
from typing import List, Dict, Any
from app.services.genkit.ai import cluster_ideas_into_topics
from app.services.genkit.cluster import _map_ideas_for_output
from app.models.schemas import Topic, TopicIdPayload, TopicsResponse
from app.models.query_models import TopicQueryParameters, PaginatedResponse
from app.services.query_executor import create_topic_query_executor
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.config import settings
from app.routers.discussions import get_discussion_by_id_internal
import logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["topics"])

# Create topic query executor
topic_query_executor = create_topic_query_executor()

# Routes
@router.get("/discussions/{discussion_id}/topics", response_model=None)
@limiter.limit(settings.HIGH_RATE_LIMIT)
async def get_discussion_topics(
    request: Request,
    discussion_id: str,
):
    """
    Get topics for a discussion with server-side sorting, filtering, and pagination.
    Uses the standardized query service pattern for consistency with other endpoints.

    Supports both legacy format (TopicsResponse) and new paginated format based on query parameters.

    Example queries:
    - `/api/discussions/{id}/topics` (legacy format)
    - `/api/discussions/{id}/topics?page=1&page_size=10&sort=count&sort_dir=desc` (paginated)
    - `/api/discussions/{id}/topics?sort=id&sort_dir=desc` (newest first)
    """
    # Validate discussion exists
    await get_discussion_by_id_internal(discussion_id)

    # Extract query parameters using the standardized service
    params = await topic_query_executor.query_service.get_query_parameters_dependency()(request)

    # Get database connection
    db = await get_db()

    # Determine sort field and direction from params
    sort_field = params.sort if params.sort else "count"  # Default to count (popular)
    sort_dir = params.sort_dir if params.sort_dir else "desc"  # Default to descending

    # Map frontend sort field to MongoDB field
    if sort_field == "id":
        mongo_sort_field = "_id"
    elif sort_field == "count":
        mongo_sort_field = "count"  # We'll calculate this after fetching ideas
    else:
        mongo_sort_field = "_id"  # Default fallback

    # Determine MongoDB sort direction
    mongo_sort_direction = -1 if sort_dir == "desc" else 1

    # Fetch all topic documents for the discussion
    if sort_field == "count":
        # For count sorting, we need to fetch all topics first, then sort by actual idea count
        topic_docs = await db.topics.find({"discussion_id": discussion_id}).sort("_id", 1).to_list(length=None)
    else:
        # For other fields, we can sort directly in MongoDB
        topic_docs = await db.topics.find({"discussion_id": discussion_id}).sort(mongo_sort_field, mongo_sort_direction).to_list(length=None)

    # Build topics with nested ideas (same as original logic)
    results = []
    for topic_doc in topic_docs:
        topic_id = str(topic_doc["_id"])

        # Fetch ideas belonging to this specific topic_id from the 'ideas' collection
        ideas_cursor = db.ideas.find({"topic_id": topic_id}).sort("timestamp", 1)
        ideas_list = await ideas_cursor.to_list(length=None)

        # Map fetched ideas to the required output format
        nested_ideas_data = _map_ideas_for_output(ideas_list)

        # Construct the final Topic object using fetched data
        topic_data_for_pydantic = {
            "id": topic_id,
            "representative_idea_id": str(topic_doc.get("representative_idea_id")) if topic_doc.get("representative_idea_id") else None,
            "representative_text": topic_doc.get("representative_text", "Untitled Topic"),
            "count": len(ideas_list),  # Use the actual count of fetched ideas
            "ideas": nested_ideas_data  # Use the dynamically fetched & mapped ideas
        }

        try:
            # Validate and create the Pydantic model instance
            topic_model = Topic(**topic_data_for_pydantic)
            results.append(topic_model)
        except Exception as e:
            logger.error(f"Pydantic validation failed for topic {topic_id}: {e}. Skipping topic.", exc_info=True)

    # Sort by count if needed (since we couldn't sort in MongoDB for count)
    if sort_field == "count":
        results.sort(key=lambda t: t.count, reverse=(sort_dir == "desc"))

    # Get unclustered count (needed for both paginated and legacy responses)
    unclustered_count = await db.ideas.count_documents({
        "discussion_id": discussion_id,
        "topic_id": None
    })

    # Use standardized pagination response
    total_topics = len(results)
    page = params.page if params.page else 1
    page_size = params.page_size if params.page_size else total_topics

    # Apply pagination
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_results = results[start_idx:end_idx]

    # Create standardized paginated response
    from app.models.query_models import PaginatedResponse, PaginationMetadata, QueryMetadata

    pagination_metadata = PaginationMetadata(
        page=page,
        page_size=page_size,
        total_items=total_topics,
        total_pages=(total_topics + page_size - 1) // page_size,
        has_previous=page > 1,
        has_next=page < (total_topics + page_size - 1) // page_size
    )

    query_metadata = QueryMetadata(
        search_term_used=params.search,
        filters_applied={},
        sort_by=params.sort,
        sort_direction=params.sort_dir,
        execution_time_ms=0  # Could be calculated if needed
    )

    paginated_response = PaginatedResponse[Topic](
        items=paginated_results,
        pagination=pagination_metadata,
        query_metadata=query_metadata
    )

    # Convert to TanStack format and add unclustered_count
    response_dict = paginated_response.to_tanstack_response()
    response_dict["unclustered_count"] = unclustered_count

    return response_dict


@router.post("/topics", response_model=List[dict]) 
async def create_topics(
        payload: TopicIdPayload, # Expect JSON object
        background_tasks: BackgroundTasks, # Keep BackgroundTasks import
        # Note: Drill-down clustering usually shouldn't run in background
        # Consider making this synchronous for drill-down.
):
    """
    Drill-down into an existing topic to generate sub-topics.
    Accepts {"topic_id": "..."} in the request body.
    Returns the generated sub-topic data without persisting it fully.
    """
    topic_id = payload.topic_id
    logger.info(f"Received request to drill-down cluster topic_id: {topic_id}")

    # Call clustering logic for drill-down (persist_results=False)
    # This call is synchronous in this implementation.
    sub_topic_results = await cluster_ideas_into_topics(topic_id=topic_id, persist_results=False)

    if sub_topic_results is None: # Handle potential errors from clustering
         logger.error(f"Sub-topic generation failed for topic_id: {topic_id}")
         # Return an empty list or raise an appropriate HTTP error
         # Returning empty list might be preferred by frontend expecting a list
         return []
         # Or raise HTTPException(status_code=500, detail="Sub-topic generation failed.")

    # Check if the result indicates an error (based on the example in generate_topic_results error handling)
    if sub_topic_results and isinstance(sub_topic_results, list) and len(sub_topic_results) > 0 and sub_topic_results[0].get("error"):
        logger.error(f"Sub-topic generation returned an error for {topic_id}: {sub_topic_results[0]['error']}")
        # Return empty list or raise
        return []
        # Or raise HTTPException(status_code=500, detail=sub_topic_results[0]['error'])


    # --- Return the list directly, matching response_model=List[dict] ---
    logger.info(f"Returning {len(sub_topic_results)} generated sub-topics for topic {topic_id}")
    return sub_topic_results
