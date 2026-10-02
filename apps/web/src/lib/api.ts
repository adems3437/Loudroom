import { apiErrorSchema, CSRF_HEADER, type ApiError } from '@loudroom/shared';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

/** Waits before repeating a GET that was rate limited (429). */
const GET_RETRY_DELAYS_MS = [500, 1_000, 2_000];

const NETWORK_ERROR: ApiError = { code: 'INTERNAL_ERROR', message: 'No response from the server' };

/** Any zod schema (the web app does not depend on zod directly). */
interface Schema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
}

export interface ApiRequest<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  json?: unknown;
  form?: FormData;
  /** Validates the success body; omitted for empty (204) answers. */
  schema?: Schema<T>;
  csrfToken?: string | null;
}

/**
 * Calls the REST API on the page's own origin (Next forwards /api to the server). The admin
 * session cookie travels by itself; unsafe requests add the CSRF token.
 */
export async function apiRequest<T = undefined>(
  path: string,
  { method = 'GET', json, form, schema, csrfToken }: ApiRequest<T> = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET' && csrfToken) headers[CSRF_HEADER] = csrfToken;
  let body: string | FormData | null = null;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  let response: Response;
  try {
    response = await fetch(path, { method, headers, body, credentials: 'same-origin' });
    // Reads are safe to repeat: wait out a short burst over the rate limit (the bucket refills
    // within seconds) instead of showing an error or a logged-out panel.
    for (const delay of method === 'GET' ? GET_RETRY_DELAYS_MS : []) {
      if (response.status !== 429) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      response = await fetch(path, { method, headers, credentials: 'same-origin' });
    }
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  const text = await response.text();
  let parsedBody: unknown;
  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = null;
  }
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(parsedBody);
    return {
      ok: false,
      status: response.status,
      error: error.success ? error.data : { code: 'INTERNAL_ERROR', message: response.statusText },
    };
  }
  if (!schema) return { ok: true, data: undefined as T };
  const data = schema.safeParse(parsedBody);
  return data.success
    ? { ok: true, data: data.data }
    : { ok: false, status: 0, error: NETWORK_ERROR };
}
