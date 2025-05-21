"""
Query Execution Utilities for TopicTrends API 

This module provides the QueryExecutor class, a high-level interface for executing
standardized MongoDB queries using the MongoDBQueryService. It supports rate limiting,
application of additional filters, and result transformations, optimized for frontend usage
including TanStack Query/Table integration.
"""

import logging
import time
from typing import Dict, List, Any, Optional, Type, TypeVar, Generic, Callable
from datetime import datetime

from fastapi import Depends, Request, Query as FastAPIQueryParam, HTTPException, status # Renamed Query to avoid class name clash
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.models.query_models import (
    QueryParameters, PaginatedResponse, FilterCondition, FilterOperator,
    DiscussionQueryParameters, TopicQueryParameters, IdeaQueryParameters,
    EntityMetricsQueryParameters, InteractionQueryParameters, UserInteractionStateQueryParameters
)
from app.services.query_service import MongoDBQueryService # Use  service
# Assuming app.models.schemas contains the actual Pydantic models for DB entities
from app.models.schemas import Discussion, Topic, Idea
from app.models.interaction_schemas import EntityMetrics, InteractionEvent, UserInteractionState

from app.core.limiter import limiter # For rate limiting
from app.core.config import settings # For default settings like rate limits

# Type variable for generic entity type (Pydantic model of the items in response)
T_ResponseModel = TypeVar('T_ResponseModel', bound=BaseModel)
# Type variable for specific QueryParameters type (e.g., DiscussionQueryParameters)
T_Query_Params = TypeVar('T_Query_Params', bound=QueryParameters)

logger = logging.getLogger(__name__)

