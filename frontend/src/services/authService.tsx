import api from '../utils/api'; 
import { User } from '../interfaces/user'; 
import { TokenResponse } from '../interfaces/auth'; 

// Interface matching the backend TokenResponse (excluding token itself)
interface LoginResponse {
    user_id: string;
    username: string;
}

const authService = {
    /**
     * Logs in a user using email (as username) and password.
     * Backend handles setting HttpOnly cookies.
     */
    login: async (email: string, password: string): Promise<LoginResponse> => {
        const params = new URLSearchParams();
        params.append('username', email); // Backend's OAuth2PasswordRequestForm expects 'username'
        params.append('password', password);

        try {
            // API call triggers the server to set the cookie
            const response = await api.post<LoginResponse>('/auth/login', params);
            return response.data;
        } catch (error) {
            console.error('AuthService Login Error:', error);
            throw error; 
        }
    },

    /**
     * Logs out the current user.
     * Backend handles clearing HttpOnly cookies.
     */
    logout: async (): Promise<{ message: string }> => {
        try {
            const response = await api.post<{ message: string }>('/auth/logout');
            console.log("Logout API call successful, cookies should be cleared.");
            // Optionally clear client-side non-HttpOnly cookies if needed (e.g., CSRF token as fallback)
            // Cookies.remove('csrftoken', { path: '/' });
            return response.data;
        } catch (error) {
            console.error('AuthService Logout Error:', error);
            throw error;
        }
    },

    /**
     * Registers a new user.
     */
    register: async (userData): Promise<{ message: string }> => {
        try {
            const response = await api.post<{ message: string }>('/auth/register', userData);
            return response.data;
        } catch (error) {
            console.error('AuthService Register Error:', error);
            throw error;
        }
    },

    /**
     * Fetches the current authenticated user's data using the HttpOnly cookie.
     */
    getCurrentUser: async (): Promise<User> => {
        try {
            const response = await api.get<User>('/auth/me');
            return response.data; 
        } catch (error) {
            console.error('AuthService getCurrentUser Error:', error);
            throw error;
        }
    },

    /**
     * Verifies a user's email using the provided code.
     */
    verifyEmail: async (email: string, code: string): Promise<{ message: string }> => {
        try {
            const response = await api.post<{ message: string }>(`/auth/verify?email=${encodeURIComponent(email)}`, { code });
            return response.data;
        } catch (error) {
            console.error('AuthService verifyEmail Error:', error);
            throw error;
        }
    },

    /**
     * Requests a password reset email to be sent.
     */
    forgotPassword: async (email: string): Promise<{ message: string }> => {
        try {
            const response = await api.post<{ message: string }>('/auth/forgot-password', { email });
            return response.data; 
        } catch (error) {
            console.error('AuthService forgotPassword Error:', error);
            throw error;
        }
    },

    /**
     * Resets the password using a token.
     */
    resetPassword: async (resetData): Promise<{ message: string }> => {
        try {
            const response = await api.post<{ message: string }>('/auth/reset-password', resetData);
            return response.data;
        } catch (error) {
            console.error('AuthService resetPassword Error:', error);
            throw error;
        }
    },

    /**
     * Updates the current user's profile.
     */
    updateProfile: async (profileData): Promise<User> => {
        try {
            const response = await api.put<User>('/auth/profile', profileData);
            return response.data;
        } catch (error) {
            console.error('AuthService updateProfile Error:', error);
            throw error;
        }
    },

    // Add other auth-related API calls here (e.g., resend verification)
    resendVerification: async (email: string): Promise<{ message: string }> => {
        try {
            const response = await api.post<{ message: string }>('/auth/resend-verification', { email });
            return response.data; 
        } catch (error) {
            console.error('AuthService resendVerification Error:', error);
            throw error;
        }
    }

};

export default authService;