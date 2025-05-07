import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie'; 

interface ApiClientOptions {
    basePath?: string;
    headers?: Record<string, string>;
    timeout?: number;
}

export const createApiClient = (options: ApiClientOptions = {}): AxiosInstance => {
    const {
        basePath = '/api',
        headers = {},
        timeout = 30000
    } = options;

    const viteApiUrl = import.meta.env.VITE_API_URL;
    if (!viteApiUrl) {
        console.error("VITE_API_URL environment variable is not set.");
    }
    // Base URL combines the server address and the standard '/api' prefix (or override)
    const baseURL = `${viteApiUrl || ''}${basePath}`;
    console.log(`API Base URL configured: ${baseURL}`);

    const client = axios.create({
        baseURL,
        timeout,
        headers: {
            //'Content-Type': 'application/json', 
            'Accept': 'application/json',
            ...headers,
        },
        withCredentials: true,
    });

    // Request interceptor for CSRF token
    client.interceptors.request.use(
        (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
            const method = config.method?.toLowerCase();
            if (['post', 'put', 'delete', 'patch'].includes(method || '')) {
                const csrfToken = Cookies.get('csrftoken');
                if (csrfToken) {
                    config.headers['X-CSRF-Token'] = csrfToken;
                    // console.debug('CSRF Token added to request header for:', config.url);
                } else {
                    // Only warn if it's not a login/register type path, which wouldn't have CSRF yet
                    if (!config.url?.includes('/auth/login') && !config.url?.includes('/auth/register')) {
                        console.warn('CSRF token cookie not found for state-changing request to:', config.url);
                    }
                }
            }

            // Do NOT add Participation Token globally here.
            // It should be added specifically for anonymous requests in components like DiscussionView/EmbeddedView.

            return config;
        },
        (error) => {
            console.error('API Request Interceptor Error:', error);
            return Promise.reject(error);
        }
    );


    // Global response error handler
    client.interceptors.response.use(
        (response) => response,
        (error) => {
            const status = error.response?.status;
            const errorData = error.response?.data;
            const requestUrl = error.config?.url;

            console.error(`API Error: ${status} on ${requestUrl}`, errorData || error.message);

            if (status === 401) {
                console.warn('Authentication Error (401) - Session likely expired or invalid credentials/token.');
                // Avoid global redirect, let components handle 401 based on context
                // For example, redirect to login only if not already on login page.
            } else if (status === 403) {
                console.warn('Permission Denied (403) - Possible CSRF failure or insufficient permissions.');
                // Could check errorData.detail for "CSRF" and potentially force refresh/logout?
            } else if (status === 429) {
                console.warn('Rate Limit Exceeded (429) - Too many requests.');
                // Can potentially show a global notification using react-toastify here
                // import { toast } from 'react-toastify';
                // toast.warn("You're doing that too fast! Please wait a moment.", { toastId: 'rate-limit-toast' });
            } else if (status >= 500) {
                console.error('Server Error (5xx) - An internal server error occurred.');
            }
            // Reject with backend error details if available, otherwise the Axios error object
            return Promise.reject(error.response?.data || error);
        }
    );

    return client;
};

// Create the main default client instance
export const api = createApiClient({});

// Export the base API URL if needed elsewhere (e.g., Socket.IO)
export const API_URL = import.meta.env.VITE_API_URL || '';

// Specialized clients can still be created if needed, inheriting the /api prefix by default
export const topicsApiClient = createApiClient({
    // basePath: '/api/topics', // Example: more specific path
    timeout: 60000
});

// Export types
export type { AxiosInstance, AxiosRequestConfig, ApiClientOptions };

// Default export can be the main 'api' client
export default api;