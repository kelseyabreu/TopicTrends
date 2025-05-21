"""
Query parameter models for TopicTrends API 

This module provides Pydantic V2 models for standardized query parameter handling
across the API, ensuring consistent filtering, pagination, sorting, and
TanStack Query/Table compatibility.
"""

from enum import Enum
from typing import Dict, Optional, Any, List, TypeVar, Generic, Union
from datetime import datetime
import logging

from pydantic import (
    BaseModel, Field, field_validator, model_validator, create_model, ConfigDict
)

logger = logging.getLogger(__name__)

# Generic type for response items
T_ResponseItem = TypeVar('T_ResponseItem', bound=BaseModel)

class SortDirection(str, Enum):
    """Enumeration for sort directions."""
    ASC = "asc"
    DESC = "desc"

class FilterOperator(str, Enum):
    """Supported filter operators for advanced filtering."""
    EQ = "eq"        # Equal
    NE = "ne"        # Not equal
    GT = "gt"        # Greater than
    GTE = "gte"      # Greater than or equal
    LT = "lt"        # Less than
    LTE = "lte"      # Less than or equal
    IN = "in"        # In array
    NIN = "nin"      # Not in array
    EXISTS = "exists"  # Field exists (value should be true/false)
    REGEX = "regex"  # Regular expression match (case-insensitive by default in service)
    
    @classmethod
    def get_mongo_operator(cls, operator: 'FilterOperator') -> str:
        """Convert a FilterOperator to a MongoDB operator string."""
        mapping = {
            cls.EQ: "$eq", cls.NE: "$ne", cls.GT: "$gt", cls.GTE: "$gte",
            cls.LT: "$lt", cls.LTE: "$lte", cls.IN: "$in", cls.NIN: "$nin",
            cls.EXISTS: "$exists", cls.REGEX: "$regex"
        }
        return mapping.get(operator, "$eq") # Default to $eq if somehow not found

class FilterCondition(BaseModel):
    """
    Represents a single filter condition with field, operator, and value.
    
    Example:
        FilterCondition(field="created_at", operator=FilterOperator.GTE, value="2023-01-01T00:00:00Z")
        FilterCondition(field="tags", operator=FilterOperator.IN, value="python,fastapi") # Comma-sep string for IN/NIN
        FilterCondition(field="is_active", operator=FilterOperator.EXISTS, value=True)
    """
    field: str = Field(..., description="Field name to filter on.")
    operator: FilterOperator = Field(FilterOperator.EQ, description="Filter operator.")
    value: Any = Field(..., description="Filter value. For IN/NIN, can be a list or comma-separated string. For EXISTS, boolean.")
    
    model_config = ConfigDict(validate_assignment=True)
    
    @field_validator('value')
    @classmethod
    def validate_value_for_operator(cls, v: Any, info: Any) -> Any:
        """
        Validate and pre-process the value based on the operator.
        Ensures lists for IN/NIN and booleans for EXISTS.
        """
        operator = info.data.get('operator') # info.data contains other field values of the model
        if operator in (FilterOperator.IN, FilterOperator.NIN):
            if not isinstance(v, list):
                if isinstance(v, str):
                    # Split comma-separated string into a list of strings
                    return [item.strip() for item in v.split(',') if item.strip()]
                return [v] # Wrap single value in a list
            # If already a list, ensure items are appropriate (e.g. not nested lists)
            if any(isinstance(item, list) for item in v):
                raise ValueError(f"Nested lists are not supported for {operator.value} operator values.")
            return v
        elif operator == FilterOperator.EXISTS:
            if isinstance(v, str):
                v_lower = v.lower()
                if v_lower in ('true', '1', 'yes', 't'): return True
                if v_lower in ('false', '0', 'no', 'f'): return False
                raise ValueError("EXISTS operator value must be a boolean-like string (true/false, 1/0, yes/no).")
            if not isinstance(v, bool):
                raise ValueError("EXISTS operator value must be a boolean.")
            return v
        elif operator == FilterOperator.REGEX:
            if not isinstance(v, str):
                raise ValueError("REGEX operator value must be a string.")
            if len(v) > 200: # Validate reasonable regex length
                raise ValueError("REGEX pattern too long (max 200 characters).")
        return v

