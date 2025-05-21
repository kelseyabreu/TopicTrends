"""
MongoDB Query Service for TopicTrends API 

This module provides a high-performance, type-safe query service for MongoDB collections
with advanced filtering, searching, sorting, and pagination capabilities.
It uses Pydantic V2 models and supports efficient aggregation.
"""

import logging
import re
import time
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Tuple, TypeVar, Generic, Type, Callable, cast

from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from fastapi import Request, HTTPException, status
from pydantic import BaseModel

from app.models.query_models import (
    QueryParameters, FilterOperator, FilterCondition, PaginatedResponse,
    PaginationMetadata, QueryMetadata, SortDirection,
    DiscussionQueryParameters, TopicQueryParameters, IdeaQueryParameters,
    EntityMetricsQueryParameters, InteractionQueryParameters, UserInteractionStateQueryParameters
)
# Assuming app.models.schemas contains the actual Pydantic models for DB entities
from app.models.schemas import Discussion, Topic, Idea # Add other specific response models if needed
from app.models.interaction_schemas import EntityMetrics, InteractionEvent, UserInteractionState
from app.core.database import get_db
# from app.core.config import settings # For default settings if needed

logger = logging.getLogger(__name__)

T_ResponseModel = TypeVar('T_ResponseModel', bound=BaseModel) # For Pydantic models (responses)
T_Query_Params = TypeVar('T_Query_Params', bound=QueryParameters) # For QueryParameter types

# --- MongoDB Collection Configuration ---
# This configuration drives the behavior of the MongoDBQueryService.
# - text_index_fields: Fields covered by a MongoDB text index.
# - default_sort: Default sorting order if not specified by the client.
# - searchable_fields: Fields for fallback regex search if text index not used.
# - datetime_fields, boolean_fields, numeric_fields, array_fields: Used for type casting/handling filter values.
# - parameter_model: The Pydantic model used to validate query parameters for this entity.
# - response_model_default: The default Pydantic model for response items from this collection.
COLLECTION_CONFIG: Dict[str, Dict[str, Any]] = {
    "discussions": {
        "text_index_fields": ["title", "prompt", "tags"],
        "default_sort": ("created_at", DESCENDING),
        "searchable_fields": ["title", "prompt", "creator_id", "tags"],
        "datetime_fields": ["created_at", "last_activity"],
        "boolean_fields": ["require_verification"],
        "numeric_fields": ["idea_count", "topic_count"],
        "array_fields": ["tags"],
        "parameter_model": DiscussionQueryParameters,
        "response_model_default": Discussion,
    },
    "topics": {
        "text_index_fields": ["representative_text", "generated_summary"],
        "default_sort": ("count", DESCENDING),
        "searchable_fields": ["representative_text", "representative_idea_id", "generated_summary"],
        "datetime_fields": [], "boolean_fields": [], "numeric_fields": ["count"], "array_fields": ["ideas"], # 'ideas' for IN operator
        "parameter_model": TopicQueryParameters,
        "response_model_default": Topic,
    },
    "ideas": {
        "text_index_fields": ["text", "keywords"],
        "default_sort": ("timestamp", DESCENDING),
        "searchable_fields": ["text", "intent", "sentiment", "keywords", "submitter_display_id", "language"],
        "datetime_fields": ["timestamp"], "boolean_fields": ["verified"],
        "numeric_fields": ["on_topic", "specificity"], "array_fields": ["keywords", "related_topics"],
        "parameter_model": IdeaQueryParameters,
        "response_model_default": Idea,
    },
    "entity_metrics": {
        "text_index_fields": [],
        "default_sort": ("metrics.last_activity_at", DESCENDING),
        "searchable_fields": ["entity_id", "entity_type", "parent_id"],
        "datetime_fields": ["metrics.last_activity_at", "time_window_metrics.hourly.timestamp", "time_window_metrics.daily.date"],
        "boolean_fields": [],
        "numeric_fields": ["metrics.view_count", "metrics.like_count", "metrics.pin_count", "metrics.save_count", "metrics.unique_view_count"],
        "array_fields": [], # time_window_metrics are complex, usually not filtered by simple array ops
        "parameter_model": EntityMetricsQueryParameters,
        "response_model_default": EntityMetrics,
    },
    "interaction_events": {
        "text_index_fields": [],
        "default_sort": ("timestamp", DESCENDING),
        "searchable_fields": ["entity_id", "entity_type", "action_type", "user_id", "anonymous_id", "session_id", "value"],
        "datetime_fields": ["timestamp"], "boolean_fields": [],
        "numeric_fields": [], # 'value' could be numeric but is Any, handle in parsing if needed
        "array_fields": [],
        "parameter_model": InteractionQueryParameters,
        "response_model_default": InteractionEvent,
    },
    "user_interaction_states": {
        "text_index_fields": [],
        "default_sort": ("last_updated_at", DESCENDING),
        "searchable_fields": ["user_identifier", "entity_id", "entity_type"],
        "datetime_fields": ["last_updated_at", "state.first_viewed_at", "state.last_viewed_at"],
        "boolean_fields": ["state.liked", "state.pinned", "state.saved"],
        "numeric_fields": ["state.view_count"],
        "array_fields": [],
        "parameter_model": UserInteractionStateQueryParameters,
        "response_model_default": UserInteractionState,
    }
}


