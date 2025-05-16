import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { AuthStatus } from "../enums/AuthStatus";
import { Idea } from "../interfaces/ideas";
import { Discussion } from "../interfaces/discussions";

// UI Components
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbSeparator,
    BreadcrumbPage,
} from "@/components/ui/breadcrumb";

// Icons
import {
    Loader2,
    Calendar,
    ArrowDownNarrowWide,
    ArrowDownWideNarrow,
    Waves,
    Filter,
    ChevronRight,
    Zap
} from "lucide-react";

// Styles
import "../styles/NewIdeasView.css";

const NewIdeasView: React.FC = () => {
    const { discussionId } = useParams<{ discussionId: string }>();
    const navigate = useNavigate();
    const { authStatus } = useAuth();

    // Data states
    const [discussion, setDiscussion] = useState<Discussion | null>(null);
    const [unclusteredIdeas, setUnclusteredIdeas] = useState<Idea[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isClustering, setIsClustering] = useState(false);

    // UI states
    const [sortBy, setSortBy] = useState("newest");
    const [filterByIntent, setFilterByIntent] = useState<string | null>(null);

    // Fetch discussion and unclustered ideas
    useEffect(() => {
        const fetchData = async () => {
            if (!discussionId) {
                setError("Discussion ID is missing");
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                // Fetch the discussion details
                const discussionResponse = await api.get<Discussion>(`/discussions/${discussionId}`);
                setDiscussion(discussionResponse.data);

                // Fetch all ideas for the discussion
                const ideasResponse = await api.get<Idea[]>(`/discussions/${discussionId}/ideas`);

                // Filter for unclustered ideas only (those with no topic_id)
                const unclustered = ideasResponse.data.filter(idea => !idea.topic_id);
                setUnclusteredIdeas(unclustered);
            } catch (err) {
                console.error("Error fetching data:", err);
                setError(err.message || "Failed to load discussion data");
                toast.error("Failed to load unclustered ideas");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [discussionId, authStatus]);

    // Trigger clustering operation
    const handleClusterClick = async () => {
        if (!discussionId) return;
        if (authStatus !== AuthStatus.Authenticated) {
            toast.error("You must be logged in to group ideas.");
            return;
        }

        setIsClustering(true);
        try {
            const response = await api.post(`/discussions/${discussionId}/cluster`);
            toast.info(response.data.message || "Grouping started...");

            // After clustering, wait a moment and refresh the unclustered ideas
            setTimeout(async () => {
                try {
                    const ideasResponse = await api.get<Idea[]>(`/discussions/${discussionId}/ideas`);
                    const unclustered = ideasResponse.data.filter(idea => !idea.topic_id);
                    setUnclusteredIdeas(unclustered);
                } catch (err) {
                    console.error("Error refreshing ideas:", err);
                } finally {
                    setIsClustering(false);
                }
            }, 2000);
        } catch (error) {
            console.error(`Error triggering clustering for discussion ${discussionId}:`, error);
            if (error.response?.status === 403) {
                toast.error("Permission denied to group ideas.");
            } else {
                toast.error(error.message || "Failed to start grouping process.");
            }
            setIsClustering(false);
        }
    };

    // Filter and sort the unclustered ideas
    const filteredAndSortedIdeas = React.useMemo(() => {
        let filtered = [...unclusteredIdeas];

        // Apply intent filter if selected
        if (filterByIntent) {
            filtered = filtered.filter((idea) => idea.intent === filterByIntent);
        }

        // Apply sorting
        return filtered.sort((a, b) => {
            if (sortBy === "newest") {
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            } else if (sortBy === "oldest") {
                return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            }
            return 0;
        });
    }, [unclusteredIdeas, filterByIntent, sortBy]);

    // Calculate intent distribution for filtering
    const intentCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        unclusteredIdeas.forEach((idea) => {
            if (idea.intent) {
                counts[idea.intent] = (counts[idea.intent] || 0) + 1;
            }
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]); // Sort by count descending
    }, [unclusteredIdeas]);

    const handleIntentFilterChange = (intent: string | null) => {
        setFilterByIntent(intent === filterByIntent ? null : intent);
    };

    const navigateToIdea = (ideaId: string) => {
        navigate(`/ideas/${ideaId}`);
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="new-ideas-container loading">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p>Loading unprocessed ideas...</p>
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
                    Return to Discussion
                </Button>
            </div>
        );
    }

    return (
        <div className="new-ideas-container">
            {/* Breadcrumbs Navigation */}
            <div className="breadcrumb-container">
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/">Home</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/discussions">Discussions</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink href={`/discussion/${discussionId}`}>
                                {discussion?.title || "Discussion"}
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>Drifting Ideas</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </div>

            {/* Header Section */}
            <div className="new-ideas-header">
                <div>
                    <h1>Drifting Ideas</h1>
                    <p>
                        These ideas haven't been grouped into topics yet.
                        {unclusteredIdeas.length > 0 ? " You can manually trigger grouping to organize them." : ""}
                    </p>
                </div>

                <div className="header-actions">
                    <Button
                        variant="default"
                        onClick={() => navigate(`/discussion/${discussionId}`)}
                    >
                        <ChevronRight className="h-4 w-4 rotate-180" />
                        Back to Discussion
                    </Button>

                    {authStatus === AuthStatus.Authenticated && unclusteredIdeas.length > 0 && (
                        <Button
                            variant="default"
                            onClick={handleClusterClick}
                            disabled={isClustering}
                            className="ml-2"
                        >
                            {isClustering ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Zap className="mr-2 h-4 w-4" />
                            )}
                            Regroup All Ideas
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats Card */}
            <Card className="stats-card">
                <CardContent className="stats-content">
                    <div className="stat-item">
                        <h3>Drifting Ideas</h3>
                        <div className="stat-value">{unclusteredIdeas.length}</div>
                    </div>

                    <div className="stat-item">
                        <h3>Total Ideas</h3>
                        <div className="stat-value">{discussion?.idea_count || 0}</div>
                    </div>

                    <div className="stat-item">
                        <h3>Progress</h3>
                        <div className="progress-bar-wrapper">
                            <div className="progress-bar-container">
                                <div
                                    className="progress-bar-fill"
                                    style={{
                                        width: `${discussion && discussion.idea_count > 0
                                            ? (1 - unclusteredIdeas.length / discussion.idea_count) * 100
                                            : 0}%`
                                    }}
                                ></div>
                            </div>
                            <div className="progress-text">
                                {discussion && discussion.idea_count > 0
                                    ? Math.round((1 - unclusteredIdeas.length / discussion.idea_count) * 100)
                                    : 0}% Processed
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Filters Section */}
            {unclusteredIdeas.length > 0 && (
                <div className="filter-section">
                    <div className="filter-group">
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Sort By" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Sort By</SelectLabel>
                                    <SelectItem value="newest">
                                        <div className="flex items-center gap-2">
                                            <ArrowDownNarrowWide className="h-4 w-4" />
                                            <span>Newest First</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="oldest">
                                        <div className="flex items-center gap-2">
                                            <ArrowDownWideNarrow className="h-4 w-4" />
                                            <span>Oldest First</span>
                                        </div>
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    {intentCounts.length > 0 && (
                        <div className="intent-filters">
                            <div className="filter-label">
                                <Filter className="h-4 w-4" />
                                <span>Filter by Intent:</span>
                            </div>
                            <div className="intent-badges">
                                {intentCounts.slice(0, 5).map(([intent, count]) => (
                                    <Badge
                                        key={intent}
                                        variant={filterByIntent === intent ? "neutral" : "default"}
                                        onClick={() => handleIntentFilterChange(intent)}
                                        className="intent-filter-badge"
                                    >
                                        {intent} ({count})
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Main Content - Ideas List */}
            <div className="ideas-content">
                {unclusteredIdeas.length === 0 ? (
                    <div className="no-ideas-placeholder">
                        <Waves className="waves-icon" />
                        <h3>No Drifting Ideas</h3>
                        <p>All ideas have been successfully grouped into topics!</p>
                        <Button onClick={() => navigate(`/discussion/${discussionId}`)}>
                            View Discussion Topics
                        </Button>
                    </div>
                ) : (
                    <div className="ideas-list">
                        {filteredAndSortedIdeas.map((idea) => (
                            <Card key={idea.id} className="idea-card">
                                <CardContent>
                                    <div className="idea-content">
                                        <p className="idea-text">{idea.text}</p>
                                        <div className="idea-meta">
                                            <div className="idea-submitter">
                                                {idea.verified ? (
                                                    <Badge variant="default">
                                                        ✓ {idea.submitter_display_id || "Verified"}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="neutral">
                                                        👤 {idea.submitter_display_id || "Anonymous"}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="idea-time">
                                                <Calendar className="h-4 w-4" />
                                                <span>{new Date(idea.timestamp).toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="idea-tags">
                                            {idea.intent && (
                                                <Badge variant="neutral" className="intent-badge">
                                                    {idea.intent}
                                                </Badge>
                                            )}
                                            {idea.sentiment && (
                                                <Badge
                                                    variant={
                                                        idea.sentiment === "positive"
                                                            ? "default"
                                                            : idea.sentiment === "negative"
                                                                ? "neutral"
                                                                : "neutral"
                                                    }
                                                    className="sentiment-badge"
                                                >
                                                    {idea.sentiment}
                                                </Badge>
                                            )}
                                            {idea.keywords && idea.keywords.length > 0 && (
                                                <div className="keywords-container">
                                                    {idea.keywords.slice(0, 3).map((keyword) => (
                                                        <Badge key={keyword} className="keyword-badge">
                                                            {keyword}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            variant="neutral"
                                            size="sm"
                                            onClick={() => navigateToIdea(idea.id)}
                                            className="view-idea-btn"
                                        >
                                            View Details
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NewIdeasView;