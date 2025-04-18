import api from "../utils/api";
import { ClusterResponse } from "../interfaces/clusters";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from 'react-toastify';
import { Session } from "../interfaces/sessions";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "@/components/ui/accordion"

function ClusterView() {
    const { sessionId, clusterId } = useParams();
    const navigate = useNavigate();
    const [session, setSession] = useState<Session|null>(null);
    const [cluster, setCluster] = useState<ClusterResponse>({ data: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [userId, setUserId] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [verificationMethod, setVerificationMethod] = useState(null);

    useEffect(() => {
        console.log(`[ClusterView Effect ${sessionId}/${clusterId}] Starting effect...`);
        let isMounted = true; // Flag to check if component is still mounted

        // 1. Check if user has joined this session
        const storedUserId = localStorage.getItem(`TopicTrends_${sessionId}_userId`);
        const storedIsVerified = localStorage.getItem(`TopicTrends_${sessionId}_isVerified`) === 'true';
        const storedVerificationMethod = localStorage.getItem(`TopicTrends_${sessionId}_verificationMethod`);

        if (!storedUserId) {
            console.log(`[ClusterView Effect ${sessionId}/${clusterId}] No stored user ID. Navigating back to join.`);
            // User hasn't joined this session, navigate back immediately
            navigate(`/join/${sessionId}`);
            return; // Exit the effect early
        }

        console.log(`[ClusterView Effect ${sessionId}/${clusterId}] User ID found: ${storedUserId}. Proceeding.`);
        // Set user state based on localStorage
        setUserId(storedUserId);
        setIsVerified(storedIsVerified);
        setVerificationMethod(storedVerificationMethod);
        setIsLoading(true); // Set loading true while fetching data

        // 2. Fetch session and cluster details
        const fetchData = async () => {
            try {
                const [sessionResponse, clusterResponse] = await Promise.all([
                    api.get(`/api/sessions/${sessionId}`),
                    api.post('/api/clusters', clusterId)
                ]);

                if (isMounted) {
                    console.log('mounted', cluster)
                    setSession(sessionResponse.data);
                    setCluster(clusterResponse.data);
                }
                console.log('not mounted', cluster)
            } catch (error) {
                
                console.error(`[ClusterView Effect ${sessionId}/${clusterId}] Error fetching data:`, error);
                if (isMounted) {
                    toast.error(error.response?.data?.detail || 'Failed to load cluster data. Returning to session.');
                    // navigate(`/session/${sessionId}`); // Navigate back to session view on error
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchData();

        // Cleanup function
        return () => {
            isMounted = false; // Prevent state updates after unmount
        };
    }, [sessionId, clusterId, navigate]);

    // Helper function to determine cluster type based on idea count
    const getClusterType = (count) => {
        if (count <= 10) return 'Ripple';
        if (count <= 25) return 'Wave';
        if (count <= 50) return 'Breaker';
        return 'Tsunami';
    };

    // Render Loading state
    if (isLoading) {
        return (
            <div className="session-view-container loading">
                <div className="loader"></div>
                <p>Loading cluster data...</p>
            </div>
        );
    }

    // Render main component content if not loading
    return (
        <div className="cluster-page">
            {/* Only render content if session and cluster are loaded */}
            {session && cluster.data.length ? (
                <div>
                    <div className="session-info">
                        <button 
                            className="back-button"
                            onClick={() => navigate(`/session/${sessionId}`)}
                        >
                            &larr; Back to Session
                        </button>
                        <h1>{session.title}</h1>
                        <p className="prompt">{session.prompt}</p>
                        
                    </div>
                    <div className="">
                    
                        {cluster.data.map((cluster) => (
                            <div key={cluster.id} className="cluster-view-content">
                                <Accordion type="single" collapsible className="w-full max-w-xl">
                        `        <AccordionItem value={cluster.id}>
                                    <AccordionTrigger>
                                        <div className="cluster-details">
                                        <h2 className="cluster-title">{cluster.representative_text}</h2>
                                        <div className="cluster-meta">
                                            <span className="cluster-type">{getClusterType(cluster.count)}</span> <br />
                                            <span className="cluster-count">{cluster.count} ideas</span>
                                        </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                    {(!cluster.ideas || cluster.ideas.length === 0) ? (
                                    <div className="no-ideas">
                                        <p>No ideas found in this cluster.</p>
                                    </div>
                                ) : (
                                    <>
                                        {cluster.ideas.map((idea) => (
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
                                                    {idea.timestamp && (
                                                        <span className="idea-timestamp">
                                                            {new Date(idea.timestamp).toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                                    </AccordionContent>
                                </AccordionItem>
                                </Accordion>     
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="session-view-container error">
                    <h2>Error</h2>
                    <p>Could not load cluster details.</p>
                    <button 
                        className="btn btn-primary"
                        onClick={() => navigate(`/session/${sessionId}`)}
                    >
                        Return to Session
                    </button>
                </div>
            )}
        </div>
    );
}

export default ClusterView;