class MongoDBQueryService(Generic[T_ResponseModel, T_Query_Params]):
    """
    Service for building and executing MongoDB queries with advanced capabilities.
    """
    
    def __init__(
        self, 
        collection_name: str,
        response_model: Type[T_ResponseModel],
    ):
        self.collection_name = collection_name
        self.response_model = response_model
        self.transform_function: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
        
        self.config = COLLECTION_CONFIG.get(collection_name)
        if not self.config:
            logger.critical(f"FATAL: No collection configuration found for '{collection_name}'. Service cannot operate.")
            raise ValueError(f"Missing configuration for collection: {collection_name}")
        
        self._param_model_cls: Type[T_Query_Params] = self.config["parameter_model"]
        self._text_search_score_alias: str = "text_score" # Consistent alias
        
        logger.debug(f"Initialized MongoDBQueryService for '{collection_name}' with param model {self._param_model_cls.__name__}")

    async def get_collection(self) -> AsyncIOMotorCollection:
        """Returns the MongoDB collection instance."""
        db: AsyncIOMotorDatabase = await get_db()
        return db[self.collection_name]
        
    async def _has_text_index(self) -> bool:
        """Checks if the collection configuration indicates a text index exists."""
        # For production, one might actually query `collection.index_information()`
        # but for simplicity and performance, we trust the config here.
        return bool(self.config.get("text_index_fields"))

    def _map_id_field(self, field: str) -> str:
        """Maps API 'id' field to MongoDB '_id'."""
        return '_id' if field == 'id' else field
        
    def _convert_sort_direction(self, direction: SortDirection) -> int:
        """Converts SortDirection enum to pymongo sort value."""
        return DESCENDING if direction == SortDirection.DESC else ASCENDING
        
    def _parse_filter_value(self, field: str, value: Any) -> Any:
        """
        Parses and converts a filter value to its appropriate MongoDB type
        based on the field's configuration.
        Note: `FilterCondition` model already handles list conversion for IN/NIN and
        boolean conversion for EXISTS. This method focuses on DB storage types.
        """
        # IDs are typically strings (UUIDs or client-generated) and don't need ObjectId conversion
        # unless your schema strictly uses MongoDB ObjectIds generated by the DB.
        
        if field in self.config.get("datetime_fields", []):
            if isinstance(value, str):
                try:
                    dt_value = value.replace('Z', '+00:00') # Ensure UTC timezone for 'Z'
                    parsed_dt = datetime.fromisoformat(dt_value)
                    # If datetime is naive, one might assume UTC or based on application policy.
                    # Pydantic models should ideally handle this timezone awareness upon input.
                    return parsed_dt
                except ValueError:
                    logger.warning(f"Invalid datetime string '{value}' for field '{field}'. Passing as is.")
                    return value # Let MongoDB or subsequent validation handle it
            elif isinstance(value, datetime):
                return value # Already a datetime object
        
        # FilterCondition validator handles boolean strings for EXISTS.
        # This handles booleans for EQ operator if they arrive as strings.
        if field in self.config.get("boolean_fields", []):
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() in ('true', '1', 'yes', 't')
            return bool(value) # Fallback conversion
            
        if field in self.config.get("numeric_fields", []):
            if isinstance(value, (int, float)):
                return value
            if isinstance(value, str):
                try:
                    # Attempt to parse as float if decimal or exponent present, else int
                    return float(value) if '.' in value or 'e' in value.lower() else int(value)
                except ValueError:
                    logger.warning(f"Invalid numeric string '{value}' for field '{field}'. Passing as is.")
                    return value
        
        # Array fields are primarily handled by FilterCondition's IN/NIN for list conversion.
        # If an EQ filter is used on an array field with a single value, MongoDB handles it.
        # If `value` is a list (e.g., from an IN filter that was parsed), items might need parsing.
        if isinstance(value, list) and field in self.config.get("array_fields", []):
             # Example: if array_fields stores numbers, and `value` is `['1', '2']` from IN op
             # This part is tricky because item types within array might vary.
             # Assuming for now that items in lists from IN/NIN are already of compatible type
             # or the field config for numeric/datetime applies to array *elements*.
             # This would require more complex logic if elements need individual parsing.
             pass # For now, assume list elements are okay.

        return value # Return as is if no specific parsing rule matches
        
    def _build_filter_query(self, params: T_Query_Params) -> Dict[str, Any]:
        """Builds the MongoDB filter document from the List[FilterCondition]."""
        mongo_filter: Dict[str, Any] = {}
        for fc in params.filters:
            field = self._map_id_field(fc.field)
            parsed_value = self._parse_filter_value(field, fc.value)
            mongo_op_str = FilterOperator.get_mongo_operator(fc.operator)

            condition_for_field: Any
            if fc.operator == FilterOperator.EQ:
                condition_for_field = parsed_value
            else:
                condition_for_field = {mongo_op_str: parsed_value}

            if field not in mongo_filter:
                mongo_filter[field] = condition_for_field
            else: # Field already has conditions, need to merge using $and
                current_condition = mongo_filter[field]
                # If current condition is not already a dict of operators, make it one (implicit $eq)
                if not isinstance(current_condition, dict) or not any(k.startswith('$') for k in current_condition.keys()):
                    mongo_filter[field] = {'$eq': current_condition}
                
                # Now mongo_filter[field] is a dict of operators. Add the new one.
                # MongoDB handles { field: { $gt: X, $lt: Y } } as an AND.
                if fc.operator == FilterOperator.EQ:
                     mongo_filter[field]['$eq'] = parsed_value # Add/overwrite $eq
                else:
                    # If the same operator is applied multiple times (e.g., multiple $in),
                    # MongoDB usually expects an $and of those. This simple merge overwrites.
                    # For distinct operators (e.g. $gt and $lt), this merge is correct.
                    mongo_filter[field][mongo_op_str] = parsed_value
        return mongo_filter
        
    async def _build_search_query_part(self, params: T_Query_Params) -> Tuple[Dict[str, Any], bool]:
        """
        Builds the search part of the query ($text or $regex).
        Returns the query dict and a boolean indicating if $text search is active.
        """
        if not params.search:
            return {}, False

        is_text_search_active = False
        search_query: Dict[str, Any] = {}

        # 1. User-specified search_fields (always regex)
        if params.search_fields:
            conditions = [
                {self._map_id_field(f): {"$regex": re.escape(params.search), "$options": "i"}}
                for f in params.search_fields
            ]
            if conditions:
                search_query = {"$or": conditions}
            logger.debug(f"Regex search for '{params.search}' on specified fields: {params.search_fields}")
        
        # 2. $text search if available (config-defined text_index_fields) and no specific search_fields given
        elif await self._has_text_index() and self.config.get("text_index_fields"):
            search_query = {"$text": {"$search": params.search}}
            is_text_search_active = True
            logger.debug(f"$text search for '{params.search}' on default text index for {self.collection_name}")

        # 3. Fallback to regex on default `searchable_fields` from config if $text not used
        elif self.config.get("searchable_fields"):
            default_search_fields = self.config["searchable_fields"]
            conditions = [
                {self._map_id_field(f): {"$regex": re.escape(params.search), "$options": "i"}}
                for f in default_search_fields
            ]
            if conditions:
                search_query = {"$or": conditions}
            logger.debug(f"Fallback regex search for '{params.search}' on default searchable_fields: {default_search_fields}")
        
        else:
            logger.warning(f"Search term '{params.search}' provided, but no search method (text_index_fields, search_fields, or config.searchable_fields) is applicable for {self.collection_name}.")
            
        return search_query, is_text_search_active
        
    def _build_sort_specification(self, params: T_Query_Params, is_text_search_active: bool) -> List[Tuple[str, int]]:
        """Builds the MongoDB sort specification list."""
        sort_direction_pymongo = self._convert_sort_direction(params.sort_dir)
        
        # Sort by relevance if text search is active and requested
        if params.sort == "relevance" and is_text_search_active:
            return [(self._text_search_score_alias, DESCENDING)] # Relevance is typically best descending

        # Sort by a specific field
        if params.sort:
            sort_field_mapped = self._map_id_field(params.sort)
            # Add secondary sort by _id for consistent ordering if primary sort field has duplicates
            # This ensures stable pagination.
            return [(sort_field_mapped, sort_direction_pymongo), ('_id', ASCENDING)] if sort_field_mapped != '_id' else [(sort_field_mapped, sort_direction_pymongo)]

        # Default sort from configuration
        def_field, def_direction_pymongo = self.config.get("default_sort", ("_id", ASCENDING))
        def_field_mapped = self._map_id_field(def_field)
        # Also add secondary _id sort to default if not already _id
        return [(def_field_mapped, def_direction_pymongo), ('_id', ASCENDING)] if def_field_mapped != '_id' else [(def_field_mapped, def_direction_pymongo)]
            
    def _build_projection(self, params: T_Query_Params, is_text_search_active: bool) -> Optional[Dict[str, Any]]:
        """Builds the MongoDB projection document."""
        projection: Optional[Dict[str, Any]] = None
        if params.fields:
            projection = {'_id': 1} # Always include _id (for 'id' mapping and stability)
            for f_name in params.fields:
                if f_name != 'id': # 'id' is derived from '_id', no need to project 'id' directly
                    projection[self._map_id_field(f_name)] = 1
        
        # If sorting by relevance due to text search, add textScore to projection
        if params.sort == "relevance" and is_text_search_active:
            if projection is None: projection = {}
            projection[self._text_search_score_alias] = {'$meta': 'textScore'}
            if '_id' not in projection: projection['_id'] = 1 # Ensure _id is included if only projecting score
        return projection
        
    def _build_aggregation_pipeline(self, 
                                    final_query: Dict[str, Any], 
                                    sort_spec: List[Tuple[str, int]],
                                    skip: int, 
                                    limit: int, 
                                    projection: Optional[Dict[str, Any]] = None
                                   ) -> List[Dict[str, Any]]:
        """Builds an aggregation pipeline for query with total count using $facet."""
        pipeline: List[Dict[str, Any]] = []
        
        # $match stage for filtering (main query conditions)
        if final_query:
            pipeline.append({"$match": final_query})
            
        # $facet stage for getting both paginated results and total count in one go
        facet_results_pipeline: List[Dict[str, Any]] = []
        if sort_spec:
            facet_results_pipeline.append({"$sort": dict(sort_spec)}) # $sort needs a dict
        facet_results_pipeline.append({"$skip": skip})
        facet_results_pipeline.append({"$limit": limit})
        if projection: # Apply projection within the facet for results
            facet_results_pipeline.append({"$project": projection})
            
        pipeline.append({
            "$facet": {
                "paginatedResults": facet_results_pipeline,
                "totalCount": [{"$count": "count"}] # Counts matching documents *after* $match
            }
        })
        
        # $project stage to reshape the output from $facet
        pipeline.append({
            "$project": {
                "items": "$paginatedResults",
                "total_items": {"$arrayElemAt": ["$totalCount.count", 0]} # Get count from array
            }
        })
        # Ensure total_items is 0 if no documents matched (totalCount array would be empty or its element null)
        pipeline.append({"$addFields": {"total_items": {"$ifNull": ["$total_items", 0]}}})
        return pipeline
        
    async def execute_query(self, params: T_Query_Params) -> PaginatedResponse[T_ResponseModel]:
        """Executes the constructed query against MongoDB and returns a paginated response."""
        collection = await self.get_collection()
        query_start_time = time.perf_counter()
        
        try:
            # 1. Build filter query part from `params.filters`
            filter_query_part = self._build_filter_query(params)
            
            # 2. Build search query part from `params.search` and `params.search_fields`
            search_query_part, is_text_search_active = await self._build_search_query_part(params)
            
            # 3. Combine filter and search queries
            final_query: Dict[str, Any] = {}
            if filter_query_part and search_query_part:
                final_query = {"$and": [filter_query_part, search_query_part]}
            elif filter_query_part:
                final_query = filter_query_part
            elif search_query_part:
                final_query = search_query_part
                        
            # 4. Build sort specification
            sort_spec = self._build_sort_specification(params, is_text_search_active)
            
            # 5. Calculate skip and limit for pagination
            skip = (params.page - 1) * params.page_size
            limit = params.page_size
            
            # 6. Build projection
            projection = self._build_projection(params, is_text_search_active)
            
            items_data: List[Dict[str, Any]] = []
            total_items = 0

            # 7. Execute query (aggregation or find)
            if params.use_aggregation:
                pipeline = self._build_aggregation_pipeline(final_query, sort_spec, skip, limit, projection)
                logger.debug(f"Executing Aggregation Pipeline ({self.collection_name}): {pipeline}")
                
                agg_cursor = collection.aggregate(pipeline)
                # The pipeline is designed to return a single document with 'items' and 'total_items'
                agg_result_list = await agg_cursor.to_list(length=1) 
                
                if agg_result_list:
                    query_output = agg_result_list[0]
                    total_items = query_output.get("total_items", 0)
                    items_data = query_output.get("items", [])
                # No else needed, total_items and items_data default to 0/empty list
            else: # Fallback to find() - less efficient for total count
                logger.debug(f"Executing Find Query ({self.collection_name}): q={final_query}, sort={sort_spec}, proj={projection}")
                # This requires two DB calls: one for count, one for data
                total_items = await collection.count_documents(final_query)
                
                find_cursor = collection.find(final_query)
                if sort_spec: find_cursor = find_cursor.sort(sort_spec) # sort takes list of tuples
                find_cursor = find_cursor.skip(skip).limit(limit)
                if projection: find_cursor = find_cursor.project(projection)
                items_data = await find_cursor.to_list(length=limit)
                
            exec_time_ms = (time.perf_counter() - query_start_time) * 1000
            
            # 8. Calculate pagination metadata
            total_pages = (total_items + params.page_size - 1) // params.page_size if total_items > 0 else 1
            # Handle edge case where requested page might be > total_pages if items were deleted
            current_page_for_meta = min(params.page, total_pages) if total_items > 0 else 1

            pagination_meta = PaginationMetadata(
                page=current_page_for_meta, 
                page_size=params.page_size, 
                total_items=total_items,
                total_pages=total_pages, 
                has_previous=current_page_for_meta > 1 and total_items > 0, 
                has_next=current_page_for_meta < total_pages and total_items > 0
            )
            
            # 9. Transform and validate items
            formatted_items: List[T_ResponseModel] = []
            for item_doc in items_data:
                transformed_doc = item_doc
                if self.transform_function: # Apply custom transformation if provided by executor
                    transformed_doc = self.transform_function(transformed_doc)
                
                # Map MongoDB '_id' to 'id' for API consistency
                if '_id' in transformed_doc:
                    transformed_doc['id'] = str(transformed_doc.pop('_id'))
                
                # Remove text search score if it was projected but not part of the response model
                if self._text_search_score_alias in transformed_doc:
                    if self._text_search_score_alias not in self.response_model.model_fields:
                        del transformed_doc[self._text_search_score_alias]
                
                try:
                    model_instance = self.response_model(**transformed_doc)
                    formatted_items.append(model_instance)
                except Exception as e: # Catch PydanticValidationError or other model instantiation errors
                    logger.error(f"Pydantic validation error for item in {self.collection_name}: {e}. Item: {transformed_doc}", exc_info=False)
                    # Depending on policy, you might skip the item, or raise, or return partial data with errors.
                    # Skipping for now to ensure API remains responsive even with some bad data.
            
            # 10. Prepare QueryMetadata
            search_fields_reported = None
            if params.search:
                if params.search_fields:
                    search_fields_reported = params.search_fields
                elif is_text_search_active:
                    search_fields_reported = self.config.get("text_index_fields")
                else: # Regex fallback on default searchable_fields
                    search_fields_reported = self.config.get("searchable_fields")

            query_meta = QueryMetadata(
                search_term_used=params.search,
                search_fields_used=search_fields_reported,
                execution_time_ms=round(exec_time_ms, 2),
                filters_applied=params.get_applied_filters_as_dict(),
                sort_by=params.sort,
                sort_direction=params.sort_dir if params.sort else None # Only report sort_dir if sort_by is present
            )
            
            # 11. Construct final PaginatedResponse
            response = PaginatedResponse[T_ResponseModel](
                items=formatted_items,
                pagination=pagination_meta,
                query_metadata=query_meta
            )
            logger.info(f"Query for {self.collection_name} completed in {exec_time_ms:.2f}ms. Total items matched: {total_items}. Items returned: {len(formatted_items)}.")
            return response
            
        except Exception as e:
            logger.error(f"Error executing query for {self.collection_name}: {e}", exc_info=True)
            # Consider a more specific custom exception for query failures
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database query failed for {self.collection_name}. Error: {str(e)}")

    @classmethod
    async def extract_query_parameters(
        cls, request: Request, param_model_cls: Type[T_Query_Params]
    ) -> T_Query_Params:
        """
        Extracts and validates query parameters from a FastAPI request using the
        specified Pydantic model (e.g., DiscussionQueryParameters).
        This method is designed to be called by `get_query_parameters_dependency`.
        """
        query_params_dict = dict(request.query_params)
        
        # Prepare data for Pydantic model validation.
        # Pydantic V2 handles many type conversions automatically based on field annotations.
        # The `convert_flat_filters_to_list` model_validator in QueryParameters
        # will handle converting a flat dict of filters into List[FilterCondition].
        
        data_for_model: Dict[str, Any] = {}
        
        # Standard QueryParameters fields are extracted.
        # Defaults are typically handled by the Pydantic model itself.
        data_for_model['page'] = query_params_dict.pop('page', QueryParameters.model_fields['page'].default)
        data_for_model['page_size'] = query_params_dict.pop('page_size', QueryParameters.model_fields['page_size'].default)
        data_for_model['search'] = query_params_dict.pop('search', None)
        data_for_model['sort'] = query_params_dict.pop('sort', None)
        data_for_model['sort_dir'] = query_params_dict.pop('sort_dir', QueryParameters.model_fields['sort_dir'].default)
        
        # Handle list fields (search_fields, fields) from comma-separated strings
        search_fields_str = query_params_dict.pop('search_fields', None)
        if search_fields_str:
            data_for_model['search_fields'] = [sf.strip() for sf in search_fields_str.split(',') if sf.strip()]
        
        fields_str = query_params_dict.pop('fields', None)
        if fields_str:
            data_for_model['fields'] = [f.strip() for f in fields_str.split(',') if f.strip()]
        
        use_agg_str = query_params_dict.pop('use_aggregation', 'true').lower() # Default to true
        data_for_model['use_aggregation'] = use_agg_str in ('true', '1', 'yes', 't')

        # Pass remaining query_params_dict items to Pydantic model.
        # The `convert_flat_filters_to_list` validator will pick up any remaining
        # key-value pairs as potential simple equality filters.
        # It also handles structured filter formats like `filter.field.op=value`.
        
        # For structured filters (e.g., filter.field.op=value), we need to pass them
        # in a way that `convert_flat_filters_to_list` can interpret if they are mixed with flat filters.
        # The current `convert_flat_filters_to_list` expects `filters` to be a dict if structured,
        # or it processes root-level flat params.
        
        # Let's prepare `filters_dict_for_model` for the `filters` field of QueryParameters
        filters_dict_for_model: Dict[str, Any] = {}
        filter_pattern = re.compile(r'^filter\.([^.]+)(?:\.([^.]+))?$') # e.g. filter.field.op=value or filter.field=value

        keys_to_pop_from_qparams = []
        for key, value in query_params_dict.items():
            match = filter_pattern.match(key)
            if match:
                field_name, operator_str = match.groups()
                # If operator_str is None, it means filter.field=value, which implies EQ
                operator_key = operator_str or 'eq'
                
                if field_name not in filters_dict_for_model:
                    filters_dict_for_model[field_name] = {}
                
                # If it's just filter.field=value (operator_str is None), it's an EQ.
                # If operator_str is present, it's filter.field.op=value.
                if operator_str is None: # filter.field=value form
                     filters_dict_for_model[field_name] = value # Pydantic validator will see {field: value}
                else: # filter.field.op=value form
                    filters_dict_for_model[field_name][operator_key] = value # Pydantic validator will see {field: {op: value}}
                keys_to_pop_from_qparams.append(key)

        for key in keys_to_pop_from_qparams:
            query_params_dict.pop(key) # Remove processed structured filters

        # Any remaining items in query_params_dict are potential flat EQ filters
        # These will be handled by the `convert_flat_filters_to_list` if passed at root level of data
        data_for_model.update(query_params_dict) # Add remaining as potential flat filters
        
        # If structured filters were found, pass them via the 'filters' key
        if filters_dict_for_model:
            data_for_model['filters'] = filters_dict_for_model
        elif 'filters' not in data_for_model : # ensure 'filters' key exists for validator
             data_for_model['filters'] = {}


        try:
            # Validate and create the specific T_Query_Params instance (e.g., DiscussionQueryParameters)
            params_instance = param_model_cls(**data_for_model)
            return params_instance
        except Exception as e: # Catch Pydantic ValidationErrors
            logger.warning(f"Query parameter validation error for {param_model_cls.__name__}: {e}", exc_info=False)
            # Extract Pydantic error details for a more informative HTTP response
            error_details = e.errors() if hasattr(e, 'errors') else str(e)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, 
                detail=error_details
            )
            
    def get_query_parameters_dependency(self) -> Callable[..., T_Query_Params]:
        """
        Creates a FastAPI dependency for extracting query parameters using this service's
        configured parameter model (`self._param_model_cls`).
        
        The returned dependency, when used in a FastAPI route, will produce an instance
        of `T_Query_Params` (e.g., `DiscussionQueryParameters`).
        """
        param_model_to_use: Type[T_Query_Params] = self._param_model_cls
        
        # Define the actual dependency function
        async def dependency_function(request: Request) -> T_Query_Params:
           return await self.extract_query_parameters(request, param_model_to_use)
        
        return dependency_function # FastAPI will correctly infer types for Depends()

    def get_parameter_model(self) -> Type[T_Query_Params]:
        """Returns the Pydantic model class for query parameters for this service."""
        return self._param_model_cls

    # --- Factory Methods for specific collections ---
    @classmethod
    def for_discussions(cls, response_model: Type[T_ResponseModel] = Discussion) -> 'MongoDBQueryService[T_ResponseModel, DiscussionQueryParameters]': # type: ignore
        return cls(collection_name="discussions", response_model=response_model)

    @classmethod
    def for_topics(cls, response_model: Type[T_ResponseModel] = Topic) -> 'MongoDBQueryService[T_ResponseModel, TopicQueryParameters]': # type: ignore
        return cls(collection_name="topics", response_model=response_model)

    @classmethod
    def for_ideas(cls, response_model: Type[T_ResponseModel] = Idea) -> 'MongoDBQueryService[T_ResponseModel, IdeaQueryParameters]': # type: ignore
        return cls(collection_name="ideas", response_model=response_model)
    
    @classmethod
    def for_entity_metrics(cls, response_model: Type[T_ResponseModel] = EntityMetrics) -> 'MongoDBQueryService[T_ResponseModel, EntityMetricsQueryParameters]': # type: ignore
        return cls(collection_name="entity_metrics", response_model=response_model)

    @classmethod
    def for_interactions(cls, response_model: Type[T_ResponseModel] = InteractionEvent) -> 'MongoDBQueryService[T_ResponseModel, InteractionQueryParameters]': # type: ignore
        return cls(collection_name="interaction_events", response_model=response_model)

    @classmethod
    def for_user_interaction_states(cls, response_model: Type[T_ResponseModel] = UserInteractionState) -> 'MongoDBQueryService[T_ResponseModel, UserInteractionStateQueryParameters]': # type: ignore
        return cls(collection_name="user_interaction_states", response_model=response_model)
        