class QueryParameters(BaseModel):
    """
    Base model for query parameters. Validates and structures HTTP query inputs.
    Specific entity query parameter models will inherit from this.
    """
    page: int = Field(1, ge=1, description="Page number for pagination (1-indexed).")
    page_size: int = Field(25, ge=1, le=200, description="Number of items per page (max 200).")
    
    search: Optional[str] = Field(None, min_length=1, max_length=200, description="Text to search for across relevant fields.")
    search_fields: Optional[List[str]] = Field(None, min_items=1, description="Specific fields for regex-based search. If omitted, text index search (if available) or default searchable fields are used.")
    
    sort: Optional[str] = Field(None, description="Field to sort by (e.g., 'created_at', 'relevance'). 'relevance' is used for text search score.")
    sort_dir: SortDirection = Field(SortDirection.DESC, description="Sort direction ('asc' or 'desc').")
    
    filters: List[FilterCondition] = Field(default_factory=list, description="List of filter conditions to apply.")
    
    fields: Optional[List[str]] = Field(None, min_items=1, description="Specific fields to include in the response items (projection). 'id' is always included.")
    
    use_aggregation: bool = Field(True, description="Whether to use MongoDB aggregation pipeline (recommended for features like total count with pagination).")
    
    model_config = ConfigDict(
        extra='ignore', # Ignore any extra query parameters not defined in the model
        validate_assignment=True,
        arbitrary_types_allowed=True # For FilterCondition.value
    )
    
    @model_validator(mode='before')
    @classmethod
    def convert_flat_filters_to_list(cls, data: Any) -> Any:
        """
        Converts filters from a flat dictionary (from HTTP query params) or
        a structured dictionary into a List[FilterCondition].
        
        Handles:
        1. Direct `filters` as List[FilterCondition] (passes through).
        2. `filters` as a dictionary:
           - Simple: `{'field_name': 'value'}` (becomes EQ)
           - Complex: `{'field_name': {'operator_str': 'value'}}`
        3. Root-level flat params not part of standard fields (e.g. `user_id=abc&status=active`):
           These are treated as simple EQ filters.
        """
        if not isinstance(data, dict):
            return data

        processed_filters: List[FilterCondition] = []
        
        # Handle 'filters' field if it's a dictionary
        filters_input = data.get('filters')
        if isinstance(filters_input, dict):
            for field_name, value_or_op_dict in filters_input.items():
                if isinstance(value_or_op_dict, dict): # Complex: {field: {op_str: value}}
                    for op_str, op_value in value_or_op_dict.items():
                        try:
                            op_enum = FilterOperator(op_str)
                            processed_filters.append(FilterCondition(field=field_name, operator=op_enum, value=op_value))
                        except ValueError:
                            logger.warning(f"Invalid filter operator '{op_str}' for field '{field_name}'. Skipping.")
                else: # Simple EQ: {field: value}
                    processed_filters.append(FilterCondition(field=field_name, operator=FilterOperator.EQ, value=value_or_op_dict))
            data['filters'] = processed_filters # Replace dict with list
        elif filters_input is None:
            data['filters'] = [] # Ensure it's an empty list if not provided
        elif not isinstance(filters_input, list): # If it's some other type, Pydantic will raise error later
             pass


        # Handle root-level flat params (e.g., custom_field=value from query string)
        # These are treated as simple EQ filters, excluding known standard fields.
        standard_fields = set(cls.model_fields.keys())
        additional_eq_filters = []
        for key, value in data.items():
            if key not in standard_fields and key != 'filters': # Not a standard field and not the filters dict itself
                additional_eq_filters.append(FilterCondition(field=key, operator=FilterOperator.EQ, value=value))
        
        # Combine filters from 'filters' field and root-level params
        if isinstance(data.get('filters'), list): # if 'filters' was already a list or converted to one
            data['filters'].extend(additional_eq_filters)
        else: # if 'filters' was not present or not a dict
            data['filters'] = additional_eq_filters
            
        return data

    def get_applied_filters_as_dict(self) -> Dict[str, Any]:
        """
        Returns a dictionary representation of the applied filters.
        Useful for metadata or UI display.
        Example: {'status': 'active', 'created_at': {'gte': '2023-01-01'}}
        """
        result: Dict[str, Any] = {}
        for condition in self.filters:
            field_key = condition.field
            if condition.operator == FilterOperator.EQ:
                if field_key not in result or not isinstance(result.get(field_key), dict):
                    result[field_key] = condition.value
                else: # Field already has complex conditions, add EQ under its operator
                    result[field_key][condition.operator.value] = condition.value
            else:
                if field_key not in result or not isinstance(result.get(field_key), dict):
                    result[field_key] = {} # Initialize as dict if it's a simple value or not present
                result[field_key][condition.operator.value] = condition.value
        return result
    
    def to_tanstack_params(self) -> Dict[str, Any]:
        """Converts query parameters to a format compatible with TanStack Table state."""
        params: Dict[str, Any] = {
            "pagination": {
                "pageIndex": self.page - 1,  # TanStack uses 0-indexed pages
                "pageSize": self.page_size
            }
        }
        if self.sort:
            params["sorting"] = [{"id": self.sort, "desc": self.sort_dir == SortDirection.DESC}]
        if self.filters:
            # TanStack typically uses an array of {id: string, value: any} for columnFilters
            # or a dictionary for more complex filter state.
            # Let's provide the dictionary format from get_applied_filters_as_dict.
            params["columnFilters"] = self.get_applied_filters_as_dict()
        if self.search:
            params["globalFilter"] = self.search
        return params
    
    @classmethod
    def from_tanstack_params(cls, params: Dict[str, Any], **extra_kwargs) -> 'QueryParameters':
        """
        Creates QueryParameters from a TanStack Table state-like dictionary.
        `extra_kwargs` can be used to pass defaults for fields not in TanStack state
        (e.g. use_aggregation).
        """
        query_args: Dict[str, Any] = {"filters": []} 
        query_args.update(extra_kwargs)

        if "pagination" in params and isinstance(params["pagination"], dict):
            pagination = params["pagination"]
            query_args["page"] = pagination.get("pageIndex", 0) + 1
            query_args["page_size"] = pagination.get("pageSize", cls.model_fields["page_size"].default)
            
        if "sorting" in params and isinstance(params["sorting"], list) and params["sorting"]:
            sorting_list = params["sorting"]
            if sorting_list: # Ensure not empty
                sorting_item = sorting_list[0] 
                query_args["sort"] = sorting_item.get("id")
                query_args["sort_dir"] = SortDirection.DESC if sorting_item.get("desc", True) else SortDirection.ASC
            
        if "columnFilters" in params:
            filters_input = params["columnFilters"]
            parsed_filters: List[FilterCondition] = []
            if isinstance(filters_input, list): # Array format
                for f_item in filters_input:
                    if isinstance(f_item, dict) and 'id' in f_item and 'value' in f_item:
                        field_id = f_item['id']
                        filter_value = f_item['value']
                        
                        if isinstance(filter_value, dict):
                            for op_str, op_val in filter_value.items():
                                try:
                                    # Attempt to map common range ops; extend if more are needed
                                    op_enum = FilterOperator(op_str.lower()) # Ensure lowercase for gte, lte etc.
                                    parsed_filters.append(FilterCondition(field=field_id, operator=op_enum, value=op_val))
                                except ValueError:
                                    logger.warning(f"TanStack `columnFilters` list: Unrecognized operator '{op_str}' in value for field '{field_id}'. Treating as EQ for the object.")
                                    parsed_filters.append(FilterCondition(field=field_id, operator=FilterOperator.EQ, value=filter_value))
                                    break 
                        else:
                            parsed_filters.append(FilterCondition(field=field_id, operator=FilterOperator.EQ, value=filter_value))
            
            elif isinstance(filters_input, dict):
                query_args["filters"] = filters_input
            
            if parsed_filters and not query_args.get("filters"): # If parsed from list and 'filters' wasn't set by dict format
                 query_args["filters"] = parsed_filters
        
        if "globalFilter" in params and params["globalFilter"]:
            query_args["search"] = str(params["globalFilter"])
            
        return cls(**query_args)

