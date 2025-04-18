export interface Cluster {
    id: string;
    representative_idea_id: string;
    representative_text: string;
    count: number;
    ideas: Idea[];
}

export interface ClusterResponse {
    data: Cluster[];
}