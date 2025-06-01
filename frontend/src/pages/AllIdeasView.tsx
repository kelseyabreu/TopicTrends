import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { AuthStatus } from '../enums/AuthStatus';
import api from '../utils/api';
import { PaginatedIdeas, PaginatedDiscussions, convertTanStackToApiParams } from '../interfaces/pagination';
import "../styles/AllIdeasView.css";

// Import UI components
import { Button } from '@/components/ui/button'; // User's Button, unchanged
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

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
    Activity,
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
    Tag,
    Brain,
    Lightbulb,
    MessageSquare,
    TrendingUp,
    Zap,
    Target,
    Hash,
    User,
    Globe,
    ShieldCheck,
    Verified,
    Map,
    Layers,
    ScanLine,
    Sliders,
    ChevronDown,
    X,
    Check,
    Plus,
    Minus,
    RotateCcw,
    ArrowRight,
} from 'lucide-react';

// Chart components
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart as RechartsLineChart, Line, ScatterChart, Scatter } from 'recharts';

// Types
interface Idea {
    id: string;
    text: string;
    user_id?: string;
    anonymous_user_id?: string;
    verified: boolean;
    submitter_display_id?: string;
    timestamp: string;
    embedding?: number[];
    topic_id?: string;
    discussion_id?: string;
    intent?: string;
    keywords?: string[];
    sentiment?: string;
    specificity?: string;
    related_topics?: string[];
    on_topic?: number;
    language?: string;
}

interface Discussion {
    id: string;
    title: string;
    prompt: string;
    require_verification: boolean;
    creator_id?: string;
    created_at: string;
    last_activity?: string;
    idea_count: number;
    topic_count: number;
    join_link?: string;
    qr_code?: string;
}

// PaginatedIdeas interface now imported from pagination.ts

interface IdeaAnalytics {
    totalIdeas: number;
    verifiedIdeas: number;
    verificationRate: number;
    averageOnTopicScore: number;
    sentimentDistribution: { [key: string]: number };
    intentDistribution: { [key: string]: number };
    specificityDistribution: { [key: string]: number };
    languageDistribution: { [key: string]: number };
    topKeywords: { keyword: string; count: number }[];
    topDiscussions: { id: string; title: string; count: number }[];
    ideasOverTime: { date: string; count: number }[];
    topicCoverage: number;
    averageKeywordsPerIdea: number;
}

interface SavedFilter {
    id: string;
    name: string;
    description?: string;
    filters: any;
    created_at: string;
}

// Debounce hook
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

// Helper functions
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

