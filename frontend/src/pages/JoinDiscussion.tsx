import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import '../styles/JoinDiscussion.css'; 
import api from "../utils/api";
import { useAuth } from "../context/AuthContext"; 
import { AuthStatus } from "../enums/AuthStatus";
import { Button } from "@/components/ui/button"; 
import { Loader2 } from "lucide-react"; 

interface DiscussionDetails {
    id: string;
    title: string;
    prompt: string;
    require_verification: boolean;
}

function JoinDiscussion() {
    const { discussionId } = useParams<{ discussionId?: string }>();
    const navigate = useNavigate();
    const { user, authStatus } = useAuth();

    const [discussion, setDiscussion] = useState<DiscussionDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDiscussion = async () => {
            if (!discussionId) {
                setError("Invalid discussion link.");
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError(null);
            try {
                console.log(`[JoinDiscussion] Fetching details for ${discussionId}`);
                const response = await api.get(`/discussions/${discussionId}`);
                setDiscussion(response.data);
            } catch (err) {
                console.error('[JoinDiscussion] Error fetching discussion:', err);
                if (err.response?.status === 404) {
                    setError('Discussion not found. The link may be invalid or the discussion deleted.');
                } else if (err.response?.status === 429) {
                    setError('Loading too quickly. Please wait a moment.');
                    toast.warn("Rate limit hit while loading discussion details.");
                }
                else {
                    setError(err.message || 'Could not load discussion details.');
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchDiscussion();
    }, [discussionId]);

    // Action handler to proceed to the discussion view
    const handleProceedToDiscussion = () => {
        if (discussionId) {
            // Clear any potentially lingering anonymous session token for this discussion
            // before navigating, as DiscussionView will handle auth/anon state cleanly.
            const participationTokenKey = `TopicTrends_participation_token_${discussionId}`;
            sessionStorage.removeItem(participationTokenKey);

            console.log(`[JoinDiscussion] Navigating to /discussion/${discussionId}`);
            navigate(`/discussion/${discussionId}`);
        } else {
            console.error("[JoinDiscussion] Cannot navigate, discussionId is missing.");
            toast.error("An error occurred. Cannot proceed to discussion.");
        }
    };

    // Action handler to redirect to login page
    const handleLoginRedirect = () => {
        if (discussionId) {
            console.log(`[JoinDiscussion] Redirecting to login, will return to /discussion/${discussionId}`);
            // Pass the intended destination in state for redirect after login
            navigate('/login', { state: { from: `/discussion/${discussionId}` } });
        } else {
            navigate('/login');
        }
    };

    if (isLoading || authStatus === AuthStatus.Loading) {
        return (
            <div className="join-discussion-container loading">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
                <p>Loading discussion details...</p>
            </div>
        );
    }

    if (error || !discussion) {
        return (
            <div className="join-discussion-container error">
                <h2>Error</h2>
                <p>{error || "Could not load discussion details."}</p>
                <Button onClick={() => navigate('/')}>Return to Home</Button>
            </div>
        );
    }

    return (
        <div className="join-discussion-container">

            <div className="join-card">
                <h1>Join Discussion</h1>
                <div className="discussion-info">
                    <h2>{discussion.title}</h2>
                    <p className="prompt-text">{discussion.prompt}</p> 
                </div>

                <div className="join-options">
                    {authStatus === AuthStatus.Authenticated && (
                        <div className="logged-in-section">
                            <h3>Welcome back, {user?.username}!</h3>
                            <p>You are logged in and can join directly.</p>
                            <Button onClick={handleProceedToDiscussion} className="primary-button">
                                Enter Discussion
                            </Button>
                        </div>
                    )}

                    {authStatus === AuthStatus.Unauthenticated && discussion.require_verification && (
                        <div className="verification-section">
                            <h3>Login Required</h3>
                            <p>This discussion requires participants to be logged in to contribute.</p>
                            <Button onClick={handleLoginRedirect} className="primary-button">
                                Login to Participate
                            </Button>
                            <Button variant="default" onClick={() => navigate('/register')}>
                                Don't have an account? Register
                            </Button>
                        </div>
                    )}

                    {authStatus === AuthStatus.Unauthenticated && !discussion.require_verification && (
                        <div className="anonymous-section">
                            <h3>Ready to Join?</h3>
                            <p>You can participate anonymously or log in if you have an account.</p>
                            <Button onClick={handleProceedToDiscussion} className="primary-button">
                                Join as Anonymous
                            </Button>
                            <Button variant="default" onClick={handleLoginRedirect} className="secondary-button">
                                Login / Register
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default JoinDiscussion;
