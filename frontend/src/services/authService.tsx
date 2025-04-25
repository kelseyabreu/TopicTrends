import { api } from '../utils/api';

// Token management functions
const TOKEN_KEY = 'token';
const USER_KEY = 'user';

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
const removeToken = () => localStorage.removeItem(TOKEN_KEY);

const getUser = () => {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
};
const setUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));
const removeUser = () => localStorage.removeItem(USER_KEY);

const authService = {
    // Register new user
    register: async (userData) => {
        const response = await api.post('/auth/register', userData);
        return response.data;
    },

    // Login user
    login: async (email: string, password: string) => {
        const formData = new FormData();
        formData.append('username', email); // OAuth2 expects 'username'
        formData.append('password', password);

        const response = await api.post('/auth/login', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        // Save token and user data
        setToken(response.data.access_token);
        setUser({
            id: response.data.user_id,
            username: response.data.username,
        });

        return response.data;
    },

    // Verify email
    verifyEmail: async (email: string, code: string) => {
        const response = await api.post(`/auth/verify?email=${encodeURIComponent(email)}`, { code });
        return response.data;
    },

    // Resend verification email
    resendVerification: async (email: string) => {
        // Use encodeURIComponent for safety in query params
        const response = await api.post(`/auth/resend-verification?email=${encodeURIComponent(email)}`);
        return response.data;
    },

    // Get current user
    getCurrentUser: async () => {
        try {
            const response = await api.get('/auth/me');
            return response.data;
        } catch (error) {
            // The global interceptor in api.ts already logs 401 errors.
            // Specific handling like auto-logout could be added here if needed.
            if (error?.response?.status === 401) {
                console.warn("Attempted to get user with invalid/expired token.");
                // Consider calling logout() here if auto-logout on 401 is desired
                // authService.logout();
            }
            throw error;
        }
    },

    // Update user profile
    updateProfile: async (profileData) => {
        const response = await api.put('/auth/profile', profileData);
        // Fetch fresh user data after update and store it locally
        const updatedUserData = await authService.getCurrentUser();
        if (updatedUserData) {
            setUser(updatedUserData);
        }
        return response.data;
    },

    // Logout user
    logout: () => {
        removeToken();
        removeUser();
        // Consider navigating the user after logout if needed
    },

    // Check if user is logged in
    isLoggedIn: () => {
        return !!getToken();
    },

    // Get user from local storage
    getUser,
};

export default authService;