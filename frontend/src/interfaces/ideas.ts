export interface Idea {
    submitter_display_id: string;
    id: string;
    text: string;
    user_id: string;
    verified: boolean;
    timestamp: string;
    topic_id: string | null;
    discussion_id: string;
    related_topics: string[];
    keywords: string[];
    on_topic: number;
    sentiment:string;
    specificity:string;
    intent: string;
    // Rating system fields
    average_rating?: number;
    rating_count: number;
    rating_distribution?: Record<string, number>;
}
export interface IdeaStats {
    intentCounts: Record<string, number>;
    sentimentCounts: Record<string, number>;
    clusterRate: number;
    totalIdeas: number;
    clusteredIdeas: number;
    discussionsCount: number;
}