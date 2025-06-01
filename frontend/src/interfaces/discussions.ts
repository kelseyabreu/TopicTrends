export interface Discussion {
    idea_count: number;
    require_verification: boolean;
    join_link: string | null;
    qr_code: string | null;
    id: string;
    title: string;
    prompt: string;
    creator_id?: string | null;
    created_at: string;
    last_activity?: string | null;
    topic_count: number;
}