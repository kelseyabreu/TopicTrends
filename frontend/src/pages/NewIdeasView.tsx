import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import io, { Socket } from "socket.io-client";
import api, { API_URL } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { AuthStatus } from "../enums/AuthStatus";
import "../styles/NewIdeasView.css";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Zap, CheckCircle, AlertTriangle, ArrowLeft, Clock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, BarChart3, TrendingUp, Users, Calendar, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UnprocessedIdea {
    id: string;
    text: string;
    status: 'pending' | 'completed' | 'stuck';
    stuck_reason?: 'embedding_failed' | 'clustering_failed';
    last_attempt?: string;
    timestamp: string;
    submitter_display_id: string;
    category: 'needs_embedding' | 'needs_clustering';
}

// TanStack-compatible pagination response
interface UnprocessedIdeasResponse {
    rows: UnprocessedIdea[];
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
    category_counts: {
        needs_embedding: number;
        needs_clustering: number;
        total_unprocessed: number;
    };
    status_counts: {
        pending: number;
        processing: number;
        embedded: number;
        completed: number;
        failed: number;
        stuck: number;
    };
}

// Legacy interface for backward compatibility during transition
interface UnprocessedIdeasData {
    needs_embedding: UnprocessedIdea[];
    needs_clustering: UnprocessedIdea[];
    total_unprocessed: number;
    pagination?: {
        page: number;
        page_size: number;
        total_embedding: number;
        total_clustering: number;
        has_more_embedding: boolean;
        has_more_clustering: boolean;
        has_more: boolean;
        showing: number;
    };
}

interface Analytics {
    total_stuck: number;
    avg_processing_time: number;
    most_active_submitter: string;
    oldest_idea_age: number;
    processing_success_rate: number;
    ideas_by_status: Record<string, number>;
}


