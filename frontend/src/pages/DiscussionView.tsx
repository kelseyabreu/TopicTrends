import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import io, { Socket } from "socket.io-client";
import "../styles/DiscussionView.css";
import api, { API_URL } from "../utils/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "../context/AuthContext";
import { AuthStatus } from "../enums/AuthStatus";
import { Lightbulb, Loader2, Trash2, Waves, Zap, Star, BarChart3 } from "lucide-react"; // Import Zap icon or similar for grouping
import { Discussion } from "../interfaces/discussions"; // Import Discussion type
import { Topic, TopicsResponse } from "../interfaces/topics"; // Import Topic type
import { Idea } from "../interfaces/ideas"; // Import Idea type
import TopicListItem from "../components/TopicListItem"; // Import our custom TopicListItem component
import InteractionButton, {
  InteractionActionType,
} from "../components/InteractionButton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
// Define Session Storage Key function for Participation Token
const getParticipationTokenKey = (discussionId: string | undefined): string =>
  `TopicTrends_participation_token_${discussionId || "unknown"}`;

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
  const [participationToken, setParticipationToken] = useState<string | null>(
    null
  );
  const [showShareModal, setShowShareModal] = useState(false);
  const [showNewIdeaModal, setShowNewIdeaModal] = useState(false);
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
      console.log(
        `[DiscussionView ${discussionId}] No PT in sessionStorage. Requesting new one...`
      );
      try {
        const apiKey = import.meta.env.VITE_PARTICIPATION_REQUEST_API_KEY;
        if (!apiKey) {
          console.error(
            "Frontend configuration error: VITE_PARTICIPATION_REQUEST_API_KEY is not set."
          );
          toast.error("Configuration error. Cannot initiate session.");
          return;
        }

        const response = await api.post(
          `/discussions/${discussionId}/initiate-anonymous`,
          {},
          { headers: { "X-API-Key": apiKey } }
        );

        token = response.data.participation_token;
        if (token) {
          console.log(
            `[DiscussionView ${discussionId}] Received new PT, storing in sessionStorage.`
          );
          sessionStorage.setItem(storageKey, token);
          setParticipationToken(token);
        } else {
          console.error(
            `[DiscussionView ${discussionId}] Failed to get participation token (empty response).`
          );
          toast.error("Could not initiate anonymous session. Please refresh.");
        }
      } catch (error) {
        console.error(
          `[DiscussionView ${discussionId}] Error fetching participation token:`,
          error
        );
        if (error.response?.status === 401) {
          toast.error(
            "Error initiating anonymous session (Authorization failed). Please contact support."
          );
        } else {
          toast.error(
            "Error starting anonymous session. Please try refreshing the page."
          );
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
      navigate("/discussions");
    } catch (error) {
      console.error("Error deleting discussion:", error);
      // Error object likely comes from the api client interceptor now
      toast.error(
        error?.message ||
          "Failed to delete discussion. You might not have permission."
      );
      setIsDeleting(false);
    }
  };

  const handleEngagementChange = useCallback(
    (isActive: boolean, actionType: InteractionActionType) => {
      console.log(
        `Discussion ${discussionId} - Action: ${actionType}, IsActive: ${isActive}`
      );
      // You could potentially update discussion object here if it contains like/pin/save counts
    },
    [discussionId]
  );

  // --- Fetch initial discussion data --- // Also used for refreshing topics after socket update
  const fetchDiscussionData = useCallback(async () => {
    if (!discussionId) return;
    console.log(
      `[DiscussionView Effect ${discussionId}] Fetching discussion data...`
    );
    try {
      const [discussionResponse, topicsResponse] = await Promise.all([
        api.get<Discussion>(`/discussions/${discussionId}`),
        api.get<TopicsResponse>(`/discussions/${discussionId}/topics`),
      ]);

      // isMounted check is handled by the useEffect cleanup, no need here if useCallback is used correctly
      setDiscussion(discussionResponse.data);
      const fetchedTopics = Array.isArray(topicsResponse.data.topics)
        ? topicsResponse.data.topics
        : [];
      const sortedTopics = [...fetchedTopics].sort((a, b) => b.count - a.count);
      setTopics(sortedTopics);
      setUnclusteredCount(topicsResponse.data.unclustered_count || 0);
      console.log(
        `[DiscussionView Effect ${discussionId}] Data fetched successfully.`
      );
    } catch (error) {
      // Catch any error type
      console.error(
        `[DiscussionView Effect ${discussionId}] Error fetching discussion data:`,
        error
      );
      // isMounted check is handled by the useEffect cleanup
      if (error.response?.status === 404) {
        toast.error("Discussion not found. It might have been deleted.");
        navigate("/"); // Navigate away if discussion doesn't exist
      } else {
        toast.error(error.message || "Failed to load discussion data.");
      }
    } finally {
      // isMounted check is handled by the useEffect cleanup
      setIsLoading(false);
    }
  }, [discussionId, navigate]); // Add navigate to dependencies

  // --- Combined Effect for Data Fetching, Socket Connection, PT Management, and Real-time Idea Updates ---
  useEffect(() => {
    console.log(
      `[DiscussionView Effect ${discussionId}] Starting. AuthStatus: ${authStatus}`
    );
    let isMounted = true;

    if (authStatus === AuthStatus.Loading) {
      console.log(
        `[DiscussionView Effect ${discussionId}] Auth status loading, waiting...`
      );
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

    // --- Fetch initial discussion data --- // Now called from outside useEffect
    fetchDiscussionData();

    // --- Socket.IO Setup ---
    console.log(
      `[DiscussionView Effect ${discussionId}] Setting up Socket.IO connection to ${API_URL}...`
    );
    // Ensure any existing socket connection is closed before creating a new one
    if (socketRef.current) {
      console.log(
        `[DiscussionView Effect ${discussionId}] Disconnecting existing socket before reconnecting.`
      );
      socketRef.current.disconnect();
    }

    // Establish new connection
    const socket = io(API_URL || window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"], // Recommended transports
      reconnectionAttempts: 5,
      timeout: 10000, // Consider connection timeout
    });
    socketRef.current = socket; // Store socket instance

    // --- Define Event Handlers ---
    const handleConnect = () => {
      console.log(
        `[Socket ${discussionId}] Connected: ${socket.id}. Joining room.`
      );
      if (discussionId) socket.emit("join", discussionId);
    };

    const handleConnectError = (error: Error) => {
      console.error(
        `[Socket ${discussionId}] Connection error:`,
        error.message
      );
      if (isMounted) toast.warning("Connection issue. Trying to reconnect...");
    };

    const handleDisconnect = (reason: Socket.DisconnectReason) => {
      console.warn(`[Socket ${discussionId}] Disconnected: ${reason}`);
      if (isMounted && reason !== "io client disconnect") {
        toast.error("Disconnected. Please refresh if issues persist.");
      }
    };

    // Refactored handleTopicsUpdated to trigger data fetch
    const handleTopicsUpdated = (data: { discussion_id: string }) => {
      if (data.discussion_id === discussionId && isMounted) {
        console.log(
          `[Socket ${discussionId}] Received topics_updated event. Fetching latest data...`
        );
        // Trigger a fetch of the latest discussion data, which includes topics
        fetchDiscussionData();
      } else if (isMounted) {
        console.log(
          `[Socket ${discussionId}] Ignored 'topics_updated' for different discussion (${data.discussion_id})`
        );
      }
    };

    const handleProcessingError = (data: {
      discussion_id: string;
      error?: string;
    }) => {
      console.error(
        `[Socket ${discussionId}] Received processing_error:`,
        data
      );
      if (data.discussion_id === discussionId && isMounted) {
        toast.error(
          `Backend processing error: ${
            data.error || "Failed to process update."
          }`
        );
      }
    };

    const handleIdeaProcessingError = (data: {
      discussion_id: string;
      idea_id: string;
      error?: string;
    }) => {
      if (data.discussion_id === discussionId && isMounted) {
        console.warn(
          `[Socket ${discussionId}] Received idea_processing_error for idea ${data.idea_id}:`,
          data.error
        );
        toast.warn(
          `AI processing issue for one idea: ${
            data.error || "Processing failed."
          }`,
          { autoClose: 7000 }
        );
      }
    };

    // >>> Handler for the new_idea event <<<
    const handleNewIdea = (data: { discussion_id: string; idea: Idea }) => {
      if (data.discussion_id === discussionId && isMounted) {
        console.log(
          `[Socket ${discussionId}] Received new_idea event:`,
          data.idea.id
        );

        // Update overall discussion idea count
        setDiscussion((prevDiscussion) =>
          prevDiscussion
            ? {
                ...prevDiscussion,
                idea_count: (prevDiscussion.idea_count || 0) + 1,
              }
            : null
        );

        // Increment unclustered count since new ideas are now unclustered
        setUnclusteredCount((prev) => prev + 1);
      } else if (isMounted) {
        console.log(
          `[Socket ${discussionId}] Ignored 'new_idea' event for different discussion (${data.discussion_id})`
        );
      }
    };
    // >>> END Handler for new_idea <<<

    // --- Attach Listeners ---
    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("topics_updated", handleTopicsUpdated);
    socket.on("processing_error", handleProcessingError);
    socket.on("idea_processing_error", handleIdeaProcessingError);
    // >>> Attach the new listener <<<
    socket.on("new_idea", handleNewIdea);

    // --- Cleanup Function ---
    return () => {
      console.log(`[DiscussionView Effect ${discussionId}] Cleanup running.`);
      isMounted = false; // Prevent state updates after unmount
      if (socketRef.current) {
        console.log(
          `[DiscussionView Cleanup ${discussionId}] Removing listeners and disconnecting socket ID: ${socketRef.current.id}`
        );
        // Remove all specific listeners
        socketRef.current.off("connect", handleConnect);
        socketRef.current.off("connect_error", handleConnectError);
        socketRef.current.off("disconnect", handleDisconnect);
        socketRef.current.off("topics_updated", handleTopicsUpdated);
        socketRef.current.off("processing_error", handleProcessingError);
        socketRef.current.off(
          "idea_processing_error",
          handleIdeaProcessingError
        );
        // >>> Remove the new listener <<<
        socketRef.current.off("new_idea", handleNewIdea);

        // Emit leave and disconnect
        if (discussionId) socketRef.current.emit("leave", discussionId);
        socketRef.current.disconnect();
        socketRef.current = null; // Clear the ref
      } else {
        console.log(
          `[DiscussionView Cleanup ${discussionId}] No socket found in ref to cleanup.`
        );
      }
    };
  }, [
    discussionId,
    navigate,
    authStatus,
    ensureParticipationToken,
    participationToken,
    fetchDiscussionData, // Add fetchDiscussionData to dependencies
  ]);

  // --- Idea Submission Handler (remains mostly the same, no clustering call) ---
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // ... (validation logic for idea text, length, socket connection) ...
    const trimmedIdea = idea.trim();
    if (!trimmedIdea) return toast.error("Please enter an idea");
    if (trimmedIdea.length > 500)
      return toast.error("Idea too long (max 500 chars)");
    if (!socketRef.current?.connected)
      return toast.error("Not connected. Wait or refresh.");
    if (!discussionId) return toast.error("Discussion context missing.");

    // Authorization check
    const headers: Record<string, string> = {};
    if (authStatus === AuthStatus.Authenticated) {
      // CSRF handled by api.ts interceptor
    } else if (
      authStatus === AuthStatus.Unauthenticated &&
      participationToken
    ) {
      headers["X-Participation-Token"] = participationToken;
    } else {
      return toast.error(
        "Cannot submit: Authentication issue. Please refresh."
      );
    }
    // Verification check
    if (
      discussion?.require_verification &&
      authStatus !== AuthStatus.Authenticated
    ) {
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
      console.error(
        `[Submit Idea ${discussionId}] Error submitting idea:`,
        error
      );
      if (error.response?.status === 401) {
        toast.error("Auth failed. Session expired? Refresh or log in.");
        if (authStatus === AuthStatus.Unauthenticated) {
          sessionStorage.removeItem(getParticipationTokenKey(discussionId));
          setParticipationToken(null);
        } else {
          checkAuthStatus();
        }
      } else if (error.response?.status === 403) {
        toast.error(error.message || "Permission denied (verification/CSRF?).");
      } else if (error.response?.status === 429) {
        toast.warn("Submitting too quickly. Please wait.");
      } else {
        toast.error(error.message || "Failed to submit idea.");
      }
    } finally {
      setIsSubmitting(false);
      setShowNewIdeaModal(false);
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
      console.error(
        `Error triggering clustering for discussion ${discussionId}:`,
        error
      );
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
    navigator.clipboard
      .writeText(discussion.join_link)
      .then(() => toast.success("Link copied!"))
      .catch(() => toast.error("Failed to copy."));
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault(); 
      
      if (submitDisabled || isSubmitting) {
        return; 
      }
      
      const syntheticEvent = {
        preventDefault: () => {},
        currentTarget: document.querySelector('#new-idea-form')
      } as React.FormEvent<HTMLFormElement>;
      
      handleSubmit(syntheticEvent);
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
  const displayStatus =
    authStatus === AuthStatus.Authenticated
      ? `✓ ${user?.username || "Verified User"}`
      : participationToken
      ? "👤 Anonymous"
      : "Connecting...";
  const submitDisabled =
    isSubmitting ||
    (authStatus === AuthStatus.Unauthenticated && !participationToken) ||
    (discussion?.require_verification &&
      authStatus !== AuthStatus.Authenticated);

  return (
    <div className="discussion-view-container">
      {/* New Idea Modal */}
      <Dialog open={showNewIdeaModal} onOpenChange={setShowNewIdeaModal}>
        <DialogContent onKeyDown={handleDialogKeyDown}>
          <DialogHeader>
            <DialogTitle>
              <Lightbulb className="inline" /> New Idea
            </DialogTitle>
            <DialogDescription>
              Share your thoughts on this discussion.
            </DialogDescription>
          </DialogHeader>
          <form id="new-idea-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="idea-input">Your Idea</label>
              <Textarea
                id="idea-input"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder={
                  discussion.require_verification &&
                  authStatus !== AuthStatus.Authenticated
                    ? "Login required to submit ideas"
                    : "Share your idea here..."
                }
                required
                disabled={submitDisabled || isSubmitting}
                maxLength={500}
              />
              <small className={idea.length > 500 ? "text-red-500" : ""}>
                {idea.length}/500 chars • Press Ctrl+Enter to submit
              </small>
            </div>
            <DialogFooter className="mt-4">
              <div className="user-info-dialog">
                <span
                  className={`status-badge ${
                    authStatus === AuthStatus.Authenticated
                      ? "verified-badge"
                      : "anonymous-badge"
                  }`}
                >
                  {displayStatus}
                </span>
                {discussion.require_verification && (
                  <Badge variant="default" className="ml-2">
                    Login Required
                  </Badge>
                )}
              </div>
              <DialogClose asChild>
                <Button variant="default" type="button">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={submitDisabled}
                className={isSubmitting ? "animate-pulse" : ""}
              >
                {isSubmitting ? "Submitting..." : "Submit Idea"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="bread-crumb-container">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/discussions">Discussions</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{discussion.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {discussion ? (
        <>
          {/* Discussion Info Header */}
          <div className="discussion-info">
            {/* ... (title, prompt, stats, share button) ... */}
            <h1>{discussion.title}</h1>
            <p className="prompt">{discussion.prompt}</p>
            <div className="stats">
              {/* Recalculate stats based on current topics state */}
              <div className="stat">
                <span className="stat-value">
                  {topics.reduce((sum, t) => sum + t.count, 0) +
                    unclusteredCount}
                </span>
                <span className="stat-label">Ideas</span>
              </div>
              <div className="stat">
                <span className="stat-value">{topics.length || 0}</span>
                <span className="stat-label">Currents</span>
              </div>
              {/* Add counts for specific types if needed */}
            </div>
            <div className="discussion-actions">
              <Button
                variant="default"
                onClick={() => setShowShareModal(true)}
                disabled={!discussion.join_link}
                className="shareBtn ml-2">
                Share
              </Button>
              <Button
                variant="default"
                onClick={() => setShowNewIdeaModal(true)}
                disabled={isClustering}
                className="ml-2">
                <Lightbulb className="mr-2 h-4 w-4" />
                New Idea
              </Button>
              {authStatus === AuthStatus.Authenticated && ( // Only show if logged in
                <>
                  <Button
                    variant="default"
                    onClick={handleClusterClick}
                    disabled={isClustering}
                    className="ml-2">
                    {isClustering ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Regroup All Ideas
                  </Button>
                  <Button
                    variant="default"
                    onClick={() =>
                      navigate(`/discussion/${discussionId}/new-ideas`)
                    }
                    className="ml-2">
                    <Waves className="mr-2 h-4 w-4" />
                    Drifting Ideas ({unclusteredCount})
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => navigate(`/discussion/${discussionId}/analytics`)}
                    className="ml-2">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Analytics
                  </Button>
                </>
              )}
              {discussionId && (
                <>
                  <InteractionButton
                    entityType="discussion"
                    entityId={discussionId}
                    actionType="like"
                    onStateChange={handleEngagementChange}
                    className="ml-2"
                    activeLabel="Liked"
                    // Optional: pass initialActive if discussion object has this info
                    // initialActive={discussion.is_liked_by_user}
                  />
                  <InteractionButton
                    entityType="discussion"
                    entityId={discussionId}
                    actionType="pin"
                    onStateChange={handleEngagementChange}
                    className="ml-2"
                    // initialActive={discussion.is_pinned_by_user}
                  />
                  <InteractionButton
                    entityType="discussion"
                    entityId={discussionId}
                    actionType="save"
                    activeIcon={
                      <Star
                        size={20}
                        className="text-yellow-500"
                        fill="currentColor"
                      />
                    }
                    onStateChange={handleEngagementChange}
                    className="ml-2"
                    // initialActive={discussion.is_saved_by_user}
                  />
                </>
              )}
              <Button
                variant="default"
                onClick={handleDeleteDiscussion}
                disabled={isDeleting}
                className="ml-2 deleteBtn ml-auto"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete
              </Button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="main-content">
            {/* Topics Section */}
            <div className="topics-section">
              {topics.length === 0 ? (
                <div className="no-topics">
                  <p>No currents flowing yet. Share an idea!</p>
                </div>
              ) : (
                <div className="topics-list">
                  {/* Render topics using our custom TopicListItem component */}
                  {topics.map((topic) => (
                    <TopicListItem
                      key={topic.id}
                      topic={topic}
                      discussionId={discussionId || ""}
                      onVote={(topicId, direction) => {
                        // Handle voting - in a real app, this would call an API
                        console.log(`Vote ${direction} for topic ${topicId}`);
                        toast.info(`Voted ${direction} for topic`);
                      }}
                      limitIdeas={true}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Share Modal (remains the same) */}
          {showShareModal && discussion && (
            // ... modal JSX ...
            <div
              className="modal-overlay"
              onClick={() => setShowShareModal(false)}
            >
              <div className="share-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Share This Discussion</h2>
                  <button
                    className="close-button"
                    onClick={() => setShowShareModal(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="modal-content">
                  <p>Share link:</p>
                  <div className="share-link">
                    <input
                      type="text"
                      value={discussion.join_link || ""}
                      readOnly
                    />
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
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      )}
    </div>
  );
}

export default DiscussionView;
