// src/pages/TopicView.tsx

import React, { useEffect, useState } from "react"; // Import React
import { useParams, useNavigate } from "react-router-dom";
import { toast } from 'react-toastify';
import { Loader2 } from "lucide-react"; // Keep Loader

// Application Imports
import api from "../utils/api"; // Use the configured API client
import { useAuth } from "../context/AuthContext"; // Import useAuth
import { Discussion } from "../interfaces/discussions"; // Import Discussion type
import { Topic } from "../interfaces/topics";
import TopicListItem from "../components/TopicListItem";
import "../styles/TopicView.css"; // Assuming styles exist

// Define the structure of the response from POST /topics (for drill-down)
// This assumes the backend returns data nested under a 'data' key
interface TopicDrilldownResponse {
    data: Topic[]; // Expecting an array of Topic objects
    // Include other potential fields like 'status', 'message' if the backend sends them
}


function TopicView() {
    const { discussionId, topicId } = useParams<{ discussionId: string; topicId: string }>();
    const navigate = useNavigate();
    const { authStatus } = useAuth(); // Get auth status, user object isn't directly needed now

    // State for fetched data and loading/error status
    const [discussion, setDiscussion] = useState<Discussion | null>(null);
    const [subTopics, setSubTopics] = useState<Topic[]>([]); // State to hold the drill-down results
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null); // State for errors

    // Removed useState hooks for userId, isVerified, verificationMethod

    useEffect(() => {
        console.log(`[TopicView Effect ${discussionId}/${topicId}] Starting effect. AuthStatus: ${authStatus}`);
        let isMounted = true;

        // Removed localStorage checks and associated state setting

        setIsLoading(true);
        setError(null); // Clear previous errors

        // Fetch discussion details and perform topic drill-down clustering
        const fetchData = async () => {
            if (!discussionId || !topicId) {
                if (isMounted) setError("Missing discussion or topic ID.");
                setIsLoading(false);
                return;
            }

            try {
                // Fetch discussion details first (needed for display)
                const discussionResponse = await api.get<Discussion>(`/discussions/${discussionId}`);
                if (isMounted) {
                    setDiscussion(discussionResponse.data);
                } else {
                    return; // Stop if unmounted
                }

                // Then, trigger the drill-down clustering via POST /topics
                // IMPORTANT: Sending payload as {"topic_id": topicId}
                console.log(`[TopicView Effect ${discussionId}/${topicId}] Posting to /topics with topic_id: ${topicId}`);
                const topicResponse = await api.post<TopicDrilldownResponse>(
                    '/topics',
                    { topic_id: topicId } // Send as JSON object matching backend expectation
                );

                if (isMounted) {
                    if (topicResponse.data && Array.isArray(topicResponse.data)) {
                        setSubTopics(topicResponse.data);
                        console.log(`[TopicView Effect ${discussionId}/${topicId}] Received ${topicResponse.data.length} sub-topics.`);
                        if (topicResponse.data.length === 0) {
                            toast.info("No further sub-topics could be generated from this topic's ideas.");
                        }
                    } else {
                        console.error("[TopicView Effect] Invalid response structure from POST /topics:", topicResponse.data);
                        setSubTopics([]); // Set empty on invalid structure
                        setError("Received unexpected data structure for sub-topics.");
                    }
                }

                // RECORD TOPIC VIEW EVENT 
                await api.post(`/interaction/topic/${topicId}/view`);
            } catch (err) { // Catch any error type
                console.error(`[TopicView Effect ${discussionId}/${topicId}] Error fetching data:`, err);
                if (isMounted) {
                    const errorDetail = err.response?.data?.detail || err.message || 'Failed to load topic data.';
                    setError(errorDetail);
                    toast.error(`${errorDetail} Returning to discussion.`);
                    // Optional: Navigate back after a short delay or let user click back
                    // setTimeout(() => navigate(`/discussion/${discussionId}`), 3000);
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
            console.log(`[TopicView Effect ${discussionId}/${topicId}] Cleanup.`);
            isMounted = false;
        };
        // Dependency array includes IDs and navigate (for error navigation)
    }, [discussionId, topicId, navigate, authStatus]); // Include authStatus if needed later

    // --- Render Logic ---

    if (isLoading) {
        return (
            <div className="topic-view-loading"> {/* Use a specific class */}
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p>Loading sub-topic details...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="topic-view-error"> {/* Use a specific class */}
                <h2>Error Loading Topic</h2>
                <p>{error}</p>
                <button
                    className="btn btn-primary" // Use consistent button styling
                    onClick={() => navigate(`/discussion/${discussionId}`)}
                >
                    Return to Discussion
                </button>
            </div>
        );
    }

    // Main content rendering
    return (
        <div className="topic-page">
            {/* Render discussion header if discussion data is available */}
            {discussion && (
                <div className="discussion-info">
                    <button
                        className="back-button" // Use consistent button styling
                        onClick={() => navigate(`/discussion/${discussionId}`)}
                    >
                        ← Back to Discussion
                    </button>
                    <h1>{discussion.title}</h1>
                    <p className="prompt">{discussion.prompt}</p>
                    {/* You might want to display the PARENT topic title here if available */}
                    {/* This requires fetching the parent topic details or passing them */}
                    <h2 className="topic-view-subtitle">Sub-Topics Generated from Drill-Down</h2>
                </div>
            )}

            {/* Render Sub-Topics generated by the drill-down */}
            <div className="sub-topics-list"> {/* Use a specific class */}
                {subTopics.length > 0 ? (
                    subTopics.map((subTopic) => (
                        <TopicListItem
                            key={subTopic.id}
                            topic={subTopic}
                            discussionId={discussionId!}
                        />
                    ))
                ) : (
                    // Render message if drill-down yielded no sub-topics (and no error occurred)
                    !error && <p className="text-muted-foreground p-sm p-4">No further sub-topics were generated for this topic.</p>
                )}
            </div>
        </div>
    );
}

export default TopicView;