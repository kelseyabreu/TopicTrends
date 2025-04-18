// File: src/pages/SessionView.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import '../styles/SessionView.css';
import api from '../utils/api';
import { Link } from 'react-router-dom';

function SessionView() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [idea, setIdea] = useState('');
    const [clusters, setClusters] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true); // Keep loading state
    const [userId, setUserId] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [verificationMethod, setVerificationMethod] = useState(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const socketRef = useRef(null);

    // *** COMBINED useEffect Hook ***
    useEffect(() => {
        console.log(`[SessionView Effect ${sessionId}] Starting effect...`);
        let isMounted = true; // Flag to check if component is still mounted

        // 1. Check if user has joined this session
        const storedUserId = localStorage.getItem(`TopicTrends_${sessionId}_userId`);
        const storedIsVerified = localStorage.getItem(`TopicTrends_${sessionId}_isVerified`) === 'true';
        const storedVerificationMethod = localStorage.getItem(`TopicTrends_${sessionId}_verificationMethod`);

        if (!storedUserId) {
            console.log(`[SessionView Effect ${sessionId}] No stored user ID. Navigating back to join.`);
            // User hasn't joined this session, navigate back immediately
            navigate(`/join/${sessionId}`);
            return; // Exit the effect early
        }

        console.log(`[SessionView Effect ${sessionId}] User ID found: ${storedUserId}. Proceeding.`);
        // Set user state based on localStorage
        setUserId(storedUserId);
        setIsVerified(storedIsVerified);
        setVerificationMethod(storedVerificationMethod);
        setIsLoading(true); // Set loading true while fetching data

        // 2. Fetch session details and initial clusters
        const fetchSessionData = async () => {
            try {
                const [sessionResponse, clustersResponse] = await Promise.all([
                    api.get(`/api/sessions/${sessionId}`),
                    api.get(`/api/sessions/${sessionId}/clusters`)
                ]);

                if (isMounted) {
                    setSession(sessionResponse.data);

                    // Handle both formats - either direct array or nested in .clusters property
                    const fetchedClusters = Array.isArray(clustersResponse.data)
                        ? clustersResponse.data  // New API format (direct array)
                        : (clustersResponse.data.clusters || []);  // Old format (nested in .clusters)

                    setClusters(fetchedClusters.sort((a, b) => b.count - a.count));
                }
            } catch (error) {
                console.error(`[SessionView Effect ${sessionId}] Error fetching session data:`, error);
                if (isMounted) {
                    toast.error(error.response?.data?.detail || 'Failed to load session data. Returning home.');
                    navigate('/'); // Navigate home on critical fetch error
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false); // Stop loading only after fetch attempt
                }
            }
        };

        fetchSessionData(); // Fetch data only if user check passed

        // 3. Set up Socket.IO connection (only if user check passed)
        console.log(`[SessionView Effect ${sessionId}] Setting up Socket.IO...`);
        // Ensure existing socket is disconnected before creating a new one if effect re-runs
        if (socketRef.current) {
            console.log(`[SessionView Effect ${sessionId}] Disconnecting existing socket before reconnecting.`);
            socketRef.current.disconnect();
        }

        const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:8000', {
            transports: ['websocket', 'polling'],
            withCredentials: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            autoConnect: true, // Let it auto-connect
        });

        socket.on('connect', () => {
            console.log(`[Socket ${sessionId}] Connected with ID: ${socket.id}. Emitting join.`);
            // Join room with session ID *after* connection established
            socket.emit('join', sessionId);
        });

        socket.on('connect_error', (error) => {
            console.error(`[Socket ${sessionId}] Connection error:`, error);
            // Maybe show a toast notification about connection issues
            if (isMounted) {
                toast.warning('Connection issue. Trying to reconnect...');
            }
        });

        socket.on('disconnect', (reason) => {
            console.warn(`[Socket ${sessionId}] Disconnected:`, reason);
            if (isMounted) {
                // Only show toast if disconnect wasn't initiated by cleanup
                if (reason !== 'io client disconnect') {
                    toast.error('Disconnected. Please refresh if issues persist.');
                }
            }
        });

        socket.on('clusters_updated', (data) => {
            console.log(`[Socket ${sessionId}] Received clusters_updated event.`);
            // Check if the update is for the correct session and component is mounted
            if (data.session_id === sessionId && isMounted) {
                console.log(`[Socket ${sessionId}] Updating clusters state with ${data.clusters.length} clusters.`);
                // Ensure data.clusters is an array
                const updatedClusters = Array.isArray(data.clusters) ? data.clusters : [];
                const sortedClusters = [...updatedClusters].sort((a, b) => b.count - a.count);
                setClusters(sortedClusters);

                // Update idea count in session state if session exists
                if (session) {
                    const newIdeaCount = updatedClusters.reduce((total, cluster) => total + (cluster.ideas?.length || 0), 0);
                    setSession(prevSession => ({
                        ...prevSession,
                        idea_count: newIdeaCount,
                        cluster_count: updatedClusters.length
                    }));
                }

                // No need for separate success toast here, the info toast from submit is sufficient
                // toast.success('Ideas updated!');
            } else {
                console.log(`[Socket ${sessionId}] Received clusters_updated for different session (${data.session_id}) or component unmounted.`);
            }
        });

        socket.on('processing_error', (data) => {
            console.error(`[Socket ${sessionId}] Received processing_error:`, data);
            if (data.session_id === sessionId && isMounted) {
                toast.error(`Backend error: ${data.error || 'Failed to process update.'}`);
            }
        });


        socketRef.current = socket; // Store socket instance

        // 4. Cleanup function for the combined effect
        return () => {
            console.log(`[SessionView Effect ${sessionId}] Running cleanup function...`);
            isMounted = false; // Prevent state updates after unmount
            if (socketRef.current) {
                console.log(`[SessionView Cleanup ${sessionId}] Emitting leave and disconnecting socket ID: ${socketRef.current.id}`);
                socketRef.current.emit('leave', sessionId);
                socketRef.current.disconnect();
                socketRef.current = null; // Clear the ref
            } else {
                console.log(`[SessionView Cleanup ${sessionId}] No socket found in ref to disconnect.`);
            }
        };

        // Dependencies: Only sessionId and navigate.
        // navigate function from react-router is generally stable.
    }, [sessionId, navigate]); // Removed 'session' from deps to prevent loop on count update

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!idea.trim()) {
            toast.error('Please enter an idea');
            return;
        }
        if (idea.length > 500) {
            toast.error('Idea text is too long (maximum 500 characters)');
            return;
        }
        if (!socketRef.current || !socketRef.current.connected) {
            toast.error('Not connected. Please wait or refresh.');
            return;
        }

        setIsSubmitting(true);

        try {
            console.log(`[Submit Idea ${sessionId}] Posting idea...`);
            // Post the idea via API
            const response = await api.post(`/api/sessions/${sessionId}/ideas`, {
                text: idea,
                user_id: userId,
                verified: isVerified,
                verification_method: verificationMethod
            });
            console.log(`[Submit Idea ${sessionId}] API response:`, response.data);

            setIdea(''); // Clear input field immediately
            toast.info('Idea submitted! Processing...'); // Give user feedback

            // Removed setTimeout fallback fetch

        } catch (error) {
            console.error(`[Submit Idea ${sessionId}] Error submitting idea:`, error);
            toast.error(error.response?.data?.detail || 'Failed to submit idea. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const copyShareLink = () => {
        if (!session) return;
        navigator.clipboard.writeText(session.join_link)
            .then(() => toast.success('Link copied to clipboard!'))
            .catch(err => toast.error('Failed to copy link.'));
    };
    const countByClusterType = (type) => {
        if (!clusters || clusters.length === 0) return 0;
        
        let count = 0;
        
        clusters.forEach(cluster => {
            const ideaCount = cluster.count || 0;
            
            if (type === 'ripples' && ideaCount <= 10) {
                count++;
            } else if (type === 'waves' && ideaCount > 10 && ideaCount <= 25) {
                count++;
            } else if (type === 'breakers' && ideaCount > 25 && ideaCount <= 50) {
                count++;
            } else if (type === 'tsunamis' && ideaCount > 50) {
                count++;
            }
        });
        
        return count;
    }

    // Render Loading state
    if (isLoading) {
        return (
            <div className="session-view-container loading">
                <div className="loader"></div>
                <p>Loading session data...</p>
            </div>
        );
    }

    // Render main component content if not loading
    return (
        <div className="session-view-container">
            {/* Only render content if session is loaded */}
            {session ? (
                <>
                    <div className="session-info">
                        <h1>{session.title}</h1>
                        <p className="prompt">{session.prompt}</p>
                        <div className="stats">
                            <div className="stat">
                                <span className="stat-value">{session.idea_count}</span>
                                <span className="stat-label">Ideas</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{clusters.length}</span>
                                <span className="stat-label">Currents</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{countByClusterType("ripples")}</span>
                                <span className="stat-label">Ripples</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{countByClusterType("waves")}</span>
                                <span className="stat-label">Waves</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{countByClusterType("breakers")}</span>
                                <span className="stat-label">Breakers</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{countByClusterType("tsunamis")}</span>
                                <span className="stat-label">Tsunamis</span>
                            </div>
                        </div>
                        <div className="session-actions">
                        {session && ( // Only show share if session data loaded
                    <button
                        className="share-button"
                        onClick={() => setShowShareModal(true)}
                    >
                        Share
                    </button>
                )}
                        </div>
                    </div>

                    <div className="main-content">
                        <div className="idea-input-section">
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label htmlFor="idea-input">Your Idea</label>
                                    <textarea
                                        id="idea-input"
                                        value={idea}
                                        onChange={(e) => setIdea(e.target.value)}
                                        placeholder="Share your idea here..."
                                        required
                                        disabled={isSubmitting}
                                    />
                                    <small>{idea.length}/500 characters</small>
                                </div>

                                <div className="user-info">
                                    {isVerified ? (
                                        <span className="verification-badge">✓ Verified User</span>
                                    ) : (
                                        <span className="anonymous-badge">Anonymous</span>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={isSubmitting || (!socketRef.current || !socketRef.current.connected)} // Disable if submitting or not connected
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Idea'}
                                </button>
                            </form>
                        </div>

                        <div className="clusters-section">
                            <h2>Topic Trends</h2>
                            {clusters.length === 0 ? (
                                <div className="no-clusters">
                                    <p>No ideas submitted yet. Be the first to contribute!</p>
                                </div>
                            ) : (
                                <div className="clusters-list">
                                    {clusters.map((cluster) => (
                                        <div 
                                            className="cluster-card" 
                                            key={cluster.id} 
                                        >
                                            <div className="cluster-header">
                                                <span className="cluster-title">{cluster.representative_text}</span>
                                                <span className="cluster-count">{cluster.count}</span>
                                            </div>
                                            <Link to={`/session/${sessionId}/cluster/${cluster.id}`} className="cluster-header">
                                                Swim
                                            </Link>
                                            <div className="cluster-ideas">
                                                {(cluster.ideas || []).map((idea) => ( // Add safety check for ideas array
                                                    <div className="idea-card" key={idea.id}>
                                                        <p>{idea.text}</p>
                                                        <div className="idea-meta">
                                                            <span className="idea-user">
                                                                {idea.verified ? (
                                                                    <span className="verification-badge">✓ Verified</span>
                                                                ) : (
                                                                    <span className="anonymous-badge">Anonymous</span>
                                                                )}
                                                            </span>
                                                            {/* Display timestamp if needed */}
                                                            {/* <span className="idea-timestamp">
                                                                {idea.timestamp ? new Date(idea.timestamp).toLocaleString() : ''}
                                                            </span> */}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                // Render something if session is null after loading (shouldn't happen if fetch error navigates away)
                <div className="session-view-container error">
                    <h2>Error</h2>
                    <p>Could not load session details.</p>
                </div>
            )}


            {/* Share Modal */}
            {showShareModal && session && ( // Ensure session exists before rendering modal
                <div className="modal-overlay" onClick={() => setShowShareModal(false)}> {/* Close on overlay click */}
                    <div className="share-modal" onClick={(e) => e.stopPropagation()}> {/* Prevent modal close when clicking inside */}
                        <div className="modal-header">
                            <h2>Share This Discussion</h2>
                            <button
                                className="close-button"
                                onClick={() => setShowShareModal(false)}
                                aria-label="Close share modal" // Accessibility
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-content">
                            <p>Share this link with others to invite them:</p>
                            <div className="share-link">
                                <input
                                    type="text"
                                    value={session.join_link}
                                    readOnly
                                    aria-label="Session join link" // Accessibility
                                />
                                <button
                                    className="copy-button"
                                    onClick={copyShareLink}
                                >
                                    Copy
                                </button>
                            </div>
                            <div className="qr-code">
                                <h3>Or scan this QR code:</h3>
                                <img src={session.qr_code} alt="QR Code for session link" /> {/* Improved alt text */}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SessionView;