import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { AuthStatus } from '../enums/AuthStatus';
import api from '../utils/api';
import { Interaction } from '../interfaces/interaction';

// Import UI components from ShadCN/UI
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"; // Using ShadCN Table component

// TanStack Table imports
import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    FilterFn, // For custom filter functions if needed
    OnChangeFn,
} from '@tanstack/react-table';

// Icons
import {
    Loader2,
    ArrowUpDown,
    ChevronDown,
    Eye,
    Heart,
    Pin,
    Bookmark,
    Clock,
    Filter as FilterIcon, // Renamed to avoid conflict
    Download,
    Settings2, // For column visibility
    Search,
    ChevronsLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
} from 'lucide-react';

import '../styles/InteractionsView.css'; // Your custom styles

// --- Debounce Hook (simple implementation) ---
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}


// --- Helper Functions (formatDate, getActionIcon, formatActionType) - unchanged ---
const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getActionIcon = (actionType: string) => {
    switch (actionType) {
        case 'view': return <Eye className="h-4 w-4 text-blue-500" />;
        case 'like': return <Heart className="h-4 w-4 text-rose-500" fill="currentColor" />;
        case 'unlike': return <Heart className="h-4 w-4 text-gray-500" />;
        case 'pin': return <Pin className="h-4 w-4 text-sky-500" fill="currentColor" />;
        case 'unpin': return <Pin className="h-4 w-4 text-gray-500" />;
        case 'save': return <Bookmark className="h-4 w-4 text-green-500" fill="currentColor" />;
        case 'unsave': return <Bookmark className="h-4 w-4 text-gray-500" />;
        default: return <Eye className="h-4 w-4 text-gray-500" />;
    }
};
const formatActionType = (actionType: string) => {
    switch (actionType) {
        case 'view': return 'Viewed';
        case 'like': return 'Liked';
        case 'unlike': return 'Unliked';
        case 'pin': return 'Pinned';
        case 'unpin': return 'Unpinned';
        case 'save': return 'Saved';
        case 'unsave': return 'Unsaved';
        default: return actionType.charAt(0).toUpperCase() + actionType.slice(1);
    }
};
// --- END Helper Functions ---

interface PaginatedInteractions {
    rows: Interaction[];
    pageCount: number;
    totalRowCount: number;
    meta: {
        currentPage: number;
        pageSize: number;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
        searchTerm: string | null;
        filtersApplied: Record<string, any>;
        sortBy: string | null;
        sortDirection: string | null;
        executionTimeMs: number;
    };
}

// --- Column Filter Component (Generic for text inputs) ---
function ColumnTextFilter({
    column,
    placeholder,
}: {
    column: any; // Column from TanStack Table
    placeholder?: string;
}) {
    const [filterValue, setFilterValue] = useState<string>((column.getFilterValue() as string) ?? '');
    const debouncedFilterValue = useDebounce(filterValue, 300);

    useEffect(() => {
        column.setFilterValue(debouncedFilterValue);
    }, [debouncedFilterValue, column]);

    return (
        <Input
            type="text"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder={placeholder || `Filter ${column.id}...`}
            className="h-8 text-xs"
        />
    );
}


