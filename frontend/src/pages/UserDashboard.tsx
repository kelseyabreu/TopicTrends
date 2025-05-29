// src/pages/UserDashboard.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { AuthStatus } from '../enums/AuthStatus';
import api from '../utils/api';
import { Discussion } from '../interfaces/discussions';
import { Interaction } from '../interfaces/interaction';
import '../styles/UserDashboard.css';

// Import UI components
import { Button } from '../components/ui/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from '../components/ui/card';

import {
    Loader2,
    PlusCircle,
    MessageSquare,
    Clock,
    ChevronRight,
    Eye,
    Heart,
    Pin,
    Bookmark,
} from 'lucide-react';

// Interface for stats data
interface UserStats {
    total_ideas: number;
    clustered_ideas: number;
    clustering_rate: number;
    created_discussions: number;
    participated_discussions: number;
    activity_by_date: Record<string, number>;
}

// Interface for engagement data
interface EngagementData {
    participation_rate: number;
    participated_discussions: number;
    total_discussions: number;
    avg_response_time_minutes: number;
    activity_heatmap: {
        data: {
            date: string;
            year: number;
            month: number;
            day: number;
            count: number;
        }[];
        max_count: number;
    };
}

const UserDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user, authStatus } = useAuth();

    const [discussions, setDiscussions] = useState<Discussion[]>([]);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [engagement, setEngagement] = useState<EngagementData | null>(null);
    const [recentInteractions, setRecentInteractions] = useState<Interaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (authStatus !== AuthStatus.Authenticated) return;

            setIsLoading(true);
            setError(null);

            try {
                // Fetch discussions, stats, and engagement data in parallel
                const [discussionsResponse, statsResponse, engagementResponse] = await Promise.all([
                    api.get('/users/me/discussions'),
                    api.get('/users/me/stats'),
                    api.get('/users/me/engagement')
                ]);

                setDiscussions(discussionsResponse.data.discussions);
                setStats(statsResponse.data);
                setEngagement(engagementResponse.data);
                setRecentInteractions(engagementResponse.data.recent_interactions || []);
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
                setError('Failed to load dashboard data. Please try again later.');
                toast.error('Could not load dashboard data. Please refresh the page.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, [authStatus]);

    const handleCreateDiscussion = () => {
        navigate('/create');
    };

    const handleGetStarted = () => {
        navigate('/getting-started');
    };

    if (isLoading) {
        return (
            <div className="user-dashboard dashboard-container loading">
                <Loader2 className="h-12 w-12 animate-spin" />
                <p>Loading your dashboard...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="user-dashboard dashboard-container error">
                <h2>Error</h2>
                <p>{error}</p>
                <Button onClick={() => window.location.reload()}>
                    Try Again
                </Button>
            </div>
        );
    }

    return (
        <div className="user-dashboard dashboard-container">
            <div className="dashboard-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>Welcome {user?.username}</p>
                </div>
                <Button onClick={handleGetStarted}>
                    New here? Read the Get Stated guide!
                </Button>
                <Button onClick={handleCreateDiscussion}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create Discussion
                </Button>
            </div>

            {/* Stats Overview */}
            <div className="stats-overview">
                <Card className="stat-card">
                    <CardContent>
                        <h3>Created Discussions</h3>
                        <div className="stat-value">{stats?.created_discussions || 0}</div>
                    </CardContent>
                </Card>

                <Card className="stat-card">
                    <CardContent>
                        <h3>Participated Discussions</h3>
                        <div className="stat-value">{stats?.participated_discussions || 0}</div>
                    </CardContent>
                </Card>

                <Card className="stat-card">
                    <CardContent>
                        <h3>Total Ideas</h3>
                        <div className="stat-value">{stats?.total_ideas || 0}</div>
                    </CardContent>
                </Card>

                <Card className="stat-card">
                    <CardContent>
                        <h3>Clustering Rate</h3>
                        <div className="stat-value">{stats?.clustering_rate || 0}%</div>
                    </CardContent>
                </Card>
            </div>

            {/* Engagement Analytics Section */}
            {engagement && (
                <div className="engagement-section">
                    <div className="section-header">
                        <h2>Engagement Analytics</h2>
                    </div>

                    <div className="engagement-grid">
                        {/* Participation Rate Card */}
                        <Card className="engagement-card">
                            <CardHeader>
                                <CardTitle>Participation Rate</CardTitle>
                                <CardDescription>
                                    Percentage of discussions you've contributed to
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="participation-chart">
                                    <div className="participation-rate">
                                        <div className="rate-value">{engagement.participation_rate}%</div>
                                        <div className="rate-details">
                                            <div>{engagement.participated_discussions} of {engagement.total_discussions} discussions</div>
                                        </div>
                                    </div>
                                    <div className="progress-bar-container">
                                        <div
                                            className="progress-bar-fill"
                                            style={{ width: `${engagement.participation_rate}%` }}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Response Time Card */}
                        <Card className="engagement-card">
                            <CardHeader>
                                <CardTitle>Average Response Time</CardTitle>
                                <CardDescription>
                                    Time between viewing and submitting your first idea
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="response-time">
                                    <Clock className="time-icon" />
                                    <div className="time-value">
                                        {formatResponseTime(engagement.avg_response_time_minutes)}
                                    </div>
                                </div>
                                <div className="time-label">
                                    {getResponseTimeLabel(engagement.avg_response_time_minutes)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Activity Heatmap */}
                    <Card className="heatmap-card">
                        <CardHeader>
                            <CardTitle>Activity Heatmap</CardTitle>
                            <CardDescription>
                                Your idea submission activity by day
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="activity-heatmap">
                                {renderActivityHeatmap(engagement.activity_heatmap)}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* My Discussions */}
            <div className="my-discussions-section">
                <div className="section-header">
                    <h2>My Discussions</h2>
                    <Link to="/discussions" className="view-all-link">
                        View All <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                {discussions.length === 0 ? (
                    <div className="empty-state">
                        <MessageSquare className="h-12 w-12" />
                        <h3>No discussions yet</h3>
                        <p>Create your first discussion to get started</p>
                        <Button onClick={handleCreateDiscussion}>
                            Create Discussion
                        </Button>
                    </div>
                ) : (
                    <div className="discussions-grid">
                        {discussions.slice(0, 6).map(discussion => (
                            <Card key={discussion.id} className="discussion-card">
                                <CardHeader>
                                    <CardTitle>{discussion.title}</CardTitle>
                                    <CardDescription>{discussion.prompt}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="discussion-stats">
                                        <div className="discussion-stat">
                                            <span>{discussion.idea_count}</span>
                                            <span>Ideas</span>
                                        </div>
                                        <div className="discussion-stat">
                                            <span>{discussion.topic_count}</span>
                                            <span>Topics</span>
                                        </div>
                                        <div className="discussion-stat">
                                            <span>{new Date(discussion.created_at).toLocaleDateString()}</span>
                                            <span>Created</span>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => navigate(`/discussion/${discussion.id}`)}
                                        className="mt-4 w-full"
                                    >
                                        View Discussion
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {recentInteractions.length > 0 && (
                <div className="recentInteractions mt-8">
                    <div className="section-header">
                        <h2>Recent Interactions</h2>
                        <Link to="/my-interactions" className="view-all-link">
                            View All <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="space-y-3">
                                {recentInteractions.map((interaction) => {
                                    // Simple time formatting
                                    const timeAgo = new Date(interaction.timestamp).toLocaleString();

                                    // Define action text and icon
                                    let actionText = interaction.action_type;
                                    let ActionIcon = null;

                                    // Set action text and icon
                                    if (actionText === 'view') {
                                        actionText = 'viewed';
                                        ActionIcon = Eye;
                                    }
                                    else if (actionText === 'like') {
                                        actionText = 'liked';
                                        ActionIcon = Heart;
                                    }
                                    else if (actionText === 'pin') {
                                        actionText = 'pinned';
                                        ActionIcon = Pin;
                                    }
                                    else if (actionText === 'save') {
                                        actionText = 'saved';
                                        ActionIcon = Bookmark;
                                    }
                                    else if (actionText === 'unlike') {
                                        actionText = 'unliked';
                                        ActionIcon = Heart;
                                    }
                                    else if (actionText === 'unpin') {
                                        actionText = 'unpinned';
                                        ActionIcon = Pin;
                                    }
                                    else if (actionText === 'unsave') {
                                        actionText = 'unsaved';
                                        ActionIcon = Bookmark;
                                    }

                                    // Determine navigation path
                                    let navigationPath = '';
                                    if (interaction.entity_type === 'idea') {
                                        navigationPath = `/ideas/${interaction.entity_id}`;
                                    } else if (interaction.entity_type === 'discussion') {
                                        navigationPath = `/discussion/${interaction.entity_id}`;
                                    } else if (interaction.entity_type === 'topic' && interaction.parent_id) {
                                        navigationPath = `/discussion/${interaction.parent_id}/topic/${interaction.entity_id}`;
                                    }

                                    return (
                                        <div
                                            key={interaction.id}
                                            className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50"
                                        >
                                            <div className="flex items-center gap-3">
                                                {ActionIcon && (
                                                    <div className={`rounded-full p-2 ${actionText === 'liked' ? 'bg-red-100 text-red-500' :
                                                            actionText === 'pinned' ? 'bg-blue-100 text-blue-500' :
                                                                actionText === 'saved' ? 'bg-green-100 text-green-500' :
                                                                    actionText === 'viewed' ? 'bg-purple-100 text-purple-500' :
                                                                        'bg-gray-100 text-gray-500'
                                                        }`}>
                                                        <ActionIcon className="h-4 w-4" />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-medium">
                                                        You {actionText} {interaction.entity_type} <b>{interaction.displaytext}</b>
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {timeAgo}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => navigationPath && navigate(navigationPath)}
                                                disabled={!navigationPath}
                                            >
                                                View
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Recent Activity */}
            {stats && Object.keys(stats.activity_by_date).length > 0 && (
                <div className="activity-section">
                    <div className="section-header">
                        <h2>Recent Activity</h2>
                        <Link to="/my-ideas" className="view-all-link">
                            View All Ideas <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <Card>
                        <CardContent className="activity-chart">
                            {Object.entries(stats.activity_by_date)
                                .map(([date, count]) => (
                                    <div key={date} className="activity-day">
                                        <div className="activity-date">{date}</div>
                                        <div className="activity-bar-container">
                                            <div
                                                className="activity-bar"
                                                style={{
                                                    width: `${Math.min((count / Math.max(...Object.values(stats.activity_by_date))) * 100, 100)}%`,
                                                }}
                                            />
                                            <span className="activity-count">{count} ideas</span>
                                        </div>
                                    </div>
                                ))
                            }
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Quick Links */}
            <div className="quick-links-section">
                <h2>Quick Links</h2>
                <div className="quick-links">
                    <Card className="quick-link-card">
                        <CardContent onClick={() => navigate('/my-ideas')}>
                            <div className="quick-link-content">
                                <MessageSquare className="h-6 w-6" />
                                <span>My Ideas</span>
                            </div>
                            <ChevronRight className="h-4 w-4" />
                        </CardContent>
                    </Card>

                    <Card className="quick-link-card">
                        <CardContent onClick={() => navigate('/discussions')}>
                            <div className="quick-link-content">
                                <MessageSquare className="h-6 w-6" />
                                <span>All Discussions</span>
                            </div>
                            <ChevronRight className="h-4 w-4" />
                        </CardContent>
                    </Card>

                    <Card className="quick-link-card">
                        <CardContent onClick={() => navigate('/settings')}>
                            <div className="quick-link-content">
                                <MessageSquare className="h-6 w-6" />
                                <span>Settings</span>
                            </div>
                            <ChevronRight className="h-4 w-4" />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

// Helper functions for formatting and rendering

// Format response time into minutes and seconds or hours and minutes
function formatResponseTime(minutes: number): string {
    if (minutes < 1) {
        return 'Less than a minute';
    } else if (minutes < 60) {
        return `${Math.round(minutes)} minutes`;
    } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        return `${hours} ${hours === 1 ? 'hour' : 'hours'}${remainingMinutes > 0 ? ` ${remainingMinutes} min` : ''}`;
    }
}

// Get a descriptive label for the response time
function getResponseTimeLabel(minutes: number): string {
    if (minutes < 2) {
        return 'Lightning fast responder';
    } else if (minutes < 5) {
        return 'Very quick thinker';
    } else if (minutes < 15) {
        return 'Thoughtful contributor';
    } else if (minutes < 30) {
        return 'Detailed participant';
    } else {
        return 'Deep analyzer';
    }
}

// Render a calendar-style heatmap of activity
function renderActivityHeatmap(heatmapData: EngagementData['activity_heatmap']) {
    if (!heatmapData.data.length) {
        return (
            <div className="empty-heatmap">
                <p>No activity data available yet</p>
            </div>
        );
    }

    // Group data by month for display
    const dataByMonth: Record<string, any[]> = {};
    heatmapData.data.forEach(day => {
        const monthKey = `${day.year}-${day.month}`;
        if (!dataByMonth[monthKey]) {
            dataByMonth[monthKey] = [];
        }
        dataByMonth[monthKey].push(day);
    });

    // Get intensity color based on count relative to max
    const getIntensity = (count: number) => {
        const intensity = Math.max(0.1, Math.min(1, count / heatmapData.max_count));
        return intensity;
    };

    // Get last 3 months
    const months = Object.keys(dataByMonth).sort().slice(-3);

    return (
        <div className="heatmap-container">
            {months.map(monthKey => {
                const [year, month] = monthKey.split('-').map(Number);
                const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

                return (
                    <div key={monthKey} className="month-container">
                        <div className="month-header">{monthName} {year}</div>
                        <div className="month-grid">
                            {/* Render day headers (Sun-Sat) */}
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                <div key={`header-${i}`} className="day-header">{day}</div>
                            ))}

                            {/* Render placeholder cells for proper alignment */}
                            {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, i) => (
                                <div key={`placeholder-${i}`} className="day-cell placeholder"></div>
                            ))}

                            {/* Render actual days in month */}
                            {Array.from(
                                { length: new Date(year, month, 0).getDate() },
                                (_, i) => i + 1
                            ).map(day => {
                                const dayData = dataByMonth[monthKey].find(d => d.day === day);
                                const count = dayData ? dayData.count : 0;
                                const intensity = getIntensity(count);

                                return (
                                    <div
                                        key={`day-${day}`}
                                        className={`day-cell ${count > 0 ? 'active' : ''}`}
                                        style={{
                                            backgroundColor: count > 0 ? `rgba(52, 152, 219, ${intensity})` : '',
                                        }}
                                        title={`${year}-${month}-${day}: ${count} ideas`}
                                    >
                                        <span className="day-number">{day}</span>
                                        {count > 0 && (
                                            <span className="day-count">{count}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default UserDashboard;