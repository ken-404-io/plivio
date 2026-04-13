import { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import api from '../services/api.ts';
import type { User, AuthContextValue, RegisterPayload, AuthTransition } from '../types/index.ts';

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'plivio_active_session';
const CHANNEL_NAME = 'plivio_session';
const DEVICE_KEY = 'plivio_did';

/** Returns a persistent device UUID stored in localStorage. */
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

interface AuthState {
  user:            User | null;
  loading:         boolean;
  transition:      AuthTransition;
  sessionConflict: boolean;
}

type AuthAction =
  | { type: 'SET_USER';            payload: User }
  | { type: 'CLEAR_USER' }
  | { type: 'SET_LOADING';         payload: boolean }
  | { type: 'SET_TRANSITION';      payload: AuthTransition }
  | { type: 'SET_SESSION_CONFLICT'; payload: boolean };

const initialState: AuthState = {
  user:            null,
  loading:         true,
  transition:      null,
  sessionConflict: false,
};

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_USER':            return { ...state, user: action.payload, loading: false };
    case 'CLEAR_USER':          return { ...state, user: null, loading: false };
    case 'SET_LOADING':         return { ...state, loading: action.payload };
    case 'SET_TRANSITION':      return { ...state, transition: action.payload };
    case 'SET_SESSION_CONFLICT': return { ...state, sessionConflict: action.payload };
    default:                    return state;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const userRef = useRef<User | null>(null);

  // Keep userRef in sync
  userRef.current = state.user;

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

  // ─── Session guard: 1 account per browser ─────────────────────────────
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;
    } catch {
      // BroadcastChannel not supported — fall through to storage events
    }

    // When another tab logs in with a different user
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type: string; userId?: string };
      if (data.type === 'SESSION_LOGIN' && userRef.current && data.userId !== userRef.current.id) {
        dispatch({ type: 'SET_SESSION_CONFLICT', payload: true });
      }
    };

    // Storage event fires in OTHER tabs when localStorage changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEY || !e.newValue || !userRef.current) return;
      try {
        const data = JSON.parse(e.newValue) as { userId: string };
        if (data.userId !== userRef.current.id) {
          dispatch({ type: 'SET_SESSION_CONFLICT', payload: true });
        }
      } catch { /* ignore */ }
    };

    if (channel) channel.onmessage = handleMessage;
    window.addEventListener('storage', handleStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Broadcast session when user changes
  useEffect(() => {
    if (state.user) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: state.user.id, ts: Date.now() }));
        channelRef.current?.postMessage({ type: 'SESSION_LOGIN', userId: state.user.id });
      } catch { /* ignore */ }
    }
  }, [state.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Check if another user is already active in this browser
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const { userId } = JSON.parse(stored) as { userId: string };
        // We'll know the actual user after login — check after
        void userId;
      }
    } catch { /* ignore */ }

    // NOTE: the "Logging in…" transition overlay is only dispatched AFTER
    // the server confirms the credentials are valid. Triggering it at the
    // start of the request made the overlay flash into view on every
    // validation / invalid-credential error, which looked like the user
    // was being logged in when they actually weren't.
    try {
      const { data } = await api.post<{ requires_2fa?: boolean }>('/auth/login', { email, password, device_id: getDeviceId() });
      if (data.requires_2fa) {
        // Don't animate — user still needs to enter their 2FA code
        return { requires_2fa: true, is_admin: false };
      }

      dispatch({ type: 'SET_TRANSITION', payload: 'logging-in' });

      const user = await fetchMe();

      // Broadcast to other tabs
      const userId = user?.id;
      if (userId) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, ts: Date.now() }));
        channelRef.current?.postMessage({ type: 'SESSION_LOGIN', userId });
      }

      // Keep transition visible briefly for animation effect
      await new Promise((r) => setTimeout(r, 800));
      dispatch({ type: 'SET_TRANSITION', payload: null });
      return { requires_2fa: false, is_admin: user?.is_admin ?? false };
    } catch (err) {
      // Make sure the overlay never lingers if something throws after the
      // transition was dispatched (e.g. fetchMe failing post-login).
      dispatch({ type: 'SET_TRANSITION', payload: null });
      throw err;
    }
  }, [fetchMe]);

  const verify2FA = useCallback(async (token: string) => {
    // Same pattern as login: only animate the overlay once the server has
    // accepted the code — avoids a misleading flash when the 2FA check
    // rejects the entered value.
    try {
      await api.post('/auth/2fa/verify-login', { token });

      dispatch({ type: 'SET_TRANSITION', payload: 'logging-in' });

      const user = await fetchMe();

      if (user?.id) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, ts: Date.now() }));
        channelRef.current?.postMessage({ type: 'SESSION_LOGIN', userId: user.id });
      }

      await new Promise((r) => setTimeout(r, 800));
      dispatch({ type: 'SET_TRANSITION', payload: null });
      return { is_admin: user?.is_admin ?? false };
    } catch (err) {
      dispatch({ type: 'SET_TRANSITION', payload: null });
      throw err;
    }
  }, [fetchMe]);

  const register = useCallback(async (payload: RegisterPayload) => {
    // Manual sign-ups do NOT auto-login. The backend creates the account
    // and sends a verification email; the caller is expected to show a
    // "check your email" screen and the user only gets a session after
    // clicking the verification link.
    const { data } = await api.post<{
      success: boolean;
      requires_email_verification?: boolean;
      email?: string;
      message?: string;
    }>('/auth/register', payload);
    return {
      requires_email_verification: Boolean(data.requires_email_verification),
      email: data.email ?? payload.email,
    };
  }, []);

  const logout = useCallback(async () => {
    dispatch({ type: 'SET_TRANSITION', payload: 'logging-out' });
    try {
      await api.post('/auth/logout');
    } catch { /* ignore */ }
    // Brief animation delay
    await new Promise((r) => setTimeout(r, 800));
    try {
      localStorage.removeItem(SESSION_KEY);
      channelRef.current?.postMessage({ type: 'SESSION_LOGOUT' });
    } catch { /* ignore */ }
    dispatch({ type: 'CLEAR_USER' });
    dispatch({ type: 'SET_TRANSITION', payload: null });
    dispatch({ type: 'SET_SESSION_CONFLICT', payload: false });
  }, []);

  const dismissSessionConflict = useCallback(() => {
    dispatch({ type: 'SET_SESSION_CONFLICT', payload: false });
    // Force logout since cookies are now for the other user
    dispatch({ type: 'CLEAR_USER' });
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
  }, []);

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      verify2FA,
      register,
      logout,
      fetchMe,
      dismissSessionConflict,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
