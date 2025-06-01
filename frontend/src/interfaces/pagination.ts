/**
 * Generic pagination interfaces for consistent API responses across the application.
 * These interfaces match the backend PaginatedResponse structure and TanStack Table format.
 */

export interface PaginationMeta {
    currentPage: number;
    pageSize: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
    searchTerm: string | null;
    filtersApplied: Record<string, any>;
    sortBy: string | null;
    sortDirection: string | null;
    executionTimeMs: number;
}

export interface PaginatedResponse<T> {
    rows: T[];
    pageCount: number;
    totalRowCount: number;
    meta: PaginationMeta;
}

// Specific paginated response types
export interface PaginatedInteractions extends PaginatedResponse<import('./interaction').Interaction> {}
export interface PaginatedIdeas extends PaginatedResponse<import('./ideas').Idea> {}
export interface PaginatedTopics extends PaginatedResponse<import('./topics').Topic> {
    unclustered_count?: number; // Topics-specific field
}
export interface PaginatedDiscussions extends PaginatedResponse<import('./discussions').Discussion> {}

// Generic query parameters for consistent API requests
export interface PaginationParams {
    page?: number;
    page_size?: number;
}

export interface SortingParams {
    sort?: string;
    sort_dir?: 'asc' | 'desc';
}

export interface SearchParams {
    search?: string;
}

export interface FilterParams {
    [key: string]: any; // Dynamic filter parameters like filter.entity_type, filter.timestamp.gte, etc.
}

export interface QueryParams extends PaginationParams, SortingParams, SearchParams, FilterParams {}

// TanStack Table compatible pagination state
export interface TanStackPaginationState {
    pageIndex: number; // 0-based
    pageSize: number;
}

export type TanStackSortingState = {
    id: string;
    desc: boolean;
}[]

// Utility functions for converting between TanStack and API formats
export const convertTanStackToApiParams = (
    pagination: TanStackPaginationState,
    sorting: TanStackSortingState,
    globalFilter?: string,
    columnFilters?: any[]
): QueryParams => {
    const params: QueryParams = {
        page: pagination.pageIndex + 1, // Convert 0-based to 1-based
        page_size: pagination.pageSize,
    };

    if (sorting.length > 0) {
        params.sort = sorting[0].id;
        params.sort_dir = sorting[0].desc ? 'desc' : 'asc';
    }

    if (globalFilter) {
        params.search = globalFilter;
    }

    // Convert column filters to API filter format
    if (columnFilters) {
        columnFilters.forEach(filter => {
            if (typeof filter.value === 'object' && filter.value !== null) {
                Object.entries(filter.value).forEach(([op, val]) => {
                    params[`filter.${filter.id}.${op}`] = val;
                });
            } else {
                params[`filter.${filter.id}`] = filter.value;
            }
        });
    }

    return params;
};

export const convertApiToTanStackResponse = <T>(apiResponse: any): PaginatedResponse<T> => {
    return {
        rows: apiResponse.rows || apiResponse.data || [],
        pageCount: apiResponse.pageCount || apiResponse.meta?.total_pages || 1,
        totalRowCount: apiResponse.totalRowCount || apiResponse.meta?.total || 0,
        meta: apiResponse.meta || {
            currentPage: 1,
            pageSize: 20,
            hasPreviousPage: false,
            hasNextPage: false,
            searchTerm: null,
            filtersApplied: {},
            sortBy: null,
            sortDirection: null,
            executionTimeMs: 0
        }
    };
};
