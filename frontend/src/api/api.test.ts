import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request, setCsrfToken, setUnauthorizedHandler } from './client'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setCsrfToken(null)
  setUnauthorizedHandler(null)
})
afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('api client', () => {
  it('sends credentials and the CSRF token only on state-changing requests', async () => {
    setCsrfToken('tok')
    fetchMock.mockImplementation(async () => json(200, { ok: true }))
    await request('GET', '/api/x')
    await request('POST', '/api/y', { body: { a: 1 } })
    const [, getInit] = fetchMock.mock.calls[0]
    const [, postInit] = fetchMock.mock.calls[1]
    expect(getInit.credentials).toBe('include')
    expect(getInit.headers['X-CSRF-Token']).toBeUndefined()
    expect(postInit.headers['X-CSRF-Token']).toBe('tok')
    expect(postInit.body).toBe('{"a":1}')
  })

  it('drops empty query params', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await request('GET', '/api/bookmarks', { query: { q: '', topic: 'ai', limit: 30, author: undefined } })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bookmarks?topic=ai&limit=30')
  })

  it('normalises server errors into ApiError with code and message', async () => {
    fetchMock.mockResolvedValue(json(429, { code: 'scan_cooldown', message: 'Wait', retryAfter: 60 }))
    await expect(request('POST', '/api/scans')).rejects.toMatchObject({ status: 429, code: 'scan_cooldown', message: 'Wait', retryAfter: 60 })
  })

  it('notifies the auth layer on 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock.mockResolvedValue(json(401, { code: 'not_authenticated', message: 'Sign in' }))
    await expect(request('GET', '/api/dashboard')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('reports network failures as a typed error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(request('GET', '/api/auth/me')).rejects.toMatchObject({ status: 0, code: 'network' })
  })

  it('rejects non-JSON bodies', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(request('GET', '/api/x')).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
