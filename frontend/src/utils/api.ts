// File: src/utils/api.js
import axios, { AxiosInstance } from 'axios';

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL||'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json'
  }
});

export default api;