class PaginationMetadata(BaseModel):
    """Metadata for paginated responses."""
    page: int = Field(..., description="Current page number (1-indexed).")
    page_size: int = Field(..., description="Number of items per page.")
    total_items: int = Field(..., description="Total number of items matching the query.")
    total_pages: int = Field(..., description="Total number of pages.")
    has_previous: bool = Field(..., description="Indicates if a previous page exists.")
    has_next: bool = Field(..., description="Indicates if a next page exists.")

class QueryMetadata(BaseModel):
    """Metadata about the executed query."""
    search_term_used: Optional[str] = Field(None, description="The search term applied, if any.")
    search_fields_used: Optional[List[str]] = Field(None, description="Fields searched if text/regex search was performed.")
    execution_time_ms: float = Field(..., description="Query execution time in milliseconds.")
    filters_applied: Dict[str, Any] = Field(default_factory=dict, description="A dictionary representation of filters that were applied.")
    sort_by: Optional[str] = Field(None, description="Field the results were sorted by.")
    sort_direction: Optional[SortDirection] = Field(None, description="Direction of the sort.")
    
    model_config = ConfigDict(arbitrary_types_allowed=True)

class PaginatedResponse(BaseModel, Generic[T_ResponseItem]):
    """
    Generic paginated response model for API endpoints.
    Provides a consistent structure including items, pagination, and query metadata.
    """
    items: List[T_ResponseItem] = Field(..., description="List of items for the current page.")
    pagination: PaginationMetadata = Field(..., description="Pagination metadata.")
    query_metadata: QueryMetadata = Field(..., description="Metadata about the query execution.")
    
    model_config = ConfigDict(arbitrary_types_allowed=True)
    
    def to_tanstack_response(self) -> Dict[str, Any]:
        """
        Converts paginated response to a format compatible with TanStack Table's `data` prop
        when using manual server-side pagination and data fetching.
        """
        return {
            "rows": [item.model_dump(mode='json') if hasattr(item, 'model_dump') else item for item in self.items], # Ensure JSON serializable items
            "pageCount": self.pagination.total_pages,
            "totalRowCount": self.pagination.total_items,
            "meta": { # Custom meta object that can be useful for frontend state
                "currentPage": self.pagination.page,
                "pageSize": self.pagination.page_size,
                "hasPreviousPage": self.pagination.has_previous,
                "hasNextPage": self.pagination.has_next,
                "searchTerm": self.query_metadata.search_term_used,
                "filtersApplied": self.query_metadata.filters_applied,
                "sortBy": self.query_metadata.sort_by,
                "sortDirection": self.query_metadata.sort_direction.value if self.query_metadata.sort_direction else None,
                "executionTimeMs": self.query_metadata.execution_time_ms,
            }
        }

