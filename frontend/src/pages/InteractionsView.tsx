// --- START OF FILE InteractionsView.tsx ---

import React, { useState, useEffect, useMemo } from 'react';
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
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
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
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

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
    RowData,
    Column,
} from '@tanstack/react-table';

// Icons
import {
    Loader2,
    ArrowUpDown,
    Eye,
    Heart,
    Pin,
    Bookmark,
    Clock,
    Filter as FilterIcon,
    Settings2,
    Search,
    ChevronsLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
    XCircle,
    CalendarDays,
    Download, // Kept for potential future export feature
} from 'lucide-react';

import '../styles/InteractionsView.css'; // Ensure this path is correct and styles are applied

// --- TanStack Table ColumnMeta Module Augmentation ---
declare module '@tanstack/react-table' {
    interface ColumnMeta<TData extends RowData, TValue> {
        filterComponent?: React.FC<{ column: Column<TData, TValue>; placeholder?: string }>;
        filterPlaceholder?: string;
    }
}

// --- Debounce Hook ---
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(value), delay]); // Debounce based on stringified value for objects/arrays
    return debouncedValue;
}

// --- Helper Functions ---
const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return 'Invalid Date';
    }
};

const getActionIcon = (actionType: string): JSX.Element => {
    switch (actionType) {
        case 'view': return <Eye className="h-4 w-4 text-blue-500" />;
        case 'like': return <Heart className="h-4 w-4 text-rose-500" fill="currentColor" />;
        case 'unlike': return <Heart className="h-4 w-4 text-gray-500" />;
        case 'pin': return <Pin className="h-4 w-4 text-sky-500" fill="currentColor" />;
        case 'unpin': return <Pin className="h-4 w-4 text-gray-500" />;
        case 'save': return <Bookmark className="h-4 w-4 text-green-500" fill="currentColor" />;
        case 'unsave': return <Bookmark className="h-4 w-4 text-gray-500" />;
        default: return <Eye className="h-4 w-4 text-gray-500" />; // Default or fallback icon
    }
};

const formatActionType = (actionType: string): string => {
    if (!actionType) return 'Unknown';
    const formatted = actionType.charAt(0).toUpperCase() + actionType.slice(1);
    const map: Record<string, string> = {
        'View': 'Viewed', 'Like': 'Liked', 'Unlike': 'Unliked',
        'Pin': 'Pinned', 'Unpin': 'Unpinned', 'Save': 'Saved', 'Unsave': 'Unsaved',
    };
    return map[formatted] || formatted;
};
// --- END Helper Functions ---

interface PaginatedInteractions {
    rows: Interaction[];
    pageCount: number;
    totalRowCount: number;
    meta: { // Based on PaginatedResponse.to_tanstack_response() in query_models.py
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
    column: Column<any, any>;
    placeholder?: string;
}) {
    // Using column.getFilterValue() might cause issues if the type isn't string.
    // For text filters, it's generally safe.
    const [filterValue, setFilterValue] = useState<string>((column.getFilterValue() as string) ?? '');
    const debouncedFilterValue = useDebounce(filterValue, 500); // Increased debounce for text inputs

    useEffect(() => {
        column.setFilterValue(debouncedFilterValue);
    }, [debouncedFilterValue, column]);

    return (
        <Input
            type="text"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder={placeholder || `Filter ${column.id}...`}
            className="h-8 text-xs w-full"
            aria-label={`Filter by ${column.id.replace(/_/g, ' ')}`}
        />
    );
}

interface DateRange {
    startDate: string;
    endDate: string;
}

