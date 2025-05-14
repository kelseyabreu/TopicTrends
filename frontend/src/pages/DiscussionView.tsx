import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import io, { Socket } from "socket.io-client";
import "../styles/DiscussionView.css";
import api, { API_URL } from "../utils/api";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "../context/AuthContext";
import { AuthStatus } from "../enums/AuthStatus";
import { Loader2, Trash2, Zap } from "lucide-react"; // Import Zap icon or similar for grouping
import { Discussion } from "../interfaces/discussions"; // Import Discussion type
import { Topic, TopicsResponse } from "../interfaces/topics";         // Import Topic type
import { Idea } from "../interfaces/ideas";           // Import Idea type
// Define Session Storage Key function for Participation Token
const getParticipationTokenKey = (discussionId: string | undefined): string =>
    `TopicTrends_participation_token_${discussionId || 'unknown'}`;

function DiscussionView() {
    const { discussionId } = useParams<{ discussionId: string }>();
    const navigate = useNavigate();
    const { user, authStatus, checkAuthStatus } = useAuth();

    const [discussion, setDiscussion] = useState<Discussion | null>(null);
    const [idea, setIdea] = useState("");
    const [topics, setTopics] = useState<Topic[]>([]);
    const [unclusteredCount, setUnclusteredCount] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [participationToken, setParticipationToken] = useState<string | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const [isClustering, setIsClustering] = useState(false);

    const ensureParticipationToken = useCallback(async () => {
        if (!discussionId || authStatus !== AuthStatus.Unauthenticated) {
            if (authStatus === AuthStatus.Authenticated && participationToken) {
                const storageKey = getParticipationTokenKey(discussionId);
                sessionStorage.removeItem(storageKey);
                setParticipationToken(null);
            }
            return;
        }
        const storageKey = getParticipationTokenKey(discussionId);
        let token = sessionStorage.getItem(storageKey);
        if (!token) {
            console.log(`[DiscussionView ${discussionId}] No PT in sessionStorage. Requesting new one...`);
            try {
                const apiKey = import.meta.env.VITE_PARTICIPATION_REQUEST_API_KEY;
                if (!apiKey) {
                    console.error("Frontend configuration error: VITE_PARTICIPATION_REQUEST_API_KEY is not set.");
                    toast.error("Configuration error. Cannot initiate session.");
                    return;
                }

                const response = await api.post(
                    `/discussions/${discussionId}/initiate-anonymous`,
                    {},
                    { headers: { 'X-API-Key': apiKey } }
                );

                token = response.data.participation_token;
                if (token) {
                    console.log(`[DiscussionView ${discussionId}] Received new PT, storing in sessionStorage.`);
                    sessionStorage.setItem(storageKey, token);
                    setParticipationToken(token);
                } else {
                    console.error(`[DiscussionView ${discussionId}] Failed to get participation token (empty response).`);
                    toast.error("Could not initiate anonymous session. Please refresh.");
                }
            } catch (error) {
                console.error(`[DiscussionView ${discussionId}] Error fetching participation token:`, error);
                if (error.response?.status === 401) {
                    toast.error("Error initiating anonymous session (Authorization failed). Please contact support.");
                } else {
                    toast.error("Error starting anonymous session. Please try refreshing the page.");
                }
                setParticipationToken(null);
            }
        } else {
            setParticipationToken(token);
        }
    }, [authStatus, discussionId, participationToken]);

    const handleDeleteDiscussion = async () => {
        if (!discussionId || !discussion) return;

        setIsDeleting(true);
        try {
            await api.delete(`/discussions/${discussionId}`);
            toast.success(`Discussion "${discussion.title}" deleted successfully.`);
            navigate('/discussions');
        } catch (error) {
            console.error("Error deleting discussion:", error);
            // Error object likely comes from the api client interceptor now
            toast.error(error?.message || "Failed to delete discussion. You might not have permission.");
            setIsDeleting(false);
        }
    };

    // --- Combined Effect for Data Fetching, Socket Connection, PT Management, and Real-time Idea Updates ---
    useEffect(() => {
        console.log(`[DiscussionView Effect ${discussionId}] Starting. AuthStatus: ${authStatus}`);
        let isMounted = true;

        if (authStatus === AuthStatus.Loading) {
            console.log(`[DiscussionView Effect ${discussionId}] Auth status loading, waiting...`);
            setIsLoading(true); // Keep loading indicator while auth is loading
            return; // Wait for auth status to resolve
        }

        // We are either Authenticated or Unauthenticated now
        setIsLoading(true); // Set loading true for data fetching phase

        // --- Participation Token Management ---
        if (authStatus === AuthStatus.Unauthenticated) {
            // ensureParticipationToken is called, which will set the participationToken state
            ensureParticipationToken();
        } else if (authStatus === AuthStatus.Authenticated) {
            // Clear any potential lingering PT if user logs in
            const storageKey = getParticipationTokenKey(discussionId);
            if (sessionStorage.getItem(storageKey)) {
                sessionStorage.removeItem(storageKey);
            }
            // If the state still holds a token (e.g., from previous anonymous session), clear it
            if (participationToken) {
                setParticipationToken(null);
            }
        }
        // Note: ensureParticipationToken is async, but we don't necessarily need to await it
        // here as the submission logic checks for its presence later.

        // --- Fetch initial discussion data ---
        const fetchDiscussionData = async () => {
            if (!discussionId) return;
            console.log(`[DiscussionView Effect ${discussionId}] Fetching discussion data...`);
            try {
                const [discussionResponse, topicsResponse] = await Promise.all([
                    api.get<Discussion>(`/discussions/${discussionId}`),
                    api.get<TopicsResponse>(`/discussions/${discussionId}/topics`),
                ]);

                if (isMounted) {
                    setDiscussion(discussionResponse.data);
                    const fetchedTopics = Array.isArray(topicsResponse.data.topics) ? topicsResponse.data.topics : [];
                    const sortedTopics = [...fetchedTopics].sort((a, b) => b.count - a.count);
                    setTopics(sortedTopics);
                    setUnclusteredCount(topicsResponse.data.unclustered_count || 0);
                    console.log(`[DiscussionView Effect ${discussionId}] Data fetched successfully.`);
                }
            } catch (error) { // Catch any error type
                console.error(`[DiscussionView Effect ${discussionId}] Error fetching discussion data:`, error);
                if (isMounted) {
                    if (error.response?.status === 404) {
                        toast.error("Discussion not found. It might have been deleted.");
                        navigate("/"); // Navigate away if discussion doesn't exist
                    } else {
                        toast.error(error.message || "Failed to load discussion data.");
                    }
                }
            } finally {
                // Only set loading false if the component is still mounted
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchDiscussionData();

        // --- Socket.IO Setup ---
        console.log(`[DiscussionView Effect ${discussionId}] Setting up Socket.IO connection to ${API_URL}...`);
        // Ensure any existing socket connection is closed before creating a new one
        if (socketRef.current) {
            console.log(`[DiscussionView Effect ${discussionId}] Disconnecting existing socket before reconnecting.`);
            socketRef.current.disconnect();
        }

        // Establish new connection
        const socket = io(API_URL || window.location.origin, {
            path: "/socket.io",
            transports: ['websocket', 'polling'], // Recommended transports
            reconnectionAttempts: 5,
            timeout: 10000, // Consider connection timeout
        });
        socketRef.current = socket; // Store socket instance

        // --- Define Event Handlers ---
        const handleConnect = () => {
            console.log(`[Socket ${discussionId}] Connected: ${socket.id}. Joining room.`);
            if (discussionId) socket.emit("join", discussionId);
        };

        const handleConnectError = (error: Error) => {
            console.error(`[Socket ${discussionId}] Connection error:`, error.message);
            if (isMounted) toast.warning("Connection issue. Trying to reconnect...");
        };

        const handleDisconnect = (reason: Socket.DisconnectReason) => {
            console.warn(`[Socket ${discussionId}] Disconnected: ${reason}`);
            if (isMounted && reason !== "io client disconnect") {
                toast.error("Disconnected. Please refresh if issues persist.");
            }
        };

        const handleTopicsUpdated = (data: { discussion_id: string; topics: Topic[]; unclustered_count: number }) => {
            if (data.discussion_id === discussionId && isMounted) {
                console.log(`[Socket ${discussionId}] Received topics_updated event with ${data.topics?.length} topics.`);
                const updatedTopics = Array.isArray(data.topics) ? data.topics : [];
                const sortedTopics = [...updatedTopics].sort((a, b) => b.count - a.count);
                setTopics(sortedTopics);
                setUnclusteredCount(data.unclustered_count);

                // Update discussion topic count
                setDiscussion((prev) => prev ? { ...prev, topic_count: updatedTopics.length } : null);
            } else if (isMounted) {
                console.log(`[Socket ${discussionId}] Ignored 'topics_updated' for different discussion (${data.discussion_id})`);
            }
        };

        const handleProcessingError = (data: { discussion_id: string; error?: string }) => {
            console.error(`[Socket ${discussionId}] Received processing_error:`, data);
            if (data.discussion_id === discussionId && isMounted) {
                toast.error(`Backend processing error: ${data.error || "Failed to process update."}`);
            }
        };

        const handleIdeaProcessingError = (data: { discussion_id: string; idea_id: string; error?: string }) => {
            if (data.discussion_id === discussionId && isMounted) {
                console.warn(`[Socket ${discussionId}] Received idea_processing_error for idea ${data.idea_id}:`, data.error);
                toast.warn(`AI processing issue for one idea: ${data.error || 'Processing failed.'}`, { autoClose: 7000 });
            }
        };

        // >>> Handler for the new_idea event <<<
        const handleNewIdea = (data: { discussion_id: string; idea: Idea }) => {
            if (data.discussion_id === discussionId && isMounted) {
                console.log(`[Socket ${discussionId}] Received new_idea event:`, data.idea.id);

                // Update overall discussion idea count
                setDiscussion((prevDiscussion) =>
                    prevDiscussion
                        ? { ...prevDiscussion, idea_count: (prevDiscussion.idea_count || 0) + 1 }
                        : null
                );

                // Increment unclustered count since new ideas are now unclustered
                setUnclusteredCount(prev => prev + 1);
            } else if (isMounted) {
                console.log(`[Socket ${discussionId}] Ignored 'new_idea' event for different discussion (${data.discussion_id})`);
            }
        };
        // >>> END Handler for new_idea <<<


        // --- Attach Listeners ---
        socket.on('connect', handleConnect);
        socket.on('connect_error', handleConnectError);
        socket.on('disconnect', handleDisconnect);
        socket.on('topics_updated', handleTopicsUpdated);
        socket.on('processing_error', handleProcessingError);
        socket.on('idea_processing_error', handleIdeaProcessingError);
        // >>> Attach the new listener <<<
        socket.on('new_idea', handleNewIdea);


        // --- Cleanup Function ---
        return () => {
            console.log(`[DiscussionView Effect ${discussionId}] Cleanup running.`);
            isMounted = false; // Prevent state updates after unmount
            if (socketRef.current) {
                console.log(`[DiscussionView Cleanup ${discussionId}] Removing listeners and disconnecting socket ID: ${socketRef.current.id}`);
                // Remove all specific listeners
                socketRef.current.off('connect', handleConnect);
                socketRef.current.off('connect_error', handleConnectError);
                socketRef.current.off('disconnect', handleDisconnect);
                socketRef.current.off('topics_updated', handleTopicsUpdated);
                socketRef.current.off('processing_error', handleProcessingError);
                socketRef.current.off('idea_processing_error', handleIdeaProcessingError);
                // >>> Remove the new listener <<<
                socketRef.current.off('new_idea', handleNewIdea);

                // Emit leave and disconnect
                if (discussionId) socketRef.current.emit("leave", discussionId);
                socketRef.current.disconnect();
                socketRef.current = null; // Clear the ref
            } else {
                console.log(`[DiscussionView Cleanup ${discussionId}] No socket found in ref to cleanup.`);
            }
        };
    }, [discussionId, navigate, authStatus, ensureParticipationToken, participationToken]);


    // --- Idea Submission Handler (remains mostly the same, no clustering call) ---
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        // ... (validation logic for idea text, length, socket connection) ...
        const trimmedIdea = idea.trim();
        if (!trimmedIdea) return toast.error("Please enter an idea");
        if (trimmedIdea.length > 500) return toast.error("Idea too long (max 500 chars)");
        if (!socketRef.current?.connected) return toast.error("Not connected. Wait or refresh.");
        if (!discussionId) return toast.error("Discussion context missing.");


        // Authorization check
        const headers: Record<string, string> = {};
        if (authStatus === AuthStatus.Authenticated) {
            // CSRF handled by api.ts interceptor
        } else if (authStatus === AuthStatus.Unauthenticated && participationToken) {
            headers['X-Participation-Token'] = participationToken;
        } else {
            return toast.error("Cannot submit: Authentication issue. Please refresh.");
        }
        // Verification check
        if (discussion?.require_verification && authStatus !== AuthStatus.Authenticated) {
            return toast.error("This discussion requires login to submit ideas.");
        }

        setIsSubmitting(true);
        try {
            const response = await api.post(
                `/discussions/${discussionId}/ideas`,
                { text: trimmedIdea },
                { headers }
            );
            console.log(`[Submit Idea ${discussionId}] API success:`, response.data);
            setIdea("");
            toast.info("Idea submitted! Processing...");
            // --- NO automatic clustering call here ---
        } catch (error) {
            // ... (existing detailed error handling for 401, 403, 429) ...
            console.error(`[Submit Idea ${discussionId}] Error submitting idea:`, error);
            if (error.response?.status === 401) {
                toast.error("Auth failed. Session expired? Refresh or log in.");
                if (authStatus === AuthStatus.Unauthenticated) {
                    sessionStorage.removeItem(getParticipationTokenKey(discussionId));
                    setParticipationToken(null);
                } else { checkAuthStatus(); }
            } else if (error.response?.status === 403) {
                toast.error(error.message || "Permission denied (verification/CSRF?).");
            } else if (error.response?.status === 429) {
                toast.warn("Submitting too quickly. Please wait.");
            } else {
                toast.error(error.message || "Failed to submit idea.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- <<< NEW: Manual Clustering Trigger Handler >>> ---
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
            // Topics will update via Socket.IO listener
        } catch (error) {
            console.error(`Error triggering clustering for discussion ${discussionId}:`, error);
            if (error.response?.status === 403) {
                toast.error("Permission denied to group ideas.");
            } else {
                toast.error(error.message || "Failed to start grouping process.");
            }
        } finally {
            setIsClustering(false);
        }
    };


    // --- Utility functions (copyShareLink, getTopicType, goSwim remain the same) ---
    const copyShareLink = () => {
        if (!discussion?.join_link) return;
        navigator.clipboard.writeText(discussion.join_link)
            .then(() => toast.success("Link copied!"))
            .catch(() => toast.error("Failed to copy."));
    };
    const getTopicType = (count: number): string => {
        if (count <= 10) return 'Ripple';
        if (count <= 25) return 'Wave';
        if (count <= 50) return 'Breaker';
        return 'Tsunami';
    };
    const goSwim = (topicId: string) => {
        if (discussionId && topicId) {
            navigate(`/discussion/${discussionId}/topic/${topicId}`);
        } else {
            console.error("Missing IDs for topic navigation.");
        }
    };

    // --- Render Logic ---
    if (isLoading || authStatus === AuthStatus.Loading) {
        // ... (loading spinner remains the same) ...
        return (
            <div className="discussion-view-container loading">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                <p>Loading discussion...</p>
            </div>
        );
    }

    // ... (displayStatus, submitDisabled logic remains similar) ...
    const displayStatus = authStatus === AuthStatus.Authenticated
        ? `✓ ${user?.username || 'Verified User'}`
        : (participationToken ? '👤 Anonymous' : 'Connecting...');
    const submitDisabled = isSubmitting ||
        (authStatus === AuthStatus.Unauthenticated && !participationToken) ||
        (discussion?.require_verification && authStatus !== AuthStatus.Authenticated);


    return (
        <div className="discussion-view-container">
            {discussion ? (
                <>
                    {/* Discussion Info Header */}
                    <div className="discussion-info">
                        {/* ... (title, prompt, stats, share button) ... */}
                        <h1>{discussion.title}</h1>
                        <p className="prompt">{discussion.prompt}</p>
                        <div className="stats">
                            {/* Recalculate stats based on current topics state */}
                            <div className="stat"><span className="stat-value">{topics.reduce((sum, t) => sum + t.count, 0) + unclusteredCount}</span><span className="stat-label">Ideas</span></div>
                            <div className="stat"><span className="stat-value">{topics.length || 0}</span><span className="stat-label">Currents</span></div>
                            {/* Add counts for specific types if needed */}
                        </div>
                        <div className="discussion-actions">
                            <Button variant="reverse" onClick={() => setShowShareModal(true)} disabled={!discussion.join_link} className="shareBtn">
                                Share
                            </Button>
                            {/* <<< Add Clustering Button >>> */}
                            {authStatus === AuthStatus.Authenticated && ( // Only show if logged in
                                <>
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
                                    <Button
                                        variant="default"
                                        onClick={() => navigate(`/new-ideas/${discussionId}`)/* Doesnt exist yet jason, we can also show something on this page if we want */}
                                        className="ml-2"
                                    >
                                        Drifting Ideas ({unclusteredCount})
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="default"
                                onClick={handleDeleteDiscussion}
                                disabled={isDeleting}
                                className="ml-2 deleteBtn ml-auto"
                            >
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                Delete
                            </Button>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="main-content">
                        {/* Idea Input Section (remains the same) */}
                        <div className="idea-input-section">
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label htmlFor="idea-input">Your Idea</label>
                                    <Textarea
                                        id="idea-input"
                                        value={idea}
                                        onChange={(e) => setIdea(e.target.value)}
                                        placeholder={discussion.require_verification && authStatus !== AuthStatus.Authenticated ? "Login required to submit ideas" : "Share your idea here..."}
                                        required
                                        disabled={submitDisabled || isSubmitting}
                                        maxLength={500}
                                    />
                                    <small className={idea.length > 500 ? "text-red-500" : ""}>{idea.length}/500 chars</small>
                                </div>
                                <div className="user-info">
                                    <span className={`status-badge ${authStatus === AuthStatus.Authenticated ? 'verified-badge' : 'anonymous-badge'}`}>
                                        {displayStatus}
                                    </span>
                                    {discussion.require_verification && <Badge variant="default" className="ml-2">Login Required</Badge>}
                                </div>
                                <Button type="submit" disabled={submitDisabled}>
                                    {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit Idea"}
                                </Button>
                            </form>
                        </div>

                        {/* Topics Section */}
                        <div className="topics-section">
                            <h2>Motions in the Ocean</h2>
                            {topics.length === 0 ? (
                                <div className="no-topics">
                                    <p>No currents flowing yet. Share an idea!</p>
                                </div>
                            ) : (
                                <div className="topics-list">
                                    {/* Render topics using map */}
                                    {topics.map((topic) => (
                                        <div key={topic.id} className="topic-view-content">
                                            <Accordion type="single" collapsible className="w-full">
                                                <AccordionItem value={topic.id}>
                                                    <AccordionTrigger>
                                                        <div className="topic-header-grid">
                                                            <div className="topic-details">
                                                                <h3 className="topic-title line-clamp-2">{topic.representative_text}</h3>
                                                                <div className="topic-meta">
                                                                    <Badge variant="default">{getTopicType(topic.count)}</Badge>
                                                                    <Badge variant="default">{topic.count} Ideas</Badge>
                                                                </div>
                                                            </div>
                                                            <Button
                                                                variant="default"
                                                                size="sm"
                                                                onClick={(e) => { e.stopPropagation(); goSwim(topic.id); }}
                                                                className="go-swim-button"
                                                                aria-label={`View details for topic ${topic.representative_text}`}
                                                            >
                                                                View Topic
                                                            </Button>
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent>
                                                        {/* Display ideas within the topic */}
                                                        {(!topic.ideas || topic.ideas.length === 0) ? (
                                                            <p className="text-muted-foreground text-sm p-4">No ideas found in this topic.</p>
                                                        ) : (
                                                            <div className="ideas-in-topic">
                                                                {/* Show limited ideas initially */}
                                                                {topic.ideas.slice(0, 5).map((ideaItem: Idea) => ( // Add explicit type
                                                                    <div className="idea-card" key={ideaItem.id}>
                                                                        <p className="idea-text">{ideaItem.text}</p>
                                                                        <div className="idea-meta">
                                                                            <span className="idea-user">
                                                                                {ideaItem.verified ? (
                                                                                    <Badge variant="success" size="sm">✓ {ideaItem.submitter_display_id || 'Verified'}</Badge>
                                                                                ) : (
                                                                                    <Badge variant="default" size="sm">👤 {ideaItem.submitter_display_id || 'Anonymous'}</Badge>
                                                                                )}
                                                                            </span>
                                                                            {ideaItem.timestamp && (
                                                                                <span className="idea-timestamp">
                                                                                    {new Date(ideaItem.timestamp).toLocaleString()}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {/* Show 'View All' button if many ideas */}
                                                                {topic.ideas.length > 5 && (
                                                                    <Button variant="link" size="sm" onClick={() => goSwim(topic.id)} className="mt-2">
                                                                        View all {topic.ideas.length} ideas in topic...
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </AccordionContent>
                                                </AccordionItem>
                                            </Accordion>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Share Modal (remains the same) */}
                    {showShareModal && discussion && (
                        // ... modal JSX ...
                        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
                            <div className="share-modal" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h2>Share This Discussion</h2>
                                    <button className="close-button" onClick={() => setShowShareModal(false)}>×</button>
                                </div>
                                <div className="modal-content">
                                    <p>Share link:</p>
                                    <div className="share-link">
                                        <input type="text" value={discussion.join_link || ''} readOnly />
                                        <Button onClick={copyShareLink}>Copy</Button>
                                    </div>
                                    {discussion.qr_code && (
                                        <div className="qr-code">
                                            <h3>Or scan QR code:</h3>
                                            <img src={discussion.qr_code} alt="QR Code" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                // Error state if discussion failed to load
                <div className="discussion-view-container error">
                    <h2>Error Loading Discussion</h2>
                    <p>Could not load details. Link incorrect or discussion deleted?</p>
                    <Button onClick={() => navigate('/')}>Go Home</Button>
                </div>
            )}
        </div>
    );
}

export default DiscussionView;