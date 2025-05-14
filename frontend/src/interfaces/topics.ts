import { Idea } from "./ideas";
export interface Topic {
    id: string;
    representative_idea_id: string;
    representative_text: string;
    count: number;
    ideas: Idea[];
}

export interface TopicResponse {
    data: Topic[];
}

export interface TopicsResponse {
    topics: Topic[];
    unclustered_count: number;
}
