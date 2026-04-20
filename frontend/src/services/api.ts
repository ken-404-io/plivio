import axios, { type InternalAxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL:         BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// In-memory CSRF token — populated from response headers
let csrfToken: string | null = null;

function readCsrfToken(): string | null {
  // Prefer in-memory token (set from response header)
  if (csrfToken) return csrfToken;
  // Fallback: try cookie (works when frontend and API share the same domain)
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const mutating = ['post', 'put', 'patch', 'delete'];
  if (mutating.includes(config.method?.toLowerCase() ?? '')) {
    const token = readCsrfToken();
    if (token) config.headers['X-CSRF-Token'] = token;
  }

  // FormData uploads: strip the default application/json Content-Type so
  // axios / the browser can set it to multipart/form-data with a proper
  // boundary. If we leave the JSON default in place (or set the header to
  // the literal string 'multipart/form-data' without a boundary), the
  // multipart body is misparsed on the server and no file ever reaches
  // multer — this is why avatar / KYC uploads were silently failing.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete (config.headers as Record<string, unknown>)['content-type'];
    }
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
  (res) => {
    // Capture CSRF token from any response header
    const token = res.headers['x-csrf-token'];
    if (token) csrfToken = token;
    return res;
  },
  async (error) => {
    // Capture CSRF token even from error responses
    const token = error.response?.headers?.['x-csrf-token'];
    if (token) csrfToken = token;

    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Never attempt token refresh for auth endpoints — login returns 401 for
    // invalid credentials, and refresh returns 401 when there is no session.
    // Retrying these would deadlock the interceptor (isRefreshing stays true
    // while the queued refresh request waits for itself to finish).
    const url = original.url ?? '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/register');

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
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
        // Only force logout when the refresh endpoint explicitly told us the
        // session is gone (401/403). Transient failures — network down,
        // 5xx, CORS hiccup, timeout — must NOT log the user out, otherwise
        // a momentary connectivity blip while returning to a backgrounded
        // tab kicks them to the login page.
        const refreshStatus = (refreshErr as { response?: { status?: number } })?.response?.status;
        if (refreshStatus === 401 || refreshStatus === 403) {
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