const InteractionsView: React.FC = () => {
    const navigate = useNavigate();
    const { authStatus } = useAuth();

    const [data, setData] = useState<Interaction[]>([]);
    const [pageCount, setPageCount] = useState(0);
    const [totalRowCount, setTotalRowCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Memoize initial states to prevent re-creation on every render
    const initialSorting: SortingState = useMemo(() => [{ id: 'timestamp', desc: true }], []);
    const initialColumnFilters: ColumnFiltersState = useMemo(() => [], []);
    const initialGlobalFilter: string = useMemo(() => '', []);
    const initialPagination = useMemo(() => ({ pageIndex: 0, pageSize: 10 }), []);
    const initialDateRange: DateRange = useMemo(() => ({ startDate: '', endDate: '' }), []);

    const [sorting, setSorting] = useState<SortingState>(initialSorting);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialColumnFilters);
    const [globalFilter, setGlobalFilter] = useState<string>(initialGlobalFilter);
    const debouncedGlobalFilter = useDebounce(globalFilter, 500);

    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        user_id: false,
        anonymous_id: false,
    });
    const [rowSelection, setRowSelection] = useState({}); // Not used for actions yet, but good for selection state
    const [pagination, setPagination] = useState(initialPagination);
    const [dateRange, setDateRange] = useState<DateRange>(initialDateRange);
    const debouncedDateRange = useDebounce(dateRange, 300); // Slightly shorter debounce for dates for responsiveness

    const columns = useMemo<ColumnDef<Interaction>[]>(() => [
        {
            accessorKey: 'action_type',
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
        },
        {
            accessorKey: 'entity_id',
            header: 'Entity ID',
            cell: ({ row }) => (
                <div className="font-mono text-xs truncate max-w-[100px] sm:max-w-[120px]" title={row.original.entity_id}>
                    {row.original.entity_id}
                </div>
            ),
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
        },
        {
            accessorKey: 'user_id',
            header: 'User ID',
            cell: ({ row }) => row.original.user_id ? (
                <div className="font-mono text-xs truncate max-w-[100px]" title={row.original.user_id}>{row.original.user_id}</div>
            ) : (<span className="text-xs text-muted-foreground">N/A</span>),
            meta: { filterComponent: ColumnTextFilter, filterPlaceholder: "Filter User ID..." },
        },
        {
            accessorKey: 'anonymous_id',
            header: 'Anon ID',
            cell: ({ row }) => row.original.anonymous_id ? (
                <div className="font-mono text-xs truncate max-w-[100px]" title={row.original.anonymous_id}>{row.original.anonymous_id}</div>
            ) : (<span className="text-xs text-muted-foreground">N/A</span>),
            meta: { filterComponent: ColumnTextFilter, filterPlaceholder: "Filter Anon ID..." },
        },
        {
            id: 'view_actions',
            header: 'View',
            cell: ({ row }) => {
                const interaction = row.original;
                let viewPath = '';
                if (interaction.entity_type === 'idea') viewPath = `/ideas/${interaction.entity_id}`;
                else if (interaction.entity_type === 'discussion') viewPath = `/discussion/${interaction.entity_id}`;
                else if (interaction.entity_type === 'topic' && interaction.parent_id) viewPath = `/discussion/${interaction.parent_id}/topic/${interaction.entity_id}`;

                return viewPath ? (
                    <Button variant="outline" size="xs" onClick={() => navigate(viewPath)}>
                        View <Eye className="ml-1 h-3 w-3" />
                    </Button>
                ) : null; // Don't render button if no path
            },
        },
    ], [navigate]);

    const table = useReactTable({
        data,
        columns,
        state: { sorting, columnFilters, columnVisibility, rowSelection, pagination, globalFilter: debouncedGlobalFilter },
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        pageCount,
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
        // debugTable: process.env.NODE_ENV === 'development', // Optional: for debugging TanStack Table
    });

    // Effect to update columnFilters based on debouncedDateRange
    useEffect(() => {
        const { startDate, endDate } = debouncedDateRange;
        let newTimestampFilterValue: Record<string, string> | undefined = undefined;

        if (startDate || endDate) {
            newTimestampFilterValue = {};
            if (startDate) {
                try { newTimestampFilterValue.gte = new Date(startDate).toISOString(); }
                catch (e) { console.warn("Invalid start date for filter", startDate); }
            }
            if (endDate) {
                try {
                    const endOfDay = new Date(endDate);
                    endOfDay.setHours(23, 59, 59, 999); // Ensure end of day for lte
                    newTimestampFilterValue.lte = endOfDay.toISOString();
                } catch (e) { console.warn("Invalid end date for filter", endDate); }
            }
            // If only one part of the range is invalid, newTimestampFilterValue might be incomplete.
            // Ensure it's only applied if it has valid properties.
            if (Object.keys(newTimestampFilterValue).length === 0) {
                newTimestampFilterValue = undefined;
            }
        }

        setColumnFilters(prevFilters => {
            const currentTimestampFilter = prevFilters.find(f => f.id === 'timestamp');
            // Compare stringified versions to detect actual changes in value
            if (JSON.stringify(currentTimestampFilter?.value) !== JSON.stringify(newTimestampFilterValue)) {
                const otherFilters = prevFilters.filter(f => f.id !== 'timestamp');
                if (newTimestampFilterValue) {
                    return [...otherFilters, { id: 'timestamp', value: newTimestampFilterValue }];
                }
                return otherFilters; // Remove timestamp filter if new value is undefined
            }
            return prevFilters; // No change needed, return previous filters
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedDateRange]); // Only depends on debouncedDateRange. setColumnFilters is stable.

    // Create a stable key for columnFilters for the main data fetching effect's dependency array
    const stableColumnFiltersKey = useMemo(() => JSON.stringify(columnFilters), [columnFilters]);

    // Main data fetching effect
    useEffect(() => {
        if (authStatus !== AuthStatus.Authenticated) {
            setIsLoading(false); setData([]); setPageCount(0); setTotalRowCount(0);
            return;
        }

        const fetchInteractions = async () => {
            setIsLoading(true); setError(null);
            try {
                const tanStackStateForApi = {
                    pagination: { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize },
                    sorting: sorting, // TanStack sorting state [{id: string, desc: boolean}]
                    columnFilters: columnFilters, // Send the actual columnFilters object from state
                    globalFilter: debouncedGlobalFilter || undefined,
                };

                const response = await api.post<PaginatedInteractions>('/interaction/table', tanStackStateForApi);
                setData(response.data.rows);
                setPageCount(response.data.pageCount);
                setTotalRowCount(response.data.totalRowCount);

            } catch (err: any) {
                console.error('Error fetching interactions:', err);
                const errorMsg = err.response?.data?.detail || err.message || 'Failed to load interaction data.';
                setError(errorMsg);
                toast.error(errorMsg, { toastId: 'fetch-interactions-error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchInteractions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authStatus, pagination, sorting, stableColumnFiltersKey, debouncedGlobalFilter]);
    // Dependencies: authStatus, pagination (object), sorting (array), stableColumnFiltersKey (string), debouncedGlobalFilter (string)
    // All these should be stable or change only when intended.

    const handleClearFilters = () => {
        setGlobalFilter(initialGlobalFilter);
        setDateRange(initialDateRange); // This will trigger the date effect to remove its timestamp filter
        // It is CRITICAL that setColumnFilters is called AFTER setDateRange if dateRange contributes to columnFilters.
        // However, since the dateRange effect is debounced, and handleClearFilters wants immediate reset,
        // we directly set columnFilters to its initial state. The dateRange effect will run later
        // and see that debouncedDateRange matches initialDateRange, so it won't re-add a timestamp filter.
        setColumnFilters(initialColumnFilters);
        setSorting(initialSorting);
        setPagination(initialPagination); // This will reset pageIndex to 0
        // table.setPageIndex(0) is redundant if initialPagination.pageIndex is 0 and setPagination is called
    };

    // --- Render Logic ---
    if (authStatus === AuthStatus.Loading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /> <p className="ml-3">Authenticating...</p></div>;
    }
    if (authStatus === AuthStatus.Unauthenticated) {
        return <div className="text-center mt-10"><p>Please <a href="/login" className="text-blue-600 hover:underline">login</a> to view your interactions.</p></div>;
    }
    // Initial loading state specific to this component's data fetch
    if (isLoading && data.length === 0 && authStatus === AuthStatus.Authenticated && !error) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3">Loading your interactions...</p></div>;
    }
    if (error && data.length === 0) { // Show main error only if no data could be loaded at all
        return <div className="text-center mt-10 p-4 border border-destructive bg-destructive/10 rounded-md"><h2>Error Loading Interactions</h2><p className="text-destructive">{error}</p><Button onClick={() => window.location.reload()} className="mt-4">Try Again</Button></div>;
    }

    return (
        <div className="interactions-view-container p-4 md:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">My Interactions</h1>
                    <p className="text-sm text-muted-foreground">View and filter your recent activity across the platform.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                    Back to Dashboard
                </Button>
            </div>

            <Card>
                <CardHeader className="border-b p-4">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                        <div className="relative w-full sm:max-w-xs md:max-w-sm">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search all fields..."
                                value={globalFilter}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                className="pl-8 h-9 w-full"
                                aria-label="Global search for interactions"
                            />
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-center">
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
                            <Button variant="ghost" size="sm" className="h-9 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleClearFilters}>
                                <XCircle className="mr-1.5 h-3.5 w-3.5" /> Clear All Filters
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 items-end">
                        <div>
                            <label htmlFor="actionTypeFilter" className="block text-xs font-medium text-muted-foreground mb-1">Action Type</label>
                            <Select
                                value={table.getColumn('action_type')?.getFilterValue() as string || 'all'}
                                onValueChange={(value) => table.getColumn('action_type')?.setFilterValue(value === 'all' ? undefined : value)}
                            >
                                <SelectTrigger id="actionTypeFilter" className="h-9 text-xs w-full">
                                    <SelectValue placeholder="Any Action" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any Action</SelectItem>
                                    <SelectItem value="view">Viewed</SelectItem>
                                    <SelectItem value="like">Liked</SelectItem>
                                    <SelectItem value="unlike">Unliked</SelectItem>
                                    <SelectItem value="pin">Pinned</SelectItem>
                                    <SelectItem value="unpin">Unpinned</SelectItem>
                                    <SelectItem value="save">Saved</SelectItem>
                                    <SelectItem value="unsave">Unsaved</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label htmlFor="entityTypeFilter" className="block text-xs font-medium text-muted-foreground mb-1">Entity Type</label>
                            <Select
                                value={table.getColumn('entity_type')?.getFilterValue() as string || 'all'}
                                onValueChange={(value) => table.getColumn('entity_type')?.setFilterValue(value === 'all' ? undefined : value)}
                            >
                                <SelectTrigger id="entityTypeFilter" className="h-9 text-xs w-full">
                                    <SelectValue placeholder="Any Entity" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any Entity</SelectItem>
                                    <SelectItem value="discussion">Discussion</SelectItem>
                                    <SelectItem value="topic">Topic</SelectItem>
                                    <SelectItem value="idea">Idea</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label htmlFor="startDateFilter" className="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
                            <div className="relative">
                                <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                <Input id="startDateFilter" type="date" value={dateRange.startDate} onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))} className="pl-8 h-9 text-xs w-full" />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="endDateFilter" className="block text-xs font-medium text-muted-foreground mb-1">End Date</label>
                            <div className="relative">
                                <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                <Input id="endDateFilter" type="date" value={dateRange.endDate} onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))} className="pl-8 h-9 text-xs w-full" min={dateRange.startDate || undefined} />
                            </div>
                        </div>
                    </div>

                    {table.getHeaderGroups().some(hg => hg.headers.some(h => h.column.columnDef.meta?.filterComponent)) && (
                        <>
                            <Separator className="my-4" />
                            <div>
                                <h3 className="text-xs font-medium text-muted-foreground mb-2">Filter by Specific Text Fields:</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                                    {table.getHeaderGroups().flatMap(headerGroup =>
                                        headerGroup.headers.filter(header => header.column.columnDef.meta?.filterComponent)
                                            .map(header => {
                                                const column = header.column;
                                                const FilterComponent = column.columnDef.meta!.filterComponent!; // Assert non-null due to filter
                                                const filterPlaceholder = column.columnDef.meta!.filterPlaceholder;
                                                return (
                                                    <div key={column.id}>
                                                        <label htmlFor={`${column.id}-text-filter`} className="block text-xs font-medium text-muted-foreground mb-1 capitalize">
                                                            {column.id.replace(/_/g, ' ')}
                                                        </label>
                                                        <FilterComponent column={column} placeholder={filterPlaceholder} />
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <Card className="interactionsGridCard mt-6">
                <CardContent className="p-0 card-content">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => (
                                            <TableHead key={header.id} className="px-3 py-2.5 text-xs whitespace-nowrap">
                                                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {isLoading && !error && ( // Show loading only if not already in error state
                                    <TableRow>
                                        <TableCell colSpan={columns.length} className="h-24 text-center">
                                            <div className="flex justify-center items-center text-sm text-muted-foreground">
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating results...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {!isLoading && table.getRowModel().rows?.length > 0 ? (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id} className="px-3 py-2 align-middle text-xs">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : null}
                                {!isLoading && table.getRowModel().rows?.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                                            {error && data.length > 0 ? `Error updating: ${error}` : "No interactions found matching your criteria."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row items-center justify-between pt-2 text-xs text-muted-foreground gap-4">
                <div className="flex-1 text-center sm:text-left">
                    {table.getFilteredSelectedRowModel().rows.length > 0 ?
                        `${table.getFilteredSelectedRowModel().rows.length} of ` : ''}
                    {totalRowCount} row(s)
                    {table.getFilteredSelectedRowModel().rows.length > 0 ? ' selected.' : '.'}
                </div>
                <div className="flex items-center gap-x-2 sm:gap-x-4">
                    <div className="flex items-center gap-x-1">
                        <span className="hidden sm:inline">Rows:</span>
                        <Select
                            value={`${pagination.pageSize}`}
                            onValueChange={(value) => table.setPageSize(Number(value))}
                        >
                            <SelectTrigger className="h-7 w-[70px] text-xs">
                                <SelectValue placeholder={pagination.pageSize} />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {[10, 20, 50, 100].map((size) => (
                                    <SelectItem key={size} value={`${size}`} className="text-xs">{size}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <span className="whitespace-nowrap">
                        Page {pagination.pageIndex + 1} of {pageCount || 1}
                    </span>
                    <div className="flex items-center gap-x-1">
                        <Button variant="outline" size="icon-xs" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="icon-xs" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="icon-xs" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="icon-xs" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}><ChevronsRight className="h-3.5 w-3.5" /></Button>
                    </div>
                </div>
            </div>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle className="text-base">Current Page Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {["view", "like", "pin", "save"].map(action => {
                        const count = data.filter(i => i.action_type === action).length;
                        return (
                            <div key={action} className="flex items-center gap-2 p-2.5 border rounded-md bg-muted/30">
                                {getActionIcon(action)}
                                <span className="text-muted-foreground">{formatActionType(action)}:</span>
                                <span className="font-semibold">{count}</span>
                            </div>
                        );
                    })}
                </CardContent>
                <CardDescription className="p-4 text-xs text-muted-foreground border-t">
                    Note: This summary reflects only the interactions visible on the current page ({data.length} items).
                </CardDescription>
            </Card>
        </div>
    );
};

export default InteractionsView;