class QueryExecutor(Generic[T_ResponseModel, T_Query_Params]):
    """
    Executes standardized queries for specific entity types.
    It uses a MongoDBQueryService instance for database interactions and adds
    features like rate limiting, additional server-side filters, and transformations.
    
    Type Parameters:
        T_ResponseModel: The Pydantic model type for response items.
        T_Query_Params: The specific QueryParameters model type for this executor.
    """
    
    def __init__(
        self, 
        query_service: MongoDBQueryService[T_ResponseModel, T_Query_Params],
        rate_limit: Optional[str] = None,
        transform_function: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
    ):
        """
        Initializes the QueryExecutor.
        
        Args:
            query_service: An instance of MongoDBQueryService configured for a specific collection.
            rate_limit: Rate limit string (e.g., "10/minute"). Uses default if None.
            transform_function: A function to transform raw DB documents before Pydantic validation.
                                This is passed to the query_service.
        """
        self.query_service = query_service
        if transform_function:
            self.query_service.transform_function = transform_function
            
        self.rate_limit = rate_limit if rate_limit is not None else settings.DEFAULT_RATE_LIMIT
        
    async def execute(
        self, 
        params: T_Query_Params, # Expects the specific QueryParameters type
        additional_filter: Optional[Dict[str, Any]] = None
    ) -> PaginatedResponse[T_ResponseModel]:
        """
        Executes a query using the configured query service.
        
        Args:
            params: The validated query parameters.
            additional_filter: An optional dictionary of server-side filters to apply.
                               These are added as EQ filters.
                               Example: `{"discussion_id": "some_id"}`
        
        Returns:
            A PaginatedResponse containing the query results and metadata.
        """
        # Create a mutable copy of params to add additional_filter if needed.
        # This ensures the original params object (e.g., from FastAPI Depends) is not modified.
        effective_params = params.model_copy(deep=True)

        if additional_filter:
            for field, value in additional_filter.items():
                # Create a new FilterCondition for each item in additional_filter
                # and append it to the existing filters.
                effective_params.filters.append(
                    FilterCondition(field=field, operator=FilterOperator.EQ, value=value)
                )
        
        # Note: Query execution time is now calculated and set by the MongoDBQueryService
        # The execute_query method in the service already handles this.
        # If we wanted to measure executor overhead, we could time here as well.
        logger.debug(f"QueryExecutor executing for {self.query_service.collection_name} with params: {effective_params.model_dump_json(indent=2)}")
        
        result = await self.query_service.execute_query(effective_params)
        
        logger.debug(f"QueryExecutor for {self.query_service.collection_name} completed. Total items: {result.pagination.total_items}.")
        
        return result
        
    def get_dependency(self) -> Callable[..., PaginatedResponse[T_ResponseModel]]:
        """
        Creates a FastAPI dependency that parses query parameters using the service's
        parameter model, applies rate limiting, and executes the query.
        
        Returns:
            An awaitable FastAPI dependency function.
        """
        # Get the dependency that extracts and validates T_Query_Params
        params_dependency: Callable[..., T_Query_Params] = self.query_service.get_query_parameters_dependency()
        
        async def execute_query_dependency(
            request: Request, # Request is needed for rate limiting
            params: T_Query_Params = Depends(params_dependency) # params is of type T_Query_Params
        ) -> PaginatedResponse[T_ResponseModel]:
            if self.rate_limit:
                await limiter.check(request) # Assumes limiter.check is an async method
            return await self.execute(params)
        
        execute_query_dependency.__doc__ = f"""
        Standard query endpoint for {self.query_service.collection_name}.
        Parses query parameters, applies rate limiting, and returns a paginated response.
        Supports filtering, sorting, searching, and field projection.
        """
        return execute_query_dependency # type: ignore
    
    def get_filtered_dependency(self, filter_field: str, filter_operator: FilterOperator = FilterOperator.EQ):
        """
        Creates a FastAPI dependency for executing queries with a fixed, additional filter
        applied based on a path or query parameter.
        
        Args:
            filter_field: The database field to apply the fixed filter on.
            filter_operator: The operator for the fixed filter (default: EQ).
        
        Returns:
            An awaitable FastAPI dependency function.
        """
        params_dependency: Callable[..., T_Query_Params] = self.query_service.get_query_parameters_dependency()
        
        async def execute_filtered_query_dependency(
            request: Request,
            # Use FastAPIQueryParam for path/query parameter for filter_value
            filter_value: str = FastAPIQueryParam(..., description=f"Value to filter '{filter_field}' by using {filter_operator.value} operator."),
            params: T_Query_Params = Depends(params_dependency)
        ) -> PaginatedResponse[T_ResponseModel]:
            if self.rate_limit:
                 await limiter.check(request)
            
            # Add the fixed filter to a copy of the params
            effective_params = params.model_copy(deep=True)
            effective_params.filters.append(
                FilterCondition(field=filter_field, operator=filter_operator, value=filter_value)
            )
            return await self.execute(effective_params)

        execute_filtered_query_dependency.__doc__ = f"""
        Query for {self.query_service.collection_name}, with an additional server-side filter:
        '{filter_field}' {filter_operator.value} [filter_value provided in request].
        Supports all standard query parameters (pagination, search, sort, other filters).
        """
        return execute_filtered_query_dependency # type: ignore
    
    def get_tanstack_endpoint_handler(self, additional_filter_logic: Optional[Callable[[Request], Dict[str, Any]]] = None):
        """
        Creates a FastAPI endpoint handler specifically for TanStack Query/Table integration.
        It parses parameters (TanStack or regular HTTP), executes the query,
        and returns data in a TanStack-compatible format.
        
        Args:
            additional_filter_logic: An optional callable that takes a Request and returns
                                     a dictionary of additional filters to apply.
        
        Returns:
            An awaitable FastAPI endpoint handler function.
        """
        # Get the dependency that extracts and validates T_Query_Params from regular HTTP query params
        params_from_http_dependency: Callable[..., T_Query_Params] = self.query_service.get_query_parameters_dependency()
        # Get the Pydantic model class for query parameters used by this service
        SpecificQueryParamsModel: Type[T_Query_Params] = self.query_service.get_parameter_model()

        async def tanstack_endpoint_handler_function(request: Request):
            if self.rate_limit:
                await limiter.check(request)
            
            params_instance: T_Query_Params
            
            # TanStack Table might send its state via GET (query params) or POST (JSON body).
            # This handler tries to be flexible.
            # A common GET pattern is to stringify the TanStack state into one query param,
            # or send individual params matching TanStack's state structure.
            
            if request.method == "POST":
                try:
                    tanstack_state_dict = await request.json()
                    params_instance = SpecificQueryParamsModel.from_tanstack_params(tanstack_state_dict)
                except Exception as e:
                    logger.warning(f"Failed to parse TanStack params from POST body: {e}. Falling back to HTTP query params.", exc_info=False)
                    params_instance = await params_from_http_dependency(request=request)
            else: # GET or other methods, parse from HTTP query params
                # The `params_from_http_dependency` is designed to handle standard HTTP query params.
                # If TanStack sends its state as individual query params (e.g., pagination[pageIndex]=0),
                # `MongoDBQueryService.extract_query_parameters` would need to be adapted, or
                # `QueryParameters.from_tanstack_params` would need to be called with `dict(request.query_params)`.
                # For simplicity here, we rely on `params_from_http_dependency` for GETs.
                # A more robust solution might check for a specific "tanstackState" query param.
                params_instance = await params_from_http_dependency(request=request)

            additional_filters = {}
            if additional_filter_logic:
                # Example: extract discussion_id from path params if this handler is for /discussions/{discussion_id}/ideas-table
                additional_filters = additional_filter_logic(request) 

            try:
                result = await self.execute(params_instance, additional_filters)
                tanstack_response_payload = result.to_tanstack_response()
                return JSONResponse(content=tanstack_response_payload)
            except HTTPException as http_exc: # Re-raise HTTPExceptions from service/param parsing
                raise http_exc
            except Exception as e:
                logger.error(f"Error in TanStack endpoint handler for {self.query_service.collection_name}: {e}", exc_info=True)
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={"error": "Failed to process TanStack request.", "detail": str(e)}
                )
        
        tanstack_endpoint_handler_function.__doc__ = f"""
        TanStack Query/Table compatible endpoint for {self.query_service.collection_name}.
        Parses TanStack state (from POST body or HTTP query params) and returns data
        formatted for server-side TanStack Table integration.
        """
        return tanstack_endpoint_handler_function

