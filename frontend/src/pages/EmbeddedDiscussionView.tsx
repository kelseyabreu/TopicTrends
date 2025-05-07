import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import api from "../utils/api"; // Use the configured api client
import '../styles/EmbeddedDiscussionView.css'; // Ensure styles are imported

function EmbeddedDiscussionView() {
    const { discussionId } = useParams<{ discussionId: string }>();
    const location = useLocation();

    const [discussionTitle, setDiscussionTitle] = useState<string>("");
    const [idea, setIdea] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [participationToken, setParticipationToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ideaSubmitted, setIdeaSubmitted] = useState<boolean>(false);
    const [rateLimited, setRateLimited] = useState<boolean>(false); // State for rate limit

    useEffect(() => {
        let isMounted = true;
        console.log("EmbeddedDiscussionView mounting or deps changed.");

        const queryParams = new URLSearchParams(location.search);
        const tokenFromUrl = queryParams.get("token");

        if (!tokenFromUrl) {
            console.error("[Embed] Missing participation token in URL.");
            if (isMounted) {
                setError("Configuration error: Missing participation token.");
                setIsLoading(false);
            }
            return;
        }

        if (isMounted) {
            console.log("[Embed] Participation token found in URL.");
            setParticipationToken(tokenFromUrl);
        }

        const fetchDiscussionInfo = async () => {
            if (!discussionId) {
                if (isMounted) setError("Configuration error: Missing discussion ID.");
                return;
            }
            console.log(`[Embed] Fetching info for discussion ${discussionId}...`);
            setIsLoading(true); // Ensure loading is true before fetch
            setError(null); // Clear previous errors
            setRateLimited(false); // Reset rate limit state

            try {
                // Use the standard API client
                const response = await api.get(`/discussions/${discussionId}`);
                if (isMounted) {
                    setDiscussionTitle(response.data.title);
                    console.log(`[Embed] Discussion title set: ${response.data.title}`);
                }
            } catch (err) {
                console.error("[Embed] Error fetching discussion info:", err);
                if (isMounted) {
                    const status = err.response?.status;
                    if (status === 429) {
                        setError("Too many requests. Please try again in a moment.");
                        setRateLimited(true);
                        toast.warn("Rate limit hit while loading discussion.");
                    } else if (status === 404) {
                        setError("Discussion not found. The link may be invalid.");
                    } else {
                        setError(err.message || "Could not load discussion information.");
                    }
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        // Only fetch if token is present
        if (tokenFromUrl) {
            fetchDiscussionInfo();
        }

        return () => {
            console.log("EmbeddedDiscussionView unmounting.");
            isMounted = false;
        };
    }, [discussionId, location.search]); // Depend on search to re-extract token if URL changes

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        console.log("[Embed] Submit button clicked.");

        const trimmedIdea = idea.trim();
        if (!trimmedIdea || !participationToken || !discussionId) {
            toast.error("Cannot submit: Missing idea text, token, or discussion ID.");
            console.error("[Embed] Submit validation failed:", { trimmedIdea, participationToken, discussionId });
            return;
        }

        if (trimmedIdea.length > 500) {
            toast.error("Idea is too long (max 500 characters).");
            return;
        }

        setIsSubmitting(true);
        setError(null); // Clear previous errors
        setRateLimited(false); // Reset rate limit state

        try {
            console.log("[Embed] Posting idea with participation token...");
            // Send request with the participation token in the header
            await api.post(
                `/discussions/${discussionId}/ideas`,
                { text: trimmedIdea }, // Only send text as per backend schema change
                { headers: { 'X-Participation-Token': participationToken } }
            );

            console.log("[Embed] Idea submitted successfully via API.");
            setIdea(""); // Clear text area
            setIdeaSubmitted(true); // Show success message
            toast.success("Idea submitted!");

        } catch (error) {
            console.error("[Embed] Error submitting idea:", error);
            const status = error.response?.status;

            if (status === 401) {
                setError("Your session token is invalid or expired. Please reload the page containing this component.");
                toast.error("Session expired. Please reload.");
            } else if (status === 403) {
                setError(error.message || "Permission denied. This discussion might require login.");
                toast.error(error.message || "Permission denied.");
            } else if (status === 429) {
                setError("Too many submissions. Please try again in a few minutes.");
                setRateLimited(true);
                toast.warn("Rate limit hit while submitting idea.");
            } else {
                setError(error.message || "Failed to submit idea. Please try again.");
                toast.error(error.message || "Failed to submit idea.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReset = () => {
        setIdeaSubmitted(false);
        setIdea("");
        setError(null); // Clear errors
        setRateLimited(false); // Clear rate limit state
    };

    // --- Render Logic ---

    if (isLoading) {
        return (
            <div className="embedded-loading">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>Loading Discussion...</p>
            </div>
        );
    }

    if (rateLimited || error) { // Show error/rate limit message prominently
        return (
            <div className="embedded-error">
                <p>Error: {error || "Rate limit exceeded."}</p>
                {rateLimited && (
                    // Typically, just informing the user is enough for rate limits in embeds.
                    // A retry button might cause loops if the limit persists.
                    // Refreshing the outer page is often the user's action.
                    <p>Please wait a moment and try reloading the page.</p>
                    // <Button onClick={handleReset} className="retry-button">Try Again</Button>
                )}
                {!rateLimited && error && ( // Provide a way to retry if it's not a rate limit issue
                    <Button onClick={handleReset} className="retry-button">Try Again</Button>
                )}
            </div>
        );
    }

    if (ideaSubmitted) {
        return (
            <div className="embedded-discussion-view success">
                <h3>Thank You!</h3>
                <p>Your idea for "{discussionTitle}" has been submitted.</p>
                <Button onClick={handleReset} className="submit-button">Submit Another Idea</Button>
            </div>
        );
    }

    // Default view: Submission form
    return (
        <div className="embedded-discussion-view">
            <h3>{discussionTitle || 'Contribute an Idea'}</h3>
            <form onSubmit={handleSubmit}>
                <Textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="Share your thoughts here..."
                    required
                    disabled={isSubmitting || !participationToken} // Also disable if token somehow missing
                    maxLength={500}
                    aria-label="Idea input text area"
                />
                <small>{idea.length}/500</small>
                <Button
                    type="submit"
                    disabled={isSubmitting || !participationToken || !idea.trim()} // Disable if no text
                    className="submit-button"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Submitting...
                        </>
                    ) : (
                        "Submit Idea"
                    )}
                </Button>
            </form>
        </div>
    );
}

export default EmbeddedDiscussionView;