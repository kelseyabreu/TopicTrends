import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { AuthStatus } from '../enums/AuthStatus';
import api from '../utils/api';
import { Discussion } from '../interfaces/discussions';
import '../styles/UserDashboard.css';

// Import UI components
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import {
    Loader2,
    PlusCircle,
    MessageSquare,
    ChevronRight
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

const UserDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user, authStatus } = useAuth();

    const [discussions, setDiscussions] = useState<Discussion[]>([]);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (authStatus !== AuthStatus.Authenticated) return;

            setIsLoading(true);
            setError(null);

            try {
                // Fetch both discussions and stats in parallel
                const [discussionsResponse, statsResponse] = await Promise.all([
                    api.get('/users/me/discussions'),
                    api.get('/users/me/stats')
                ]);

                setDiscussions(discussionsResponse.data.discussions);
                setStats(statsResponse.data);
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

    if (isLoading) {
        return (
            <div className="dashboard-container loading">
                <Loader2 className="h-12 w-12 animate-spin" />
                <p>Loading your dashboard...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard-container error">
                <h2>Error</h2>
                <p>{error}</p>
                <Button onClick={() => window.location.reload()}>
                    Try Again
                </Button>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>Welcome back, {user?.username}</p>
                </div>
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
                        {discussions.slice(0, 4).map(discussion => (
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
                                .slice(-7) // Last 7 days
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

export default UserDashboard;