import { Idea } from "./ideas";

export interface Topic {
    id: string;
    representative_idea_id: string;
    representative_text: string;
    count: number;
    ideas: Idea[];
}

// Legacy interfaces removed - now using standardized PaginatedTopics from pagination.ts