# --- Default Transformation Functions (Examples) ---
# These can be passed to the QueryExecutor factory functions.

def format_datetime_fields(doc: Dict[str, Any], fields_to_format: List[str]) -> Dict[str, Any]:
    """Converts specified datetime fields in a document to ISO 8601 string format."""
    for field in fields_to_format:
        if field in doc and isinstance(doc[field], datetime):
            doc[field] = doc[field].isoformat()
    return doc

def remove_fields_from_doc(doc: Dict[str, Any], fields_to_remove: List[str]) -> Dict[str, Any]:
    """Removes specified fields from a document."""
    for field in fields_to_remove:
        if field in doc:
            del doc[field]
    return doc

def truncate_array_fields_in_doc(doc: Dict[str, Any], field_limits: Dict[str, int]) -> Dict[str, Any]:
    """Truncates specified array fields in a document to a given limit."""
    for field, limit in field_limits.items():
        if field in doc and isinstance(doc[field], list) and len(doc[field]) > limit:
            doc[field] = doc[field][:limit]
            # Optionally add an indicator that the array was truncated
            doc[f"{field}_has_more"] = True 
    return doc

# --- Factory functions for common entity QueryExecutors ---
# These tie together the service, specific query param model, response model, and default transformations.

def create_discussion_query_executor(
    response_model: Type[T_ResponseModel] = Discussion, # type: ignore
    rate_limit: Optional[str] = None,
    custom_transform: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
) -> QueryExecutor[Discussion, DiscussionQueryParameters]: # type: ignore
    
    def default_discussion_transform(doc: Dict[str, Any]) -> Dict[str, Any]:
        doc = format_datetime_fields(doc, ['created_at', 'last_activity'])
        doc = remove_fields_from_doc(doc, ['qr_code']) # Example: QR code likely not needed in list views
        return doc
    
    transform_to_use = custom_transform if custom_transform is not None else default_discussion_transform
    query_service = MongoDBQueryService.for_discussions(response_model=response_model) # type: ignore
    
    return QueryExecutor(
        query_service=query_service,
        rate_limit=rate_limit, 
        transform_function=transform_to_use
    ) # type: ignore

def create_topic_query_executor(
    response_model: Type[T_ResponseModel] = Topic, # type: ignore
    rate_limit: Optional[str] = None,
    custom_transform: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
) -> QueryExecutor[Topic, TopicQueryParameters]: # type: ignore
    
    def default_topic_transform(doc: Dict[str, Any]) -> Dict[str, Any]:
        doc = truncate_array_fields_in_doc(doc, {'ideas': 5}) # Truncate 'ideas' array for list views
        return doc

    transform_to_use = custom_transform if custom_transform is not None else default_topic_transform
    query_service = MongoDBQueryService.for_topics(response_model=response_model) # type: ignore
    
    return QueryExecutor(
        query_service=query_service,
        rate_limit=rate_limit,
        transform_function=transform_to_use
    ) # type: ignore

