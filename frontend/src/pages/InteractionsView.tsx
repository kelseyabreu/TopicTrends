import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { AuthStatus } from '../enums/AuthStatus';
import api from '../utils/api';
import { Interaction } from '../interfaces/interaction';
import { Discussion } from '../interfaces/discussions';
import { Idea } from '../interfaces/ideas';
import { Topic } from '../interfaces/topics';
import { PaginatedInteractions, convertTanStackToApiParams } from '../interfaces/pagination';

// Import UI components from ShadCN/UI
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    CardFooter,
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
    DropdownMenuItem,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

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
    RowSelectionState,
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
    Download,
    MoreHorizontal,
    BarChart,
    PieChart,
    LineChart,
    Activity,
    Calendar,
    ListFilter,
    Trash2,
    RefreshCw,
    Info,
    FileText,
    Copy,
    Share2,
    Star,
    AlertTriangle,
    Users,
    Sparkles,
    LayoutGrid,
    Coffee,
    FileBarChart,
    Zap,
} from 'lucide-react';

// Import Chart components
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart as RechartsLineChart, Line } from 'recharts';


import '../styles/InteractionsView.css';

// --- TanStack Table ColumnMeta Module Augmentation ---
declare module '@tanstack/react-table' {
    interface ColumnMeta<TData extends RowData, TValue> {
        filterComponent?: React.FC<{ column: Column<TData, TValue>; placeholder?: string }>;
        filterPlaceholder?: string;
    }
}

// --- Types ---
interface EntityDetails {
    title?: string;
    text?: string;
    type: string;
    id: string;
    parent_id?: string;  // For topics that need parent discussion ID
}

interface ActivityByDay {
    date: string;
    count: number;
}

interface UserInteractionStats {
    activityByDay: ActivityByDay[];
    actionTypeCounts: { [key: string]: number };
    entityTypeCounts: { [key: string]: number };
    recentEntities: EntityDetails[];
    hourlyDistribution: { [hour: string]: number };
    totalInteractions: number;
    mostActiveDiscussion?: { id: string; title: string; count: number };
    avgInteractionsPerDay: number;
    streakData: {
        currentStreak: number;
        longestStreak: number;
        lastActive: string;
    };
}

interface InteractionTimeMetric {
    timestamp: string;
    views: number;
    likes: number;
    pins: number;
    saves: number;
}

interface DateRange {
    startDate: string;
    endDate: string;
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
    }, [JSON.stringify(value), delay]);
    return debouncedValue;
}

// --- Helper Functions ---
const formatDate = (dateString: string, includeTime = true): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';

        if (includeTime) {
            return date.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } else {
            return date.toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric'
            });
        }
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return 'Invalid Date';
    }
};

