from fastapi import APIRouter, BackgroundTasks, Body, Depends, Request
from app.services.auth import verify_csrf_dependency
from typing import List, Dict, Any
from app.services.genkit.agglomerative_clustering import cluster_ideas_into_topics, _map_ideas_for_output
from app.models.schemas import Topic, TopicIdPayload, TopicsResponse
from app.models.query_models import TopicQueryParameters, PaginatedResponse
from app.services.query_executor import create_topic_query_executor, create_idea_query_executor
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.config import settings
from app.routers.discussions import get_discussion_by_id_internal
import logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(tags=["topics"])

# Create query executors
topic_query_executor = create_topic_query_executor()
idea_query_executor = create_idea_query_executor()

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

    # PERFORMANCE OPTIMIZATION: Use aggregation pipeline to avoid N+1 queries
    # This replaces 144 individual queries with 1 efficient aggregation

    pipeline = [
        # Match topics for this discussion
        {"$match": {"discussion_id": discussion_id}},

        # Lookup to count ideas only (no full idea data for performance)
        {"$lookup": {
            "from": "ideas",
            "localField": "_id",
            "foreignField": "topic_id",
            "as": "idea_count_check"
        }},

        # Add actual count field based on ideas found
        {"$addFields": {
            "actual_count": {"$size": "$idea_count_check"}
        }},

        # Project final fields (no idea data, just metadata)
        {"$project": {
            "_id": 1,
            "representative_text": 1,
            "count": "$actual_count",
            "centroid_embedding": 1,
            "created_at": 1,
            "updated_at": 1
        }}
    ]

    # Add sorting to pipeline if not sorting by count
    if sort_field != "count":
        pipeline.append({"$sort": {mongo_sort_field: mongo_sort_direction}})

    # Execute aggregation
    topic_docs = await db.topics.aggregate(pipeline).to_list(length=None)

    # Build results from aggregated data (no ideas loaded for performance)
    results = []
    for topic_doc in topic_docs:
        # Create Topic object without ideas (empty list for fast loading)
        topic_data_for_pydantic = {
            "id": str(topic_doc["_id"]),
            "representative_idea_id": None,  # Will be loaded on-demand
            "representative_text": topic_doc.get("representative_text", "Untitled Topic"),
            "count": topic_doc.get("count", 0),
            "ideas": [],  # Empty - ideas loaded on-demand via separate endpoint
            "centroid_embedding": topic_doc.get("centroid_embedding")
        }

        try:
            topic_model = Topic(**topic_data_for_pydantic)
            results.append(topic_model)
        except Exception as e:
            logger.error(f"Pydantic validation failed for topic {topic_doc['_id']}: {e}. Skipping topic.", exc_info=True)

    # Sort by count if needed (since we couldn't sort in MongoDB for count)
    if sort_field == "count":
        results.sort(key=lambda t: t.count, reverse=(sort_dir == "desc"))

    # Get unclustered count (includes ideas needing processing)
    unclustered_count = await db.ideas.count_documents({
        "discussion_id": discussion_id,
        "$or": [
            {"topic_id": None},  # Not assigned to topic
            {"status": {"$in": ["pending", "stuck"]}}  # Still processing
        ]
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


@router.get("/topics/{topic_id}/ideas", response_model=None)
@limiter.limit(settings.HIGH_RATE_LIMIT)
async def get_topic_ideas(
    request: Request,
    topic_id: str,
):
    """
    Get ideas for a specific topic with server-side sorting, filtering, and pagination.
    Uses the standardized query service pattern for consistency with other endpoints.

    Supports advanced querying:
    - Pagination with page and page_size
    - Sorting with sort and sort_dir
    - Filtering with multiple operators (eq, ne, gt, lt, in, etc.)
    - Text search across relevant fields
    - Field projection to limit returned data

    Example queries:
    - `/api/topics/{id}/ideas?page=1&page_size=20&sort=timestamp&sort_dir=desc`
    - `/api/topics/{id}/ideas?filter.verified=true&sort=sentiment&sort_dir=asc`
    - `/api/topics/{id}/ideas?search=environment&sort=timestamp&sort_dir=desc`
    """
    # Validate topic exists
    db = await get_db()
    topic = await db.topics.find_one({"_id": topic_id})
    if not topic:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")

    # Extract query parameters using the standardized service
    params = await idea_query_executor.query_service.get_query_parameters_dependency()(request)

    # Execute query using the standardized pattern with additional_filter
    # This follows the established pattern used throughout the codebase
    result = await idea_query_executor.execute(
        params=params,
        additional_filter={"topic_id": topic_id}
    )
    return result.to_tanstack_response()


@router.post("/topics", response_model=List[dict], dependencies=[Depends(verify_csrf_dependency)])
@limiter.limit(settings.DEFAULT_RATE_LIMIT)
async def create_topics(
        request: Request,
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
