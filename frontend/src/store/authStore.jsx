import { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);

const initialState = {
  user:    null,
  loading: true, // true while fetching /users/me on mount
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER':    return { ...state, user: action.payload, loading: false };
    case 'CLEAR_USER':  return { ...state, user: null,           loading: false };
    case 'SET_LOADING': return { ...state, loading: action.payload };
    default:            return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/users/me');
      dispatch({ type: 'SET_USER', payload: data.user });
    } catch {
      dispatch({ type: 'CLEAR_USER' });
    }
  }, []);

  // Initialise CSRF cookie then restore session on mount
  useEffect(() => {
    api.get('/auth/csrf').finally(() => fetchMe());
  }, [fetchMe]);

  // Listen for token-expiry events fired by the axios interceptor
  useEffect(() => {
    const handler = () => dispatch({ type: 'CLEAR_USER' });
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.requires_2fa) return { requires_2fa: true };
    await fetchMe();
    return { requires_2fa: false };
  }, [fetchMe]);

  const verify2FA = useCallback(async (token) => {
    await api.post('/auth/2fa/verify-login', { token });
    await fetchMe();
  }, [fetchMe]);

  const register = useCallback(async (payload) => {
    await api.post('/auth/register', payload);
    await fetchMe();
  }, [fetchMe]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    dispatch({ type: 'CLEAR_USER' });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, verify2FA, register, logout, fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
