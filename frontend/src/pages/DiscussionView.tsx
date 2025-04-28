// File: src/pages/DiscussionView.js
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import io from "socket.io-client";
import "../styles/DiscussionView.css";
import api from "../utils/api";
import { Button } from "@/components/ui/button"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

function DiscussionView() {
  const { discussionId } = useParams();
  const navigate = useNavigate();
  const [discussion, setDiscussion] = useState(null);
  const [idea, setIdea] = useState("");
  const [topics, setTopics] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Keep loading state
  const [userId, setUserId] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const socketRef = useRef(null);

  // *** COMBINED useEffect Hook ***
  useEffect(() => {
    console.log(`[DiscussionView Effect ${discussionId}] Starting effect...`);
    let isMounted = true; // Flag to check if component is still mounted

    // 1. Check if user has joined this discussion
    const storedUserId = localStorage.getItem(
      `TopicTrends_${discussionId}_userId`
    );
    const storedIsVerified =
      localStorage.getItem(`TopicTrends_${discussionId}_isVerified`) === "true";
    const storedVerificationMethod = localStorage.getItem(
      `TopicTrends_${discussionId}_verificationMethod`
    );

    if (!storedUserId) {
      console.log(
        `[DiscussionView Effect ${discussionId}] No stored user ID. Navigating back to join.`
      );
      // User hasn't joined this discussion, navigate back immediately
      navigate(`/join/${discussionId}`);
      return; // Exit the effect early
    }

    console.log(
      `[DiscussionView Effect ${discussionId}] User ID found: ${storedUserId}. Proceeding.`
    );
    // Set user state based on localStorage
    setUserId(storedUserId);
    setIsVerified(storedIsVerified);
    setVerificationMethod(storedVerificationMethod);
    setIsLoading(true); // Set loading true while fetching data

    // 2. Fetch discussion details and initial topics
    const fetchDiscussionData = async () => {
      try {
        const [discussionResponse, topicsResponse] = await Promise.all([
          api.get(`/discussions/${discussionId}`),
          api.get(`/discussions/${discussionId}/topics`),
        ]);

        if (isMounted) {
          setDiscussion(discussionResponse.data);

          // Handle both formats - either direct array or nested in .topics property
          const fetchedTopics = Array.isArray(topicsResponse.data)
            ? topicsResponse.data // New API format (direct array)
            : topicsResponse.data.topics || []; // Old format (nested in .topics)

          setTopics(fetchedTopics.sort((a, b) => b.count - a.count));
        }
      } catch (error) {
        console.error(
          `[DiscussionView Effect ${discussionId}] Error fetching discussion data:`,
          error
        );
        if (isMounted) {
          toast.error(
            error.response?.data?.detail ||
              "Failed to load discussion data. Returning home."
          );
          navigate("/"); // Navigate home on critical fetch error
        }
      } finally {
        if (isMounted) {
          setIsLoading(false); // Stop loading only after fetch attempt
        }
      }
    };

    fetchDiscussionData(); // Fetch data only if user check passed

    // 3. Set up Socket.IO connection (only if user check passed)
    console.log(`[DiscussionView Effect ${discussionId}] Setting up Socket.IO...`);
    // Ensure existing socket is disconnected before creating a new one if effect re-runs
    if (socketRef.current) {
      console.log(
        `[DiscussionView Effect ${discussionId}] Disconnecting existing socket before reconnecting.`
      );
      socketRef.current.disconnect();
    }

    const socket = io(import.meta.env.VITE_API_URL || "http://localhost:8000", {
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 60000,
      autoConnect: true, // Let it auto-connect
    });

    socket.on("connect", () => {
      console.log(
        `[Socket ${discussionId}] Connected with ID: ${socket.id}. Emitting join.`
      );
      // Join room with discussion ID *after* connection established
      socket.emit("join", discussionId);
    });

    socket.on("connect_error", (error) => {
      console.error(`[Socket ${discussionId}] Connection error:`, error);
      // Maybe show a toast notification about connection issues
      if (isMounted) {
        toast.warning("Connection issue. Trying to reconnect...");
      }
    });

    socket.on("disconnect", (reason) => {
      console.warn(`[Socket ${discussionId}] Disconnected:`, reason);
      if (isMounted) {
        // Only show toast if disconnect wasn't initiated by cleanup
        if (reason !== "io client disconnect") {
          toast.error("Disconnected. Please refresh if issues persist.");
        }
      }
    });

    socket.on("topics_updated", (data) => {
      console.log(`[Socket ${discussionId}] Received topics_updated event.`);
      // Check if the update is for the correct discussion and component is mounted
      if (data.discussion_id === discussionId && isMounted) {
        console.log(
          `[Socket ${discussionId}] Updating topics state with ${data.topics.length} topics.`
        );
        // Ensure data.topics is an array
        const updatedTopics = Array.isArray(data.topics)
          ? data.topics
          : [];
        const sortedTopics = [...updatedTopics].sort(
          (a, b) => b.count - a.count
        );
        setTopics(sortedTopics);

        // Update idea count in discussion state if discussion exists
        if (discussion) {
          const newIdeaCount = updatedTopics.reduce(
            (total, topic) => total + (topic.ideas?.length || 0),
            0
          );
          setDiscussion((prevDiscussion) => ({
            ...prevDiscussion,
            idea_count: newIdeaCount,
            topic_count: updatedTopics.length,
          }));
        }

        // No need for separate success toast here, the info toast from submit is sufficient
        // toast.success('Ideas updated!');
      } else {
        console.log(
          `[Socket ${discussionId}] Received topics_updated for different discussion (${data.discussion_id}) or component unmounted.`
        );
      }
    });

    socket.on("processing_error", (data) => {
      console.error(`[Socket ${discussionId}] Received processing_error:`, data);
      if (data.discussion_id === discussionId && isMounted) {
        toast.error(
          `Backend error: ${data.error || "Failed to process update."}`
        );
      }
    });

    socketRef.current = socket; // Store socket instance

    // 4. Cleanup function for the combined effect
    return () => {
      console.log(
        `[DiscussionView Effect ${discussionId}] Running cleanup function...`
      );
      isMounted = false; // Prevent state updates after unmount
      if (socketRef.current) {
        console.log(
          `[DiscussionView Cleanup ${discussionId}] Emitting leave and disconnecting socket ID: ${socketRef.current.id}`
        );
        socketRef.current.emit("leave", discussionId);
        socketRef.current.disconnect();
        socketRef.current = null; // Clear the ref
      } else {
        console.log(
          `[DiscussionView Cleanup ${discussionId}] No socket found in ref to disconnect.`
        );
      }
    };

    // Dependencies: Only discussionId and navigate.
    // navigate function from react-router is generally stable.
  }, [discussionId, navigate]); // Removed 'discussion' from deps to prevent loop on count update

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!idea.trim()) {
      toast.error("Please enter an idea");
      return;
    }
    if (idea.length > 500) {
      toast.error("Idea text is too long (maximum 500 characters)");
      return;
    }
    if (!socketRef.current || !socketRef.current.connected) {
      toast.error("Not connected. Please wait or refresh.");
      return;
    }

    setIsSubmitting(true);

    try {
      console.log(`[Submit Idea ${discussionId}] Posting idea...`);
      // Post the idea via API
      const response = await api.post(`/discussions/${discussionId}/ideas`, {
        text: idea,
        user_id: userId,
        verified: isVerified,
        verification_method: verificationMethod,
      });
      console.log(`[Submit Idea ${discussionId}] API response:`, response.data);

      setIdea(""); // Clear input field immediately
      toast.info("Idea submitted! Processing..."); // Give user feedback

      // Removed setTimeout fallback fetch
    } catch (error) {
      console.error(`[Submit Idea ${discussionId}] Error submitting idea:`, error);
      toast.error(
        error.response?.data?.detail ||
          "Failed to submit idea. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyShareLink = () => {
    if (!discussion) return;
    navigator.clipboard
      .writeText(discussion.join_link)
      .then(() => toast.success("Link copied to clipboard!"))
      .catch((err) => toast.error("Failed to copy link."));
  };
  const countByTopicType = (type) => {
    if (!topics || topics.length === 0) return 0;

    let count = 0;

    topics.forEach((topic) => {
      const ideaCount = topic.count || 0;

      if (type === "ripples" && ideaCount <= 10) {
        count++;
      } else if (type === "waves" && ideaCount > 10 && ideaCount <= 25) {
        count++;
      } else if (type === "breakers" && ideaCount > 25 && ideaCount <= 50) {
        count++;
      } else if (type === "tsunamis" && ideaCount > 50) {
        count++;
      }
    });

    return count;
  };
  const getTopicType = (count) => {
    if (count <= 10) return 'Ripple';
    if (count <= 25) return 'Wave';
    if (count <= 50) return 'Breaker';
    return 'Tsunami';
};
const goSwim = (id) => {
    navigate(`/discussion/${discussionId}/topic/${id}`)
}

  // Render Loading state
  if (isLoading) {
    return (
      <div className="discussion-view-container loading">
        <div className="loader"></div>
        <p>Loading discussion data...</p>
      </div>
    );
  }

  // Render main component content if not loading
  return (
    <div className="discussion-view-container">
      {/* Only render content if discussion is loaded */}
      {discussion ? (
        <>
          <div className="discussion-info">
            <h1>{discussion.title}</h1>
            <p className="prompt">{discussion.prompt}</p>
            <div className="stats">
              <div className="stat">
                <span className="stat-value">{discussion.idea_count}</span>
                <span className="stat-label">Ideas</span>
              </div>
              <div className="stat">
                <span className="stat-value">{topics.length}</span>
                <span className="stat-label">Currents</span>
              </div>
              <div className="stat">
                <span className="stat-value">
                  {countByTopicType("ripples")}
                </span>
                <span className="stat-label">Ripples</span>
              </div>
              <div className="stat">
                <span className="stat-value">
                  {countByTopicType("waves")}
                </span>
                <span className="stat-label">Waves</span>
              </div>
              <div className="stat">
                <span className="stat-value">
                  {countByTopicType("breakers")}
                </span>
                <span className="stat-label">Breakers</span>
              </div>
              <div className="stat">
                <span className="stat-value">
                  {countByTopicType("tsunamis")}
                </span>
                <span className="stat-label">Tsunamis</span>
              </div>
            </div>
            <div className="discussion-actions">
              {discussion && ( // Only show share if discussion data loaded
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
                  <Textarea                   
                    id="idea-input"
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="Share your idea here..."
                    required
                    disabled={isSubmitting} />
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
                  disabled={
                    isSubmitting ||
                    !socketRef.current ||
                    !socketRef.current.connected
                  } // Disable if submitting or not connected
                >
                  {isSubmitting ? "Submitting..." : "Submit Idea"}
                </button>
              </form>
            </div>

            <div className="topics-section">
              <h2>Motions in the Ocean</h2>
              {topics.length === 0 ? (
                <div className="no-topics">
                  <p>No ideas submitted yet. Be the first to contribute!</p>
                </div>
              ) : (
                <div className="topics-list">
                  {topics.map((topic) => (
                    <div key={topic.id} className="topic-view-content">
                      <Accordion
                        type="single"
                        collapsible
                        className="w-full max-w-xl"
                      >
                        <AccordionItem value={topic.id}>
                          <AccordionTrigger>
                            <div className="topic-details">
                              <h2 className="topic-title">
                                {topic.representative_text}
                              </h2>
                              <div className="topic-meta">
                                <div>
                                <Badge variant="neutral">{getTopicType(topic.count)}</Badge>
                                <Badge>{topic.count} Ideas</Badge>
                                </div>
                                {/* <Button onClick={() => goSwim(topic.id)} className="topic-header">
                                                Go Swimming
                                </Button> */}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            {!topic.ideas || topic.ideas.length === 0 ? (
                              <div className="no-ideas">
                                <p>No ideas found in this topic.</p>
                              </div>
                            ) : (
                              <>
                                {topic.ideas.map((idea) => (
                                  <div className="idea-card" key={idea.id}>
                                    <p>{idea.text}</p>
                                    <pre>{idea?.on_topic}</pre>
                                   {idea?.related_topics?.length > 0 && (
                                      <div className="related-topics">
                                        {idea.related_topics.map((topic) => (
                                          <Badge key={topic} variant="neutral" className="mr-2">
                                            {topic}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    <div className="idea-meta">
                                      <span className="idea-user">
                                        {idea.verified ? (
                                          <span className="verification-badge">
                                            ✓ Verified
                                          </span>
                                        ) : (
                                          <span className="anonymous-badge">
                                            Anonymous
                                          </span>
                                        )}
                                      </span>
                                      {idea.timestamp && (
                                        <span className="idea-timestamp">
                                          {new Date(
                                            idea.timestamp
                                          ).toLocaleString()}
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
              )}
            </div>
          </div>
        </>
      ) : (
        // Render something if discussion is null after loading (shouldn't happen if fetch error navigates away)
        <div className="discussion-view-container error">
          <h2>Error</h2>
          <p>Could not load discussion details.</p>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal &&
        discussion && ( // Ensure discussion exists before rendering modal
          <div
            className="modal-overlay"
            onClick={() => setShowShareModal(false)}
          >
            {" "}
            {/* Close on overlay click */}
            <div className="share-modal" onClick={(e) => e.stopPropagation()}>
              {" "}
              {/* Prevent modal close when clicking inside */}
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
                    value={discussion.join_link}
                    readOnly
                    aria-label="Discussion join link" // Accessibility
                  />
                  <button className="copy-button" onClick={copyShareLink}>
                    Copy
                  </button>
                </div>
                <div className="qr-code">
                  <h3>Or scan this QR code:</h3>
                  <img
                    src={discussion.qr_code}
                    alt="QR Code for discussion link"
                  />{" "}
                  {/* Improved alt text */}
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default DiscussionView;
