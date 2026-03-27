import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL:         BASE_URL,
  withCredentials: true, // send/receive HttpOnly cookies
  headers: { 'Content-Type': 'application/json' },
});

/** Reads the CSRF token set by the backend from a non-HttpOnly cookie. */
function readCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Attach CSRF token to all mutating requests
api.interceptors.request.use((config) => {
  const mutating = ['post', 'put', 'patch', 'delete'];
  if (mutating.includes(config.method?.toLowerCase())) {
    const token = readCsrfToken();
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

let isRefreshing = false;
let failedQueue  = [];

function flushQueue(error) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()));
  failedQueue = [];
}

// Silently refresh access token on 401, then retry the original request
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(original))
          .catch((e) => Promise.reject(e));
      }

      original._retry  = true;
      isRefreshing     = true;

      try {
        await api.post('/auth/refresh');
        flushQueue(null);
        return api(original);
      } catch (refreshErr) {
        flushQueue(refreshErr);
        // Clear stale state and redirect to login
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
