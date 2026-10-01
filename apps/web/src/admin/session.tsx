'use client';

import { adminSessionSchema, type AdminSession, type AdminUser } from '@loudroom/shared';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, type ApiRequest, type ApiResult } from '@/lib/api';

type SessionState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'signedIn'; session: AdminSession };

interface AdminSessionContext {
  state: SessionState;
  /** Calls the API with the session's CSRF token; a 401 signs the panel out. */
  api: <T = undefined>(path: string, request?: ApiRequest<T>) => Promise<ApiResult<T>>;
  signedIn: (session: AdminSession) => void;
  logout: () => Promise<void>;
}

const Context = createContext<AdminSessionContext | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void apiRequest('/api/admin/auth/me', { schema: adminSessionSchema }).then((result) => {
      if (!active) return;
      setState(result.ok ? { status: 'signedIn', session: result.data } : { status: 'anonymous' });
    });
    return () => {
      active = false;
    };
  }, []);

  const csrfToken = state.status === 'signedIn' ? state.session.csrfToken : null;

  const api = useCallback(
    async <T,>(path: string, request: ApiRequest<T> = {}) => {
      const result = await apiRequest<T>(path, { ...request, csrfToken });
      if (!result.ok && result.status === 401) setState({ status: 'anonymous' });
      return result;
    },
    [csrfToken],
  );

  const signedIn = useCallback((session: AdminSession) => {
    setState({ status: 'signedIn', session });
  }, []);

  const logout = useCallback(async () => {
    await apiRequest('/api/admin/auth/logout', { method: 'POST', csrfToken });
    setState({ status: 'anonymous' });
  }, [csrfToken]);

  const value = useMemo(() => ({ state, api, signedIn, logout }), [state, api, signedIn, logout]);
  return <Context value={value}>{children}</Context>;
}

export function useAdminSession(): AdminSessionContext {
  const context = useContext(Context);
  if (!context) throw new Error('useAdminSession outside AdminSessionProvider');
  return context;
}

/** The signed-in user; sends anonymous visitors to the login page. */
export function useAdminUser(): AdminUser | null {
  const { state } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (state.status === 'anonymous') {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [state.status, router, pathname]);
  return state.status === 'signedIn' ? state.session.user : null;
}
