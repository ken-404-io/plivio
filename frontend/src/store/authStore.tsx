import { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import api from '../services/api.ts';
import type { User, AuthContextValue, RegisterPayload } from '../types/index.ts';

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthState {
  user:    User | null;
  loading: boolean;
}

type AuthAction =
  | { type: 'SET_USER';    payload: User }
  | { type: 'CLEAR_USER' }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: AuthState = {
  user:    null,
  loading: true,
};

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_USER':    return { ...state, user: action.payload, loading: false };
    case 'CLEAR_USER':  return { ...state, user: null,           loading: false };
    case 'SET_LOADING': return { ...state, loading: action.payload };
    default:            return state;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchMe = useCallback(async (): Promise<User | null> => {
    try {
      const { data } = await api.get<{ user: User }>('/users/me');
      dispatch({ type: 'SET_USER', payload: data.user });
      return data.user;
    } catch {
      dispatch({ type: 'CLEAR_USER' });
      return null;
    }
  }, []);

  // Initialise CSRF cookie then restore session on mount
  useEffect(() => {
    api.get('/auth/csrf').finally(() => fetchMe());
  }, [fetchMe]);

  useEffect(() => {
    const handler = () => dispatch({ type: 'CLEAR_USER' });
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ requires_2fa?: boolean }>('/auth/login', { email, password });
    if (data.requires_2fa) return { requires_2fa: true, is_admin: false };
    const user = await fetchMe();
    return { requires_2fa: false, is_admin: user?.is_admin ?? false };
  }, [fetchMe]);

  const verify2FA = useCallback(async (token: string) => {
    await api.post('/auth/2fa/verify-login', { token });
    const user = await fetchMe();
    return { is_admin: user?.is_admin ?? false };
  }, [fetchMe]);

  const register = useCallback(async (payload: RegisterPayload) => {
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