# --- Entity-Specific Query Parameter Model Factory ---
def create_entity_query_params(entity_name: str, allowed_fields: List[str]) -> type[QueryParameters]:
    """
    Creates an entity-specific QueryParameters model that validates `sort`, 
    `search_fields`, and `filters[...].field` against a list of allowed fields.
    """
    # Ensure 'id' and 'relevance' are always permitted for sorting/filtering
    # 'id' maps to '_id', 'relevance' is for text search score
    valid_sort_filter_fields = set(['id', 'relevance']).union(allowed_fields)
    # Search fields can sometimes be broader, but for strictness, we can also validate them.
    # For now, we'll validate search_fields against the same set.
    valid_search_fields_set = valid_sort_filter_fields

    # PascalCase model name
    model_name = ''.join(x.capitalize() for x in entity_name.split('_')) + 'QueryParameters'
    
    class BaseValidatedEntityQueryParameters(QueryParameters):
        # This intermediate class is used to define validators with access to `valid_sort_filter_fields`
        # The Pydantic `create_model` doesn't easily allow closures for validators in V2.
        
        @field_validator('sort', mode='before') # 'before' to catch string before enum conversion
        @classmethod
        def _validate_sort_field(cls, v: Optional[str]) -> Optional[str]:
            if v is not None and v not in valid_sort_filter_fields:
                allowed_str = ', '.join(sorted(list(valid_sort_filter_fields)))
                raise ValueError(f"Invalid sort field: '{v}'. Must be one of: {allowed_str}")
            return v
        
        @field_validator('search_fields')
        @classmethod
        def _validate_entity_search_fields(cls, v: Optional[List[str]]) -> Optional[List[str]]:
            if v is not None:
                invalid_fields = [field for field in v if field not in valid_search_fields_set]
                if invalid_fields:
                    allowed_str = ', '.join(sorted(list(valid_search_fields_set)))
                    raise ValueError(f"Invalid search_fields: {invalid_fields}. Must be among: {allowed_str}")
            return v

        @field_validator('filters') # Validates List[FilterCondition]
        @classmethod
        def _validate_entity_filter_fields(cls, v: List[FilterCondition]) -> List[FilterCondition]:
            for fc in v:
                if fc.field not in valid_sort_filter_fields:
                    allowed_str = ', '.join(sorted(list(valid_sort_filter_fields)))
                    raise ValueError(f"Invalid filter field: '{fc.field}'. Must be one of: {allowed_str}")
            return v

    # Create the final model inheriting from this validated base
    EntitySpecificParamsModel = create_model(
        model_name,
        __base__=BaseValidatedEntityQueryParameters,
        # Remove the model_config parameter and instead set it after creating the model
    )

    # Set the model_config after model creation
    EntitySpecificParamsModel.model_config = ConfigDict(arbitrary_types_allowed=True, extra='ignore')
    
    EntitySpecificParamsModel.__doc__ = f"""
    Query parameters model for {entity_name} entities.
    Extends QueryParameters with validation specific to {entity_name} fields.
    Allowed filter/sort/search fields include: {', '.join(sorted(list(valid_sort_filter_fields)))}
    """
    return EntitySpecificParamsModel

