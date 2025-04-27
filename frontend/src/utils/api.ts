import axios, { AxiosInstance, AxiosHeaders, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

interface ApiClientOptions {
    basePath?: string;
    headers?: Record<string, string>;
    timeout?: number;
    getToken?: () => string | null | undefined;
}

const defaultGetToken = (): string | null => localStorage.getItem('token');

export const createApiClient = (options: ApiClientOptions = {}): AxiosInstance => {
    const {
        basePath = '/api',
        headers = {},
        timeout = 30000,
        getToken = defaultGetToken,
    } = options;

    const viteApiUrl = import.meta.env.VITE_API_URL;
    if (!viteApiUrl) {
        console.error("VITE_API_URL environment variable is not set.");
    }
    // Base URL combines the server address and the standard '/api' prefix (or override)
    const baseURL = `${viteApiUrl || ''}${basePath}`;

    const client = axios.create({
        baseURL,
        timeout,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...headers,
        },
    });

    // Request interceptor (Add Authorization header) 
    client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        const token = getToken();
        if (token) {
            config.headers = new AxiosHeaders();;
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    // Response interceptor (Error Handling)
    client.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error.response) {
                console.error(`API Error: ${error.response.status}`, error.response.data);
                if (error.response.status === 401) {
                    console.warn('Authentication Error (401)');
                }
            } else if (error.request) {
                console.error('Network Error:', error.message);
            } else {
                console.error('Request Setup Error:', error.message);
            }
            // Reject with backend error details if available, otherwise the Axios error object
            return Promise.reject(error.response?.data || error);
        }
    );

    return client;
};

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