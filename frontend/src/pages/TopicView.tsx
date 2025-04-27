import api from "../utils/api";
import { TopicResponse } from "../interfaces/topics";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from 'react-toastify';
import { Discussion } from "../interfaces/discussions";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "@/components/ui/accordion"

function TopicView() {
    const { discussionId, topicId } = useParams();
    const navigate = useNavigate();
    const [discussion, setDiscussion] = useState<Discussion|null>(null);
    const [topic, setTopic] = useState<TopicResponse>({ data: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [userId, setUserId] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [verificationMethod, setVerificationMethod] = useState(null);

    useEffect(() => {
        console.log(`[TopicView Effect ${discussionId}/${topicId}] Starting effect...`);
        let isMounted = true; // Flag to check if component is still mounted

        // 1. Check if user has joined this discussion
        const storedUserId = localStorage.getItem(`TopicTrends_${discussionId}_userId`);
        const storedIsVerified = localStorage.getItem(`TopicTrends_${discussionId}_isVerified`) === 'true';
        const storedVerificationMethod = localStorage.getItem(`TopicTrends_${discussionId}_verificationMethod`);

        if (!storedUserId) {
            console.log(`[TopicView Effect ${discussionId}/${topicId}] No stored user ID. Navigating back to join.`);
            // User hasn't joined this discussion, navigate back immediately
            navigate(`/join/${discussionId}`);
            return; // Exit the effect early
        }

        console.log(`[TopicView Effect ${discussionId}/${topicId}] User ID found: ${storedUserId}. Proceeding.`);
        // Set user state based on localStorage
        setUserId(storedUserId);
        setIsVerified(storedIsVerified);
        setVerificationMethod(storedVerificationMethod);
        setIsLoading(true); // Set loading true while fetching data

        // 2. Fetch discussion and topic details
        const fetchData = async () => {
            try {
                const [discussionResponse, topicResponse] = await Promise.all([
                    api.get(`/discussions/${discussionId}`),
                    api.post('/topics', topicId)
                ]);

                if (isMounted) {
                    console.log('mounted', topic)
                    setDiscussion(discussionResponse.data);
                    setTopic(topicResponse.data);
                }
                console.log('not mounted', topic)
            } catch (error) {
                
                console.error(`[TopicView Effect ${discussionId}/${topicId}] Error fetching data:`, error);
                if (isMounted) {
                    toast.error(error.response?.data?.detail || 'Failed to load topic data. Returning to discussion.');
                    // navigate(`/discussion/${discussionId}`); // Navigate back to discussion view on error
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
    }, [discussionId, topicId, navigate]);

    // Helper function to determine topic type based on idea count
    const getTopicType = (count) => {
        if (count <= 10) return 'Ripple';
        if (count <= 25) return 'Wave';
        if (count <= 50) return 'Breaker';
        return 'Tsunami';
    };

    // Render Loading state
    if (isLoading) {
        return (
            <div className="discussion-view-container loading">
                <div className="loader"></div>
                <p>Loading topic data...</p>
            </div>
        );
    }

    // Render main component content if not loading
    return (
        <div className="topic-page">
            {/* Only render content if discussion and topic are loaded */}
            {discussion && topic.data.length ? (
                <div>
                    <div className="discussion-info">
                        <button 
                            className="back-button"
                            onClick={() => navigate(`/discussion/${discussionId}`)}
                        >
                            &larr; Back to Discussion
                        </button>
                        <h1>{discussion.title}</h1>
                        <p className="prompt">{discussion.prompt}</p>
                        
                    </div>
                    <div className="">
                    
                        {topic.data.map((topic) => (
                            <div key={topic.id} className="topic-view-content">
                                <Accordion type="single" collapsible className="w-full max-w-xl">
                        `        <AccordionItem value={topic.id}>
                                    <AccordionTrigger>
                                        <div className="topic-details">
                                        <h2 className="topic-title">{topic.representative_text}</h2>
                                        <div className="topic-meta">
                                            <span className="topic-type">{getTopicType(topic.count)}</span> <br />
                                            <span className="topic-count">{topic.count} ideas</span>
                                        </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                    {(!topic.ideas || topic.ideas.length === 0) ? (
                                    <div className="no-ideas">
                                        <p>No ideas found in this topic.</p>
                                    </div>
                                ) : (
                                    <>
                                        {topic.ideas.map((idea) => (
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
                <div className="discussion-view-container error">
                    <h2>Error</h2>
                    <p>Could not load topic details.</p>
                    <button 
                        className="btn btn-primary"
                        onClick={() => navigate(`/discussion/${discussionId}`)}
                    >
                        Return to Discussion
                    </button>
                </div>
            )}
        </div>
    );
}

export default TopicView;