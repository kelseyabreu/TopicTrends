export interface Idea {
    id: string;
    text: string;
    user_id: string;
    verified: boolean;
    timestamp: string;
    topic_id: string;
    related_topics: string[];
    keywords: string[];
    on_topic: number;
    sentiment:string;
    specificity:string;
    intent: string;
}