const getSentimentColor = (sentiment: string): string => {
    switch (sentiment?.toLowerCase()) {
        case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        case 'neutral': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
};

const getIntentColor = (intent: string): string => {
    switch (intent?.toLowerCase()) {
        case 'suggestion': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
        case 'question': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
        case 'complaint': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
        case 'praise': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300';
        case 'idea': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
};

const getSpecificityColor = (specificity: string): string => {
    switch (specificity?.toLowerCase()) {
        case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
};

const getOnTopicColor = (score?: number): string => {
    if (typeof score !== 'number') return 'bg-gray-100 text-gray-800';
    if (score >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    if (score >= 0.4) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
};

// Chart colors
const CHART_COLORS = ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

// Column Filter Components
function ColumnTextFilter({ column, placeholder }: { column: Column<any, any>; placeholder?: string }) {
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
        />
    );
}

function ColumnSelectFilter({ column, options, placeholder }: { column: Column<any, any>; options: string[]; placeholder?: string }) {
    const filterValue = column.getFilterValue() as string;

    return (
        <Select value={filterValue || 'all'} onValueChange={(value) => column.setFilterValue(value === 'all' ? undefined : value)}>
            <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue placeholder={placeholder || 'All'} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function ColumnRangeFilter({ column, min = 0, max = 1, step = 0.1 }: { column: Column<any, any>; min?: number; max?: number; step?: number }) {
    const [range, setRange] = useState<[number, number]>([min, max]);
    const debouncedRange = useDebounce(range, 300);

    useEffect(() => {
        if (range[0] === min && range[1] === max) {
            column.setFilterValue(undefined);
        } else {
            column.setFilterValue({ gte: range[0], lte: range[1] });
        }
    }, [debouncedRange, column, min, max]);

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{range[0].toFixed(1)}</span>
                <span>{range[1].toFixed(1)}</span>
            </div>
            <Slider
                value={range}
                onValueChange={(value) => setRange(value as [number, number])}
                min={min}
                max={max}
                step={step}
                className="w-full"
            />
        </div>
    );
}

const AllIdeasView: React.FC = () => {
    const navigate = useNavigate();
    const { authStatus, user } = useAuth();

    // Main state
    const [data, setData] = useState<Idea[]>([]);
    const [pageCount, setPageCount] = useState(0);
    const [totalRowCount, setTotalRowCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string>("ideas");
    const [selectedRows, setSelectedRows] = useState<Idea[]>([]);
    const [analytics, setAnalytics] = useState<IdeaAnalytics | null>(null);
    const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [discussions, setDiscussions] = useState<Discussion[]>([]);
    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

    // View options
    const [viewMode, setViewMode] = useState<'table' | 'grid' | 'cards'>('table');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [enableRealtime, setEnableRealtime] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Filter states
    const [keywordSearch, setKeywordSearch] = useState('');
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
    const [relatedTopicsSearch, setRelatedTopicsSearch] = useState('');
    const [onTopicRange, setOnTopicRange] = useState<[number, number]>([0, 1]);
    const [quickFilters, setQuickFilters] = useState({
        verified: null as boolean | null,
        hasTopicId: null as boolean | null,
        hasKeywords: null as boolean | null,
        highOnTopic: false,
        recentOnly: false,
    });

    // Table state
    const initialSorting: SortingState = useMemo(() => [{ id: 'timestamp', desc: true }], []);
    const initialColumnFilters: ColumnFiltersState = useMemo(() => [], []);
    const initialGlobalFilter: string = useMemo(() => '', []);
    const initialPagination = useMemo(() => ({ pageIndex: 0, pageSize: 10 }), []);
    const initialRowSelection: RowSelectionState = useMemo(() => ({}), []);

    const [sorting, setSorting] = useState<SortingState>(initialSorting);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialColumnFilters);
    const [globalFilter, setGlobalFilter] = useState<string>(initialGlobalFilter);
    const debouncedGlobalFilter = useDebounce(globalFilter, 500);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        user_id: false,
        anonymous_user_id: false,
        embedding: false,
    });
    const [rowSelection, setRowSelection] = useState<RowSelectionState>(initialRowSelection);
    const [pagination, setPagination] = useState(initialPagination);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const debouncedDateRange = useDebounce(dateRange, 300);

    // Refs
    const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastRefreshTimeRef = useRef<Date>(new Date());
    const isInitialMount = useRef(true);

    // Available filter options (would be fetched from API in real app)
    const sentimentOptions = ['positive', 'negative', 'neutral'];
    const intentOptions = ['suggestion', 'question', 'complaint', 'praise', 'idea', 'feedback'];
    const specificityOptions = ['high', 'medium', 'low'];
    const languageOptions = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];

    // Table Columns Definition
    const columns = useMemo<ColumnDef<Idea>[]>(() => [
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
            accessorKey: 'text',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    Idea Text <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="max-w-[300px] cursor-pointer hover:text-primary overflow-hidden text-ellipsis whitespace-nowrap" title={row.original.text} onClick={() => navigate(`/ideas/${row.original.id}`)} >
                                <p className="font-medium text-sm">
                                    {row.original.text}
                                </p>
                                {row.original.keywords && row.original.keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {row.original.keywords.slice(0, 3).map((keyword, idx) => (
                                            <Badge key={idx} variant="outline" className="text-xs px-1 py-0">
                                                {keyword}
                                            </Badge>
                                        ))}
                                        {row.original.keywords.length > 3 && (
                                            <Badge variant="outline" className="text-xs px-1 py-0">
                                                +{row.original.keywords.length - 3}
                                            </Badge>
                                        )}
                                    </div>
                                )}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[400px] bg-white">
                            <p>{row.original.text}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ),
            meta: { filterComponent: ColumnTextFilter, filterPlaceholder: "Search idea text..." },
        },
        {
            accessorKey: 'verified',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    <ShieldCheck className="h-3 w-3 mr-1" /> Verified <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    {row.original.verified ? (
                        <><Verified className="h-4 w-4 text-green-500" /><span className="text-xs text-green-600">Yes</span></>
                    ) : (
                        <><User className="h-4 w-4 text-gray-400" /><span className="text-xs text-gray-500">No</span></>
                    )}
                </div>
            ),
            meta: {
                filterComponent: ({ column }) => (
                    <ColumnSelectFilter column={column} options={['true', 'false']} placeholder="All" />
                )
            },
        },
        {
            accessorKey: 'sentiment',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    <Brain className="h-3 w-3 mr-1" /> Sentiment <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <Badge className={`text-xs ${getSentimentColor(row.original.sentiment || 'unknown')}`}>
                    {row.original.sentiment || 'Unknown'}
                </Badge>
            ),
            meta: {
                filterComponent: ({ column }) => (
                    <ColumnSelectFilter column={column} options={sentimentOptions} placeholder="All Sentiments" />
                )
            },
        },
        {
            accessorKey: 'intent',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    <Target className="h-3 w-3 mr-1" /> Intent <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <Badge className={`text-xs ${getIntentColor(row.original.intent || 'unknown')}`}>
                    {row.original.intent || 'Unknown'}
                </Badge>
            ),
            meta: {
                filterComponent: ({ column }) => (
                    <ColumnSelectFilter column={column} options={intentOptions} placeholder="All Intents" />
                )
            },
        },
        {
            accessorKey: 'specificity',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    <ScanLine className="h-3 w-3 mr-1" /> Specificity <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <Badge className={`text-xs ${getSpecificityColor(row.original.specificity || 'unknown')}`}>
                    {row.original.specificity || 'Unknown'}
                </Badge>
            ),
            meta: {
                filterComponent: ({ column }) => (
                    <ColumnSelectFilter column={column} options={specificityOptions} placeholder="All Levels" />
                )
            },
        },
        {
            accessorKey: 'on_topic',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    <Zap className="h-3 w-3 mr-1" /> On Topic <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => {
                const score = row.original.on_topic;
                return (
                    <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${getOnTopicColor(score)}`}>
                            {typeof score === 'number' ? (score * 100).toFixed(0) + '%' : 'N/A'}
                        </Badge>
                        {typeof score === 'number' && (
                            <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                <div
                                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${score * 100}%` }}
                                />
                            </div>
                        )}
                    </div>
                );
            },
            meta: {
                filterComponent: ({ column }) => (
                    <ColumnRangeFilter column={column} min={0} max={1} step={0.1} />
                )
            },
        },
        {
            accessorKey: 'submitter_display_id',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    <Users className="h-3 w-3 mr-1" /> Submitter <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="font-mono text-xs truncate max-w-[120px]" title={row.original.submitter_display_id}>
                    {row.original.submitter_display_id || 'Anonymous'}
                </div>
            ),
            meta: { filterComponent: ColumnTextFilter, filterPlaceholder: "Filter submitter..." },
        },
        {
            accessorKey: 'timestamp',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    <Clock className="h-3 w-3 mr-1" /> Submitted <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="text-xs text-muted-foreground">
                    {formatDate(row.original.timestamp)}
                </div>
            ),
        },
        {
            accessorKey: 'language',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
                    <Globe className="h-3 w-3 mr-1" /> Language <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <Badge variant="outline" className="text-xs">
                    {(row.original.language || 'en').toUpperCase()}
                </Badge>
            ),
            meta: {
                filterComponent: ({ column }) => (
                    <ColumnSelectFilter column={column} options={languageOptions} placeholder="All Languages" />
                )
            },
        },
        {
            accessorKey: 'discussion_id',
            header: 'Discussion',
            cell: ({ row }) => {
                const discussion = discussions.find(d => d.id === row.original.discussion_id);
                return (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div
                                    className="text-xs text-blue-600 cursor-pointer hover:underline max-w-[120px] truncate"
                                    onClick={() => navigate(`/discussion/${row.original.discussion_id}`)}
                                >
                                    {discussion?.title || 'Unknown'}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{discussion?.title || 'Unknown Discussion'}</p>
                                <p className="text-xs text-muted-foreground">{discussion?.prompt}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                );
            },
        },
        {
            accessorKey: 'topic_id',
            header: 'Topic',
            cell: ({ row }) => (
                <div className="text-xs">
                    {row.original.topic_id ? (
                        <Badge variant="secondary" className="text-xs">
                            <Layers className="h-3 w-3 mr-1" />
                            Grouped
                        </Badge>
                    ) : (
                        <span className="text-muted-foreground">Ungrouped</span>
                    )}
                </div>
            ),
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => {
                const idea = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <span>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] bg-white">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate(`/ideas/${idea.id}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/discussion/${idea.discussion_id}`)}>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                Go to Discussion
                            </DropdownMenuItem>
                            {idea.topic_id && (
                                <DropdownMenuItem onClick={() => navigate(`/discussion/${idea.discussion_id}/topic/${idea.topic_id}`)}>
                                    <Layers className="mr-2 h-4 w-4" />
                                    View Topic
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleCopyIdeaId(idea.id)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copy ID
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleShareIdea(idea)}>
                                <Share2 className="mr-2 h-4 w-4" />
                                Share
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ], [discussions, navigate]);

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
                try {
                    newTimestampFilterValue.gte = new Date(startDate).toISOString();
                } catch (e) {
                    console.warn("Invalid start date for filter", startDate);
                }
            }
            if (endDate) {
                try {
                    const endOfDay = new Date(endDate);
                    endOfDay.setHours(23, 59, 59, 999);
                    newTimestampFilterValue.lte = endOfDay.toISOString();
                } catch (e) {
                    console.warn("Invalid end date for filter", endDate);
                }
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

    const stableColumnFiltersKey = useMemo(() => JSON.stringify(columnFilters), [columnFilters]);

    // Effect: Main data fetching
    useEffect(() => {
        if (authStatus !== AuthStatus.Authenticated) {
            setIsLoading(false);
            setData([]);
            setPageCount(0);
            setTotalRowCount(0);
            return;
        }

        const fetchIdeas = async () => {
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

                // Add keyword and related topics filters
                if (selectedKeywords.length > 0) {
                    queryParams['filter.keywords.in'] = selectedKeywords.join(',');
                }

                if (relatedTopicsSearch) {
                    queryParams['filter.related_topics.regex'] = relatedTopicsSearch;
                }

                const response = await api.get<PaginatedIdeas>('/ideas/', {
                    params: queryParams
                });

                setData(response.data.rows);
                setPageCount(response.data.pageCount);
                setTotalRowCount(response.data.totalRowCount);
                isInitialMount.current = false;
            } catch (err: any) {
                console.error('Error fetching ideas:', err);
                const errorMsg = err.response?.data?.detail || err.message || 'Failed to load ideas.';
                setError(errorMsg);
                toast.error(errorMsg, { toastId: 'fetch-ideas-error' });
            } finally {
                setIsLoading(false);
            }
        };

        fetchIdeas();
    }, [authStatus, pagination, sorting, stableColumnFiltersKey, debouncedGlobalFilter, selectedKeywords, relatedTopicsSearch, autoRefresh]);

    // Effect: Load discussions for reference
    useEffect(() => {
        if (authStatus !== AuthStatus.Authenticated) return;

        const fetchDiscussions = async () => {
            try {
                const response = await api.get<PaginatedDiscussions>('/discussions', {
                    params: { page_size: 200 } // Get all discussions for reference using standardized pagination
                });
                setDiscussions(response.data.rows);
            } catch (err) {
                console.error('Error fetching discussions:', err);
            }
        };

        fetchDiscussions();
    }, [authStatus]);

    // Effect: Load analytics
    useEffect(() => {
        if (authStatus !== AuthStatus.Authenticated || activeTab !== 'analytics') {
            return;
        }

        const fetchAnalytics = async () => {
            setIsLoadingAnalytics(true);
            setAnalyticsError(null);

            try {
                // Fetch real analytics from API
                const response = await api.get('/analytics/ideas-summary');
                setAnalytics(response.data);
            } catch (err: any) {
                console.error('Error fetching analytics:', err);
                setAnalyticsError('Failed to load analytics.');
            } finally {
                setIsLoadingAnalytics(false);
            }
        };

        fetchAnalytics();
    }, [authStatus, activeTab]);



    // Event handlers
    const handleCopyIdeaId = (ideaId: string) => {
        navigator.clipboard.writeText(ideaId)
            .then(() => toast.success("Idea ID copied to clipboard"))
            .catch(() => toast.error("Failed to copy to clipboard"));
    };

    const handleShareIdea = (idea: Idea) => {
        const shareUrl = `${window.location.origin}/ideas/${idea.id}`;
        navigator.clipboard.writeText(shareUrl)
            .then(() => toast.success("Share link copied to clipboard"))
            .catch(() => toast.error("Failed to copy share link"));
    };

    const handleClearFilters = () => {
        setGlobalFilter(initialGlobalFilter);
        setDateRange({ startDate: '', endDate: '' });
        setColumnFilters(initialColumnFilters);
        setSorting(initialSorting);
        setPagination(initialPagination);
        setRowSelection({});
        setSelectedKeywords([]);
        setRelatedTopicsSearch('');
        setOnTopicRange([0, 1]);
        setQuickFilters({
            verified: null,
            hasTopicId: null,
            hasKeywords: null,
            highOnTopic: false,
            recentOnly: false,
        });
    };

    const handleExportData = () => {
        try {
            let csvContent = "data:text/csv;charset=utf-8,";
            const headers = ["ID", "Text", "Verified", "Sentiment", "Intent", "Specificity", "On Topic", "Submitter", "Timestamp", "Discussion ID", "Topic ID", "Keywords"];
            csvContent += headers.join(",") + "\r\n";

            data.forEach(item => {
                const row = [
                    item.id || "",
                    `"${(item.text || "").replace(/"/g, '""')}"`,
                    item.verified ? "Yes" : "No",
                    item.sentiment || "",
                    item.intent || "",
                    item.specificity || "",
                    typeof item.on_topic === 'number' ? (item.on_topic * 100).toFixed(1) + '%' : "",
                    item.submitter_display_id || "",
                    item.timestamp || "",
                    item.discussion_id || "",
                    item.topic_id || "",
                    `"${(item.keywords || []).join('; ')}"`
                ];
                csvContent += row.join(",") + "\r\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `ideas_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("Export completed successfully");
        } catch (err) {
            console.error("Export error:", err);
            toast.error("Failed to export data");
        }
    };

    const handleSaveFilter = () => {
        const filterName = prompt("Enter a name for this filter:");
        if (filterName) {
            const newFilter: SavedFilter = {
                id: Date.now().toString(),
                name: filterName,
                filters: {
                    columnFilters,
                    globalFilter,
                    dateRange,
                    selectedKeywords,
                    relatedTopicsSearch,
                    quickFilters,
                },
                created_at: new Date().toISOString(),
            };
            setSavedFilters(prev => [...prev, newFilter]);
            toast.success("Filter saved successfully");
        }
    };

    const handleLoadFilter = (filter: SavedFilter) => {
        setColumnFilters(filter.filters.columnFilters || []);
        setGlobalFilter(filter.filters.globalFilter || '');
        setDateRange(filter.filters.dateRange || { startDate: '', endDate: '' });
        setSelectedKeywords(filter.filters.selectedKeywords || []);
        setRelatedTopicsSearch(filter.filters.relatedTopicsSearch || '');
        setQuickFilters(filter.filters.quickFilters || {
            verified: null,
            hasTopicId: null,
            hasKeywords: null,
            highOnTopic: false,
            recentOnly: false,
        });
        toast.success(`Filter "${filter.name}" applied`);
    };

    const handleRefresh = () => {
        setPagination(prev => ({ ...prev }));
        toast.info("Refreshing ideas data...");
    };

    // Render helpers
    const renderAdvancedFilters = () => (
        <Card className="mb-4">
            <CardHeader>
                <CardTitle className="text-sm flex items-center">
                    <Sliders className="h-4 w-4 mr-2" />
                    Advanced Filters
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <Label className="text-xs font-medium mb-1 block">Keywords</Label>
                        <div className="space-y-2">
                            <Input
                                placeholder="Search keywords..."
                                value={keywordSearch}
                                onChange={(e) => setKeywordSearch(e.target.value)}
                                className="h-8 text-xs"
                            />
                            {selectedKeywords.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {selectedKeywords.map((keyword, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-xs">
                                            {keyword}
                                            <X
                                                className="h-3 w-3 ml-1 cursor-pointer"
                                                onClick={() => setSelectedKeywords(prev =>
                                                    prev.filter(k => k !== keyword)
                                                )}
                                            />
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs font-medium mb-1 block">Related Topics</Label>
                        <Input
                            placeholder="Search related topics..."
                            value={relatedTopicsSearch}
                            onChange={(e) => setRelatedTopicsSearch(e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>
                    <div>
                        <Label className="text-xs font-medium mb-1 block">Relevance Score Range</Label>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{(onTopicRange[0] * 100).toFixed(0)}%</span>
                                <span>{(onTopicRange[1] * 100).toFixed(0)}%</span>
                            </div>
                            <Slider
                                value={onTopicRange}
                                onValueChange={(value) => setOnTopicRange(value as [number, number])}
                                min={0}
                                max={1}
                                step={0.1}
                                className="w-full"
                            />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    const renderGridView = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {data.map(idea => (
                <Card key={idea.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex gap-1">
                                {idea.verified && <Verified className="h-4 w-4 text-green-500" />}
                                {idea.topic_id && <Layers className="h-4 w-4 text-blue-500" />}
                            </div>
                            <div className="flex gap-1">
                                <Badge className={`text-xs ${getSentimentColor(idea.sentiment || 'unknown')}`}>
                                    {idea.sentiment || 'Unknown'}
                                </Badge>
                            </div>
                        </div>
                        <CardDescription className="text-sm line-clamp-3">
                            {idea.text}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 renderGridCardContent">
                        <div className="space-y-2">
                            {idea.keywords && idea.keywords.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {idea.keywords.slice(0, 3).map((keyword, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs">
                                            {keyword}
                                        </Badge>
                                    ))}
                                    {idea.keywords.length > 3 && (
                                        <Badge variant="outline" className="text-xs">
                                            +{idea.keywords.length - 3}
                                        </Badge>
                                    )}
                                </div>
                            )}
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span>{idea.submitter_display_id || 'Anonymous'}</span>
                                <span>{formatDate(idea.timestamp, false)}</span>
                            </div>
                            {typeof idea.on_topic === 'number' && (
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span>Relevance</span>
                                        <span>{(idea.on_topic * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                                        <div
                                            className="bg-blue-500 h-1.5 rounded-full"
                                            style={{ width: `${idea.on_topic * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="p-2 flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/ideas/${idea.id}`)}>
                            <Eye className="h-3 w-3 mr-1" />
                            View
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/discussion/${idea.discussion_id}`)}>
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Discussion
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    );

    const renderAnalyticsCharts = () => {
        if (!analytics) return null;

        const sentimentData = Object.entries(analytics.sentimentDistribution).map(([key, value]) => ({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            value,
            color: CHART_COLORS[Object.keys(analytics.sentimentDistribution).indexOf(key)]
        }));

        const intentData = Object.entries(analytics.intentDistribution).map(([key, value]) => ({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            value,
            color: CHART_COLORS[Object.keys(analytics.intentDistribution).indexOf(key)]
        }));

        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center">
                            <Brain className="h-4 w-4 mr-2" />
                            Sentiment Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsPieChart>
                                    <Pie
                                        data={sentimentData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {sentimentData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip formatter={(value: any) => [`${value} ideas`, 'Count']} />
                                    <Legend />
                                </RechartsPieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center">
                            <Target className="h-4 w-4 mr-2" />
                            Intent Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsBarChart data={intentData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <RechartsTooltip formatter={(value: any) => [`${value} ideas`, 'Count']} />
                                    <Bar dataKey="value" fill="#8884d8">
                                        {intentData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </RechartsBarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center">
                            <Activity className="h-4 w-4 mr-2" />
                            Ideas Over Time
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsLineChart data={analytics.ideasOverTime}>
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
                                        formatter={(value: any) => [`${value} ideas`, 'Count']}
                                        labelFormatter={(label) => formatDate(label, false)}
                                    />
                                    <Line type="monotone" dataKey="count" stroke="#8884d8" activeDot={{ r: 8 }} />
                                </RechartsLineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center">
                            <Hash className="h-4 w-4 mr-2" />
                            Top Keywords
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {analytics.topKeywords.map((keyword, index) => (
                                <div key={keyword.keyword} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium">
                                            {index + 1}
                                        </div>
                                        <span className="text-sm font-medium">{keyword.keyword}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-20 bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-500 h-2 rounded-full"
                                                style={{ width: `${(keyword.count / analytics.topKeywords[0].count) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-sm text-muted-foreground w-8">{keyword.count}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    };

    // Main render
    if (authStatus === AuthStatus.Loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-3">Loading...</p>
            </div>
        );
    }

    if (authStatus === AuthStatus.Unauthenticated) {
        return (
            <div className="text-center mt-10">
                <p>Please <a href="/login" className="text-blue-600 hover:underline">login</a> to explore ideas.</p>
            </div>
        );
    }

    if (isLoading && data.length === 0 && authStatus === AuthStatus.Authenticated && !error) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-3">Loading ideas...</p>
            </div>
        );
    }

    if (error && data.length === 0) {
        return (
            <div className="text-center mt-10 p-4 border border-destructive bg-destructive/10 rounded-md">
                <h2>Error Loading Ideas</h2>
                <p className="text-destructive">{error}</p>
                <Button onClick={() => window.location.reload()} className="mt-4">Try Again</Button>
            </div>
        );
    }

    return (
        <div className="all-ideas-view-container p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center">
                        <Lightbulb className="h-6 w-6 mr-3 text-yellow-500" />
                        All Ideas Explorer
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Discover, analyze, and explore all ideas across the platform with advanced filtering and analytics.
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

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="ideas" className="text-sm">
                        <Lightbulb className="h-4 w-4 mr-2" />
                        Ideas Explorer ({totalRowCount.toLocaleString()})
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="text-sm">
                        <BarChart className="h-4 w-4 mr-2" />
                        Analytics & Insights
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="ideas" className="mt-6 space-y-6">
                    {/* Search and Filters */}
                    <Card>
                        <CardHeader className="border-b p-4">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 allIdeasSearchAndFiltersDiv">
                                <div className="relative w-full sm:max-w-md">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="search"
                                        placeholder="Search across all idea fields..."
                                        value={globalFilter}
                                        onChange={(e) => setGlobalFilter(e.target.value)}
                                        className="pl-8 h-9 w-full"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
                                    <Select
                                        value={viewMode}
                                        onValueChange={(value: 'table' | 'grid' | 'cards') => setViewMode(value)}
                                    >
                                        <SelectTrigger className="h-9 text-xs w-32">
                                            <SelectValue />
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
                                        </SelectContent>
                                    </Select>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            {/* MODIFICATION: Wrap Button with span */}
                                            <span>
                                                <Button variant="outline" size="sm" className="h-9 text-xs">
                                                    <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Columns
                                                </Button>
                                            </span>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-[180px] bg-white">
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

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                        className="h-9 text-xs"
                                    >
                                        <Sliders className="mr-1.5 h-3.5 w-3.5" />
                                        Advanced
                                        <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
                                    </Button>

                                    <Button variant="ghost" size="sm" className="h-9 text-xs text-destructive hover:bg-destructive/10" onClick={handleClearFilters}>
                                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear All
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">

                            {/* Advanced Filters */}
                            {showAdvancedFilters && renderAdvancedFilters()}

                            {/* Date Range and Basic Filters */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 items-end">
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">Start Date</Label>
                                    <div className="relative">
                                        <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        <Input
                                            type="date"
                                            value={dateRange.startDate}
                                            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                                            className="pl-8 h-9 text-xs w-full"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">End Date</Label>
                                    <div className="relative">
                                        <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                        <Input
                                            type="date"
                                            value={dateRange.endDate}
                                            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                                            className="pl-8 h-9 text-xs w-full"
                                            min={dateRange.startDate || undefined}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">Sentiment</Label>
                                    <Select
                                        value={table.getColumn('sentiment')?.getFilterValue() as string || 'all'}
                                        onValueChange={(value) => table.getColumn('sentiment')?.setFilterValue(value === 'all' ? undefined : value)}
                                    >
                                        <SelectTrigger className="h-9 text-xs w-full">
                                            <SelectValue placeholder="All Sentiments" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Sentiments</SelectItem>
                                            {sentimentOptions.map(option => (
                                                <SelectItem key={option} value={option}>
                                                    {option.charAt(0).toUpperCase() + option.slice(1)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">Intent</Label>
                                    <Select
                                        value={table.getColumn('intent')?.getFilterValue() as string || 'all'}
                                        onValueChange={(value) => table.getColumn('intent')?.setFilterValue(value === 'all' ? undefined : value)}
                                    >
                                        <SelectTrigger className="h-9 text-xs w-full">
                                            <SelectValue placeholder="All Intents" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Intents</SelectItem>
                                            {intentOptions.map(option => (
                                                <SelectItem key={option} value={option}>
                                                    {option.charAt(0).toUpperCase() + option.slice(1)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Column-specific filters */}
                            <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="column-filters">
                                    <AccordionTrigger className="text-xs font-medium py-2">
                                        <div className="flex items-center">
                                            <FilterIcon className="h-3.5 w-3.5 mr-2" />
                                            Column-Specific Filters
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3 pt-2">
                                            {table.getHeaderGroups()?.flatMap(headerGroup =>
                                                headerGroup.headers?.filter(header => header.column.columnDef.meta?.filterComponent)
                                                    .map(header => {
                                                        const column = header.column;
                                                        const FilterComponent = column.columnDef.meta!.filterComponent!;
                                                        const filterPlaceholder = column.columnDef.meta!.filterPlaceholder;
                                                        return (
                                                            <div key={column.id}>
                                                                <Label className="block text-xs font-medium text-muted-foreground mb-1 capitalize">
                                                                    {column.id.replace(/_/g, ' ')}
                                                                </Label>
                                                                <FilterComponent column={column} placeholder={filterPlaceholder} />
                                                            </div>
                                                        );
                                                    })
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                        <CardFooter className="border-t p-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 allideasFilterSearchFooter">
                            <div className="text-xs text-muted-foreground text-center sm:text-left">
                                Last refreshed: {formatDate(lastRefreshTimeRef.current.toISOString())}
                            </div>
                            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                                <Popover className="somePopover1">
                                    <PopoverTrigger asChild>
                                        {/* MODIFICATION: Wrap Button with span */}
                                        <span>
                                            <Button variant="outline" size="sm">
                                                <Bookmark className="h-4 w-4 mr-2" />
                                                Saved Filters ({savedFilters.length})
                                            </Button>
                                        </span>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <h4 className="font-medium">Saved Filters</h4>
                                                <Button size="sm" onClick={handleSaveFilter}>
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Save Current
                                                </Button>
                                            </div>
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {savedFilters.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground">No saved filters yet.</p>
                                                ) : (
                                                    savedFilters.map(filter => (
                                                        <div key={filter.id} className="flex items-center justify-between p-2 border rounded">
                                                            <div className="flex-1">
                                                                <p className="text-sm font-medium">{filter.name}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {formatDate(filter.created_at, false)}
                                                                </p>
                                                            </div>
                                                            <div className="flex gap-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleLoadFilter(filter)}
                                                                >
                                                                    Apply
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="destructive"
                                                                    onClick={() => setSavedFilters(prev =>
                                                                        prev.filter(f => f.id !== filter.id)
                                                                    )}
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
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
                        <div className="bg-muted/60 p-3 rounded-md flex justify-between items-center">
                            <div className="text-sm">
                                <span className="font-semibold">{Object.keys(rowSelection).length}</span> {Object.keys(rowSelection).length === 1 ? 'idea' : 'ideas'} selected
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setRowSelection({})}>
                                    Clear Selection
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => {
                                    const selectedIdeaIds = selectedRows.map(row => row.id);
                                    console.log('Selected idea IDs:', selectedIdeaIds);
                                    toast.info(`${selectedIdeaIds.length} idea IDs logged to console`);
                                }}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy IDs
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => {
                                    const selectedTexts = selectedRows.map(row => row.text).join('\n\n');
                                    navigator.clipboard.writeText(selectedTexts);
                                    toast.success('Selected idea texts copied to clipboard');
                                }}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    Copy Texts
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Main Content Area */}
                    <Card className="mb-4 renderGridCard">
                        <CardContent className="p-0 renderGridCardContent">
                            {viewMode === 'table' && (
                                <div className="overflow-x-auto">
                                    <Table className="allIdeaTable">
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
                                                            <TableCell key={cell.id} className="px-3 py-3 align-top text-xs">
                                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                ))
                                            ) : null}
                                            {!isLoading && table.getRowModel().rows?.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                                                        {error && data.length > 0 ? `Error updating: ${error}` : "No ideas found matching your criteria."}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {viewMode === 'grid' && renderGridView()}
                        </CardContent>
                        <CardFooter className="border-t p-3">
                            <div className="flex flex-col sm:flex-row items-center justify-between w-full text-xs text-muted-foreground gap-4">
                                <div className="flex-1 text-center sm:text-left">
                                    {table.getFilteredSelectedRowModel().rows.length > 0 ?
                                        `${table.getFilteredSelectedRowModel().rows.length} of ` : ''}
                                    {totalRowCount.toLocaleString()} idea(s)
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
                                                {[10, 25, 50, 100].map((size) => (
                                                    <SelectItem key={size} value={`${size}`} className="text-xs">{size}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <span className="whitespace-nowrap">
                                        Page {pagination.pageIndex + 1} of {pageCount || 1}
                                    </span>
                                    <div className="flex items-center gap-x-1">
                                        <Button variant="outline" size="icon-xs" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                                            <ChevronsLeft className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="icon-xs" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="icon-xs" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="icon-xs" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}>
                                            <ChevronsRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardFooter>
                    </Card>

                    {/* Summary Statistics */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium">Total Ideas</CardTitle>
                                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-2xl font-bold">{totalRowCount.toLocaleString()}</div>
                                <p className="text-xs text-muted-foreground">Across all discussions</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium">Verified Ideas</CardTitle>
                                <Verified className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-2xl font-bold">
                                    {data.filter(idea => idea.verified).length}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {totalRowCount > 0 && data.length > 0 ? Math.round((data.filter(idea => idea.verified).length / data.length) * 100) : 0}% of current page
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium">Grouped Ideas</CardTitle>
                                <Layers className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-2xl font-bold">
                                    {data.filter(idea => idea.topic_id).length}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {data.length > 0 ? Math.round((data.filter(idea => idea.topic_id).length / data.length) * 100) : 0}% of current page
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium">High Relevance</CardTitle>
                                <Zap className="h-4 w-4 text-yellow-500" />
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-2xl font-bold">
                                    {data.filter(idea => typeof idea.on_topic === 'number' && idea.on_topic >= 0.8).length}
                                </div>
                                <p className="text-xs text-muted-foreground">≥80% relevance score</p>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="analytics" className="mt-6 space-y-6">
                    {isLoadingAnalytics ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                            <p className="ml-3">Loading analytics...</p>
                        </div>
                    ) : analyticsError ? (
                        <div className="text-center p-4 border border-destructive bg-destructive/10 rounded-md">
                            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
                            <p className="text-destructive">{analyticsError}</p>
                            <Button onClick={() => setActiveTab('analytics')} className="mt-4">
                                Retry
                            </Button>
                        </div>
                    ) : analytics ? (
                        <>
                            {/* Overview Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-base">Total Ideas</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div className="flex flex-col">
                                            <span className="text-3xl font-bold">{analytics.totalIdeas.toLocaleString()}</span>
                                            <span className="text-xs text-muted-foreground">Across all discussions</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-base">Verification Rate</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div className="flex flex-col">
                                            <span className="text-3xl font-bold">{analytics.verificationRate}%</span>
                                            <span className="text-xs text-muted-foreground">{analytics.verifiedIdeas.toLocaleString()} verified ideas</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-base">Avg Relevance</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div className="flex flex-col">
                                            <span className="text-3xl font-bold">{(analytics.averageOnTopicScore * 100).toFixed(1)}%</span>
                                            <span className="text-xs text-muted-foreground">Average on-topic score</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="p-4 pb-2">
                                        <CardTitle className="text-base">Topic Coverage</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-0">
                                        <div className="flex flex-col">
                                            <span className="text-3xl font-bold">{analytics.topicCoverage}%</span>
                                            <span className="text-xs text-muted-foreground">Ideas with topics assigned</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Charts */}
                            {renderAnalyticsCharts()}

                            {/* Additional Analytics */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center">
                                            <ScanLine className="h-4 w-4 mr-2" />
                                            Specificity Distribution
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {Object.entries(analytics.specificityDistribution).map(([level, count]) => (
                                                <div key={level} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Badge className={`text-xs ${getSpecificityColor(level)}`}>
                                                            {level.charAt(0).toUpperCase() + level.slice(1)}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20 bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="bg-blue-500 h-2 rounded-full"
                                                                style={{ width: `${(count / analytics.totalIdeas) * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-sm text-muted-foreground w-12">{count}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center">
                                            <Globe className="h-4 w-4 mr-2" />
                                            Language Distribution
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {Object.entries(analytics.languageDistribution).map(([lang, count]) => (
                                                <div key={lang} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-xs">
                                                            {lang.toUpperCase()}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20 bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="bg-blue-500 h-2 rounded-full"
                                                                style={{ width: `${(count / analytics.totalIdeas) * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-sm text-muted-foreground w-12">{count}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Top Discussions */}
                            <Card className="mt-6">
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center">
                                        <TrendingUp className="h-4 w-4 mr-2" />
                                        Most Active Discussions
                                    </CardTitle>
                                    <CardDescription>
                                        Discussions with the highest number of ideas
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-hidden border-t">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[50px]">Rank</TableHead>
                                                    <TableHead>Discussion</TableHead>
                                                    <TableHead className="text-right">Ideas</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {analytics.topDiscussions.map((discussion, index) => (
                                                    <TableRow key={discussion.id}>
                                                        <TableCell>
                                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium">
                                                                {index + 1}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="font-medium">
                                                            {discussion.title}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Badge variant="secondary">{discussion.count}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => navigate(`/discussion/${discussion.id}`)}
                                                            >
                                                                <ArrowRight className="h-3 w-3 mr-1" />
                                                                View
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Key Metrics Summary */}
                            <Card className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center">
                                        <Sparkles className="h-4 w-4 mr-2 text-blue-500" />
                                        Key Insights
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="text-center p-4 bg-white rounded-lg border">
                                            <div className="text-2xl font-bold text-blue-600">{analytics.averageKeywordsPerIdea}</div>
                                            <div className="text-sm text-muted-foreground">Avg Keywords per Idea</div>
                                        </div>
                                        <div className="text-center p-4 bg-white rounded-lg border">
                                            <div className="text-2xl font-bold text-green-600">
                                                {Object.values(analytics.sentimentDistribution).reduce((acc, val) => acc + val, 0) > 0
                                                    ? Math.round((analytics.sentimentDistribution.positive / Object.values(analytics.sentimentDistribution).reduce((acc, val) => acc + val, 0)) * 100)
                                                    : 0}%
                                            </div>
                                            <div className="text-sm text-muted-foreground">Positive Sentiment</div>
                                        </div>
                                        <div className="text-center p-4 bg-white rounded-lg border">
                                            <div className="text-2xl font-bold text-purple-600">
                                                {Object.values(analytics.intentDistribution).reduce((acc, val) => acc + val, 0) > 0
                                                    ? Math.round((analytics.intentDistribution.suggestion / Object.values(analytics.intentDistribution).reduce((acc, val) => acc + val, 0)) * 100)
                                                    : 0}%
                                            </div>
                                            <div className="text-sm text-muted-foreground">Suggestions</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    ) : null}
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default AllIdeasView;