const NewIdeasView: React.FC = () => {
    const { discussionId } = useParams<{ discussionId: string }>();
    const navigate = useNavigate();
    const { authStatus } = useAuth();

    // Data states
    const [driftingData, setDriftingData] = useState<UnprocessedIdeasData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState({
        embeddings: false,
        clustering: false,
        failed: false
    });

    // Ref for the select all checkbox
    const selectAllCheckboxRef = useRef<HTMLButtonElement>(null);

    // Filter and view states - removed 'pending' tab as it's redundant with 'embedding'
    const [activeTab, setActiveTab] = useState<'all' | 'embedding' | 'clustering' | 'stuck' | 'failed'>('all');
    const [selectedIdeas, setSelectedIdeas] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // Calculate analytics from data (memoized to prevent unnecessary re-renders)
    const calculateAnalytics = useCallback((data: UnprocessedIdeasData, statusCounts?: Record<string, number>): Analytics => {
        const allIdeas = [...data.needs_embedding, ...data.needs_clustering];

        const stuckIdeas = allIdeas.filter(idea => idea.status === 'stuck');
        const pendingIdeas = allIdeas.filter(idea => idea.status === 'pending');

        // Use accurate status counts from backend if available
        const totalStuck = statusCounts?.stuck || stuckIdeas.length;

        // Calculate average processing time for stuck ideas
        const avgProcessingTime = stuckIdeas.length > 0
            ? stuckIdeas.reduce((acc, idea) => {
                if (idea.last_attempt) {
                    const attemptTime = new Date(idea.last_attempt);
                    const now = new Date();
                    return acc + (now.getTime() - attemptTime.getTime()) / (1000 * 60); // minutes
                }
                return acc;
            }, 0) / stuckIdeas.length
            : 0;

        // Find most active submitter
        const submitterCounts: Record<string, number> = {};
        allIdeas.forEach(idea => {
            submitterCounts[idea.submitter_display_id] = (submitterCounts[idea.submitter_display_id] || 0) + 1;
        });
        const mostActiveSubmitter = Object.entries(submitterCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';

        // Calculate oldest idea age
        const oldestIdea = allIdeas.reduce((oldest, idea) => {
            const ideaTime = new Date(idea.timestamp);
            const oldestTime = new Date(oldest.timestamp);
            return ideaTime < oldestTime ? idea : oldest;
        }, allIdeas[0]);

        const oldestAge = oldestIdea
            ? (new Date().getTime() - new Date(oldestIdea.timestamp).getTime()) / (1000 * 60 * 60) // hours
            : 0;

        // Calculate success rate (ideas that aren't stuck)
        const successRate = allIdeas.length > 0
            ? ((allIdeas.length - stuckIdeas.length) / allIdeas.length) * 100
            : 100;

        // Ideas by status - use accurate counts if available
        const ideasByStatus = statusCounts ? {
            pending: statusCounts.pending || 0,
            stuck: statusCounts.stuck || 0,
            processing: statusCounts.processing || 0,
            embedded: statusCounts.embedded || 0,
            completed: statusCounts.completed || 0,
            failed: statusCounts.failed || 0
        } : {
            pending: pendingIdeas.length,
            stuck: stuckIdeas.length,
            processing: allIdeas.filter(idea => idea.status === 'processing').length,
            embedded: allIdeas.filter(idea => idea.status === 'embedded').length,
            completed: allIdeas.filter(idea => idea.status === 'completed').length,
            failed: allIdeas.filter(idea => idea.status === 'failed').length
        };

        return {
            total_stuck: totalStuck,
            avg_processing_time: avgProcessingTime,
            most_active_submitter: mostActiveSubmitter,
            oldest_idea_age: oldestAge,
            processing_success_rate: successRate,
            ideas_by_status: ideasByStatus
        };
    }, []); // Empty dependency array since this function doesn't depend on any props or state

    // Convert TanStack response to legacy format for compatibility
    const convertResponseToLegacyFormat = (response: UnprocessedIdeasResponse): UnprocessedIdeasData => {
        const needs_embedding = response.rows.filter(idea => idea.category === 'needs_embedding');
        const needs_clustering = response.rows.filter(idea => idea.category === 'needs_clustering');

        return {
            needs_embedding,
            needs_clustering,
            total_unprocessed: response.category_counts.total_unprocessed, // Use total unprocessed count from backend
            pagination: {
                page: response.meta.currentPage,
                page_size: response.meta.pageSize,
                total_embedding: response.category_counts.needs_embedding,
                total_clustering: response.category_counts.needs_clustering,
                has_more_embedding: response.category_counts.needs_embedding > 0,
                has_more_clustering: response.category_counts.needs_clustering > 0,
                has_more: response.meta.hasNextPage,
                showing: response.rows.length
            }
        };
    };

    // Fetch drifting ideas data function
    const fetchDriftingIdeas = async () => {
        if (!discussionId) {
            setError("Discussion ID is missing");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await api.get<UnprocessedIdeasResponse>(`/discussions/${discussionId}/unprocessed-ideas`, {
                params: {
                    page: currentPage,
                    page_size: pageSize,
                    'filter.tab': activeTab  // Send active tab as filter
                }
            });

            // Convert to legacy format for compatibility
            const legacyData = convertResponseToLegacyFormat(response.data);
            setDriftingData(legacyData);

            // Calculate analytics with accurate status counts
            if (legacyData) {
                setAnalytics(calculateAnalytics(legacyData, response.data.status_counts));
            }
        } catch (err: any) {
            console.error("Error fetching unprocessed ideas:", err);
            const errorMsg = err.response?.data?.detail || err.message || "Failed to load unprocessed ideas";
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    // Reset page when switching tabs
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    // Fetch drifting ideas data
    useEffect(() => {
        if (authStatus === AuthStatus.Authenticated) {
            fetchDriftingIdeas();
        }
    }, [discussionId, authStatus, currentPage, pageSize, activeTab]);

    // WebSocket setup for real-time updates
    useEffect(() => {
        if (!discussionId || authStatus !== AuthStatus.Authenticated) return;

        // Setup WebSocket connection
        const socket = io(API_URL || window.location.origin, {
            path: "/socket.io",
            transports: ["websocket", "polling"],
            reconnectionAttempts: 5,
            timeout: 10000,
        });
        socketRef.current = socket;

        // Join discussion room
        socket.emit('join', discussionId);

        // Listen for unprocessed count updates
        const handleUnprocessedCountUpdate = (data: any) => {
            if (data.discussion_id === discussionId) {
                console.log('Received unprocessed count update:', data);

                // Update analytics with new counts
                setAnalytics(prev => prev ? {
                    ...prev,
                    total_stuck: data.needs_embedding + data.needs_clustering // Use actual unprocessed count, not total
                } : null);

                // Refresh the full data to get updated lists
                setTimeout(() => {
                    const fetchData = async () => {
                        try {
                            const response = await api.get<UnprocessedIdeasResponse>(`/discussions/${discussionId}/unprocessed-ideas`, {
                                params: { page: currentPage, page_size: pageSize, 'filter.tab': activeTab }
                            });
                            const legacyData = convertResponseToLegacyFormat(response.data);
                            setDriftingData(legacyData);
                            if (legacyData) {
                                setAnalytics(calculateAnalytics(legacyData, response.data.status_counts));
                            }
                        } catch (err) {
                            console.error('Error refreshing data after WebSocket update:', err);
                        }
                    };
                    fetchData();
                }, 500); // Small delay to ensure backend is updated
            }
        };

        // Listen for batch processed events
        const handleBatchProcessed = (data: any) => {
            if (data.discussion_id === discussionId) {
                console.log('Received batch processed event:', data);
                // Refresh unprocessed ideas data
                setTimeout(() => {
                    const fetchData = async () => {
                        try {
                            const response = await api.get<UnprocessedIdeasResponse>(`/discussions/${discussionId}/unprocessed-ideas`, {
                                params: { page: currentPage, page_size: pageSize, 'filter.tab': activeTab }
                            });
                            const legacyData = convertResponseToLegacyFormat(response.data);
                            setDriftingData(legacyData);
                            if (legacyData) {
                                setAnalytics(calculateAnalytics(legacyData, response.data.status_counts));
                            }
                        } catch (err) {
                            console.error('Error refreshing data after batch processed:', err);
                        }
                    };
                    fetchData();
                }, 500);
            }
        };

        socket.on('unprocessed_count_updated', handleUnprocessedCountUpdate);
        socket.on('batch_processed', handleBatchProcessed);

        // Cleanup
        return () => {
            socket.off('unprocessed_count_updated', handleUnprocessedCountUpdate);
            socket.off('batch_processed', handleBatchProcessed);
            socket.emit('leave', discussionId);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [discussionId, authStatus]); // Removed currentPage and calculateAnalytics to prevent unnecessary reconnections



    // Handle individual idea selection
    const toggleIdeaSelection = (ideaId: string) => {
        const newSelected = new Set(selectedIdeas);
        if (newSelected.has(ideaId)) {
            newSelected.delete(ideaId);
        } else {
            newSelected.add(ideaId);
        }
        setSelectedIdeas(newSelected);
    };

    // Get all visible ideas for current tab
    const getVisibleIdeas = () => {
        if (!driftingData) return [];

        switch (activeTab) {
            case 'all':
                return [...driftingData.needs_embedding, ...driftingData.needs_clustering];
            case 'embedding':
                return driftingData.needs_embedding;
            case 'clustering':
                return driftingData.needs_clustering;
            case 'stuck':
                return [...driftingData.needs_embedding, ...driftingData.needs_clustering]
                    .filter(idea => idea.status === 'stuck');
            case 'failed':
                return [...driftingData.needs_embedding, ...driftingData.needs_clustering]
                    .filter(idea => idea.status === 'failed');
            default:
                return [];
        }
    };

    // Handle select all/none for current tab
    const handleSelectAll = () => {
        const visibleIdeas = getVisibleIdeas();
        const visibleIdeaIds = new Set(visibleIdeas.map(idea => idea.id));

        // Check if all visible ideas are selected
        const allVisibleSelected = visibleIdeas.length > 0 &&
            visibleIdeas.every(idea => selectedIdeas.has(idea.id));

        if (allVisibleSelected) {
            // Deselect all visible ideas
            const newSelected = new Set(selectedIdeas);
            visibleIdeaIds.forEach(id => newSelected.delete(id));
            setSelectedIdeas(newSelected);
        } else {
            // Select all visible ideas
            const newSelected = new Set(selectedIdeas);
            visibleIdeaIds.forEach(id => newSelected.add(id));
            setSelectedIdeas(newSelected);
        }
    };

    // Check if all visible ideas are selected
    const areAllVisibleSelected = () => {
        const visibleIdeas = getVisibleIdeas();
        return visibleIdeas.length > 0 && visibleIdeas.every(idea => selectedIdeas.has(idea.id));
    };

    // Check if some (but not all) visible ideas are selected
    const areSomeVisibleSelected = () => {
        const visibleIdeas = getVisibleIdeas();
        return visibleIdeas.some(idea => selectedIdeas.has(idea.id)) && !areAllVisibleSelected();
    };

    // Update checkbox indeterminate state
    useEffect(() => {
        if (selectAllCheckboxRef.current) {
            const checkbox = selectAllCheckboxRef.current.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (checkbox) {
                checkbox.indeterminate = areSomeVisibleSelected() && !areAllVisibleSelected();
            }
        }
    }, [selectedIdeas, driftingData]);

    // Get count of selected ideas that need embeddings (simplified approach)
    const getSelectedIdeasNeedingEmbeddingsCount = () => {
        // For now, show total selected count when in embedding tab or when we know there are embedding ideas
        if (activeTab === 'embedding') {
            return selectedIdeas.size;
        }
        // For mixed tabs, show the count of visible embedding ideas that are selected
        const visibleEmbeddingIds = displayData.needs_embedding.map(idea => idea.id);
        const selectedEmbeddingCount = Array.from(selectedIdeas).filter(id => visibleEmbeddingIds.includes(id)).length;

        // If we have selected ideas but none visible on current page, assume some need embeddings
        if (selectedIdeas.size > 0 && selectedEmbeddingCount === 0 && (activeTab === 'all' || activeTab === 'stuck')) {
            // Estimate based on proportion - this is a workaround for cross-page selections
            return Math.floor(selectedIdeas.size * 0.5); // Rough estimate
        }

        return selectedEmbeddingCount;
    };

    // Get count of selected ideas that need clustering (simplified approach)
    const getSelectedIdeasNeedingClusteringCount = () => {
        if (activeTab === 'clustering') {
            return selectedIdeas.size;
        }

        const visibleClusteringIds = displayData.needs_clustering.map(idea => idea.id);
        const selectedClusteringCount = Array.from(selectedIdeas).filter(id => visibleClusteringIds.includes(id)).length;

        // If we have selected ideas but none visible on current page, assume some need clustering
        if (selectedIdeas.size > 0 && selectedClusteringCount === 0 && (activeTab === 'all' || activeTab === 'stuck')) {
            // Estimate based on proportion - this is a workaround for cross-page selections
            return Math.floor(selectedIdeas.size * 0.5); // Rough estimate
        }

        return selectedClusteringCount;
    };



    // Process selected ideas
    const processSelectedIdeas = async (type: 'embedding' | 'clustering') => {
        if (selectedIdeas.size === 0) {
            toast.error('Please select ideas to process');
            return;
        }

        // Send ALL selected idea IDs to the backend - let the backend filter by type
        const allSelectedIds = Array.from(selectedIdeas);

        const endpoint = type === 'embedding'
            ? `/discussions/${discussionId}/retry-selected-embeddings`
            : `/discussions/${discussionId}/retry-selected-clustering`;

        try {
            const response = await api.post(endpoint, {
                idea_ids: allSelectedIds
            });

            // The backend response should tell us how many were actually processed
            const processedCount = response.data.queued || allSelectedIds.length;
            toast.success(`Processing ${processedCount} selected ideas`);
            setSelectedIdeas(new Set()); // Clear selection

            // Refresh data
            setTimeout(() => {
                const fetchData = async () => {
                    try {
                        const response = await api.get<UnprocessedIdeasResponse>(`/discussions/${discussionId}/unprocessed-ideas`, {
                            params: { page: currentPage, page_size: pageSize, 'filter.tab': activeTab }
                        });
                        const legacyData = convertResponseToLegacyFormat(response.data);
                        setDriftingData(legacyData);
                        if (legacyData) {
                            setAnalytics(calculateAnalytics(legacyData, response.data.status_counts));
                        }
                    } catch (err) {
                        console.error('Error refreshing data:', err);
                    }
                };
                fetchData();
            }, 2000);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to process selected ideas');
        }
    };

    // Clear stuck clustering lock
    const clearClusteringLock = async () => {
        try {
            const response = await api.post(`/discussions/${discussionId}/clear-clustering-lock`);
            toast.success(response.data.message || 'Clustering lock cleared');

            // Refresh data after clearing lock
            setTimeout(() => {
                fetchDriftingIdeas();
            }, 1000);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to clear clustering lock');
        }
    };

    // Retry failed ideas function
    const retryFailedIdeas = async () => {
        if (!discussionId) return;

        try {
            setProcessing(prev => ({ ...prev, failed: true }));
            const response = await api.post(`/discussions/${discussionId}/retry-failed`);

            toast.success(`Queued ${response.data.queued} failed ideas for retry`);

            // Refresh data
            setTimeout(() => {
                fetchDriftingIdeas();
            }, 1000);
        } catch (error: any) {
            console.error('Error retrying failed ideas:', error);
            toast.error(error.response?.data?.detail || "Failed to retry failed ideas");
        } finally {
            setProcessing(prev => ({ ...prev, failed: false }));
        }
    };

    const retryEmbeddings = async () => {
        if (!discussionId) return;
        setProcessing(prev => ({ ...prev, embeddings: true }));

        try {
            await api.post(`/discussions/${discussionId}/retry-embeddings`);
            toast.success('Embedding processing started');

            // Refresh data after a short delay
            setTimeout(async () => {
                try {
                    const response = await api.get<UnprocessedIdeasResponse>(`/discussions/${discussionId}/unprocessed-ideas`, {
                        params: { page: currentPage, page_size: pageSize, 'filter.tab': activeTab }
                    });
                    const legacyData = convertResponseToLegacyFormat(response.data);
                    setDriftingData(legacyData);
                } catch (err) {
                    console.error('Error refreshing data:', err);
                }
                setProcessing(prev => ({ ...prev, embeddings: false }));
            }, 2000);
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || error.message || 'Failed to start embedding processing';
            toast.error(errorMsg);
            setProcessing(prev => ({ ...prev, embeddings: false }));
        }
    };

    const retryClustering = async () => {
        if (!discussionId) return;
        setProcessing(prev => ({ ...prev, clustering: true }));

        try {
            await api.post(`/discussions/${discussionId}/retry-clustering`);
            toast.success('Clustering started');

            // Refresh data after a short delay
            setTimeout(async () => {
                try {
                    const response = await api.get<UnprocessedIdeasResponse>(`/discussions/${discussionId}/unprocessed-ideas`, {
                        params: { page: currentPage, page_size: pageSize, 'filter.tab': activeTab }
                    });
                    const legacyData = convertResponseToLegacyFormat(response.data);
                    setDriftingData(legacyData);
                } catch (err) {
                    console.error('Error refreshing data:', err);
                }
                setProcessing(prev => ({ ...prev, clustering: false }));
            }, 2000);
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || error.message || 'Failed to start clustering';
            toast.error(errorMsg);
            setProcessing(prev => ({ ...prev, clustering: false }));
        }
    };

    const refreshData = async () => {
        if (!discussionId) return;
        try {
            const response = await api.get<UnprocessedIdeasResponse>(`/discussions/${discussionId}/unprocessed-ideas`, {
                params: { page: currentPage, page_size: pageSize, 'filter.tab': activeTab }
            });
            const legacyData = convertResponseToLegacyFormat(response.data);
            setDriftingData(legacyData);
        } catch (err) {
            console.error('Error refreshing data:', err);
        }
    };

    // Initial loading state - only show when no data exists yet
    if (isLoading && !driftingData) {
        return (
            <div className="new-ideas-container loading">
                <RefreshCw className="h-10 w-10 animate-spin text-primary" />
                <p>Loading drifting ideas...</p>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="new-ideas-container error">
                <h2>Error</h2>
                <p>{error}</p>
                <Button onClick={() => navigate(`/discussion/${discussionId}`)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Return to Discussion
                </Button>
            </div>
        );
    }

    // Auth check
    if (authStatus !== AuthStatus.Authenticated) {
        return (
            <div className="new-ideas-container">
                <p>Please log in to view drifting ideas.</p>
                <Button onClick={() => navigate(`/discussion/${discussionId}`)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Return to Discussion
                </Button>
            </div>
        );
    }

    // Create skeleton data when loading to maintain UI structure
    const skeletonData: UnprocessedIdeasData = {
        needs_embedding: [],
        needs_clustering: [],
        total_unprocessed: 0,
        pagination: {
            page: 1,
            page_size: pageSize,
            total_embedding: 0,
            total_clustering: 0,
            has_more_embedding: false,
            has_more_clustering: false,
            has_more: false,
            showing: 0
        }
    };

    const displayData = driftingData || skeletonData;

    // Get count for current tab
    const getCurrentTabCount = () => {
        if (!analytics) return 0;

        switch (activeTab) {
            case 'all':
                return displayData.total_unprocessed;
            case 'embedding':
                return displayData.pagination?.total_embedding || 0;
            case 'clustering':
                return displayData.pagination?.total_clustering || 0;
            case 'stuck':
                return analytics.total_stuck;
            case 'failed':
                return analytics.ideas_by_status?.failed || 0;
            default:
                return displayData.total_unprocessed;
        }
    };

    // Skeleton component for loading ideas
    const IdeaSkeleton = () => (
        <Card className="p-4">
            <div className="flex items-start gap-3">
                <div className="w-4 h-4 bg-gray-200 animate-pulse rounded"></div>
                <div className="flex-1">
                    <div className="w-full h-4 bg-gray-200 animate-pulse rounded mb-2"></div>
                    <div className="w-3/4 h-4 bg-gray-200 animate-pulse rounded mb-2"></div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-16 h-5 bg-gray-200 animate-pulse rounded"></div>
                        <div className="w-24 h-5 bg-gray-200 animate-pulse rounded"></div>
                        <div className="w-12 h-5 bg-gray-200 animate-pulse rounded"></div>
                    </div>
                </div>
            </div>
        </Card>
    );

    // Generate skeleton ideas for loading state
    const skeletonIdeas = Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
        <IdeaSkeleton key={`skeleton-${i}`} />
    ));

    return (
        <div className="new-ideas-container">
            {/* Header */}
            <div className="header">
                <div>
                    <h1>
                        Drifting Ideas ({isLoading && !driftingData ? (
                            <span className="inline-block w-8 h-4 bg-gray-200 animate-pulse rounded"></span>
                        ) : (
                            displayData.total_unprocessed
                        )})
                    </h1>
                    <p>Ideas that need processing to be grouped into topics</p>
                </div>
                <Button onClick={() => navigate(`/discussion/${discussionId}`)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Discussion
                </Button>
            </div>

            {/* Analytics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            <div>
                                <p className="text-sm text-gray-600">Stuck Ideas</p>
                                {analytics ? (
                                    <p className="text-2xl font-bold">{analytics.total_stuck}</p>
                                ) : (
                                    <div className="w-12 h-8 bg-gray-200 animate-pulse rounded"></div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-blue-500" />
                            <div>
                                <p className="text-sm text-gray-600">Avg Processing Time</p>
                                {analytics ? (
                                    <p className="text-2xl font-bold">{analytics.avg_processing_time.toFixed(1)}m</p>
                                ) : (
                                    <div className="w-16 h-8 bg-gray-200 animate-pulse rounded"></div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-green-500" />
                            <div>
                                <p className="text-sm text-gray-600">Most Active</p>
                                {analytics ? (
                                    <p className="text-lg font-bold truncate">{analytics.most_active_submitter}</p>
                                ) : (
                                    <div className="w-20 h-6 bg-gray-200 animate-pulse rounded"></div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-purple-500" />
                            <div>
                                <p className="text-sm text-gray-600">Success Rate</p>
                                {analytics ? (
                                    <p className="text-2xl font-bold">{analytics.processing_success_rate.toFixed(1)}%</p>
                                ) : (
                                    <div className="w-14 h-8 bg-gray-200 animate-pulse rounded"></div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>



            {/* Tabbed View */}
            <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="mb-6">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1 h-auto p-1">
                    <TabsTrigger value="all" className="text-xs sm:text-sm p-2 sm:p-3">
                        <span className="hidden sm:inline">All</span>
                        <span className="sm:hidden">All</span>
                        <span className="ml-1">
                            ({isLoading && !driftingData ? (
                                <span className="inline-block w-4 h-2 bg-gray-200 animate-pulse rounded"></span>
                            ) : (
                                displayData.total_unprocessed
                            )})
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="embedding" className="text-xs sm:text-sm p-2 sm:p-3">
                        <span className="hidden sm:inline">Need AI</span>
                        <span className="sm:hidden">AI</span>
                        <span className="ml-1">
                            ({isLoading && !driftingData ? (
                                <span className="inline-block w-4 h-2 bg-gray-200 animate-pulse rounded"></span>
                            ) : (
                                displayData.pagination?.total_embedding || 0
                            )})
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="clustering" className="text-xs sm:text-sm p-2 sm:p-3">
                        <span className="hidden sm:inline">Need Topics</span>
                        <span className="sm:hidden">Topics</span>
                        <span className="ml-1">
                            ({isLoading && !driftingData ? (
                                <span className="inline-block w-4 h-2 bg-gray-200 animate-pulse rounded"></span>
                            ) : (
                                displayData.pagination?.total_clustering || 0
                            )})
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="stuck" className="text-xs sm:text-sm p-2 sm:p-3">
                        <span className="hidden sm:inline">Stuck</span>
                        <span className="sm:hidden">Stuck</span>
                        <span className="ml-1">({analytics?.total_stuck || 0})</span>
                    </TabsTrigger>
                    <TabsTrigger value="failed" className="text-xs sm:text-sm p-2 sm:p-3">
                        <span className="hidden sm:inline">Failed</span>
                        <span className="sm:hidden">Failed</span>
                        <span className="ml-1">({analytics?.ideas_by_status?.failed || 0})</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="mt-4">
                    <Card>
                        <CardContent className="p-3 sm:p-4">
                            {/* Select All Header */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={areAllVisibleSelected()}
                                            ref={selectAllCheckboxRef}
                                            onCheckedChange={handleSelectAll}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-sm font-medium text-foreground cursor-pointer" onClick={handleSelectAll}>
                                            Select All Visible
                                        </span>
                                    </div>
                                    <Badge variant="neutral" className="text-xs">
                                        {getCurrentTabCount()} total
                                    </Badge>
                                </div>

                                {selectedIdeas.size > 0 && (
                                    <Badge variant="default" className="text-sm">
                                        ✓ {selectedIdeas.size} selected
                                    </Badge>
                                )}
                            </div>

                            {/* Bulk Actions - Only show when ideas are selected */}
                            {selectedIdeas.size > 0 && (
                                <div className="mb-4 p-3 bg-secondary-background rounded-base border border-border">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                        <span className="text-sm text-foreground font-medium">Bulk Actions:</span>
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                            {/* Show Process Embeddings button - let backend filter */}
                                            <Button
                                                size="sm"
                                                onClick={() => processSelectedIdeas('embedding')}
                                                disabled={processing.embeddings}
                                                className="w-full sm:w-auto"
                                            >
                                                {processing.embeddings ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <AlertTriangle className="w-4 h-4" />
                                                )}
                                                <span className="hidden sm:inline">Process Embeddings ({selectedIdeas.size})</span>
                                                <span className="sm:hidden">AI Processing ({selectedIdeas.size})</span>
                                            </Button>

                                            {/* Show Process Clustering button - let backend filter */}
                                            <Button
                                                size="sm"
                                                onClick={() => processSelectedIdeas('clustering')}
                                                disabled={processing.clustering}
                                                className="w-full sm:w-auto"
                                            >
                                                {processing.clustering ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Zap className="w-4 h-4" />
                                                )}
                                                <span className="hidden sm:inline">Process Clustering ({selectedIdeas.size})</span>
                                                <span className="sm:hidden">Topic Assignment ({selectedIdeas.size})</span>
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="neutral"
                                                onClick={() => setSelectedIdeas(new Set())}
                                                className="w-full sm:w-auto"
                                            >
                                                <X className="w-4 h-4" />
                                                Clear All ({selectedIdeas.size})
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {/* Combined view of all ideas */}
                                {isLoading && !driftingData ? (
                                    // Show skeleton loading
                                    skeletonIdeas
                                ) : (
                                    [...displayData.needs_embedding, ...displayData.needs_clustering]
                                        .map(idea => (
                                <Card
                                    key={idea.id}
                                    className={`p-4 cursor-pointer transition-all duration-200 hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${
                                        selectedIdeas.has(idea.id)
                                            ? 'bg-main/10 border-main shadow-none translate-x-1 translate-y-1'
                                            : 'hover:bg-secondary-background'
                                    }`}
                                    onClick={() => toggleIdeaSelection(idea.id)}
                                >
                                    <div className="flex items-start gap-2 sm:gap-3">
                                        <Checkbox
                                            checked={selectedIdeas.has(idea.id)}
                                            onCheckedChange={() => toggleIdeaSelection(idea.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-1"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm sm:text-base mb-3 leading-relaxed break-words">{idea.text}</p>
                                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                                                <Badge variant="neutral" className="text-xs">
                                                    👤 {idea.submitter_display_id}
                                                </Badge>

                                                {/* Processing stage badge */}
                                                {displayData.needs_embedding.some(e => e.id === idea.id) ? (
                                                    <Badge variant="default" className="text-xs">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        <span className="hidden sm:inline">Needs AI Processing</span>
                                                        <span className="sm:hidden">AI</span>
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="default" className="text-xs">
                                                        <Clock className="w-3 h-3" />
                                                        <span className="hidden sm:inline">Needs Clustering</span>
                                                        <span className="sm:hidden">Topics</span>
                                                    </Badge>
                                                )}

                                                {/* Status badge */}
                                                {idea.status === 'stuck' && (
                                                    <Badge variant="default" className="bg-red-500 text-white text-xs">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Stuck
                                                    </Badge>
                                                )}
                                                {idea.status === 'pending' && (
                                                    <Badge variant="neutral" className="text-xs">
                                                        <Clock className="w-3 h-3" />
                                                        Pending
                                                    </Badge>
                                                )}
                                                {idea.status === 'processing' && (
                                                    <Badge variant="default" className="text-xs">
                                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                                        Processing
                                                    </Badge>
                                                )}

                                                {/* Timestamp - Hide on very small screens */}
                                                {idea.timestamp && (
                                                    <Badge variant="neutral" className="text-xs hidden sm:inline-flex">
                                                        📅 {new Date(idea.timestamp).toLocaleDateString()} {new Date(idea.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </Badge>
                                                )}

                                                {/* Last attempt - Hide on very small screens */}
                                                {idea.last_attempt && (
                                                    <Badge variant="neutral" className="text-xs hidden sm:inline-flex">
                                                        🔄 Last: {new Date(idea.last_attempt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                                ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>



                <TabsContent value="embedding" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-main" />
                                    <span>
                                        Needs AI Processing ({isLoading && !driftingData ? (
                                            <span className="inline-block w-4 h-3 bg-gray-200 animate-pulse rounded"></span>
                                        ) : (
                                            displayData.pagination?.total_embedding || 0
                                        )})
                                    </span>
                                </div>
                                <Button
                                    onClick={retryEmbeddings}
                                    disabled={processing.embeddings || (isLoading && !driftingData)}
                                    size="sm"
                                >
                                    {processing.embeddings ? (
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                    )}
                                    Process All
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-4">
                            {/* Select All Header */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={areAllVisibleSelected()}
                                            onCheckedChange={handleSelectAll}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-sm font-medium text-foreground cursor-pointer" onClick={handleSelectAll}>
                                            Select All Visible
                                        </span>
                                    </div>
                                    <Badge variant="neutral" className="text-xs">
                                        {getCurrentTabCount()} total
                                    </Badge>
                                </div>

                                {selectedIdeas.size > 0 && (
                                    <Badge variant="default" className="text-sm">
                                        ✓ {selectedIdeas.size} selected
                                    </Badge>
                                )}
                            </div>

                            {/* Bulk Actions - Only show when ideas are selected */}
                            {selectedIdeas.size > 0 && (
                                <div className="mb-4 p-3 bg-secondary-background rounded-base border border-border">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                        <span className="text-sm text-foreground font-medium">Bulk Actions:</span>
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                            <Button
                                                size="sm"
                                                onClick={() => processSelectedIdeas('embedding')}
                                                disabled={processing.embeddings}
                                                className="w-full sm:w-auto"
                                            >
                                                {processing.embeddings ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <AlertTriangle className="w-4 h-4" />
                                                )}
                                                <span className="hidden sm:inline">Process Embeddings ({selectedIdeas.size})</span>
                                                <span className="sm:hidden">AI Processing ({selectedIdeas.size})</span>
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="neutral"
                                                onClick={() => setSelectedIdeas(new Set())}
                                                className="w-full sm:w-auto"
                                            >
                                                <X className="w-4 h-4" />
                                                Clear All ({selectedIdeas.size})
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <p className="text-sm text-muted-foreground mb-4">
                                These ideas need AI processing to generate embeddings before they can be grouped.
                            </p>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {isLoading && !driftingData ? (
                                    // Show skeleton loading
                                    skeletonIdeas.slice(0, 3)
                                ) : (
                                    displayData.needs_embedding.map(idea => (
                                    <div
                                        key={idea.id}
                                        className={`p-3 border-2 border-border rounded-base cursor-pointer transition-all duration-200 hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${
                                            selectedIdeas.has(idea.id)
                                                ? 'bg-main/10 border-main shadow-none translate-x-1 translate-y-1'
                                                : 'bg-background shadow-shadow hover:bg-secondary-background'
                                        }`}
                                        onClick={() => toggleIdeaSelection(idea.id)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <Checkbox
                                                checked={selectedIdeas.has(idea.id)}
                                                onCheckedChange={() => toggleIdeaSelection(idea.id)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm mb-3 leading-relaxed">{idea.text}</p>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge variant="neutral">
                                                        👤 {idea.submitter_display_id}
                                                    </Badge>

                                                    <Badge variant="default">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Needs AI Processing
                                                    </Badge>

                                                    {idea.status === 'stuck' && (
                                                        <Badge variant="default" className="bg-red-500 text-white">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Stuck - Processing Failed
                                                        </Badge>
                                                    )}
                                                    {idea.status === 'pending' && (
                                                        <Badge variant="neutral">
                                                            <Clock className="w-3 h-3" />
                                                            Pending
                                                        </Badge>
                                                    )}
                                                    {idea.status === 'processing' && (
                                                        <Badge variant="default">
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                            Processing
                                                        </Badge>
                                                    )}

                                                    {idea.timestamp && (
                                                        <Badge variant="neutral" className="text-xs">
                                                            📅 {new Date(idea.timestamp).toLocaleDateString()} {new Date(idea.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                        </Badge>
                                                    )}

                                                    {idea.last_attempt && (
                                                        <Badge variant="neutral" className="text-xs">
                                                            🔄 Last: {new Date(idea.last_attempt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="clustering" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-main" />
                                    <span>
                                        Needs Topic Assignment ({isLoading && !driftingData ? (
                                            <span className="inline-block w-4 h-3 bg-gray-200 animate-pulse rounded"></span>
                                        ) : (
                                            displayData.pagination?.total_clustering || 0
                                        )})
                                    </span>
                                </div>
                                <Button
                                    onClick={retryClustering}
                                    disabled={processing.clustering || (isLoading && !driftingData)}
                                    size="sm"
                                >
                                    {processing.clustering ? (
                                        <Zap className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Zap className="w-4 h-4 mr-2" />
                                    )}
                                    Assign Topics
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-4">
                            {/* Select All Header */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={areAllVisibleSelected()}
                                            onCheckedChange={handleSelectAll}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-sm font-medium text-foreground cursor-pointer" onClick={handleSelectAll}>
                                            Select All Visible
                                        </span>
                                    </div>
                                    <Badge variant="neutral" className="text-xs">
                                        {getCurrentTabCount()} total
                                    </Badge>
                                </div>

                                {selectedIdeas.size > 0 && (
                                    <Badge variant="default" className="text-sm">
                                        ✓ {selectedIdeas.size} selected
                                    </Badge>
                                )}
                            </div>

                            {/* Bulk Actions - Only show when ideas are selected */}
                            {selectedIdeas.size > 0 && (
                                <div className="mb-4 p-3 bg-secondary-background rounded-base border border-border">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                        <span className="text-sm text-foreground font-medium">Bulk Actions:</span>
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                            <Button
                                                size="sm"
                                                onClick={() => processSelectedIdeas('clustering')}
                                                disabled={processing.clustering}
                                                className="w-full sm:w-auto"
                                            >
                                                {processing.clustering ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Zap className="w-4 h-4" />
                                                )}
                                                <span className="hidden sm:inline">Process Clustering ({selectedIdeas.size})</span>
                                                <span className="sm:hidden">Topic Assignment ({selectedIdeas.size})</span>
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="neutral"
                                                onClick={() => setSelectedIdeas(new Set())}
                                                className="w-full sm:w-auto"
                                            >
                                                <X className="w-4 h-4" />
                                                Clear All ({selectedIdeas.size})
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <p className="text-sm text-muted-foreground mb-4">
                                These ideas have been processed by AI but need to be assigned to topics.
                            </p>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {isLoading && !driftingData ? (
                                    // Show skeleton loading
                                    skeletonIdeas.slice(0, 3)
                                ) : (
                                    displayData.needs_clustering.map(idea => (
                                    <div
                                        key={idea.id}
                                        className={`p-3 border-2 border-border rounded-base cursor-pointer transition-all duration-200 hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${
                                            selectedIdeas.has(idea.id)
                                                ? 'bg-main/10 border-main shadow-none translate-x-1 translate-y-1'
                                                : 'bg-background shadow-shadow hover:bg-secondary-background'
                                        }`}
                                        onClick={() => toggleIdeaSelection(idea.id)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <Checkbox
                                                checked={selectedIdeas.has(idea.id)}
                                                onCheckedChange={() => toggleIdeaSelection(idea.id)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm mb-3 leading-relaxed">{idea.text}</p>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge variant="neutral">
                                                        👤 {idea.submitter_display_id}
                                                    </Badge>

                                                    <Badge variant="default">
                                                        <Clock className="w-3 h-3" />
                                                        Needs Clustering
                                                    </Badge>

                                                    {idea.status === 'stuck' && (
                                                        <Badge variant="default" className="bg-red-500 text-white">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Stuck - Clustering Failed
                                                        </Badge>
                                                    )}
                                                    {idea.status === 'pending' && (
                                                        <Badge variant="neutral">
                                                            <Clock className="w-3 h-3" />
                                                            Pending
                                                        </Badge>
                                                    )}
                                                    {idea.status === 'processing' && (
                                                        <Badge variant="default">
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                            Processing
                                                        </Badge>
                                                    )}

                                                    {idea.timestamp && (
                                                        <Badge variant="neutral" className="text-xs">
                                                            📅 {new Date(idea.timestamp).toLocaleDateString()} {new Date(idea.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                        </Badge>
                                                    )}

                                                    {idea.last_attempt && (
                                                        <Badge variant="neutral" className="text-xs">
                                                            🔄 Last: {new Date(idea.last_attempt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="stuck" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-main" />
                                    <span>
                                        Stuck Ideas ({analytics ? analytics.total_stuck : 0})
                                    </span>
                                </div>
                                <Button
                                    onClick={clearClusteringLock}
                                    disabled={isLoading && !driftingData}
                                    size="sm"
                                    variant="outline"
                                >
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    Clear Stuck Lock
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-4">
                            {/* Select All Header */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={areAllVisibleSelected()}
                                            onCheckedChange={handleSelectAll}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-sm font-medium text-foreground cursor-pointer" onClick={handleSelectAll}>
                                            Select All Visible
                                        </span>
                                    </div>
                                    <Badge variant="neutral" className="text-xs">
                                        {getCurrentTabCount()} total
                                    </Badge>
                                </div>

                                {selectedIdeas.size > 0 && (
                                    <Badge variant="default" className="text-sm">
                                        ✓ {selectedIdeas.size} selected
                                    </Badge>
                                )}
                            </div>

                            {/* Bulk Actions - Only show when ideas are selected */}
                            {selectedIdeas.size > 0 && (
                                <div className="mb-4 p-3 bg-secondary-background rounded-base border border-border">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                        <span className="text-sm text-foreground font-medium">Bulk Actions:</span>
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                            {/* Show Process Embeddings button only if selected ideas need embeddings */}
                                            {getSelectedIdeasNeedingEmbeddingsCount() > 0 && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => processSelectedIdeas('embedding')}
                                                    disabled={processing.embeddings}
                                                    className="w-full sm:w-auto"
                                                >
                                                    {processing.embeddings ? (
                                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <AlertTriangle className="w-4 h-4" />
                                                    )}
                                                    <span className="hidden sm:inline">Process Embeddings ({getSelectedIdeasNeedingEmbeddingsCount()})</span>
                                                    <span className="sm:hidden">AI Processing ({getSelectedIdeasNeedingEmbeddingsCount()})</span>
                                                </Button>
                                            )}

                                            {/* Show Process Clustering button only if selected ideas need clustering */}
                                            {getSelectedIdeasNeedingClusteringCount() > 0 && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => processSelectedIdeas('clustering')}
                                                    disabled={processing.clustering}
                                                    className="w-full sm:w-auto"
                                                >
                                                    {processing.clustering ? (
                                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Zap className="w-4 h-4" />
                                                    )}
                                                    <span className="hidden sm:inline">Process Clustering ({getSelectedIdeasNeedingClusteringCount()})</span>
                                                    <span className="sm:hidden">Topic Assignment ({getSelectedIdeasNeedingClusteringCount()})</span>
                                                </Button>
                                            )}

                                            <Button
                                                size="sm"
                                                variant="neutral"
                                                onClick={() => setSelectedIdeas(new Set())}
                                                className="w-full sm:w-auto"
                                            >
                                                <X className="w-4 h-4" />
                                                Clear All
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <p className="text-sm text-muted-foreground mb-4">
                                These ideas have been stuck in processing for too long and need manual intervention.
                            </p>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {isLoading && !driftingData ? (
                                    // Show skeleton loading
                                    skeletonIdeas.slice(0, 3)
                                ) : (
                                    [...displayData.needs_embedding, ...displayData.needs_clustering]
                                        .filter(idea => idea.status === 'stuck')
                                        .map(idea => (
                                        <div
                                            key={idea.id}
                                            className={`p-3 border-2 border-border rounded-base cursor-pointer transition-all duration-200 hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${
                                                selectedIdeas.has(idea.id)
                                                    ? 'bg-main/10 border-main shadow-none translate-x-1 translate-y-1'
                                                    : 'bg-background shadow-shadow hover:bg-secondary-background'
                                            }`}
                                            onClick={() => toggleIdeaSelection(idea.id)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedIdeas.has(idea.id)}
                                                    onCheckedChange={() => toggleIdeaSelection(idea.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <div className="flex-1">
                                                    <p className="text-sm mb-3 leading-relaxed">{idea.text}</p>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Badge variant="neutral">
                                                            👤 {idea.submitter_display_id}
                                                        </Badge>

                                                        <Badge variant="default" className="bg-red-500 text-white">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Stuck - {idea.stuck_reason || 'Unknown reason'}
                                                        </Badge>

                                                        {/* Processing stage badge */}
                                                        {displayData.needs_embedding.some(e => e.id === idea.id) ? (
                                                            <Badge variant="default">
                                                                <AlertTriangle className="w-3 h-3" />
                                                                Needs AI Processing
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="default">
                                                                <Clock className="w-3 h-3" />
                                                                Needs Clustering
                                                            </Badge>
                                                        )}

                                                        {idea.timestamp && (
                                                            <Badge variant="neutral" className="text-xs">
                                                                📅 {new Date(idea.timestamp).toLocaleDateString()} {new Date(idea.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </Badge>
                                                        )}

                                                        {idea.last_attempt && (
                                                            <Badge variant="neutral" className="text-xs">
                                                                🔄 Last: {new Date(idea.last_attempt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="failed" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-red-600" />
                                    <span>
                                        Failed Ideas ({analytics?.ideas_by_status?.failed || 0})
                                    </span>
                                </div>
                                <Button
                                    onClick={retryFailedIdeas}
                                    disabled={processing.failed || (isLoading && !driftingData)}
                                    size="sm"
                                >
                                    {processing.failed ? (
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                    )}
                                    Retry Failed
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-4">
                            {/* Select All Header */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={areAllVisibleSelected()}
                                            onCheckedChange={handleSelectAll}
                                            className="cursor-pointer"
                                        />
                                        <span className="text-sm font-medium text-foreground cursor-pointer" onClick={handleSelectAll}>
                                            Select All Visible
                                        </span>
                                    </div>
                                    <Badge variant="neutral" className="text-xs">
                                        {getCurrentTabCount()} total
                                    </Badge>
                                </div>

                                {selectedIdeas.size > 0 && (
                                    <Badge variant="default" className="text-sm">
                                        ✓ {selectedIdeas.size} selected
                                    </Badge>
                                )}
                            </div>

                            <p className="text-sm text-muted-foreground mb-4">
                                These ideas failed during processing and need to be retried.
                            </p>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {isLoading && !driftingData ? (
                                    // Show skeleton loading
                                    skeletonIdeas.slice(0, 3)
                                ) : (
                                    [...displayData.needs_embedding, ...displayData.needs_clustering]
                                        .filter(idea => idea.status === 'failed')
                                        .map(idea => (
                                        <div
                                            key={idea.id}
                                            className={`p-3 border-2 border-border rounded-base cursor-pointer transition-all duration-200 hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${
                                                selectedIdeas.has(idea.id)
                                                    ? 'bg-main/10 border-main shadow-none translate-x-1 translate-y-1'
                                                    : 'bg-background shadow-shadow hover:bg-secondary-background'
                                            }`}
                                            onClick={() => toggleIdeaSelection(idea.id)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedIdeas.has(idea.id)}
                                                    onCheckedChange={() => toggleIdeaSelection(idea.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <div className="flex-1">
                                                    <p className="text-sm mb-3 leading-relaxed">{idea.text}</p>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Badge variant="neutral">
                                                            👤 {idea.submitter_display_id}
                                                        </Badge>

                                                        <Badge variant="default" className="bg-red-500 text-white">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Failed
                                                        </Badge>

                                                        {/* Processing stage badge */}
                                                        {displayData.needs_embedding.some(e => e.id === idea.id) ? (
                                                            <Badge variant="default">
                                                                <AlertTriangle className="w-3 h-3" />
                                                                Needs AI Processing
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="default">
                                                                <Clock className="w-3 h-3" />
                                                                Needs Clustering
                                                            </Badge>
                                                        )}

                                                        {idea.timestamp && (
                                                            <Badge variant="neutral" className="text-xs">
                                                                📅 {new Date(idea.timestamp).toLocaleDateString()} {new Date(idea.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </Badge>
                                                        )}

                                                        {idea.last_attempt && (
                                                            <Badge variant="neutral" className="text-xs">
                                                                🔄 Last: {new Date(idea.last_attempt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Success State */}
            {!isLoading && displayData.total_drifting === 0 && (
                <Card>
                    <CardContent className="text-center py-12">
                        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                        <h3 className="text-xl font-semibold mb-2">All Ideas Processed!</h3>
                        <p className="text-gray-600 mb-6">
                            Every idea has been successfully processed and grouped into topics.
                        </p>
                        <Button onClick={() => navigate(`/discussion/${discussionId}`)}>
                            View Discussion Topics
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* TanStack-style Pagination Controls */}
            {displayData.pagination && getCurrentTabCount() > 0 && (
                <Card className="mt-6">
                    <CardContent className="p-3">
                        <div className="flex flex-col gap-3">
                            {/* Info Row */}
                            <div className="text-center sm:text-left text-xs sm:text-sm text-muted-foreground">
                                {selectedIdeas.size > 0 ? `${selectedIdeas.size} of ` : ''}
                                {getCurrentTabCount().toLocaleString()} idea(s) in {activeTab === 'all' ? 'all categories' : `${activeTab} tab`}
                                {selectedIdeas.size > 0 ? ' selected.' : '.'}
                            </div>

                            {/* Controls Row */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                                {/* Page Size Selector */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Show:</span>
                                    <Select
                                        value={`${pageSize}`}
                                        onValueChange={(value) => {
                                            setPageSize(Number(value));
                                            setCurrentPage(1); // Reset to first page when changing page size
                                        }}
                                        disabled={isLoading && !driftingData}
                                    >
                                        <SelectTrigger className="h-8 w-[70px] text-xs">
                                            <SelectValue placeholder={pageSize} />
                                        </SelectTrigger>
                                        <SelectContent side="top">
                                            {[10, 20, 50, 100].map((size) => (
                                                <SelectItem key={size} value={`${size}`} className="text-xs">{size}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <span className="text-xs text-muted-foreground">per page</span>
                                </div>

                                {/* Page Info */}
                                <div className="text-xs sm:text-sm text-muted-foreground">
                                    Page {currentPage} of {Math.ceil(getCurrentTabCount() / pageSize) || 1}
                                </div>

                                {/* Navigation Buttons */}
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="neutral"
                                        size="sm"
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1 || (isLoading && !driftingData)}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ChevronsLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="neutral"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1 || (isLoading && !driftingData)}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="neutral"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => prev + 1)}
                                        disabled={!displayData.pagination?.has_more || (isLoading && !driftingData)}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="neutral"
                                        size="sm"
                                        onClick={() => setCurrentPage(Math.ceil(getCurrentTabCount() / pageSize))}
                                        disabled={!displayData.pagination?.has_more || (isLoading && !driftingData)}
                                        className="h-8 w-8 p-0"
                                    >
                                        <ChevronsRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Global Action Buttons */}
            {getCurrentTabCount() > 0 && (
                <Card className="mt-6">
                    <CardContent className="p-3 sm:p-4">
                        <div className="flex flex-col gap-3">
                            <h4 className="text-sm font-medium text-foreground">Global Actions:</h4>
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                                <Button
                                    variant="neutral"
                                    onClick={refreshData}
                                    disabled={isLoading && !driftingData}
                                    className="w-full sm:w-auto"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    <span className="hidden sm:inline">Refresh Status</span>
                                    <span className="sm:hidden">Refresh</span>
                                </Button>

                                {/* Show clear lock button if ideas are stuck in clustering */}
                                {displayData.needs_clustering.length > 0 && (
                                    <Button
                                        variant="neutral"
                                        onClick={clearClusteringLock}
                                        disabled={isLoading && !driftingData}
                                        className="w-full sm:w-auto"
                                    >
                                        <AlertTriangle className="w-4 h-4" />
                                        <span className="hidden sm:inline">Clear Stuck Lock</span>
                                        <span className="sm:hidden">Clear Lock</span>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default NewIdeasView;