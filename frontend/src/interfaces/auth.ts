import { AuthStatus } from '../enums/AuthStatus';
import { User } from '../interfaces/user';
import { ReactNode } from "react";

/**
 * Shape of authentication context value provided throughout the application
 */
export interface AuthContextType {
    user: User | null;
    authStatus: AuthStatus;
    login: (email: string, password: string) => Promise<User | null>;
    logout: () => Promise<void>;
    checkAuthStatus: () => Promise<User | null>;
    isLoading: boolean;
    isAuthenticated: boolean;
}
export interface AuthProviderProps {
    children: ReactNode;
}