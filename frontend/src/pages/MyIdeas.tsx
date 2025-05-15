// src/pages/MyIdeas.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { AuthStatus } from '../enums/AuthStatus';
import api from '../utils/api';
import { Idea } from '../interfaces/ideas';
import { Discussion } from '../interfaces/discussions';
import { User } from '../interfaces/user';
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Loader2, Filter, Calendar, MessageSquare } from 'lucide-react';
import '../styles/MyIdeas.css';

// Helper Types
interface UserIdeasResponse {
    ideas: Idea[];
    discussions: Discussion[];
}

const MyIdeas: React.FC = () => {
    const navigate = useNavigate();
    const { user, authStatus } = useAuth();

    // State for the ideas and discussions
    const [userIdeas, setUserIdeas] = useState<Idea[]>([]);
    const [discussionsMap, setDiscussionsMap] = useState<Map<string, Discussion>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters and sorts
    const [activeTab, setActiveTab] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [filterByIntent, setFilterByIntent] = useState<string | null>(null);

    useEffect(() => {
        const fetchUserIdeas = async () => {
            if (authStatus !== AuthStatus.Authenticated) return;

            setIsLoading(true);
            setError(null);

            try {
                // Use the new endpoint that efficiently fetches all user ideas
                const response = await api.get<UserIdeasResponse>('/users/me/ideas');
                const { ideas, discussions } = response.data;

                // Convert the discussions array to a Map for quick lookups
                const discussionsMapObj = new Map<string, Discussion>();
                discussions.forEach(discussion => {
                    discussionsMapObj.set(discussion.id, discussion);
                });

                setUserIdeas(ideas);
                setDiscussionsMap(discussionsMapObj);
            } catch (error) {
                console.error('Error fetching user ideas:', error);
                setError('Failed to load your ideas. Please try again later.');
                toast.error('Could not load your ideas. Please refresh the page.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserIdeas();
    }, [authStatus]);

    // Filtered and sorted ideas
    const filteredAndSortedIdeas = React.useMemo(() => {
        let filtered = [...userIdeas];

        // Apply tab-based filtering
        if (activeTab === 'unclustered') {
            filtered = filtered.filter(idea => !idea.topic_id);
        }

        // Apply intent filter if selected
        if (filterByIntent) {
            filtered = filtered.filter(idea => idea.intent === filterByIntent);
        }

        // Apply sorting
        return filtered.sort((a, b) => {
            if (sortBy === 'newest') {
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            } else if (sortBy === 'oldest') {
                return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            }
            return 0;
        });
    }, [userIdeas, activeTab, sortBy, filterByIntent]);

    // Group ideas by discussion
    const ideasByDiscussion = React.useMemo(() => {
        const groups = new Map<string, Idea[]>();

        userIdeas.forEach(idea => {
            const discussionId = idea.discussion_id;
            if (!discussionId) return;

            if (!groups.has(discussionId)) {
                groups.set(discussionId, []);
            }
            groups.get(discussionId)?.push(idea);
        });

        return groups;
    }, [userIdeas]);

    // Calculate statistics
    const stats = React.useMemo(() => {
        const intentCounts: Record<string, number> = {};
        userIdeas.forEach(idea => {
            if (idea.intent) {
                intentCounts[idea.intent] = (intentCounts[idea.intent] || 0) + 1;
            }
        });

        return {
            totalIdeas: userIdeas.length,
            clusteredIdeas: userIdeas.filter(idea => idea.topic_id).length,
            discussionsCount: ideasByDiscussion.size,
            intentCounts: Object.entries(intentCounts)
                .sort((a, b) => b[1] - a[1]) // Sort by count descending
        };
    }, [userIdeas, ideasByDiscussion]);

    const handleIntentFilterChange = (intent: string | null) => {
        setFilterByIntent(intent === filterByIntent ? null : intent);
    };

    const navigateToIdea = (ideaId: string) => {
        navigate(`/ideas/${ideaId}`);
    };

    const navigateToDiscussion = (discussionId: string) => {
        navigate(`/discussion/${discussionId}`);
    };

    const navigateToTopic = (discussionId: string, topicId: string) => {
        navigate(`/discussion/${discussionId}/topic/${topicId}`);
    };

    if (isLoading) {
        return (
            <div className="my-ideas-container loading">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p>Loading your ideas...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="my-ideas-container error">
                <h2>Error</h2>
                <p>{error}</p>
                <Button onClick={() => window.location.reload()}>
                    Try Again
                </Button>
            </div>
        );
    }

    return (
        <div className="my-ideas-container">
            <div className="page-header">
                <h1>My Ideas</h1>
                <div className="stats-summary">
                    <div className="stat">
                        <span className="stat-value">{stats.totalIdeas}</span>
                        <span className="stat-label">Total Ideas</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">{stats.discussionsCount}</span>
                        <span className="stat-label">Discussions</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">
                            {Math.round(stats.clusteredIdeas / Math.max(stats.totalIdeas, 1) * 100)}%
                        </span>
                        <span className="stat-label">Clustered</span>
                    </div>
                </div>
            </div>

            <Tabs
                defaultValue="all"
                value={activeTab}
                onValueChange={setActiveTab}
                className="ideas-tabs"
            >
                <TabsList className="tab-list">
                    <TabsTrigger value="all">All Ideas</TabsTrigger>
                    <TabsTrigger value="by-discussion">By Discussion</TabsTrigger>
                    <TabsTrigger value="unclustered">Unclustered Ideas</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>

                <div className="filter-section">
                    <div className="filter-group">
                        <Filter className="filter-icon" size={18} />
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="sort-select"
                        >
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                        </select>
                    </div>

                    {activeTab !== 'analytics' && stats.intentCounts.length > 0 && (
                        <div className="intent-filters">
                            {stats.intentCounts.slice(0, 5).map(([intent, count]) => (
                                <Badge
                                    key={intent}
                                    variant={filterByIntent === intent ? "default" : "outline"}
                                    onClick={() => handleIntentFilterChange(intent)}
                                    className="intent-filter-badge"
                                >
                                    {intent} ({count})
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>

                <TabsContent value="all" className="tab-content">
                    {filteredAndSortedIdeas.length === 0 ? (
                        <div className="my-ideas-no-content-placeholder">
                            <MessageSquare className="my-ideas-placeholder-icon" size={48} />
                            <h3>No ideas found</h3>
                            <p>You haven't submitted any ideas yet, or none match your current filters.</p>
                            <Link to="/discussions">
                                <Button>Browse Discussions</Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="ideas-list">
                            {filteredAndSortedIdeas.map(idea => (
                                <IdeasListItem
                                    key={idea.id}
                                    idea={idea}
                                    discussion={discussionsMap.get(idea.discussion_id || '')}
                                    onViewIdea={navigateToIdea}
                                    onViewDiscussion={navigateToDiscussion}
                                    onViewTopic={navigateToTopic}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="by-discussion" className="tab-content">
                    {ideasByDiscussion.size === 0 ? (
                        <div className="my-ideas-no-content-placeholder">
                            <MessageSquare className="my-ideas-placeholder-icon" size={48} />
                            <h3>No discussions found</h3>
                            <p>You haven't participated in any discussions yet.</p>
                            <Link to="/discussions">
                                <Button>Browse Discussions</Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="discussions-list">
                            {Array.from(ideasByDiscussion.entries()).map(([discussionId, ideas]) => (
                                <DiscussionCard
                                    key={discussionId}
                                    discussionId={discussionId}
                                    ideas={ideas}
                                    discussion={discussionsMap.get(discussionId)}
                                    onViewDiscussion={navigateToDiscussion}
                                    onViewIdea={navigateToIdea}
                                    onViewTopic={navigateToTopic}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="unclustered" className="tab-content">
                    {filteredAndSortedIdeas.length === 0 ? (
                        <div className="my-ideas-no-content-placeholder">
                            <MessageSquare className="my-ideas-placeholder-icon" size={48} />
                            <h3>No unclustered ideas</h3>
                            <p>All your ideas have been successfully grouped into topics.</p>
                            <Link to="/discussions">
                                <Button>Browse Discussions</Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="ideas-list">
                            {filteredAndSortedIdeas.map(idea => (
                                <IdeasListItem
                                    key={idea.id}
                                    idea={idea}
                                    discussion={discussionsMap.get(idea.discussion_id || '')}
                                    onViewIdea={navigateToIdea}
                                    onViewDiscussion={navigateToDiscussion}
                                    onViewTopic={navigateToTopic}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="analytics" className="tab-content">
                    <IdeasStats
                        ideas={userIdeas}
                        discussions={discussionsMap}
                        stats={stats}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
};

// --- Sub-components ---

interface IdeasListItemProps {
    idea: Idea;
    discussion?: Discussion;
    onViewIdea: (ideaId: string) => void;
    onViewDiscussion: (discussionId: string) => void;
    onViewTopic: (discussionId: string, topicId: string) => void;
}

const IdeasListItem: React.FC<IdeasListItemProps> = ({
    idea,
    discussion,
    onViewIdea,
    onViewDiscussion,
    onViewTopic
}) => {
    return (
        <Card className="my-ideas-list-item-card">
            <CardContent>
                <div className="my-ideas-item-content">
                    <p className="my-ideas-item-text">{idea.text}</p>

                    <div className="my-ideas-item-meta">
                        {discussion && (
                            <div
                                className="my-ideas-discussion-link"
                                onClick={() => onViewDiscussion(discussion.id)}
                            >
                                <MessageSquare size={14} />
                                <span>{discussion.title}</span>
                            </div>
                        )}

                        <div className="my-ideas-item-date">
                            <Calendar size={14} />
                            <span>{new Date(idea.timestamp).toLocaleDateString()}</span>
                        </div>

                        <div className="my-ideas-item-badges">
                            {idea.intent && (
                                <Badge variant="outline" className="intent-badge">
                                    {idea.intent}
                                </Badge>
                            )}

                            {idea.topic_id ? (
                                <Badge
                                    variant="default"
                                    className="my-ideas-topic-badge"
                                    onClick={() => idea.discussion_id && onViewTopic(idea.discussion_id, idea.topic_id || '')}
                                >
                                    In Topic
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="unclustered-badge">
                                    Unclustered
                                </Badge>
                            )}

                            {idea.sentiment && (
                                <Badge
                                    variant={
                                        idea.sentiment === 'positive' ? 'default' :
                                            idea.sentiment === 'negative' ? 'outline' :
                                                'secondary'
                                    }
                                    className="sentiment-badge"
                                >
                                    {idea.sentiment}
                                </Badge>
                            )}
                        </div>
                    </div>

                    <div className="my-ideas-item-actions">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onViewIdea(idea.id)}
                        >
                            View Details
                        </Button>

                        {idea.discussion_id && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onViewDiscussion(idea.discussion_id || '')}
                            >
                                Go to Discussion
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

interface DiscussionCardProps {
    discussionId: string;
    ideas: Idea[];
    discussion?: Discussion;
    onViewDiscussion: (discussionId: string) => void;
    onViewIdea: (ideaId: string) => void;
    onViewTopic: (discussionId: string, topicId: string) => void;
}

const DiscussionCard: React.FC<DiscussionCardProps> = ({
    discussionId,
    ideas,
    discussion,
    onViewDiscussion,
    onViewIdea,
    onViewTopic
}) => {
    const sortedIdeas = [...ideas].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const clusteredIdeas = ideas.filter(idea => idea.topic_id);
    const clusterRate = Math.round((clusteredIdeas.length / ideas.length) * 100);

    if (!discussion) return null;

    return (
        <Card className="my-ideas-discussion-summary-card">
            <CardHeader>
                <CardTitle
                    className="my-ideas-discussion-card-title"
                    onClick={() => onViewDiscussion(discussionId)}
                >
                    {discussion.title}
                </CardTitle>
                <CardDescription>
                    {discussion.prompt}
                </CardDescription>
            </CardHeader>

            <CardContent>
                <div className="my-ideas-discussion-card-stats">
                    <div className="my-ideas-summary-stat">
                        <span className="my-ideas-summary-stat-value">{ideas.length}</span>
                        <span className="my-ideas-summary-stat-label">Ideas</span>
                    </div>
                    <div className="my-ideas-summary-stat">
                        <span className="my-ideas-summary-stat-value">{clusterRate}%</span>
                        <span className="my-ideas-summary-stat-label">Clustered</span>
                    </div>
                    <div className="my-ideas-summary-stat">
                        <span className="my-ideas-summary-stat-value">
                            {new Date(discussion.created_at).toLocaleDateString()}
                        </span>
                        <span className="my-ideas-summary-stat-label">Created</span>
                    </div>
                </div>

                <h4 className="my-ideas-recent-list-title">Recent Ideas</h4>

                <div className="my-ideas-recent-list">
                    {sortedIdeas.slice(0, 3).map(idea => (
                        <div
                            key={idea.id}
                            className="my-ideas-recent-item"
                            onClick={() => onViewIdea(idea.id)}
                        >
                            <p>{idea.text}</p>
                            <div className="my-ideas-recent-item-meta">
                                <span className="idea-date-mini">
                                    {new Date(idea.timestamp).toLocaleDateString()}
                                </span>
                                {idea.topic_id && (
                                    <Badge
                                        variant="outline"
                                        className="my-ideas-topic-badge-small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onViewTopic(discussionId, idea.topic_id || '');
                                        }}
                                    >
                                        In Topic
                                    </Badge>
                                )}
                            </div>
                        </div>
                    ))}

                    {sortedIdeas.length > 3 && (
                        <Button
                            variant="outline"
                            className="my-ideas-view-more-btn"
                            onClick={() => onViewDiscussion(discussionId)}
                        >
                            View {sortedIdeas.length - 3} more ideas
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

interface IdeasStatsProps {
    ideas: Idea[];
    discussions: Map<string, Discussion>;
    stats: {
        totalIdeas: number;
        clusteredIdeas: number;
        discussionsCount: number;
        intentCounts: [string, number][];
    };
}

const IdeasStats: React.FC<IdeasStatsProps> = ({ ideas, discussions, stats }) => {
    // Get dates for time-based analysis
    const dates = ideas.map(idea => new Date(idea.timestamp).toLocaleDateString());
    const uniqueDates = Array.from(new Set(dates));

    // Count ideas by date
    const ideasByDate: Record<string, number> = {};
    uniqueDates.forEach(date => {
        ideasByDate[date] = dates.filter(d => d === date).length;
    });

    // Sort dates chronologically
    const sortedDates = uniqueDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // Get sentiment distribution
    const sentimentCounts: Record<string, number> = {
        positive: 0,
        neutral: 0,
        negative: 0
    };

    ideas.forEach(idea => {
        if (idea.sentiment) {
            sentimentCounts[idea.sentiment] = (sentimentCounts[idea.sentiment] || 0) + 1;
        }
    });

    return (
        <div className="ideas-stats">
            <div className="stats-grid">
                <Card className="stats-card">
                    <CardHeader>
                        <CardTitle>Intent Distribution</CardTitle>
                        <CardDescription>
                            Breakdown of your ideas by intent
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="intent-chart">
                            {stats.intentCounts.map(([intent, count]) => (
                                <div key={intent} className="intent-bar">
                                    <div className="intent-label">
                                        {intent}
                                    </div>
                                    <div className="intent-bar-container">
                                        <div
                                            className="intent-bar-fill"
                                            style={{
                                                width: `${(count / stats.totalIdeas) * 100}%`,
                                            }}
                                        />
                                        <span className="intent-count">{count}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="stats-card">
                    <CardHeader>
                        <CardTitle>Sentiment Analysis</CardTitle>
                        <CardDescription>
                            Emotional tone of your ideas
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="sentiment-chart">
                            <div className="sentiment-bars">
                                {Object.entries(sentimentCounts).map(([sentiment, count]) => (
                                    <div key={sentiment} className="sentiment-bar-container">
                                        <div className="sentiment-label">{sentiment}</div>
                                        <div className="sentiment-bar-wrapper">
                                            <div
                                                className={`sentiment-bar sentiment-${sentiment}`}
                                                style={{
                                                    height: `${(count / stats.totalIdeas) * 100}%`,
                                                }}
                                            />
                                        </div>
                                        <div className="sentiment-count">{count}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="activity-card">
                <CardHeader>
                    <CardTitle>Activity Timeline</CardTitle>
                    <CardDescription>
                        Your idea submissions over time
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="activity-chart">
                        {sortedDates.map(date => (
                            <div key={date} className="activity-day">
                                <div className="activity-date">{date}</div>
                                <div className="activity-bar-container">
                                    <div
                                        className="activity-bar"
                                        style={{
                                            width: `${Math.min((ideasByDate[date] / Math.max(...Object.values(ideasByDate))) * 100, 100)}%`,
                                        }}
                                    />
                                    <span className="activity-count">{ideasByDate[date]}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default MyIdeas;