export interface User {
    id: string;
    email: string;
    username: string;
    first_name: string | null; 
    last_name: string | null;
    location: string | null;
    timezone: string | null; 
    created_at: string; 
    modified_at?: string | null; 
    is_active: boolean;
    is_verified: boolean;
}