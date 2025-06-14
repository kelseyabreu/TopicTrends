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
import { InteractionStateProvider, useInteractionState } from "../context/InteractionStateContext";
import {
  Lightbulb,
  Loader2,
  Trash2,
  Waves,
  Zap,
  Star,
  BarChart3,
  Plus,
  Share2,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  Heart,
  Bookmark,
  Pin,
  Users,
  MessageCircle,
  TrendingUp,
  Filter,
  SortDesc,
  SortAsc,
  MessageSquareText,
  Grid3x3,
  List
} from "lucide-react";
import { Discussion } from "../interfaces/discussions";
import { Topic } from "../interfaces/topics";
import { Idea } from "../interfaces/ideas";
import { PaginatedTopics, convertTanStackToApiParams } from "../interfaces/pagination";
import TopicListItem from "../components/TopicListItem";
import InteractionButton, {
  InteractionActionType,
} from "../components/InteractionButton";
import IdeaSimulator, { GeneratedIdea } from "../components/IdeaSimulator";
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

// Inner component that uses the interaction state context
function DiscussionViewContent() {
  const { discussionId } = useParams<{ discussionId: string }>();
  const navigate = useNavigate();
  const { user, authStatus, checkAuthStatus } = useAuth();
  const { loadBulkStates } = useInteractionState();

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

  // New mobile-first UI state
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'trending'>('popular');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterBy, setFilterBy] = useState<'all' | 'ripple' | 'wave' | 'breaker' | 'tsunami'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Topics pagination and sorting state (separate from main data fetching)
  const [topicsPagination, setTopicsPagination] = useState({
    pageIndex: 0, // TanStack uses 0-based indexing
    pageSize: 20,
  });
  const [topicsPageCount, setTopicsPageCount] = useState(1);
  const [totalTopicsCount, setTotalTopicsCount] = useState(0);
  const [isTopicsLoading, setIsTopicsLoading] = useState(false);
  const [isInitialTopicsLoad, setIsInitialTopicsLoad] = useState(true);
  const [isBulkStatesLoading, setIsBulkStatesLoading] = useState(false);
  const [bulkStatesLoaded, setBulkStatesLoaded] = useState(false);

  // Track which topics have had their bulk states loaded to prevent duplicate calls
  const loadedTopicsRef = useRef<string>('');
  const currentTopicsRef = useRef<Topic[]>([]);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showNewIdeaModal, setShowNewIdeaModal] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [isClustering, setIsClustering] = useState(false);

  // Idea Simulator state
  const [simulatorIdeaCount, setSimulatorIdeaCount] = useState(0);
  const [isSimulatorSubmitting, setIsSimulatorSubmitting] = useState(false);

  // Simulator callback functions
  const handleSimulatorIdeaCountChange = useCallback((count: number) => {
    setSimulatorIdeaCount(count);
  }, []);

  const handleSimulatorFloodGates = useCallback(() => {
    setIsSimulatorSubmitting(true);
    const ideaCountDisplay = Math.floor(simulatorIdeaCount);
    const message = simulatorIdeaCount <= 100
      ? `Simulating submission of ${ideaCountDisplay} ideas for clustering!`
      : `Simulating submission of ${ideaCountDisplay} ideas for clustering! (Content area full, overflow in actions bar)`;
    toast.success(message);

    // Reset after 3 seconds (matches the simulator's internal timing)
    setTimeout(() => {
      setIsSimulatorSubmitting(false);
    }, 3000);
  }, [simulatorIdeaCount]);

  const handleIdeasGenerated = useCallback(async (generatedIdeas: GeneratedIdea[]) => {
    try {
      console.log(`Submitting ${generatedIdeas.length} generated ideas to backend...`);

      // Authorization check (same as manual submission)
      const headers: Record<string, string> = {};
      if (authStatus === AuthStatus.Authenticated) {
        // CSRF handled by api.ts interceptor
      } else if (
        authStatus === AuthStatus.Unauthenticated &&
        participationToken
      ) {
        headers["X-Participation-Token"] = participationToken;
      } else {
        toast.error("Cannot submit: Authentication issue. Please refresh.");
        return;
      }

      // Submit each idea using the same method as manual submission
      for (const idea of generatedIdeas) {
        const ideaData = {
          text: idea.text
        };

        // Use the same API client as manual submission
        await api.post(
          `/discussions/${discussionId}/ideas`,
          ideaData,
          { headers }
        );
      }

      toast.success(`Successfully submitted ${generatedIdeas.length} ideas from Orlando idea bank!`);

      // No need to refresh - Socket.IO will automatically update the UI with new ideas

    } catch (error) {
      console.error('Error submitting generated ideas:', error);

      // Same error handling as manual submission
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
        toast.error(error.message || "Failed to submit ideas.");
      }
    }
  }, [discussionId, authStatus, participationToken, checkAuthStatus]);

  // Calculate background fill styles for smooth 0.1% transitions (10 updates per second)
  const getContentFillStyle = (): React.CSSProperties => {
    if (isSimulatorSubmitting) return { '--content-fill-height': '100%' } as React.CSSProperties;

    // Content area fills from 0-100 ideas (1% per idea, 0.1% per update)
    const contentPercentage = Math.min(simulatorIdeaCount, 100);
    return { '--content-fill-height': `${contentPercentage.toFixed(1)}%` } as React.CSSProperties;
  };

  const getContentFillClass = () => {
    if (isSimulatorSubmitting) return 'submitting';
    if (simulatorIdeaCount >= 100) return 'content-full';
    return '';
  };

  const getActionsFillStyle = (): React.CSSProperties => {
    if (isSimulatorSubmitting) return { '--actions-fill-height': '100%' } as React.CSSProperties;
    if (simulatorIdeaCount <= 100) return { '--actions-fill-height': '0%' } as React.CSSProperties;

    // Actions bar starts filling after 100 ideas (1% per idea, 0.1% per update)
    const excessIdeas = simulatorIdeaCount - 100;
    const actionsPercentage = Math.min(excessIdeas, 100);
    return { '--actions-fill-height': `${actionsPercentage.toFixed(1)}%` } as React.CSSProperties;
  };

  const getActionsFillClass = () => {
    if (isSimulatorSubmitting) return 'submitting';
    if (simulatorIdeaCount >= 200) return 'actions-full';
    return '';
  };

  // Utility functions for filtering (sorting is now handled by the server)

  const filteredTopics = topics
    .filter(topic => {
      if (filterBy === 'all') return true;
      const count = topic.count;
      switch (filterBy) {
        case 'ripple': return count <= 10;
        case 'wave': return count > 10 && count <= 25;
        case 'breaker': return count > 25 && count <= 50;
        case 'tsunami': return count > 50;
        default: return true;
      }
    });

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

  // --- Discussion Data Fetching Function (without topics) ---
  const fetchDiscussionData = useCallback(async () => {
    if (!discussionId) return;
    console.log(`[DiscussionView] Fetching discussion data for ${discussionId}...`);

    try {
      const discussionResponse = await api.get<Discussion>(`/discussions/${discussionId}`);
      setDiscussion(discussionResponse.data);
      console.log(`[DiscussionView] Discussion data fetched successfully.`);
    } catch (error) {
      console.error(`[DiscussionView] Error fetching discussion data:`, error);
      if (error.response?.status === 404) {
        toast.error("Discussion not found. It might have been deleted.");
        navigate("/");
      } else {
        toast.error(error.message || "Failed to load discussion data.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [discussionId, navigate]);

  // --- Topics Data Fetching Function (separate from discussion) ---
  const fetchTopics = useCallback(async () => {
    if (!discussionId) return;

    setIsTopicsLoading(true);
    console.log(`[DiscussionView] Fetching topics with sort: ${sortBy}, direction: ${sortDir}, page: ${topicsPagination.pageIndex + 1}...`);

    try {
      // Map frontend sort values to backend field names
      const sortField = sortBy === 'newest' ? 'id' : sortBy === 'popular' ? 'count' : 'count';

      // Convert TanStack pagination state to API parameters using standardized utility
      const queryParams = convertTanStackToApiParams(
        topicsPagination,
        [{ id: sortField, desc: sortDir === 'desc' }],
        undefined, // no global filter for topics
        [] // no column filters for topics
      );

      const topicsResponse = await api.get<PaginatedTopics>(`/discussions/${discussionId}/topics`, {
        params: queryParams
      });

      // Use standardized paginated response format
      const responseData = topicsResponse.data;
      const fetchedTopics = responseData.rows;

      // Smart update: only change state if data actually changed
      const newPageCount = responseData.pageCount;
      const newTotalCount = responseData.totalRowCount;
      const newUnclusteredCount = responseData.unclustered_count || 0;

      // Check if topics data has meaningful changes (by ID and count)
      const currentTopics = currentTopicsRef.current;
      const topicsChanged =
        currentTopics.length !== fetchedTopics.length ||
        currentTopics.some((topic, index) =>
          !fetchedTopics[index] ||
          topic.id !== fetchedTopics[index].id ||
          topic.count !== fetchedTopics[index].count
        );

      // Smart topic updates: merge changes instead of replacing entire array
      if (topicsChanged || isInitialTopicsLoad) {
        console.log(`[DiscussionView] Topics changed, updating UI:`, {
          topicsChanged,
          isInitialTopicsLoad,
          oldLength: currentTopics.length,
          newLength: fetchedTopics.length,
          reason: topicsChanged ? 'data changed' : 'initial load'
        });

        if (isInitialTopicsLoad) {
          // Initial load: replace everything
          setTopics(fetchedTopics);
        } else {
          // Background update: merge changes smoothly
          setTopics(prevTopics => {
            // Create a map of existing topics for quick lookup
            const existingTopicsMap = new Map(prevTopics.map(topic => [topic.id, topic]));

            // Process fetched topics
            const updatedTopics = fetchedTopics.map(fetchedTopic => {
              const existingTopic = existingTopicsMap.get(fetchedTopic.id);

              // If topic exists and count changed, create updated version
              if (existingTopic && existingTopic.count !== fetchedTopic.count) {
                return { ...existingTopic, count: fetchedTopic.count };
              }

              // If topic exists and unchanged, keep existing reference
              if (existingTopic && existingTopic.count === fetchedTopic.count) {
                return existingTopic;
              }

              // New topic, use fetched version
              return fetchedTopic;
            });

            return updatedTopics;
          });
        }

        currentTopicsRef.current = fetchedTopics;
      } else {
        console.log(`[DiscussionView] Topics unchanged, keeping existing UI:`, {
          existingLength: topics.length,
          fetchedLength: fetchedTopics.length
        });
      }

      // Update counts only if they changed
      if (topicsPageCount !== newPageCount) setTopicsPageCount(newPageCount);
      if (totalTopicsCount !== newTotalCount) setTotalTopicsCount(newTotalCount);
      if (unclusteredCount !== newUnclusteredCount) setUnclusteredCount(newUnclusteredCount);

      // Mark initial load as complete after first successful fetch
      if (isInitialTopicsLoad) {
        setIsInitialTopicsLoad(false);
      }

      console.log(`[DiscussionView] Topics fetched successfully: ${fetchedTopics.length} topics`);
    } catch (error) {
      console.error(`[DiscussionView] Error fetching topics:`, error);
      toast.error(error.message || "Failed to load topics.");
    } finally {
      setIsTopicsLoading(false);
    }
  }, [discussionId, sortBy, sortDir, topicsPagination]);

  // --- Topics Fetching Effect (separate from main effect) ---
  useEffect(() => {
    if (discussionId && authStatus !== AuthStatus.Loading) {
      // Reset the loaded topics ref when discussion changes
      loadedTopicsRef.current = '';
      fetchTopics();
    }
  }, [fetchTopics, discussionId, authStatus]);

  // --- Professional Bulk State Loading (stable callback to prevent loops) ---
  const loadVisibleStates = useCallback(async (visibleTopics: Topic[]) => {
    if (!discussionId || visibleTopics.length === 0) return;

    try {
      // Build comprehensive entities list for currently visible topics
      const entities = [
        // Discussion state (always load)
        { type: 'discussion' as const, id: discussionId },
        // Topic states (only visible topics)
        ...visibleTopics.map(topic => ({ type: 'topic' as const, id: topic.id })),
        // Idea states (only from visible topics)
        ...visibleTopics.flatMap(topic =>
          topic.ideas.map(idea => ({ type: 'idea' as const, id: idea.id }))
        )
      ];

      // Remove duplicates (in case of any)
      const uniqueEntities = entities.filter((entity, index, self) =>
        index === self.findIndex(e => e.type === entity.type && e.id === entity.id)
      );

      if (uniqueEntities.length > 0) {
        setIsBulkStatesLoading(true);
        setBulkStatesLoaded(false);

        console.log(`[DiscussionView] Loading bulk states for ${uniqueEntities.length} entities:`, {
          discussion: uniqueEntities.filter(e => e.type === 'discussion').length,
          topics: uniqueEntities.filter(e => e.type === 'topic').length,
          ideas: uniqueEntities.filter(e => e.type === 'idea').length,
          visibleTopics: visibleTopics.length
        });

        await loadBulkStates(uniqueEntities);

        setBulkStatesLoaded(true);
        setIsBulkStatesLoading(false);
        console.log(`[DiscussionView] ✅ Bulk states loaded successfully for ${uniqueEntities.length} entities`);
      }
    } catch (error) {
      console.error('[DiscussionView] ❌ Error loading bulk states:', error);
      setBulkStatesLoaded(false);
      setIsBulkStatesLoading(false);
      // Don't show error to user as this is not critical for functionality
      // Individual components will fall back to their own API calls
    }
  }, [discussionId, loadBulkStates]); // Stable dependencies

  // --- Smart Bulk State Loading Effect (respects filtering and pagination) ---
  useEffect(() => {
    // Only load states for currently visible/filtered topics
    if (topics.length > 0) {
      // Apply the same filtering logic as the UI to get actually visible topics
      const visibleTopics = topics.filter(topic => {
        if (filterBy === 'all') return true;
        const count = topic.count;
        switch (filterBy) {
          case 'ripple': return count <= 10;
          case 'wave': return count > 10 && count <= 25;
          case 'breaker': return count > 25 && count <= 50;
          case 'tsunami': return count > 50;
          default: return true;
        }
      });

      // Create a unique key for the current visible topics to prevent duplicate loading
      const topicsKey = visibleTopics.map(t => t.id).sort().join(',');

      // Only load states if we haven't already loaded them for this exact set of topics
      if (visibleTopics.length > 0 && loadedTopicsRef.current !== topicsKey) {
        console.log(`[DiscussionView] 🔄 Starting bulk state loading for ${visibleTopics.length} topics...`);
        setBulkStatesLoaded(false); // Mark as not loaded yet
        loadedTopicsRef.current = topicsKey;
        loadVisibleStates(visibleTopics);
      } else if (visibleTopics.length > 0) {
        // Same topics, states already loaded
        console.log(`[DiscussionView] ✅ Bulk states already loaded for current topics`);
        setBulkStatesLoaded(true);
      }
    } else {
      // No topics, reset state
      setBulkStatesLoaded(false);
      loadedTopicsRef.current = '';
    }
  }, [topics, filterBy, loadVisibleStates]); // Run when topics or filter changes

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

    // Refactored handleTopicsUpdated to trigger topics fetch only (with smart update)
    const handleTopicsUpdated = (data: { discussion_id: string }) => {
      if (data.discussion_id === discussionId && isMounted) {
        console.log(
          `[Socket ${discussionId}] Received topics_updated event. Fetching latest topics in background...`
        );
        // Trigger a background fetch that won't clear existing topics
        fetchTopics();
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

    // >>> Handler for batch_processed event (optimized batch processing) <<<
    const handleBatchProcessed = (data: {
      discussion_id: string;
      ideas: Idea[];
      count: number;
      unclustered_count?: number;
      incremental_update: boolean;
    }) => {
      if (data.discussion_id === discussionId && isMounted) {
        console.log(
          `[Socket ${discussionId}] Received batch_processed event:`,
          `${data.ideas.length} ideas`
        );

        // Update discussion idea count
        setDiscussion((prevDiscussion) =>
          prevDiscussion
            ? {
                ...prevDiscussion,
                idea_count: (prevDiscussion.idea_count || 0) + data.ideas.length,
              }
            : null
        );

        // Update unclustered count from WebSocket event (real-time)
        if (typeof data.unclustered_count === 'number') {
          setUnclusteredCount(data.unclustered_count);
        } else {
          // Fallback: calculate from ideas if unclustered_count not provided
          const unclusteredCount = data.ideas.filter(idea => !idea.topic_id).length;
          setUnclusteredCount((prev) => prev + unclusteredCount);
        }

        // Refresh topics if any ideas were clustered
        const clusteredCount = data.ideas.filter(idea => idea.topic_id).length;
        if (clusteredCount > 0) {
          fetchTopics(); // Background refresh for clustered ideas
        }
      } else if (isMounted) {
        console.log(
          `[Socket ${discussionId}] Ignored 'batch_processed' event for different discussion (${data.discussion_id})`
        );
      }
    };
    // >>> END Handler for batch_processed <<<

    // Handler for idea_submitted event (immediate feedback)
    const handleIdeaSubmitted = (data: {
      discussion_id: string;
      idea: {
        id: string;
        text: string;
        status: string;
        timestamp: string;
      };
    }) => {
      if (data.discussion_id === discussionId && isMounted) {
        console.log(`[Socket ${discussionId}] Idea submitted:`, data.idea.text.substring(0, 50) + "...");
        // Show immediate feedback to user
        toast.success("Idea submitted! Processing...");
      }
    };

    // Handler for unprocessed_count_updated event (real-time count updates)
    const handleUnprocessedCountUpdate = (data: {
      discussion_id: string;
      total_unprocessed: number;
      needs_embedding: number;
      needs_clustering: number;
    }) => {
      if (data.discussion_id === discussionId && isMounted) {
        console.log(`[Socket ${discussionId}] Unprocessed count updated:`, data);
        // Update the unclustered count directly
        setUnclusteredCount(data.total_unprocessed);
      }
    };

    // --- Attach Listeners ---
    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("topics_updated", handleTopicsUpdated);
    socket.on("processing_error", handleProcessingError);
    socket.on("idea_processing_error", handleIdeaProcessingError);
    // >>> Attach the batch processing listener <<<
    socket.on("batch_processed", handleBatchProcessed);
    socket.on("idea_submitted", handleIdeaSubmitted);
    socket.on("unprocessed_count_updated", handleUnprocessedCountUpdate);

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
        // >>> Remove the batch processing listener <<<
        socketRef.current.off("batch_processed", handleBatchProcessed);
        socketRef.current.off("idea_submitted", handleIdeaSubmitted);
        socketRef.current.off("unprocessed_count_updated", handleUnprocessedCountUpdate);

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
    fetchDiscussionData,
    // Note: fetchTopics is NOT included here to prevent page refreshes when sorting/pagination changes
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
    <div className="modern-discussion-container">
      {/* New Idea Modal */}
      <Dialog open={showNewIdeaModal} onOpenChange={setShowNewIdeaModal}>
        <DialogContent onKeyDown={handleDialogKeyDown} className="modern-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              Share Your Idea
            </DialogTitle>
            <DialogDescription>
              Add your thoughts to this discussion and help shape the conversation.
            </DialogDescription>
          </DialogHeader>
          <form id="new-idea-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <Textarea
                id="idea-input"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder={
                  discussion?.require_verification &&
                  authStatus !== AuthStatus.Authenticated
                    ? "Login required to submit ideas"
                    : "What's your take on this topic? Share your perspective..."
                }
                required
                disabled={submitDisabled || isSubmitting}
                maxLength={500}
                className="min-h-[120px] resize-none border-2 focus:border-blue-500 transition-colors"
              />
              <div className="flex justify-between items-center mt-2">
                <small className={`text-sm ${idea.length > 500 ? "text-red-500" : "text-gray-500"}`}>
                  {idea.length}/500 characters
                </small>
                <small className="text-gray-400 text-xs">
                  Ctrl+Enter to submit
                </small>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 text-sm">
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    authStatus === AuthStatus.Authenticated
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {displayStatus}
                </div>
                {discussion?.require_verification && (
                  <Badge variant="neutral" className="text-xs">
                    Login Required
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button variant="neutral" type="button" className="flex-1 sm:flex-none">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={submitDisabled}
                  className={`flex-1 sm:flex-none bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 ${
                    isSubmitting ? "animate-pulse" : ""
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Submit Idea
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Modern Mobile Header */}
      <div className="modern-header">
        <div className="header-top">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/discussions")}
            className="text-gray-600 hover:text-gray-900"
          >
            <ChevronDown className="w-4 h-4 mr-1 rotate-90" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {/* Desktop Action Buttons */}
            <div className="hidden md:flex items-center gap-2">
              <Button
                variant="neutral"
                size="sm"
                onClick={() => setShowShareModal(true)}
                disabled={!discussion?.join_link}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>

              {authStatus === AuthStatus.Authenticated && (
                <>
                  <Button
                    variant="neutral"
                    size="sm"
                    onClick={handleClusterClick}
                    disabled={isClustering}
                  >
                    {isClustering ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 mr-2" />
                    )}
                    Regroup All Ideas
                  </Button>
                  <Button
                    variant="neutral"
                    size="sm"
                    onClick={() => navigate(`/discussion/${discussionId}/new-ideas`)}
                  >
                    <Waves className="w-4 h-4 mr-2" />
                    Drifting Ideas ({unclusteredCount})
                  </Button>
                  <Button
                    variant="neutral"
                    size="sm"
                    onClick={() => navigate(`/discussion/${discussionId}/analytics`)}
                  >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Analytics
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Compact Breadcrumbs */}
        <div className="breadcrumb-container">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/discussions" className="text-sm text-gray-500 hover:text-gray-700">
                  Discussions
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm font-medium text-gray-900">
                  {discussion?.title || 'Loading...'}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {discussion && (
          <div className={`header-content ${isHeaderCollapsed ? 'collapsed' : ''}`}>
            <div className="discussion-title-section">
              <h1 className="discussion-title">{discussion.title}</h1>
              <p className="discussion-prompt">{discussion.prompt}</p>
            </div>

            {/* Modern Stats Cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                </div>
                <div className="stat-content">
                  <div className="stat-value">
                    {discussion?.idea_count || 0}
                  </div>
                  <div className="stat-label">Ideas</div>
                </div>
              </div>

              <div className={`stat-card ${!isInitialTopicsLoad && isTopicsLoading ? 'updating' : ''}`}>
                <div className="stat-icon">
                  <MessageSquareText className="w-5 h-5 text-green-500" />
                  {!isInitialTopicsLoad && isTopicsLoading && (
                    <Loader2 className="w-3 h-3 animate-spin text-green-400 ml-1" />
                  )}
                </div>
                <div className="stat-content">
                  <div className="stat-value">{totalTopicsCount || 0}</div>
                  <div className="stat-label">Topics</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Waves className="w-5 h-5 text-blue-500" />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{unclusteredCount}</div>
                  <div className="stat-label">Drifting</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div className="mobile-menu-overlay" onClick={() => setShowMobileMenu(false)}>
          <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <h3>Actions</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMobileMenu(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="mobile-menu-content">
              <Button
                variant="neutral"
                onClick={() => {
                  setShowShareModal(true);
                  setShowMobileMenu(false);
                }}
                disabled={!discussion?.join_link}
                className="w-full justify-start"
              >
                <Share2 className="w-4 h-4 mr-3" />
                Share Discussion
              </Button>

              {authStatus === AuthStatus.Authenticated && (
                <>
                  <Button
                    variant="neutral"
                    onClick={() => {
                      handleClusterClick();
                      setShowMobileMenu(false);
                    }}
                    disabled={isClustering}
                    className="w-full justify-start"
                  >
                    {isClustering ? (
                      <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 mr-3" />
                    )}
                    Regroup All Ideas
                  </Button>
                  <Button
                    variant="neutral"
                    onClick={() => {
                      navigate(`/discussion/${discussionId}/new-ideas`);
                      setShowMobileMenu(false);
                    }}
                    className="w-full justify-start"
                  >
                    <Waves className="w-4 h-4 mr-3" />
                    Drifting Ideas ({unclusteredCount})
                  </Button>
                  <Button
                    variant="neutral"
                    onClick={() => {
                      navigate(`/discussion/${discussionId}/analytics`);
                      setShowMobileMenu(false);
                    }}
                    className="w-full justify-start"
                  >
                    <BarChart3 className="w-4 h-4 mr-3" />
                    Analytics
                  </Button>
                  <Button
                    variant="neutral"
                    onClick={() => {
                      handleDeleteDiscussion();
                      setShowMobileMenu(false);
                    }}
                    disabled={isDeleting}
                    className="w-full justify-start text-red-600 hover:text-red-700"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-3" />
                    )}
                    Delete Discussion
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Bar */}
      <div
        className={`quick-actions-bar ${getActionsFillClass()}`}
        style={getActionsFillStyle()}
      >
        <div className="quick-actions-content">
          {/* Interaction Buttons */}
          {discussionId && (
            <div className="interaction-buttons">
              <InteractionButton
                entityType="discussion"
                entityId={discussionId}
                actionType="like"
                onStateChange={handleEngagementChange}
                activeIcon={<Heart className="w-4 h-4" fill="currentColor" />}
                inactiveIcon={<Heart className="w-4 h-4" />}
                showLabel={false}
                disableInitialFetch={true} // Use bulk-loaded states
              />
              <InteractionButton
                entityType="discussion"
                entityId={discussionId}
                actionType="pin"
                onStateChange={handleEngagementChange}
                activeIcon={<Pin className="w-4 h-4" fill="currentColor" />}
                inactiveIcon={<Pin className="w-4 h-4" />}
                showLabel={false}
                disableInitialFetch={true} // Use bulk-loaded states
              />
              <InteractionButton
                entityType="discussion"
                entityId={discussionId}
                actionType="save"
                onStateChange={handleEngagementChange}
                activeIcon={<Bookmark className="w-4 h-4" fill="currentColor" />}
                inactiveIcon={<Bookmark className="w-4 h-4" />}
                showLabel={false}
                disableInitialFetch={true} // Use bulk-loaded states
              />
            </div>
          )}

          {/* Filter and Sort */}
          <div className="filter-sort-controls">
            <Button
              variant="neutral"
              size="sm"
              onClick={() => setShowQuickActions(!showQuickActions)}
              className="filter-button"
            >
              <Filter className="w-4 h-4 mr-1" />
              Filter
            </Button>
            <Button
              variant="neutral"
              size="sm"
              className="sort-button"
              onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
              title={`Currently sorting ${sortBy} ${sortDir === 'desc' ? 'descending' : 'ascending'}. Click to toggle.`}
            >
              {sortDir === 'desc' ? (
                <SortDesc className="w-4 h-4 mr-1" />
              ) : (
                <SortAsc className="w-4 h-4 mr-1" />
              )}
              {sortBy}
            </Button>

            {/* View Toggle Controls */}
            <div className="view-toggle-controls hidden md:flex">
              <Button
                variant="neutral"
                size="sm"
                onClick={() => setViewMode('grid')}
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                title="Grid view - Show topics in responsive columns"
              >
                <Grid3x3 className="w-4 h-4" />
              </Button>
              <Button
                variant="neutral"
                size="sm"
                onClick={() => setViewMode('list')}
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                title="List view - Show topics in full-width rows"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter/Sort Quick Actions Panel */}
      {showQuickActions && (
        <div className="quick-actions-panel">
          <div className="panel-content">
            <div className="panel-section">
              <h4>Sort by</h4>
              <div className="button-group">
                {(['popular', 'newest', 'trending'] as const).map((sort) => (
                  <Button
                    key={sort}
                    variant={sortBy === sort ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSortBy(sort)}
                    className="capitalize"
                  >
                    {sort}
                  </Button>
                ))}
              </div>
            </div>
            <div className="panel-section">
              <h4>Sort direction</h4>
              <div className="button-group">
                {(['desc', 'asc'] as const).map((dir) => (
                  <Button
                    key={dir}
                    variant={sortDir === dir ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSortDir(dir)}
                    className="capitalize flex items-center gap-1"
                  >
                    {dir === 'desc' ? (
                      <SortDesc className="w-3 h-3" />
                    ) : (
                      <SortAsc className="w-3 h-3" />
                    )}
                    {dir === 'desc' ? 'Descending' : 'Ascending'}
                  </Button>
                ))}
              </div>
            </div>
            <div className="panel-section">
              <h4>Filter by type</h4>
              <div className="button-group">
                {(['all', 'ripple', 'wave', 'breaker', 'tsunami'] as const).map((filter) => (
                  <Button
                    key={filter}
                    variant={filterBy === filter ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterBy(filter)}
                    className="capitalize"
                  >
                    {filter}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Topics List */}
      <div
        className={`modern-content ${getContentFillClass()}`}
        style={getContentFillStyle()}
      >
        {discussion ? (
          <>
            {filteredTopics.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Waves className="w-16 h-16 text-gray-300" />
                </div>
                <h3 className="empty-state-title">No currents flowing yet</h3>
                <p className="empty-state-description">
                  Be the first to share an idea and start the conversation!
                </p>
                <Button
                  onClick={() => setShowNewIdeaModal(true)}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Share Your Idea
                </Button>
              </div>
            ) : (
              <>
                {/* Topics Loading State */}
                {((isInitialTopicsLoad && isTopicsLoading && topics.length === 0) || isBulkStatesLoading) && (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    <span className="ml-2 text-gray-600">
                      {(isInitialTopicsLoad && isTopicsLoading) ? "Loading topics..." : "Loading interaction states..."}
                    </span>
                  </div>
                )}

                {/* Topics List - */}
                {!(isInitialTopicsLoad && isTopicsLoading) && !isBulkStatesLoading && (
                  <div className={`modern-topics-list ${viewMode === 'list' ? 'list-view' : 'grid-view'}`}>
                    {filteredTopics.map((topic) => (
                      <TopicListItem
                        key={topic.id}
                        topic={topic}
                        discussionId={discussionId || ""}
                        limitIdeas={true}
                        participationToken={participationToken}
                        disableInitialFetch={true} // Always disable since we're loading bulk states first
                      />
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {topicsPageCount > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white">
                    <div className="flex items-center text-sm text-gray-700">
                      <span>
                        Showing {topicsPagination.pageIndex * topicsPagination.pageSize + 1} to{' '}
                        {Math.min((topicsPagination.pageIndex + 1) * topicsPagination.pageSize, totalTopicsCount)} of{' '}
                        {totalTopicsCount} topics
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="neutral"
                        size="sm"
                        onClick={() => setTopicsPagination(prev => ({ ...prev, pageIndex: 0 }))}
                        disabled={topicsPagination.pageIndex === 0}
                      >
                        First
                      </Button>
                      <Button
                        variant="neutral"
                        size="sm"
                        onClick={() => setTopicsPagination(prev => ({ ...prev, pageIndex: prev.pageIndex - 1 }))}
                        disabled={topicsPagination.pageIndex === 0}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-gray-700">
                        Page {topicsPagination.pageIndex + 1} of {topicsPageCount}
                      </span>
                      <Button
                        variant="neutral"
                        size="sm"
                        onClick={() => setTopicsPagination(prev => ({ ...prev, pageIndex: prev.pageIndex + 1 }))}
                        disabled={topicsPagination.pageIndex >= topicsPageCount - 1}
                      >
                        Next
                      </Button>
                      <Button
                        variant="neutral"
                        size="sm"
                        onClick={() => setTopicsPagination(prev => ({ ...prev, pageIndex: topicsPageCount - 1 }))}
                        disabled={topicsPagination.pageIndex >= topicsPageCount - 1}
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="error-state">
            <h2>Discussion not found</h2>
            <p>This discussion may have been deleted or the link is incorrect.</p>
            <Button onClick={() => navigate("/discussions")} variant="neutral">
              Browse Discussions
            </Button>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fab-container">
        <Button
          onClick={() => setShowNewIdeaModal(true)}
          disabled={isClustering}
          className="fab bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Idea Simulator - Demo/Testing Tool */}
      <IdeaSimulator
        onIdeaCountChange={handleSimulatorIdeaCountChange}
        onFloodGatesOpen={handleSimulatorFloodGates}
        onIdeasGenerated={handleIdeasGenerated}
        disabled={isClustering}
      />

      {/* Modern Share Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="modern-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-r from-green-500 to-blue-600 rounded-lg">
                <Share2 className="w-5 h-5 text-white" />
              </div>
              Share Discussion
            </DialogTitle>
            <DialogDescription>
              Invite others to join this discussion and share their ideas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Discussion Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discussion?.join_link || ""}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                />
                <Button onClick={copyShareLink} size="sm">
                  Copy
                </Button>
              </div>
            </div>
            {discussion?.qr_code && (
              <div className="text-center">
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  QR Code
                </label>
                <div className="inline-block p-4 bg-white border border-gray-200 rounded-lg">
                  <img
                    src={discussion.qr_code}
                    alt="QR Code for discussion"
                    className="w-32 h-32"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Scan with your phone to join
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Main wrapper component that provides the interaction state context
function DiscussionView() {
  const { discussionId } = useParams<{ discussionId: string }>();
  const [participationToken, setParticipationToken] = useState<string | null>(null);
  const { authStatus } = useAuth();

  // Get participation token for the provider
  useEffect(() => {
    if (authStatus === AuthStatus.Unauthenticated && discussionId) {
      const storageKey = getParticipationTokenKey(discussionId);
      const token = sessionStorage.getItem(storageKey);
      setParticipationToken(token);
    } else {
      setParticipationToken(null);
    }
  }, [authStatus, discussionId]);

  return (
    <InteractionStateProvider participationToken={participationToken}>
      <DiscussionViewContent />
    </InteractionStateProvider>
  );
}

export default DiscussionView;
