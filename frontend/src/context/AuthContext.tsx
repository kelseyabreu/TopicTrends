import React, { createContext, useState, useEffect, useContext, useCallback, ReactNode, useMemo } from 'react';
import authService from '../services/authService';
import { AuthStatus } from '../enums/AuthStatus';
import { User } from '../interfaces/user';
import { AuthContextType, AuthProviderProps } from '../interfaces/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);



/**
 * Provides authentication state and actions to components throughout the application.
 * Handles login, logout, and session validation using HTTP-only cookies for security.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.Loading);

    // Computed properties for easier component usage
    const isLoading = authStatus === AuthStatus.Loading;
    const isAuthenticated = authStatus === AuthStatus.Authenticated;

    /**
     * Fetches current user and updates authentication status.
     * Returns the user object if authenticated, null otherwise.
     */
    const checkAuthStatus = useCallback(async (): Promise<User | null> => {
        setAuthStatus(AuthStatus.Loading);

        try {
            const currentUser = await authService.getCurrentUser();

            if (currentUser) {
                setUser(currentUser);
                setAuthStatus(AuthStatus.Authenticated);
                console.debug('Auth check: Authenticated as', currentUser.username);
                return currentUser;
            } else {
                setUser(null);
                setAuthStatus(AuthStatus.Unauthenticated);
                console.debug('Auth check: Not authenticated (no user data)');
                return null;
            }
        } catch (error) {
            // If /me fails (e.g., 401), user is not authenticated
            console.debug('Auth check: Not authenticated', error instanceof Error ? error.message : String(error));
            setUser(null);
            setAuthStatus(AuthStatus.Unauthenticated);
            return null;
        }
    }, []);

    // Initialize authentication check on mount
    useEffect(() => {
        console.debug("AuthProvider: Initial auth check running");
        checkAuthStatus();
    }, [checkAuthStatus]);

    /**
     * Logs in user and refreshes authentication status.
     * Returns the authenticated user on success or null on failure.
     */
    const login = useCallback(async (email: string, password: string): Promise<User | null> => {
        setAuthStatus(AuthStatus.Loading);

        try {
            // Login service handles the API call which sets cookies
            await authService.login(email, password);

            // After successful login, fetch user data
            const user = await checkAuthStatus();
            return user;
        } catch (error) {
            console.error('Login failed:', error instanceof Error ? error.message : String(error));
            setUser(null);
            setAuthStatus(AuthStatus.Unauthenticated);
            throw error; 
        }
    }, [checkAuthStatus]);

    /**
     * Logs out user and clears authentication state.
     * Uses a finally block to ensure UI state is always updated,
     * but verifies with the server if logout was successful.
     */
    const logout = useCallback(async (): Promise<void> => {
        setAuthStatus(AuthStatus.Loading);
        let logoutSuccessful = false;

        try {
            await authService.logout(); 
            logoutSuccessful = true;
        } catch (error) {
            console.error('Logout API call failed:', error instanceof Error ? error.message : String(error));
            throw error;
        } finally {
            // Always clear local state for predictable UI behavior
            setUser(null);

            // If logout API failed, verify the auth state with the server
            // This prevents UI state from getting out of sync with server state
            if (!logoutSuccessful) {
                checkAuthStatus();
            } else {
                setAuthStatus(AuthStatus.Unauthenticated);
            }
        }
    }, [checkAuthStatus]);

    // Memoize context value to avoid unnecessary re-renders
    const value = useMemo(
        () => ({
            user,
            authStatus,
            login,
            logout,
            checkAuthStatus,
            isLoading,
            isAuthenticated
        }),
        [user, authStatus, login, logout, checkAuthStatus, isLoading, isAuthenticated]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to access authentication context from any component.
 * @throws Error if used outside of AuthProvider
 */
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
