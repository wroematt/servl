const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Token store (memory + localStorage) ──────────────────────────────────────

let accessToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  if (typeof window !== 'undefined') {
    localStorage.setItem('servl_refresh', refresh);
  }
}

export function clearTokens() {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('servl_refresh');
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('servl_refresh');
}

// ── Token refresh ─────────────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Set to true to send multipart/form-data (pass FormData as body) */
  multipart?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers: extraHeaders = {}, multipart } = opts;

  const makeHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { ...extraHeaders };
    if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
    if (!multipart && body !== undefined) h['Content-Type'] = 'application/json';
    return h;
  };

  const makeBody = () => {
    if (body === undefined) return undefined;
    if (multipart) return body as FormData;
    return JSON.stringify(body);
  };

  let res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: makeHeaders(),
    body: makeBody() as BodyInit | undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: makeHeaders(),
        body: makeBody() as BodyInit | undefined,
      });
    }
  }

  if (!res.ok) {
    let errBody: { code?: string; message?: string } = {};
    try { errBody = await res.json(); } catch { /* ignore */ }
    const err = new ApiError(
      errBody.message ?? res.statusText,
      res.status,
      errBody.code ?? 'UNKNOWN',
    );
    throw err;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Public API surface ────────────────────────────────────────────────────────

export const api = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return request<T>(path, { method: 'GET', headers });
  },
  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return request<T>(path, { method: 'POST', body, ...opts });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
};
