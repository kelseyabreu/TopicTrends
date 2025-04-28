import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import api from "../utils/api";
import { Idea } from "../interfaces/ideas";
import "../styles/IdeaView.css";

function IdeaView() {
    const { ideaId } = useParams();
    const navigate = useNavigate();
    const [idea, setIdea] = useState<Idea | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchIdea = async () => {
            try {
                const response = await api.get(`/ideas/${ideaId}`);
                setIdea(response.data);
            } catch (error) {
                console.error('Error fetching idea:', error);
                toast.error('Failed to load idea details');
                navigate('/');
            } finally {
                setIsLoading(false);
            }
        };

        if (ideaId) {
            fetchIdea();
        }
    }, [ideaId, navigate]);

    if (isLoading) {
        return (
            <div className="idea-view-container loading">
                <div className="loader"></div>
                <p>Loading idea details...</p>
            </div>
        );
    }

    if (!idea) {
        return (
            <div className="idea-view-container error">
                <h2>Error</h2>
                <p>Could not load idea details.</p>
                <button onClick={() => navigate('/')}>Return Home</button>
            </div>
        );
    }

    return (
        <div className="idea-view-container">
            <button className="back-button" onClick={() => navigate(-1)}>
                &larr; Back
            </button>
            <div className="idea-content">
                <pre>Follows Topic: {idea?.on_topic}</pre>
                <pre>Sentiment: {idea?.sentiment}</pre>
                <pre>Intent: {idea?.intent}</pre>
                <pre>Specificity: {idea?.specificity}</pre>

                <p className="idea-text">{idea.text}</p>
                <div className="idea-meta">
                {idea?.related_topics?.length > 0 && (
                        <div className="related-topics">
                        {idea.related_topics.map((topic) => (
                            <Badge key={topic} variant="neutral" className="mr-2">
                            {topic}
                            </Badge>
                        ))}
                        </div>
                    )}
                </div>
                <div className="idea-meta">
                {idea?.keywords?.length > 0 && (
                        <div className="keywords">
                        {idea.keywords.map((word) => (
                            <Badge key={word} className="mr-2">
                            {word}
                            </Badge>
                        ))}
                        </div>
                    )}
                </div>
                <div className="idea-meta">
                    <span className="idea-verification">
                        {idea.verified ? (
                            <span className="verification-badge">✓ Verified</span>
                        ) : (
                            <span className="anonymous-badge">Anonymous</span>
                        )}
                    </span>
                    <span className="idea-timestamp">
                        {new Date(idea.timestamp).toLocaleString()}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default IdeaView;