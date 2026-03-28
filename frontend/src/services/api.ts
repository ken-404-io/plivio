import axios, { type InternalAxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL:         BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const mutating = ['post', 'put', 'patch', 'delete'];
  if (mutating.includes(config.method?.toLowerCase() ?? '')) {
    const token = readCsrfToken();
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];

function flushQueue(error: unknown) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()));
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(original))
          .catch((e: unknown) => Promise.reject(e));
      }

      original._retry = true;
      isRefreshing    = true;

      try {
        await api.post('/auth/refresh');
        flushQueue(null);
        return api(original);
      } catch (refreshErr) {
        flushQueue(refreshErr);
        window.dispatchEvent(new CustomEvent('auth:expired'));
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
