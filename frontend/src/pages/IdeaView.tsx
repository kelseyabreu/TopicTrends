import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "../utils/api";
import { Idea } from "../interfaces/ideas";
import RatingComponent from "../components/RatingComponent";
import { InteractionStateProvider, useInteractionState } from "../context/InteractionStateContext";
import { useAuth } from "../context/AuthContext";
import { AuthStatus } from "../enums/AuthStatus";
import "../styles/IdeaView.css";
import {
    Target, 
    Smile, 
    Meh, 
    Frown, 
    MessageSquare, 
    Lightbulb, 
    Megaphone, 
    Info, 
    AlertTriangle, 
    User, 
    Zap, 
    Eye,
    HelpCircle, 
    XCircle, 
    CheckCircle, 
    MinusCircle,
    Maximize, 
    Minimize,
    BadgeInfo,
    Ear,
    HandHelping,
    HeartHandshake,
    Angry,
    ConciergeBell,
    SearchX,
    Handshake,
    StarHalf,
    EyeOff, 
} from "lucide-react";

// Inner component that uses the interaction state context
function IdeaViewContent() {
    const { ideaId } = useParams();
    const navigate = useNavigate();
    const { loadBulkStates } = useInteractionState();
    const [idea, setIdea] = useState<Idea | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchIdea = async () => {
            try {
                await api.post(`/interaction/idea/${ideaId}/view`);
                const response = await api.get(`/ideas/${ideaId}`);
                setIdea(response.data);

                // Load interaction state for this idea
                if (ideaId) {
                    await loadBulkStates([{ type: 'idea', id: ideaId }]);
                }
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
        <Card className="idea-view-container loading">
            <CardContent className="flex flex-col items-center justify-center p-12">
                <div className="loader"></div>
                <p>Loading idea details...</p>
            </CardContent>
        </Card>
    );
}

if (!idea) {
    return (
        <Card className="idea-view-container error">
            <CardContent className="flex flex-col items-center justify-center p-12">
                <CardTitle>Error</CardTitle>
                <p>Could not load idea details.</p>
                <Button onClick={() => navigate('/')} className="mt-4">Return Home</Button>
            </CardContent>
        </Card>
    );
}

    // Helper function to get icon for sentiment
    const getSentimentIcon = (sentiment: string | undefined) => {
        switch (sentiment) {
            case 'positive':
                return <Smile className="h-4 w-4 text-green-600" />;
            case 'neutral':
                return <Meh className="h-4 w-4 text-yellow-600" />;
            case 'negative':
                return <Frown className="h-4 w-4 text-red-600" />;
            default:
                return null;
        }
    };

    // Helper function to get icon for intent
    const getIntentIcon = (intent: string | undefined) => {
        switch (intent) {
            case 'suggestion':
                return <Ear className="h-4 w-4" />
            case 'idea':
                return <Lightbulb className="h-4 w-4" />;
            case 'proposal':
                return <HandHelping className="h-4 w-4" />
            case 'advocacy':
                return <Megaphone className="h-4 w-4" />;
            case 'information':
                return <BadgeInfo  className="h-4 w-4"/>
            case 'clarification':
                return <Info className="h-4 w-4" />;
            case 'problem_identification':
                return <SearchX className="h-4 w-4"/>
            case 'warning':
                return <AlertTriangle className="h-4 w-4 text-red-600" />;
            case 'personal_experience':
                return <User className="h-4 w-4" />;
            case 'call_to_action':
                return <Zap className="h-4 w-4 text-blue-600" />;
            case 'vision':
                return <Eye className="h-4 w-4" />;
            case 'request':
                return <ConciergeBell className="h-4 w-4" />
            case 'question':
                return <HelpCircle className="h-4 w-4" />;
            case 'complaint':
                return <Angry className="h-4 w-4" />;
            case 'criticism':
                return <StarHalf className="h-4 w-4"/>
            case 'disagreement':
                return <XCircle className="h-4 w-4 text-red-600" />;
            case 'praise':
                return <HeartHandshake className="h-4 w-4" />
            case 'agreement':
                return <Handshake />
            case 'defense':
                return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'unclear':
                return <EyeOff className="h-4 w-4"/>
            case 'off_topic':
                return <MinusCircle className="h-4 w-4 text-gray-500" />;
            default:
                return <MessageSquare className="h-4 w-4 text-gray-500" />;
        }
    };

    // Helper function to get icon for specificity
    const getSpecificityIcon = (specificity: string | undefined) => {
        switch (specificity) {
            case 'broad':
                return <Maximize className="h-4 w-4" />;
            case 'specific':
                return <Minimize className="h-4 w-4" />;
            default:
                return null;
        }
    };

    // Helper function to get icon for on_topic (assuming float > 0.5 is on topic)
    const getOnTopicIcon = (onTopic: number | undefined) => {
        if (onTopic !== undefined && onTopic > 0.5) {
            return <Target className="h-4 w-4 text-green-600" />;
        } else if (onTopic !== undefined && onTopic <= 0.5) {
             return <MinusCircle className="h-4 w-4 text-red-600" />;
        }
        return null;
    };

return (
    <Card className="idea-view-container">
        <CardHeader style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(0, 0, 0, 0.06)', background: 'rgba(248, 250, 252, 0.8)', backdropFilter: 'blur(10px)' }}>
            <Button onClick={() => navigate(-1)} className="back-button">
                &larr; Back
            </Button>
        </CardHeader>
        <CardContent className="idea-content">
            <div className="stats-row flex flex-wrap gap-4 mb-6">
                <div className="stat-box">
                    <div className="stat-title">On Topic</div>
                    <div className="stat-icon">{getOnTopicIcon(idea?.on_topic)}</div>
                    <div className="stat-value">{idea?.on_topic}</div>
                </div>
                <div className="stat-box">
                    <div className="stat-title">Sentiment</div>
                    <div className="stat-icon">{getSentimentIcon(idea?.sentiment)}</div>
                    <div className="stat-value">{idea?.sentiment}</div>
                </div>
                <div className="stat-box">
                    <div className="stat-title">Intent</div>
                    <div className="stat-icon">{getIntentIcon(idea?.intent)}</div>
                    <div className="stat-value">{idea?.intent}</div>
                </div>
                <div className="stat-box">
                    <div className="stat-title">Specificity</div>
                    <div className="stat-icon">{getSpecificityIcon(idea?.specificity)}</div>
                    <div className="stat-value">{idea?.specificity}</div>
                </div>
            </div>

            <p className="idea-text">"{idea.text}"</p>

            {/* Rating Section */}
            <div className="rating-section">
                <RatingComponent
                    ideaId={idea.id}
                    averageRating={idea.average_rating}
                    ratingCount={idea.rating_count || 0}
                    ratingDistribution={idea.rating_distribution}
                    showDistribution={true}
                    compact={false}
                    participationToken={null} // IdeaView requires authentication
                />
            </div>

            <div className="idea-meta text-gray-600 text-sm">
                {idea?.related_topics?.length > 0 && (
                    <div className="related-topics flex flex-wrap gap-2">
                        <h4>Related Topics</h4>
                        {idea.related_topics.map((topic) => (
                            <Badge key={topic}>
                                {topic}
                            </Badge>
                        ))}
                    </div>
                )}
                {idea?.keywords?.length > 0 && (
                    <div className="keywords flex flex-wrap gap-2">
                        <h4>Keywords</h4>
                        {idea.keywords.map((word) => (
                            <Badge key={word} variant="default">
                                {word}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </CardContent>
        <CardFooter className="idea-meta flex justify-between items-center pt-4 border-t border-gray-200 text-gray-600 text-sm">
            <span className="idea-verification">
                {idea.verified ? (
                    <Badge className="verification-badge border-green-500 text-green-600">✓ Verified</Badge>
                ) : (
                    <Badge className="anonymous-badge border-gray-400 text-gray-500">Anonymous</Badge>
                )}
            </span>
            <span className="idea-timestamp">
                {new Date(idea.timestamp).toLocaleString()}
            </span>
        </CardFooter>
    </Card>
);
}

// Main wrapper component that provides the interaction state context
function IdeaView() {
    const { authStatus } = useAuth();

    // IdeaView requires authentication, so no participation token needed
    const participationToken = authStatus === AuthStatus.Authenticated ? null : null;

    return (
        <InteractionStateProvider participationToken={participationToken}>
            <IdeaViewContent />
        </InteractionStateProvider>
    );
}

export default IdeaView;