def create_idea_query_executor(
    response_model: Type[T_ResponseModel] = Idea, # type: ignore
    rate_limit: Optional[str] = None,
    custom_transform: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
) -> QueryExecutor[Idea, IdeaQueryParameters]: # type: ignore
    
    def default_idea_transform(doc: Dict[str, Any]) -> Dict[str, Any]:
        doc = format_datetime_fields(doc, ['timestamp'])
        doc = remove_fields_from_doc(doc, ['embedding']) # Embeddings are large and usually not for client lists
        return doc

    transform_to_use = custom_transform if custom_transform is not None else default_idea_transform
    query_service = MongoDBQueryService.for_ideas(response_model=response_model) # type: ignore
    
    return QueryExecutor(
        query_service=query_service,
        rate_limit=rate_limit,
        transform_function=transform_to_use
    ) # type: ignore

def create_entity_metrics_query_executor(
    response_model: Type[T_ResponseModel] = EntityMetrics, # type: ignore
    rate_limit: Optional[str] = None,
    custom_transform: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
) -> QueryExecutor[EntityMetrics, EntityMetricsQueryParameters]: # type: ignore
    
    def default_metrics_transform(doc: Dict[str, Any]) -> Dict[str, Any]:
        if 'metrics' in doc and isinstance(doc['metrics'], dict):
            doc['metrics'] = format_datetime_fields(doc['metrics'], ['last_activity_at'])
        # Complex transformations for time_window_metrics if needed
        # e.g., formatting timestamps within time_window_metrics.hourly array
        if 'time_window_metrics' in doc and isinstance(doc.get('time_window_metrics'), dict):
            twm = doc['time_window_metrics']
            if 'hourly' in twm and isinstance(twm.get('hourly'), list):
                twm['hourly'] = [format_datetime_fields(h_doc, ['timestamp']) for h_doc in twm['hourly']]
            # Note: 'daily' typically uses string dates like "YYYY-MM-DD", may not need datetime formatting here.
        return doc

    transform_to_use = custom_transform if custom_transform is not None else default_metrics_transform
    query_service = MongoDBQueryService.for_entity_metrics(response_model=response_model) # type: ignore
    
    return QueryExecutor(
        query_service=query_service,
        rate_limit=rate_limit,
        transform_function=transform_to_use
    ) # type: ignore

def create_interaction_query_executor(
    response_model: Type[T_ResponseModel] = InteractionEvent, # type: ignore
    rate_limit: Optional[str] = None,
    custom_transform: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
) -> QueryExecutor[InteractionEvent, InteractionQueryParameters]: # type: ignore
    
    def default_interaction_transform(doc: Dict[str, Any]) -> Dict[str, Any]:
        doc = format_datetime_fields(doc, ['timestamp'])
        if 'client_info' in doc and isinstance(doc['client_info'], dict):
            doc['client_info'] = remove_fields_from_doc(doc['client_info'], ['ip_address']) # Example: remove raw IP
        return doc

    transform_to_use = custom_transform if custom_transform is not None else default_interaction_transform
    query_service = MongoDBQueryService.for_interactions(response_model=response_model) # type: ignore
    
    return QueryExecutor(
        query_service=query_service,
        rate_limit=rate_limit,
        transform_function=transform_to_use
    ) # type: ignore

def create_user_interaction_state_query_executor(
    response_model: Type[T_ResponseModel] = UserInteractionState, # type: ignore
    rate_limit: Optional[str] = None,
    custom_transform: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
) -> QueryExecutor[UserInteractionState, UserInteractionStateQueryParameters]: # type: ignore
    
    def default_state_transform(doc: Dict[str, Any]) -> Dict[str, Any]:
        doc = format_datetime_fields(doc, ['last_updated_at'])
        if 'state' in doc and isinstance(doc['state'], dict):
            doc['state'] = format_datetime_fields(doc['state'], ['first_viewed_at', 'last_viewed_at'])
        return doc

    transform_to_use = custom_transform if custom_transform is not None else default_state_transform
    query_service = MongoDBQueryService.for_user_interaction_states(response_model=response_model) # type: ignore
    
    return QueryExecutor(
        query_service=query_service,
        rate_limit=rate_limit,
        transform_function=transform_to_use
    ) # type: ignore