# --- Pre-defined Entity-Specific QueryParameters Models ---
# These should align with your MongoDB schema and indexing strategy
DISCUSSION_ALLOWED_FIELDS = ["title", "prompt", "require_verification", "creator_id", "created_at", "last_activity", "idea_count", "topic_count", "tags"]
TOPIC_ALLOWED_FIELDS = ["representative_idea_id", "representative_text", "count", "discussion_id", "generated_summary"]
IDEA_ALLOWED_FIELDS = ["text", "user_id", "anonymous_user_id", "verified", "timestamp", "topic_id", "discussion_id", "intent", "sentiment", "keywords", "submitter_display_id", "on_topic", "specificity", "language"]
ENTITY_METRICS_ALLOWED_FIELDS = ["entity_id", "entity_type", "parent_id", "metrics.view_count", "metrics.like_count", "metrics.pin_count", "metrics.save_count", "metrics.last_activity_at", "metrics.unique_view_count", "time_window_metrics.hourly.timestamp", "time_window_metrics.daily.date"]
INTERACTION_ALLOWED_FIELDS = ["entity_id", "entity_type", "action_type", "user_id", "anonymous_id", "timestamp", "parent_id", "client_info.ip_hash", "client_info.user_agent", "value", "session_id"]
USER_INTERACTION_STATE_ALLOWED_FIELDS = ["user_identifier", "entity_id", "entity_type", "state.liked", "state.pinned", "state.saved", "state.view_count", "state.first_viewed_at", "state.last_viewed_at", "last_updated_at"]

DiscussionQueryParameters = create_entity_query_params("discussion", DISCUSSION_ALLOWED_FIELDS)
TopicQueryParameters = create_entity_query_params("topic", TOPIC_ALLOWED_FIELDS)
IdeaQueryParameters = create_entity_query_params("idea", IDEA_ALLOWED_FIELDS)
EntityMetricsQueryParameters = create_entity_query_params("entity_metrics", ENTITY_METRICS_ALLOWED_FIELDS)
InteractionQueryParameters = create_entity_query_params("interaction", INTERACTION_ALLOWED_FIELDS)
UserInteractionStateQueryParameters = create_entity_query_params("user_interaction_state", USER_INTERACTION_STATE_ALLOWED_FIELDS)