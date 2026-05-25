'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, clearTokens, getRefreshToken, setTokens } from '@/lib/api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  household_id: string | null;
  role: 'owner' | 'member';
  photo_url: string | null;
  fcm_token: string | null;
  created_at: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Swap in new tokens (e.g. after joining a household) and refresh the user profile. */
  updateAuth: (accessToken: string, refreshToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rt = getRefreshToken();
    if (!rt) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.post<{ accessToken: string }>('/auth/refresh', { refreshToken: rt });
      // Store the refreshed access token (refresh endpoint only returns a new access token)
      setTokens(data.accessToken, rt);
      const me = await api.get<AuthUser>('/users/me');
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ accessToken: string; refreshToken: string }>(
      '/auth/login',
      { email, password },
    );
    setTokens(data.accessToken, data.refreshToken);
    const me = await api.get<AuthUser>('/users/me');
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    const rt = getRefreshToken();
    if (rt) {
      try { await api.post('/auth/logout', { refreshToken: rt }); } catch { /* best-effort */ }
    }
    clearTokens();
    setUser(null);
  }, []);

  /** Used after joining a household mid-session to swap in new tokens + refresh profile. */
  const updateAuth = useCallback(async (accessToken: string, refreshToken: string) => {
    setTokens(accessToken, refreshToken);
    const me = await api.get<AuthUser>('/users/me');
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, updateAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