const getActionIcon = (actionType: string, size = 4): JSX.Element => {
    switch (actionType) {
        case 'view': return <Eye className={`h-${size} w-${size} text-blue-500`} />;
        case 'like': return <Heart className={`h-${size} w-${size} text-rose-500`} fill="currentColor" />;
        case 'unlike': return <Heart className={`h-${size} w-${size} text-gray-500`} />;
        case 'pin': return <Pin className={`h-${size} w-${size} text-sky-500`} fill="currentColor" />;
        case 'unpin': return <Pin className={`h-${size} w-${size} text-gray-500`} />;
        case 'save': return <Bookmark className={`h-${size} w-${size} text-green-500`} fill="currentColor" />;
        case 'unsave': return <Bookmark className={`h-${size} w-${size} text-gray-500`} />;
        default: return <Eye className={`h-${size} w-${size} text-gray-500`} />;
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

const getEntityTypeColor = (entityType: string): string => {
    switch (entityType) {
        case 'discussion': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
        case 'topic': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300';
        case 'idea': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
};

// Generate chart colors for consistent charting
const CHART_COLORS = {
    view: '#3b82f6', // blue-500
    like: '#f43f5e', // rose-500
    pin: '#0ea5e9', // sky-500
    save: '#10b981', // emerald-500
    unlike: '#9ca3af', // gray-400
    unpin: '#9ca3af', // gray-400
    unsave: '#9ca3af', // gray-400

    discussion: '#a855f7', // purple-500
    topic: '#f59e0b', // amber-500
    idea: '#10b981', // emerald-500
};

// --- Column Filter Component (Generic for text inputs) ---
function ColumnTextFilter({
    column,
    placeholder,
}: {
    column: Column<any, any>;
    placeholder?: string;
}) {
    const [filterValue, setFilterValue] = useState<string>((column.getFilterValue() as string) ?? '');
    const debouncedFilterValue = useDebounce(filterValue, 500);

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

const InteractionsView: React.FC = () => {
    const navigate = useNavigate();
    const { authStatus, user } = useAuth();

    // Main state
    const [data, setData] = useState<Interaction[]>([]);
    const [pageCount, setPageCount] = useState(0);
    const [totalRowCount, setTotalRowCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string>("interactions");
    const [selectedRows, setSelectedRows] = useState<Interaction[]>([]);
    const [stats, setStats] = useState<UserInteractionStats | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [showDetailPanel, setShowDetailPanel] = useState(false);
    const [selectedEntity, setSelectedEntity] = useState<EntityDetails | null>(null);
    const [isLoadingEntity, setIsLoadingEntity] = useState(false);

    // View options
    const [viewMode, setViewMode] = useState<'table' | 'grid' | 'calendar'>('table');
    const [enableRealtime, setEnableRealtime] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Initial states
    const initialSorting: SortingState = useMemo(() => [{ id: 'timestamp', desc: true }], []);
    const initialColumnFilters: ColumnFiltersState = useMemo(() => [], []);
    const initialGlobalFilter: string = useMemo(() => '', []);
    const initialPagination = useMemo(() => ({ pageIndex: 0, pageSize: 10 }), []);
    const initialDateRange: DateRange = useMemo(() => ({ startDate: '', endDate: '' }), []);
    const initialRowSelection: RowSelectionState = useMemo(() => ({}), []);

    // Table state
    const [sorting, setSorting] = useState<SortingState>(initialSorting);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialColumnFilters);
    const [globalFilter, setGlobalFilter] = useState<string>(initialGlobalFilter);
    const debouncedGlobalFilter = useDebounce(globalFilter, 500);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        user_id: false, anonymous_id: false
    });
    const [rowSelection, setRowSelection] = useState<RowSelectionState>(initialRowSelection);
    const [pagination, setPagination] = useState(initialPagination);
    const [dateRange, setDateRange] = useState<DateRange>(initialDateRange);
    const debouncedDateRange = useDebounce(dateRange, 300);

    // Refs
    const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastRefreshTimeRef = useRef<Date>(new Date());
    const isInitialMount = useRef(true);

    // Table Columns Definition
    const columns = useMemo<ColumnDef<Interaction>[]>(() => [
        {
            id: 'select',
            header: ({ table }) => (
                <Checkbox
                    checked={
                        table.getIsAllPageRowsSelected() ||
                        (table.getIsSomePageRowsSelected() && "indeterminate")
                    }
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                    className="translate-y-[2px]"
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                    className="translate-y-[2px]"
                />
            ),
            enableSorting: false,
        },
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
                <Badge
                    variant="secondary"
                    className={`text-xs capitalize ${getEntityTypeColor(row.original.entity_type)}`}
                >
                    {row.original.entity_type}
                </Badge>
            ),
        },
        {
            accessorKey: 'entity_id',
            header: 'Entity ID',
            cell: ({ row }) => (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                className="font-mono text-xs truncate max-w-[100px] sm:max-w-[120px] cursor-pointer hover:text-primary"
                                onClick={() => handleEntityClick(row.original)}
                            >
                                {row.original.entity_id}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Click to view details</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
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
            id: 'parent_id',
            accessorKey: 'parent_id',
            header: 'Parent',
            cell: ({ row }) => {
                const parentId = row.original.parent_id;
                return parentId ? (
                    <div
                        className="font-mono text-xs truncate max-w-[100px] cursor-pointer hover:text-primary"
                        title={parentId}
                        onClick={() => handleParentClick(row.original)}
                    >
                        {parentId.substring(0, 8)}...
                    </div>
                ) : (
                    <span className="text-xs text-muted-foreground">N/A</span>
                );
            }
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => {
                const interaction = row.original;

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <span>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Open menu</span>
                                </Button>
                            </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px]">
                            <DropdownMenuLabel>Options</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleViewEntity(interaction)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Entity
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyEntityId(interaction.entity_id)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copy ID
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => handleViewDetails(interaction)}
                                className="text-primary"
                            >
                                <Info className="mr-2 h-4 w-4" />
                                View Details
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ], []);

    // TanStack Table instance
    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
            pagination,
            globalFilter: debouncedGlobalFilter
        },
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        pageCount,
        enableRowSelection: true,
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
    });

    // Effect: Update selectedRows when rowSelection changes
    useEffect(() => {
        const selectedRowData = table.getSelectedRowModel().rows.map(row => row.original);
        setSelectedRows(selectedRowData);
    }, [table, rowSelection]);

    // Effect: Handle date range filter
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
                    endOfDay.setHours(23, 59, 59, 999);
                    newTimestampFilterValue.lte = endOfDay.toISOString();
                } catch (e) { console.warn("Invalid end date for filter", endDate); }
            }
            if (Object.keys(newTimestampFilterValue).length === 0) {
                newTimestampFilterValue = undefined;
            }
        }

        setColumnFilters(prevFilters => {
            const currentTimestampFilter = prevFilters.find(f => f.id === 'timestamp');
            if (JSON.stringify(currentTimestampFilter?.value) !== JSON.stringify(newTimestampFilterValue)) {
                const otherFilters = prevFilters.filter(f => f.id !== 'timestamp');
                if (newTimestampFilterValue) {
                    return [...otherFilters, { id: 'timestamp', value: newTimestampFilterValue }];
                }
                return otherFilters;
            }
            return prevFilters;
        });
    }, [debouncedDateRange]);

    // Create a stable key for columnFilters for dependency tracking
    const stableColumnFiltersKey = useMemo(() => JSON.stringify(columnFilters), [columnFilters]);

    // Effect: Main data fetching
    useEffect(() => {
        if (authStatus !== AuthStatus.Authenticated) {
            setIsLoading(false); setData([]); setPageCount(0); setTotalRowCount(0);
            return;
        }

        const fetchInteractions = async () => {
            // Skip initial render fetch if we're in auto-refresh mode (we'll fetch in that effect)
            if (isInitialMount.current && autoRefresh) {
                isInitialMount.current = false;
                return;
            }

            setIsLoading(true);
            setError(null);
            lastRefreshTimeRef.current = new Date();

            try {
                // Convert TanStack state to standard query parameters using utility function
                const queryParams = convertTanStackToApiParams(
                    pagination,
                    sorting,
                    debouncedGlobalFilter,
                    columnFilters
                );

                const response = await api.get<PaginatedInteractions>('/interaction/', {
                    params: queryParams
                });

                setData(response.data.rows);
                setPageCount(response.data.pageCount);
                setTotalRowCount(response.data.totalRowCount);
                isInitialMount.current = false;
            } catch (err: unknown) {
                console.error('Error fetching interactions:', err);
                const errorMsg = err && typeof err === 'object' && 'response' in err
                    ? (err as any).response?.data?.detail || 'Failed to load interaction data.'
                    : err && typeof err === 'object' && 'message' in err
                    ? (err as any).message
                    : 'Failed to load interaction data.';
                setError(errorMsg);
                toast.error(errorMsg, { toastId: 'fetch-interactions-error' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchInteractions();
    }, [authStatus, pagination, sorting, stableColumnFiltersKey, debouncedGlobalFilter, autoRefresh]);

    // Effect: Load user interaction stats
    useEffect(() => {
        if (authStatus !== AuthStatus.Authenticated || activeTab !== 'analytics') {
            return;
        }

        const fetchStats = async () => {
            setIsLoadingStats(true);
            setStatsError(null);

            try {
                // Fetch real interaction stats from API
                const response = await api.get('/analytics/user-interaction-stats');
                setStats(response.data);
            } catch (err: any) {
                console.error('Error fetching interaction stats:', err);
                setStatsError('Failed to load interaction statistics.');
            } finally {
                setIsLoadingStats(false);
            }
        };

        fetchStats();
    }, [authStatus, activeTab]);

    // Effect: Auto-refresh setup
    useEffect(() => {
        const setupAutoRefresh = () => {
            // Clear any existing interval
            if (autoRefreshIntervalRef.current) {
                clearInterval(autoRefreshIntervalRef.current);
                autoRefreshIntervalRef.current = null;
            }

            // Set up new interval if auto-refresh is enabled
            if (autoRefresh) {
                autoRefreshIntervalRef.current = setInterval(() => {
                    // Trigger a refetch by re-setting pagination (a stable reference that will trigger the data fetch effect)
                    setPagination(prev => ({ ...prev }));
                    toast.info("Auto-refreshed interactions data", {
                        toastId: 'auto-refresh',
                        autoClose: 2000,
                        hideProgressBar: true
                    });
                }, 30000); // 30 seconds interval
            }
        };

        setupAutoRefresh();

        // Clean up interval on unmount or when auto-refresh changes
        return () => {
            if (autoRefreshIntervalRef.current) {
                clearInterval(autoRefreshIntervalRef.current);
            }
        };
    }, [autoRefresh]);

    // Effect: Update title when tab changes
    useEffect(() => {
        document.title = `TopicTrends - ${activeTab === 'interactions' ? 'My Interactions' : 'Interaction Analytics'}`;
        return () => {
            document.title = 'TopicTrends';
        };
    }, [activeTab]);



    // --- Event Handlers ---

    const handleClearFilters = () => {
        setGlobalFilter(initialGlobalFilter);
        setDateRange(initialDateRange);
        setColumnFilters(initialColumnFilters);
        setSorting(initialSorting);
        setPagination(initialPagination);
        setRowSelection({});
    };

    const handleEntityClick = async (interaction: Interaction) => {
        setIsLoadingEntity(true);
        setSelectedEntity(null);

        try {
            // Simulate API call to fetch entity details
            const entityType = interaction.entity_type;
            const entityId = interaction.entity_id;

            // In a real app, you'd call an API like:
            // const response = await api.get(`/api/${entityType}s/${entityId}`);
            // But for demo, we'll simulate a delay and generate mock data
            await new Promise(resolve => setTimeout(resolve, 800));

            let entityDetails: EntityDetails = {
                id: entityId,
                type: entityType
            };

            if (entityType === 'discussion') {
                entityDetails.title = "Example Discussion #" + entityId.substring(0, 4);
            } else if (entityType === 'topic') {
                entityDetails.title = "Example Topic #" + entityId.substring(0, 4);
            } else if (entityType === 'idea') {
                entityDetails.text = "This is an example idea text for idea #" + entityId.substring(0, 4);
            }

            setSelectedEntity(entityDetails);
            setShowDetailPanel(true);

        } catch (err) {
            console.error('Error fetching entity details:', err);
            toast.error('Failed to load entity details.');
        } finally {
            setIsLoadingEntity(false);
        }
    };

    const handleParentClick = async (interaction: Interaction) => {
        if (!interaction.parent_id) return;

        // Similar to handleEntityClick but for the parent entity
        // For brevity, we'll just simulate what a real implementation would do

        toast.info(`Navigating to parent entity ${interaction.parent_id.substring(0, 6)}...`);

        // In real app, this would navigate to the parent entity or fetch its details
        // For now, we'll just show a mock notification
    };

    const handleViewEntity = (interaction: Interaction) => {
        let viewPath = '';
        if (interaction.entity_type === 'idea') viewPath = `/ideas/${interaction.entity_id}`;
        else if (interaction.entity_type === 'discussion') viewPath = `/discussion/${interaction.entity_id}`;
        else if (interaction.entity_type === 'topic' && interaction.parent_id) {
            viewPath = `/discussion/${interaction.parent_id}/topic/${interaction.entity_id}`;
        }

        if (viewPath) {
            navigate(viewPath);
        } else {
            toast.warn("Unable to determine entity view path.");
        }
    };

    const handleCopyEntityId = (entityId: string) => {
        navigator.clipboard.writeText(entityId)
            .then(() => toast.success("Entity ID copied to clipboard"))
            .catch(() => toast.error("Failed to copy to clipboard"));
    };

    const handleViewDetails = (interaction: Interaction) => {
        // This would typically open a detailed view of the interaction
        // For now, we'll just call handleEntityClick to show entity details
        handleEntityClick(interaction);
    };

    const handleExportData = () => {
        try {
            // Convert current data to CSV
            let csvContent = "data:text/csv;charset=utf-8,";

            // Add headers
            const headers = ["ID", "Action", "Entity Type", "Entity ID", "Timestamp", "User ID", "Anon ID", "Parent ID"];
            csvContent += headers.join(",") + "\r\n";

            // Add rows
            data.forEach(item => {
                const row = [
                    item.id || "",
                    item.action_type || "",
                    item.entity_type || "",
                    item.entity_id || "",
                    item.timestamp || "",
                    item.user_id || "",
                    item.anonymous_id || "",
                    item.parent_id || ""
                ];

                // Escape any commas in the values
                const escapedRow = row.map(value => `"${String(value).replace(/"/g, '""')}"`);
                csvContent += escapedRow.join(",") + "\r\n";
            });

            // Create download link
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `interactions_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);

            // Trigger download
            link.click();

            // Clean up
            document.body.removeChild(link);
            toast.success("Export completed successfully");

        } catch (err) {
            console.error("Export error:", err);
            toast.error("Failed to export data");
        }
    };

    const handleDeleteSelected = () => {
        // In a real app, this would call an API to delete the selected interactions
        // For demo, we'll just show a toast
        toast.info(`Would delete ${selectedRows.length} selected interactions`);
        setRowSelection({});
    };

    const handleTabChange = (value: string) => {
        setActiveTab(value);
    };

    const handleRefresh = () => {
        // Force data refresh
        setPagination(prev => ({ ...prev }));
        toast.info("Refreshing interactions data...");
    };

    // --- Render helpers ---

    const renderActionTypeChart = () => {
        if (!stats) return null;

        const actionTypes = Object.keys(stats.actionTypeCounts);
        const chartData = actionTypes.map(type => ({
            name: formatActionType(type),
            value: stats.actionTypeCounts[type],
            color: CHART_COLORS[type as keyof typeof CHART_COLORS] || '#888888'
        }));

        return (
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Legend />
                        <RechartsTooltip formatter={(value: any) => [`${value} interactions`, 'Count']} />
                    </RechartsPieChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const renderEntityTypeChart = () => {
        if (!stats) return null;

        const entityTypes = Object.keys(stats.entityTypeCounts);
        const chartData = entityTypes.map(type => ({
            name: type.charAt(0).toUpperCase() + type.slice(1),
            value: stats.entityTypeCounts[type],
            color: CHART_COLORS[type as keyof typeof CHART_COLORS] || '#888888'
        }));

        return (
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <RechartsTooltip formatter={(value: any) => [`${value} interactions`, 'Count']} />
                        <Legend />
                        <Bar dataKey="value" name="Interactions">
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </RechartsBarChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const renderActivityTimeline = () => {
        if (!stats) return null;

        const chartData = stats.activityByDay.map(day => ({
            date: day.date,
            interactions: day.count
        }));

        return (
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={(date) => {
                                const d = new Date(date);
                                return `${d.getMonth() + 1}/${d.getDate()}`;
                            }}
                        />
                        <YAxis />
                        <RechartsTooltip
                            formatter={(value: any) => [`${value} interactions`, 'Count']}
                            labelFormatter={(label) => formatDate(label, false)}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="interactions"
                            stroke="#8884d8"
                            activeDot={{ r: 8 }}
                            name="Daily Activity"
                        />
                    </RechartsLineChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const renderHourlyDistribution = () => {
        if (!stats) return null;

        const hours = Object.keys(stats.hourlyDistribution).sort();
        const chartData = hours.map(hour => ({
            hour: `${hour}:00`,
            count: stats.hourlyDistribution[hour]
        }));

        return (
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <RechartsTooltip formatter={(value: any) => [`${value} interactions`, 'Count']} />
                        <Legend />
                        <Bar dataKey="count" name="Activity" fill="#8884d8" />
                    </RechartsBarChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const renderEntityDetailsPanel = () => {
        if (!selectedEntity) {
            return (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                    <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No Entity Selected</h3>
                    <p className="text-muted-foreground">Click on an entity ID to view details</p>
                </div>
            );
        }

        return (
            <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">Entity Details</h3>
                    <Button variant="ghost" size="icon" onClick={() => setShowDetailPanel(false)}>
                        <XCircle className="h-4 w-4" />
                    </Button>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Badge className={getEntityTypeColor(selectedEntity.type)}>
                            {selectedEntity.type.charAt(0).toUpperCase() + selectedEntity.type.slice(1)}
                        </Badge>
                        <div className="text-sm font-mono">{selectedEntity.id}</div>
                    </div>

                    {selectedEntity.title && (
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-1">Title</h4>
                            <p className="text-base">{selectedEntity.title}</p>
                        </div>
                    )}

                    {selectedEntity.text && (
                        <div>
                            <h4 className="text-sm font-medium text-muted-foreground mb-1">Content</h4>
                            <p className="text-base">{selectedEntity.text}</p>
                        </div>
                    )}

                    <div className="pt-4 flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                let path = '';
                                if (selectedEntity.type === 'idea') path = `/ideas/${selectedEntity.id}`;
                                else if (selectedEntity.type === 'discussion') path = `/discussion/${selectedEntity.id}`;
                                else if (selectedEntity.type === 'topic') path = `/discussion/unknown/topic/${selectedEntity.id}`;

                                if (path) navigate(path);
                            }}
                        >
                            <Eye className="h-4 w-4 mr-2" />
                            View Entity
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyEntityId(selectedEntity.id)}
                        >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy ID
                        </Button>
                    </div>
                </div>
            </div>
        );
    };


    const renderGridView = () => {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                {data.map(interaction => (
                    <Card key={interaction.id} className="overflow-hidden">
                        <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start">
                                <Badge
                                    className={`${getEntityTypeColor(interaction.entity_type)} mb-2`}
                                >
                                    {interaction.entity_type.charAt(0).toUpperCase() + interaction.entity_type.slice(1)}
                                </Badge>
                                <div className="flex gap-1">
                                    {getActionIcon(interaction.action_type, 5)}
                                </div>
                            </div>
                            <CardTitle className="text-sm font-medium">
                                {formatActionType(interaction.action_type)}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                {formatDate(interaction.timestamp)}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-xs font-mono mt-2 truncate" title={interaction.entity_id}>
                                ID: {interaction.entity_id}
                            </div>
                            {interaction.parent_id && (
                                <div className="text-xs font-mono mt-1 truncate" title={interaction.parent_id}>
                                    Parent: {interaction.parent_id}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="p-2 pt-0 flex justify-end">
                            <Button variant="outline" size="sm" onClick={() => handleEntityClick(interaction)}>
                                Details
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        );
    };

    // --- Main Render Logic ---

    if (authStatus === AuthStatus.Loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-3">Authenticating...</p>
            </div>
        );
    }

    if (authStatus === AuthStatus.Unauthenticated) {
        return (
            <div className="text-center mt-10">
                <p>Please <a href="/login" className="text-blue-600 hover:underline">login</a> to view your interactions.</p>
            </div>
        );
    }

    // Initial loading state specific to this component's data fetch
    if (isLoading && data.length === 0 && authStatus === AuthStatus.Authenticated && !error) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-3">Loading your interactions...</p>
            </div>
        );
    }

    if (error && data.length === 0) {
        return (
            <div className="text-center mt-10 p-4 border border-destructive bg-destructive/10 rounded-md">
                <h2>Error Loading Interactions</h2>
                <p className="text-destructive">{error}</p>
                <Button onClick={() => window.location.reload()} className="mt-4">Try Again</Button>
            </div>
        );
    }

    return (
        <div className="interactions-view-container p-4 md:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">My Interactions</h1>
                    <p className="text-sm text-muted-foreground">
                        View, filter, and analyze your activity across the platform.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'text-primary' : ''}`} />
                        {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                        Back to Dashboard
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="interactions" className="text-sm">
                        <Eye className="h-4 w-4 mr-2" />
                        Interactions
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="text-sm">
                        <BarChart className="h-4 w-4 mr-2" />
                        Analytics
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="interactions" className="mt-6 space-y-6">
                    {/* Filter Panel */}
                    <Card>
                        <CardHeader className="border-b p-4">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                                <div className="relative w-full sm:max-w-md">
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
                                <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
                                    <Select
                                        value={viewMode}
                                        onValueChange={(value: 'table' | 'grid' | 'calendar') => setViewMode(value)}
                                    >
                                        <SelectTrigger className="h-9 text-xs w-32">
                                            <SelectValue placeholder="View Mode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="table">
                                                <div className="flex items-center">
                                                    <LayoutGrid className="h-3 w-3 mr-2" />
                                                    Table
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="grid">
                                                <div className="flex items-center">
                                                    <LayoutGrid className="h-3 w-3 mr-2" />
                                                    Grid
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="calendar">
                                                <div className="flex items-center">
                                                    <Calendar className="h-3 w-3 mr-2" />
                                                    Calendar
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <span>
                                                <Button variant="outline" size="sm" className="h-9 text-xs">
                                                    <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Columns
                                                </Button>
                                            </span>
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
                                        <XCircle className="mr-1.5 h-3.5 w-3.5" /> Clear All
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
                                    <Accordion type="single" collapsible className="w-full">
                                        <AccordionItem value="advanced-filters">
                                            <AccordionTrigger className="text-xs font-medium py-2">
                                                <div className="flex items-center">
                                                    <FilterIcon className="h-3.5 w-3.5 mr-2" />
                                                    Advanced Filters
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 pt-2">
                                                    {table.getHeaderGroups()?.flatMap(headerGroup =>
                                                        headerGroup.headers?.filter(header => header.column.columnDef.meta?.filterComponent)
                                                            .map(header => {
                                                                const column = header.column;
                                                                const FilterComponent = column.columnDef.meta!.filterComponent!;
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
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                </>
                            )}
                        </CardContent>
                        <CardFooter className="border-t p-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                            <div className="text-xs text-muted-foreground text-center sm:text-left">
                                Last refreshed: {formatDate(lastRefreshTimeRef.current.toISOString())}
                            </div>
                            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={handleRefresh}>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Refresh
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleExportData}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Export CSV
                                </Button>
                            </div>
                        </CardFooter>
                    </Card>

                    {/* Selection Actions */}
                    {Object.keys(rowSelection).length > 0 && (
                        <div className="bg-muted/60 p-3 rounded-md flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                            <div className="text-sm text-center sm:text-left">
                                <span className="font-semibold">{Object.keys(rowSelection).length}</span> {Object.keys(rowSelection).length === 1 ? 'item' : 'items'} selected
                            </div>
                            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setRowSelection({})}>
                                    Clear Selection
                                </Button>
                                <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Selected
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Main Content Area */}
                    <Card className="mb-4">
                        <CardContent className="p-0">
                            {viewMode === 'table' && (
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
                                            {isLoading && !error && (
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
                                                    <TableRow
                                                        key={row.id}
                                                        data-state={row.getIsSelected() && "selected"}
                                                        className={row.getIsSelected() ? "bg-muted/50" : ""}
                                                    >
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
                            )}

                            {viewMode === 'grid' && renderGridView()}

                            {viewMode === 'calendar' && (
                                <div className="p-4">
                                    <h3 className="text-lg font-medium mb-4">Calendar View</h3>
                                    <div className="text-center text-muted-foreground mb-4">
                                        <p>Calendar view coming soon!</p>
                                        <p className="text-sm">This view will show your interactions organized by date.</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="border-t p-3">
                            <div className="flex flex-col sm:flex-row items-center justify-between w-full text-xs text-muted-foreground gap-4">
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
                        </CardFooter>
                    </Card>

                    {/* Summary Statistics */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {["view", "like", "pin", "save"].map(action => {
                            const count = data.filter(i => i.action_type === action).length;
                            return (
                                <Card key={action} className="overflow-hidden">
                                    <CardHeader className="flex flex-row items-center justify-between p-4 pb-2 space-y-0">
                                        <CardTitle className="text-sm font-medium">
                                            {formatActionType(action)}
                                        </CardTitle>
                                        {getActionIcon(action, 5)}
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div className="text-2xl font-bold">{count}</div>
                                        <p className="text-xs text-muted-foreground">on current page</p>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Details panel (shown conditionally) */}
                    {showDetailPanel && (
                        <div className="bg-background border rounded-md overflow-hidden mt-4">
                            {isLoadingEntity ? (
                                <div className="flex justify-center items-center h-full min-h-[200px]">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            ) : (
                                renderEntityDetailsPanel()
                            )}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="analytics" className="mt-6 space-y-6">
                    {isLoadingStats ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <p className="ml-3">Loading analytics...</p>
                        </div>
                    ) : statsError ? (
                        <div className="text-center p-4 border border-destructive bg-destructive/10 rounded-md">
                            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                            <p className="text-destructive">{statsError}</p>
                            <Button onClick={() => setActiveTab('analytics')} className="mt-4">
                                Retry
                            </Button>
                        </div>
                    ) : stats ? (
                        <>
                            {/* Analytics Overview Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-base flex items-center">
                                            <BarChart className="h-4 w-4 mr-2 text-blue-500" />
                                            Total Interactions
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div className="flex flex-col">
                                            <span className="text-3xl font-bold">{stats.totalInteractions}</span>
                                            <span className="text-xs text-muted-foreground">Over the last 30 days</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-base flex items-center">
                                            <Activity className="h-4 w-4 mr-2 text-green-500" />
                                            Daily Average
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div className="flex flex-col">
                                            <span className="text-3xl font-bold">{stats.avgInteractionsPerDay}</span>
                                            <span className="text-xs text-muted-foreground">Interactions per day</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-base flex items-center">
                                            <Zap className="h-4 w-4 mr-2 text-amber-500" />
                                            Current Streak
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div className="flex flex-col">
                                            <div className="flex items-end gap-2">
                                                <span className="text-3xl font-bold">{stats.streakData?.currentStreak || 0}</span>
                                                <span className="text-sm text-muted-foreground mb-1">days</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                Longest: {stats.streakData?.longestStreak || 0} days
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Activity Timeline and Calendar */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                                <Card>
                                    <CardHeader className="p-4 pb-0">
                                        <CardTitle className="text-base flex items-center">
                                            <Activity className="h-4 w-4 mr-2" />
                                            Activity Timeline
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        {renderActivityTimeline()}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="p-4 pb-0">
                                        <CardTitle className="text-base flex items-center">
                                            <Calendar className="h-4 w-4 mr-2" />
                                            Activity Calendar
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        <div className="space-y-3">
                                            <div className="text-sm text-muted-foreground">
                                                Activity over the last 30 days
                                            </div>

                                            {/* Day labels */}
                                            <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground text-center">
                                                <div>Sun</div>
                                                <div>Mon</div>
                                                <div>Tue</div>
                                                <div>Wed</div>
                                                <div>Thu</div>
                                                <div>Fri</div>
                                                <div>Sat</div>
                                            </div>

                                            {/* Activity grid */}
                                            <div className="grid grid-cols-7 gap-1">
                                                {(() => {
                                                    const last30Days = stats.activityByDay.slice(-30);
                                                    const today = new Date();
                                                    const startDate = new Date(today);
                                                    startDate.setDate(today.getDate() - 29);

                                                    // Get the day of week for the start date (0 = Sunday)
                                                    const startDayOfWeek = startDate.getDay();

                                                    // Create array with empty cells for proper calendar alignment
                                                    const calendarCells = [];

                                                    // Add empty cells for days before our start date
                                                    for (let i = 0; i < startDayOfWeek; i++) {
                                                        calendarCells.push(
                                                            <div key={`empty-${i}`} className="w-3 h-3"></div>
                                                        );
                                                    }

                                                    // Add activity cells
                                                    last30Days.forEach((day, index) => {
                                                        const intensity = day.count > 0 ? Math.min(day.count / 5, 1) : 0;
                                                        const bgColor = intensity === 0
                                                            ? 'bg-green-100 dark:bg-green-800'
                                                            : intensity < 0.3
                                                            ? 'bg-green-200 dark:bg-green-900'
                                                            : intensity < 0.6
                                                            ? 'bg-green-400 dark:bg-green-700'
                                                            : 'bg-green-600 dark:bg-green-500';

                                                        calendarCells.push(
                                                            <div
                                                                key={`day-${index}`}
                                                                className={`w-3 h-3 rounded-sm ${bgColor} cursor-pointer hover:ring-1 hover:ring-gray-400`}
                                                                title={`${day.date}: ${day.count} interactions`}
                                                            />
                                                        );
                                                    });

                                                    return calendarCells;
                                                })()}
                                            </div>

                                            {/* Legend */}
                                            <div className="flex items-center justify-between text-xs text-muted-foreground mt-3">
                                                <span>Less</span>
                                                <div className="flex gap-1 items-center">
                                                    <div className="w-2.5 h-2.5 rounded-sm bg-gray-100 dark:bg-gray-800"></div>
                                                    <div className="w-2.5 h-2.5 rounded-sm bg-green-200 dark:bg-green-900"></div>
                                                    <div className="w-2.5 h-2.5 rounded-sm bg-green-400 dark:bg-green-700"></div>
                                                    <div className="w-2.5 h-2.5 rounded-sm bg-green-600 dark:bg-green-500"></div>
                                                </div>
                                                <span>More</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Charts */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                                <Card>
                                    <CardHeader className="p-4 pb-0">
                                        <CardTitle className="text-base flex items-center">
                                            <PieChart className="h-4 w-4 mr-2" />
                                            Actions Distribution
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        {renderActionTypeChart()}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="p-4 pb-0">
                                        <CardTitle className="text-base flex items-center">
                                            <BarChart className="h-4 w-4 mr-2" />
                                            Entity Types
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        {renderEntityTypeChart()}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Hourly Distribution */}
                            <Card className="mt-6">
                                <CardHeader className="p-4 pb-0">
                                    <CardTitle className="text-base flex items-center">
                                        <Clock className="h-4 w-4 mr-2" />
                                        Hourly Activity Distribution
                                    </CardTitle>
                                    <CardDescription>
                                        When you're most active throughout the day
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4">
                                    {renderHourlyDistribution()}
                                </CardContent>
                            </Card>

                            {/* Recent Entities */}
                            <Card className="mt-6">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-base flex items-center">
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        Recent Interesting Entities
                                    </CardTitle>
                                    <CardDescription>Entities you've recently interacted with</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-hidden border-t">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[100px]">Type</TableHead>
                                                    <TableHead>Content</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {(stats.recentEntities || []).map((entity) => (
                                                    <TableRow key={entity.id}>
                                                        <TableCell>
                                                            <Badge className={getEntityTypeColor(entity.type)}>
                                                                {entity.type.charAt(0).toUpperCase() + entity.type.slice(1)}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            {entity.title || entity.text || 'No content'}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    let path = '';
                                                                    if (entity.type === 'idea') {
                                                                        path = `/ideas/${entity.id}`;
                                                                    } else if (entity.type === 'discussion') {
                                                                        path = `/discussion/${entity.id}`;
                                                                    } else if (entity.type === 'topic') {
                                                                        // For topics, use parent discussion ID if available
                                                                        if (entity.parent_id) {
                                                                            path = `/discussion/${entity.parent_id}/topic/${entity.id}`;
                                                                        } else {
                                                                            path = `/discussion/unknown/topic/${entity.id}`;
                                                                        }
                                                                    }

                                                                    if (path) {
                                                                        navigate(path);
                                                                    } else {
                                                                        toast.warn("Unable to determine entity view path.");
                                                                    }
                                                                }}
                                                            >
                                                                View
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {(!stats.recentEntities || stats.recentEntities.length === 0) && (
                                                    <TableRow>
                                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                                                            No recent entities found
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Most Active Discussion */}
                            {stats.mostActiveDiscussion && (
                                <Card className="mt-6 bg-primary/5 border-primary/30">
                                    <CardHeader className="p-4 pb-2">
                                        <div className="flex justify-between items-start">
                                            <CardTitle className="text-base flex items-center">
                                                <Star className="h-4 w-4 mr-2 text-amber-500" />
                                                Most Active Discussion
                                            </CardTitle>
                                            <Badge variant="outline" className="text-xs">
                                                {stats.mostActiveDiscussion?.count || 0} interactions
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <p className="font-medium">{stats.mostActiveDiscussion?.title || 'Unknown Discussion'}</p>
                                        <div className="mt-4 flex justify-end">
                                            <Button
                                                size="sm"
                                                onClick={() => navigate(`/discussion/${stats.mostActiveDiscussion?.id || ''}`)}
                                                disabled={!stats.mostActiveDiscussion?.id}
                                            >
                                                Go to Discussion
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    ) : null}
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default InteractionsView;