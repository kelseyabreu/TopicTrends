export interface InteractionState {
    metrics: {
        view_count: number;
        unique_view_count: number;
        like_count: number;
        pin_count: number;
        save_count: number;
        last_activity_at?: string;
    };
    user_state: {
        liked: boolean;
        pinned: boolean;
        saved: boolean;
        view_count: number;
        first_viewed_at?: string;
        last_viewed_at?: string;
    };
    can_like: boolean;
    can_pin: boolean;
    can_save: boolean;
}

export interface Interaction {
    id: string;
    user_id: string;
    entity_id: string;
    entity_type: "discussion" | "topic" | "idea";
    action_type: "like" | "unlike" | "pin" | "unpin" | "save" | "unsave" | "view";
    timestamp: string;
    parent_id: string | null;
    displaytext: string;
}