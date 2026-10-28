// The one place the frontend talks HTTP. Components use the typed functions in
// ./endpoints; nothing else calls fetch() for API data.

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfter?: number

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

let csrfToken: string | null = null

/** Set from /api/auth/me. Sent on every state-changing request. */
export function setCsrfToken(token: string | null) {
  csrfToken = token
}

type Unauthorized = () => void
let onUnauthorized: Unauthorized | null = null

/** Lets the auth provider react when the server says the session is gone. */
export function setUnauthorizedHandler(fn: Unauthorized | null) {
  onUnauthorized = fn
}

export interface RequestOptions {
  body?: unknown
  signal?: AbortSignal
  query?: Record<string, string | number | undefined | null>
}

export async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
  const qs = opts.query
    ? new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : ''
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken

  let res: Response
  try {
    res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network', 'Can’t reach the BKMK.exe server. Check your connection.')
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new ApiError(res.status, 'invalid_response', 'The server sent an unexpected response.')
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as { code?: string; message?: string; retryAfter?: number }
    if (res.status === 401) onUnauthorized?.()
    throw new ApiError(res.status, body.code ?? `http_${res.status}`, body.message ?? 'Request failed.', body.retryAfter)
  }
  return data as T
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code)
}
