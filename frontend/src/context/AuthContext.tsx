import React, { createContext, useState, useEffect, useContext, useCallback, ReactNode, useMemo } from 'react';
import authService from '../services/authService';
import { AuthStatus } from '../enums/AuthStatus';
import { User } from '../interfaces/user';

// Shape of authentication context value
interface AuthContextType {
    user: User | null;
    authStatus: AuthStatus;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

// Provides authentication state and actions to components.
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.Loading);

    //Fetches current user and updates authentication status.
    const checkAuthStatus = useCallback(async () => {
        setAuthStatus(AuthStatus.Loading);
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
            setAuthStatus(currentUser ? AuthStatus.Authenticated : AuthStatus.Unauthenticated);
        } catch (error) {
            console.error('Error checking auth status:', error);
            setUser(null);
            setAuthStatus(AuthStatus.Unauthenticated);
        }
    }, []);

    // Initialize authentication check on mount
    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    
    // Logs in user and refreshes authentication status.
    const login = useCallback(async (email: string, password: string) => {
        setAuthStatus(AuthStatus.Loading);
        try {
            await authService.login(email, password);
            await checkAuthStatus();
        } catch (error) {
            console.error('Login failed:', error);
            setUser(null);
            setAuthStatus(AuthStatus.Unauthenticated);
            throw error;
        }
    }, [checkAuthStatus]);

    
    // Logs out user and clears authentication state.
    const logout = useCallback(async () => {
        setAuthStatus(AuthStatus.Loading);
        try {
            await authService.logout();
        } catch (error) {
            console.error('Logout API call failed:', error);
        } finally {
            setUser(null);
            setAuthStatus(AuthStatus.Unauthenticated);
        }
    }, []);

    // Memoize context value to avoid unnecessary re-renders
    const value = useMemo(
        () => ({ user, authStatus, login, logout, checkAuthStatus }),
        [user, authStatus, login, logout, checkAuthStatus]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Hook to access authentication context.
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
