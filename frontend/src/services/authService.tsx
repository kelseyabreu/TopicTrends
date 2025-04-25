import axios from 'axios';

// Get API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Token management functions
const TOKEN_KEY = 'token';
const USER_KEY = 'user';

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
const removeToken = () => localStorage.removeItem(TOKEN_KEY);

const getUser = () => {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
};
const setUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));
const removeUser = () => localStorage.removeItem(USER_KEY);

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests if available
api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

const authService = {
    // Register new user
    register: async (userData) => {
        try {
            const response = await api.post('/auth/register', userData);
            return response.data;
        } catch (error) {
            throw error.response?.data || { message: 'Registration failed' };
        }
    },

    // Login user
    login: async (email, password) => {
        try {
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
        } catch (error) {
            throw error.response?.data || { message: 'Login failed' };
        }
    },

    // Verify email
    verifyEmail: async (email, code) => {
        try {
            const response = await api.post(`/auth/verify?email=${email}`, { code });
            return response.data;
        } catch (error) {
            throw error.response?.data || { message: 'Verification failed' };
        }
    },

    // Resend verification email
    resendVerification: async (email) => {
        try {
            const response = await api.post(`/auth/resend-verification?email=${email}`);
            return response.data;
        } catch (error) {
            throw error.response?.data || { message: 'Failed to resend verification email' };
        }
    },

    // Get current user
    getCurrentUser: async () => {
        try {
            const response = await api.get('/auth/me');
            return response.data;
        } catch (error) {
            throw error.response?.data || { message: 'Failed to get user information' };
        }
    },

    // Update user profile
    updateProfile: async (profileData) => {
        try {
            const response = await api.put('/auth/profile', profileData);
            return response.data;
        } catch (error) {
            throw error.response?.data || { message: 'Failed to update profile' };
        }
    },

    // Logout user
    logout: () => {
        removeToken();
        removeUser();
    },

    // Check if user is logged in
    isLoggedIn: () => {
        return !!getToken();
    },

    // Get user from local storage
    getUser,
};

export default authService;