const InteractionsView: React.FC = () => {
    const navigate = useNavigate();
    const { authStatus } = useAuth(); // Removed `user` as it's not directly used here

    const [data, setData] = useState<Interaction[]>([]);
    const [pageCount, setPageCount] = useState(0); // Renamed from totalPages for clarity with TanStack
    const [totalRowCount, setTotalRowCount] = useState(0); // Renamed from totalItems
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState<string>('');
    const debouncedGlobalFilter = useDebounce(globalFilter, 500); // Debounce global filter

    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        user_id: false, // Example: hide user_id by default if it's too noisy
        anonymous_id: false,
    });
    const [rowSelection, setRowSelection] = useState({}); // Not used currently, but good for future (e.g., bulk actions)

    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

    const columns = useMemo<ColumnDef<Interaction>[]>(() => [
        {
            accessorKey: 'action_type', // Use accessorKey for direct data access
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    Action <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    {getActionIcon(row.original.action_type)}
                    <span className="text-xs">{formatActionType(row.original.action_type)}</span>
                </div>
            ),
            // Filter for this column will be handled by the global Select component
        },
        {
            accessorKey: 'entity_type',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    Entity <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <Badge variant="secondary" className="text-xs capitalize">
                    {row.original.entity_type}
                </Badge>
            ),
            // Filter for this column will be handled by the global Select component
        },
        {
            accessorKey: 'entity_id',
            header: 'Entity ID',
            cell: ({ row }) => (
                <div className="font-mono text-xs truncate max-w-[100px] sm:max-w-[120px]">
                    {row.original.entity_id}
                </div>
            ),
            // Enable filtering for this column
            meta: { filterComponent: ColumnTextFilter, filterPlaceholder: "Filter Entity ID..." },
        },
        {
            accessorKey: 'timestamp',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    Time <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3 text-gray-500" />
                    <span>{formatDate(row.original.timestamp)}</span>
                </div>
            ),
            // No direct column filter for timestamp in this simple setup, use global date range if implemented
        },
        { // User ID (optional to show)
            accessorKey: 'user_id',
            header: 'User ID',
            cell: ({ row }) => row.original.user_id ? (
                <div className="font-mono text-xs truncate max-w-[100px]">{row.original.user_id}</div>
            ) : (
                <span className="text-xs text-gray-500">N/A</span>
            ),
            meta: { filterComponent: ColumnTextFilter, filterPlaceholder: "Filter User ID..." },
        },
        { // Anonymous ID (optional to show)
            accessorKey: 'anonymous_id',
            header: 'Anon ID',
            cell: ({ row }) => row.original.anonymous_id ? (
                <div className="font-mono text-xs truncate max-w-[100px]">{row.original.anonymous_id}</div>
            ) : (
                <span className="text-xs text-gray-500">N/A</span>
            ),
            meta: { filterComponent: ColumnTextFilter, filterPlaceholder: "Filter Anon ID..." },
        },
        {
            id: 'view_actions', // Renamed from 'actions' to avoid conflict
            header: 'View',
            cell: ({ row }) => {
                const interaction = row.original;
                let viewPath = '';
                if (interaction.entity_type === 'idea') viewPath = `/ideas/${interaction.entity_id}`;
                else if (interaction.entity_type === 'discussion') viewPath = `/discussion/${interaction.entity_id}`;
                else if (interaction.entity_type === 'topic' && interaction.parent_id) viewPath = `/discussion/${interaction.parent_id}/topic/${interaction.entity_id}`;
                return (
                    <Button variant="outline" size="xs" onClick={() => viewPath && navigate(viewPath)} disabled={!viewPath}>
                        View <Eye className="ml-1 h-3 w-3" />
                    </Button>
                );
            },
        },
    ], []);

    const table = useReactTable({
        data,
        columns,
        state: { sorting, columnFilters, columnVisibility, rowSelection, pagination, globalFilter: debouncedGlobalFilter },
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true, // Important for server-side filtering
        pageCount, // From server
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter, // Use the non-debounced setter here
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection, // Keep for potential future use
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(), // Still useful for client-side aspects if any
        getPaginationRowModel: getPaginationRowModel(),
        // Faceted models are useful if you implement client-side unique value counting for filters,
        // but for fully server-side, they might not be strictly necessary unless you use their features.
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
        // debugTable: process.env.NODE_ENV === 'development', // Enable table debugging in dev
    });

    useEffect(() => {
        if (authStatus !== AuthStatus.Authenticated) {
            setIsLoading(false); // Stop loading if not authenticated
            setData([]); // Clear data
            setPageCount(0);
            setTotalRowCount(0);
            return;
        }

        const fetchInteractions = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const tableStateForApi = {
                    pagination: { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize },
                    sorting: sorting.length > 0 ? [{ id: sorting[0].id, desc: sorting[0].desc }] : undefined,
                    // Convert TanStack's ColumnFiltersState to the dict format backend expects
                    columnFilters: columnFilters.reduce((acc, filter) => {
                        // If filter.value is an object (e.g. for range filters {gte: ..., lte: ...}), pass it as is.
                        // Otherwise, it's a simple value.
                        acc[filter.id] = filter.value;
                        return acc;
                    }, {} as Record<string, any>),
                    globalFilter: debouncedGlobalFilter || undefined, // Send globalFilter if it has a value
                };

                const response = await api.post<PaginatedInteractions>('/interaction/table', tableStateForApi);
                setData(response.data.rows);
                setPageCount(response.data.pageCount);
                setTotalRowCount(response.data.totalRowCount);

            } catch (err: any) {
                console.error('Error fetching interactions:', err);
                setError(err.detail || err.message || 'Failed to load interaction data.');
                toast.error('Could not load interaction data.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchInteractions();
    }, [authStatus, pagination, sorting, columnFilters, debouncedGlobalFilter]);


    if (authStatus === AuthStatus.Loading) {
        return <div className="interactions-view-container loading"><Loader2 className="h-12 w-12 animate-spin" /> <p>Authenticating...</p></div>;
    }
    if (authStatus === AuthStatus.Unauthenticated) {
        return <div className="interactions-view-container error"><p>Please <a href="/login" className="text-blue-600 hover:underline">login</a> to view your interactions.</p></div>;
    }
    // Initial loading state before first data fetch
    if (isLoading && data.length === 0 && authStatus === AuthStatus.Authenticated) {
        return <div className="interactions-view-container loading"><Loader2 className="h-12 w-12 animate-spin" /><p>Loading your interactions...</p></div>;
    }
    if (error) {
        return <div className="interactions-view-container error"><h2>Error</h2><p>{error}</p><Button onClick={() => window.location.reload()}>Try Again</Button></div>;
    }

    return (
        <div className="interactions-view-container p-4 md:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold">My Interactions</h1>
                    <p className="text-sm text-muted-foreground">View and filter your recent activity.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                    Back to Dashboard
                </Button>
            </div>

            <Card>
                <CardContent className="p-4 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                        {/* Global Search */}
                        <div className="relative w-full md:max-w-sm">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search interactions..."
                                value={globalFilter}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                className="pl-8 h-9 w-full"
                            />
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                            {/* Action Type Filter (Select) */}
                            <Select
                                value={table.getColumn('action_type')?.getFilterValue() as string || 'all'}
                                onValueChange={(value) => {
                                    table.getColumn('action_type')?.setFilterValue(value === 'all' ? undefined : value);
                                }}
                            >
                                <SelectTrigger className="h-9 w-full sm:w-[160px] text-xs">
                                    <SelectValue placeholder="Filter by Action" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Actions</SelectItem>
                                    <SelectItem value="view">View</SelectItem>
                                    <SelectItem value="like">Like</SelectItem>
                                    <SelectItem value="pin">Pin</SelectItem>
                                    <SelectItem value="save">Save</SelectItem>
                                    <SelectItem value="unlike">Unlike</SelectItem>
                                    <SelectItem value="unpin">Unpin</SelectItem>
                                    <SelectItem value="unsave">Unsave</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Entity Type Filter (Select) */}
                            <Select
                                value={table.getColumn('entity_type')?.getFilterValue() as string || 'all'}
                                onValueChange={(value) => {
                                    table.getColumn('entity_type')?.setFilterValue(value === 'all' ? undefined : value);
                                }}
                            >
                                <SelectTrigger className="h-9 w-full sm:w-[160px] text-xs">
                                    <SelectValue placeholder="Filter by Entity" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Entities</SelectItem>
                                    <SelectItem value="discussion">Discussion</SelectItem>
                                    <SelectItem value="topic">Topic</SelectItem>
                                    <SelectItem value="idea">Idea</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Column Visibility Dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 text-xs">
                                        <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Columns
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-[180px]">
                                    <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {table.getAllColumns().filter(column => column.getCanHide()).map(column => (
                                        <DropdownMenuCheckboxItem
                                            key={column.id}
                                            className="capitalize text-xs"
                                            checked={column.getIsVisible()}
                                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                        >
                                            {column.id.replace(/_/g, ' ')}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {/* TODO: Add Export Button - <Button variant="outline" size="sm" className="h-9 text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />Export</Button> */}
                        </div>
                    </div>

                    {/* Individual Column Filters (if defined in column meta) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                        {table.getHeaderGroups().map(headerGroup =>
                            headerGroup.headers.map(header => {
                                const column = header.column;
                                // @ts-ignore // Accessing custom meta property
                                const FilterComponent = column.columnDef.meta?.filterComponent;
                                // @ts-ignore
                                const filterPlaceholder = column.columnDef.meta?.filterPlaceholder;
                                return FilterComponent ? (
                                    <div key={column.id} className="flex flex-col gap-1">
                                        <label htmlFor={`${column.id}-filter`} className="text-xs font-medium text-muted-foreground capitalize">
                                            {column.id.replace(/_/g, ' ')}
                                        </label>
                                        <FilterComponent column={column} placeholder={filterPlaceholder} />
                                    </div>
                                ) : null;
                            })
                        )}
                    </div>

                </CardContent>
            </Card>

            <Card className="interactionsGridCard">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => (
                                            <TableHead key={header.id} className="px-3 py-2.5 text-xs">
                                                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {isLoading && (
                                    <TableRow>
                                        <TableCell colSpan={columns.length} className="h-24 text-center">
                                            <div className="flex justify-center items-center text-sm text-muted-foreground">
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {!isLoading && table.getRowModel().rows?.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id} className="px-3 py-2 align-middle text-xs">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : (
                                    !isLoading && (
                                        <TableRow>
                                            <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                                                No interactions found matching your criteria.
                                            </TableCell>
                                        </TableRow>
                                    )
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                <div className="flex-1">
                    {table.getFilteredSelectedRowModel().rows.length} of{" "}
                    {totalRowCount} row(s) selected.
                </div>
                <div className="flex items-center gap-x-4 sm:gap-x-6">
                    <div className="flex items-center gap-x-1.5 interactionGridRow">
                        <span>Rows</span>
                        <Select
                            value={`${pagination.pageSize}`}
                            onValueChange={(value) => table.setPageSize(Number(value))}
                        >
                            <SelectTrigger className="h-7 w-[60px] text-xs">
                                <SelectValue placeholder={pagination.pageSize} />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {[10, 20, 50, 100].map((size) => (
                                    <SelectItem key={size} value={`${size}`} className="text-xs">{size}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>Page {pagination.pageIndex + 1} of {pageCount || 1}</div>
                    <div className="flex items-center gap-x-1">
                        <Button variant="outline" size="xs" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="xs" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="xs" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="xs" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}><ChevronsRight className="h-3.5 w-3.5" /></Button>
                    </div>
                </div>
            </div>

            {/* Summary card - can be removed if not desired */}
            <Card className="mt-6">
                <CardHeader><CardTitle className="text-lg">Current View Summary</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    {["view", "like", "pin", "save"].map(action => {
                        const count = data.filter(i => i.action_type === action).length;
                        return (
                            <div key={action} className="flex items-center gap-2 p-2 border rounded-md">
                                {getActionIcon(action)}
                                <span>{formatActionType(action)}:</span>
                                <span className="font-semibold">{count}</span>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
};

export default InteractionsView;