import { api } from '../utils/api';

const authService = {
    // Register new user
    register: async (userData) => {
        const response = await api.post('/auth/register', userData);
        return response.data;
    },

    // Login user 
    login: async (email, password) => {
        const params = new URLSearchParams();
        params.append('username', email); // Backend's OAuth2PasswordRequestForm expects 'username'
        params.append('password', password);

        // API call triggers the server to set the cookie
        const response = await api.post('/auth/login', params);
        return response.data;
    },

    // Verify email
    verifyEmail: async (email, code) => {
        const response = await api.post(`/auth/verify?email=${encodeURIComponent(email)}`, { code });
        return response.data;
    },

    // Resend verification email
    resendVerification: async (email) => {
        // Use encodeURIComponent for safety in query params
        const response = await api.post(`/auth/resend-verification?email=${encodeURIComponent(email)}`);
        return response.data;
    },

    // Request password reset
    requestPasswordReset: async (email) => {
        const response = await api.post(`/auth/forgot-password?email=${encodeURIComponent(email)}`);
        return response.data;
    },

    // Reset password
    resetPassword: async (email, token, newPassword) => {
        const response = await api.post('/auth/reset-password', {
            email,
            token,
            password: newPassword
        });
        return response.data;
    },

    // Get current user 
    getCurrentUser: async () => {
        try {
            const response = await api.get('/auth/me');
            return response.data;
        } catch (error) {
            // Handle 401 Unauthorized (not logged in or expired cookie)
            if (error?.response?.status === 401) {
                console.info("getCurrentUser failed (401): User not authenticated.");
            } else {
                // Log other potential errors
                console.error("Error fetching current user:", error);
            }
            return null;
        }
    },

    // Update user profile
    updateProfile: async (profileData) => {
        const response = await api.put('/auth/profile', profileData);
        return response.data;
    },

    // Logout user - calls backend to clear the HTTP-only cookie
    logout: async () => {
        try {
            await api.post('/auth/logout');
        } catch (error) {
            console.error("Logout API call failed:", error);
            // Re-throw the error so the calling function knows the API call failed
            throw error;
        }
    },
};

export default authService;