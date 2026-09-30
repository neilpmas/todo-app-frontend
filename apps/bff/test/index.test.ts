import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { ExecutionContext } from '@cloudflare/workers-types'
import type { Client } from '@connectrpc/connect'
import { TodosService, TemplateService } from '@template/proto'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import worker from '../src/index'
import type { Env } from '../src'
import { getTodoClient } from '../src/lib/todoClient'
import { ConnectError, Code, createClient } from '@connectrpc/connect'

vi.mock('../src/lib/todoClient', () => ({
  getTodoClient: vi.fn(),
}))

vi.mock('../src/lib/transport', () => ({
  getTransport: vi.fn(),
}))

vi.mock('@connectrpc/connect', async () => {
  const actual = await vi.importActual<typeof import('@connectrpc/connect')>('@connectrpc/connect')
  return { ...actual, createClient: vi.fn() }
})

let discoveryFetches = 0

vi.stubGlobal('fetch', async (url: string) => {
  if (url.includes('.well-known/openid-configuration')) {
    discoveryFetches += 1
    return new Response(JSON.stringify({
      issuer: 'https://test.example.com',
      authorization_endpoint: 'https://test.auth0.com/authorize',
      token_endpoint: 'https://test.auth0.com/oauth/token',
      jwks_uri: 'https://test.auth0.com/.well-known/jwks.json',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response('', { status: 404 })
})

describe('BFF Worker', () => {
  const env = (globalThis as unknown as { env: Record<string, unknown> }).env || {}
  const TEST_ENV = {
    ...env,
    SESSION_KV: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    AUTH0_DOMAIN: 'test.example.com',
    AUTH0_CLIENT_ID: 'test-client-id',
    AUTH0_CLIENT_SECRET: 'test-client-secret',
    AUTH0_AUDIENCE: 'https://api.test.example.com',
    APP_BASE_URL: 'https://test.example.com',
    BACKEND_URL: 'https://backend.example.com',
  } as unknown as Env & { SESSION_KV: { get: Mock, put: Mock, delete: Mock } }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const setupSession = (sessionId: string, accessToken: string) => {
    vi.mocked(TEST_ENV.SESSION_KV.get).mockImplementation(async (key: string, type?: string) => {
      if (key === `session:${sessionId}`) {
        const session = {
          _type: 'session',
          accessToken,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          createdAt: Math.floor(Date.now() / 1000),
          user: { sub: 'user-123' },
        }
        return type === 'json' ? session : JSON.stringify(session)
      }
      return null
    })
  }

  it('redirects to login on /auth/login', async () => {
    const request = new Request('https://test.example.com/auth/login')
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext
    const response = await worker.fetch(request, TEST_ENV, ctx)

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toContain('auth0.com')
  })

  it('redirects on POST /auth/logout', async () => {
    const request = new Request('https://test.example.com/auth/logout', { method: 'POST' })
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext
    const response = await worker.fetch(request, TEST_ENV, ctx)

    expect(response.status).toBe(302)
  })

  it('returns 404 for GET /auth/logout (bezzie only registers it as POST)', async () => {
    const request = new Request('https://test.example.com/auth/logout')
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext
    const response = await worker.fetch(request, TEST_ENV, ctx)

    expect(response.status).toBe(404)
  })

  it('returns 401 for /api/me without session', async () => {
    const request = new Request('https://test.example.com/api/me')
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext
    const response = await worker.fetch(request, TEST_ENV, ctx)

    expect(response.status).toBe(401)
  })

  describe('CRUD /api/todos', () => {
    const sessionId = 'session-123'
    const accessToken = 'token-123'
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext

    beforeEach(() => {
      setupSession(sessionId, accessToken)
    })

    it('GET /api/todos returns todos', async () => {
      const mockTodos = [
        {
          id: '1',
          title: 'Test Todo',
          completedAt: timestampFromDate(new Date('2024-01-01')),
          createdAt: timestampFromDate(new Date('2024-01-01')),
        },
      ]
      const getTodos = vi.fn().mockResolvedValue({ todos: mockTodos })
      vi.mocked(getTodoClient).mockReturnValue({
        client: { getTodos } as unknown as Client<typeof TodosService>,
        options: { headers: { authorization: `Bearer ${accessToken}` } },
      })

      const request = new Request('https://test.example.com/api/todos', {
        headers: { Cookie: `__Host-session=${sessionId}` },
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      expect(response.status).toBe(200)
      const data = await response.json() as Array<{ title: string; completedAt: string }>
      expect(data).toHaveLength(1)
      expect(data[0].title).toBe('Test Todo')
      expect(data[0].completedAt).toBe(new Date('2024-01-01').toISOString())
      expect(getTodos).toHaveBeenCalled()
    })

    it('GET /api/todos does not leak the protobuf-es $typeName field', async () => {
      const mockTodos = [
        {
          $typeName: 'todos.v1.Todo',
          id: '1',
          userId: 'user-123',
          title: 'Test Todo',
          completedAt: undefined,
          createdAt: timestampFromDate(new Date('2024-01-01')),
        },
      ]
      const getTodos = vi.fn().mockResolvedValue({ todos: mockTodos })
      vi.mocked(getTodoClient).mockReturnValue({
        client: { getTodos } as unknown as Client<typeof TodosService>,
        options: { headers: { authorization: `Bearer ${accessToken}` } },
      })

      const request = new Request('https://test.example.com/api/todos', {
        headers: { Cookie: `__Host-session=${sessionId}` },
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      const data = await response.json() as Array<Record<string, unknown>>
      expect(data[0]).not.toHaveProperty('$typeName')
    })

    it('GET /api/todos returns 404 on NotFound error', async () => {
      const getTodos = vi.fn().mockRejectedValue(new ConnectError('Not found', Code.NotFound))
      vi.mocked(getTodoClient).mockReturnValue({
        client: { getTodos } as unknown as Client<typeof TodosService>,
        options: { headers: { authorization: `Bearer ${accessToken}` } },
      })

      const request = new Request('https://test.example.com/api/todos', {
        headers: { Cookie: `__Host-session=${sessionId}` },
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      expect(response.status).toBe(404)
    })

    it('GET /api/todos returns 401 on Unauthenticated error', async () => {
      const getTodos = vi.fn().mockRejectedValue(new ConnectError('Unauthenticated', Code.Unauthenticated))
      vi.mocked(getTodoClient).mockReturnValue({
        client: { getTodos } as unknown as Client<typeof TodosService>,
        options: { headers: { authorization: `Bearer ${accessToken}` } },
      })

      const request = new Request('https://test.example.com/api/todos', {
        headers: { Cookie: `__Host-session=${sessionId}` },
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      expect(response.status).toBe(401)
    })

    it('POST /api/todos creates a todo', async () => {
      const mockTodo = {
        id: '2',
        title: 'New Todo',
        createdAt: timestampFromDate(new Date('2024-01-02')),
      }
      const createTodo = vi.fn().mockResolvedValue(mockTodo)
      vi.mocked(getTodoClient).mockReturnValue({
        client: { createTodo } as unknown as Client<typeof TodosService>,
        options: { headers: { authorization: `Bearer ${accessToken}` } },
      })

      const request = new Request('https://test.example.com/api/todos', {
        method: 'POST',
        headers: {
          Cookie: `__Host-session=${sessionId}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'New Todo' }),
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      expect(response.status).toBe(201)
      const data = await response.json() as { title: string }
      expect(data.title).toBe('New Todo')
      expect(createTodo).toHaveBeenCalledWith({ title: 'New Todo' }, expect.anything())
    })

    it('POST /api/todos returns 400 if title is missing', async () => {
      const request = new Request('https://test.example.com/api/todos', {
        method: 'POST',
        headers: {
          Cookie: `__Host-session=${sessionId}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      expect(response.status).toBe(400)
    })

    it('PATCH /api/todos/:id completes a todo', async () => {
      const mockTodo = {
        id: '1',
        title: 'Updated Todo',
        completedAt: timestampFromDate(new Date('2024-01-03')),
      }
      const completeTodo = vi.fn().mockResolvedValue(mockTodo)
      vi.mocked(getTodoClient).mockReturnValue({
        client: { completeTodo } as unknown as Client<typeof TodosService>,
        options: { headers: { authorization: `Bearer ${accessToken}` } },
      })

      const request = new Request('https://test.example.com/api/todos/1', {
        method: 'PATCH',
        headers: { Cookie: `__Host-session=${sessionId}` },
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      expect(response.status).toBe(200)
      const data = await response.json() as { id: string; completedAt: string }
      expect(data.id).toBe('1')
      expect(data.completedAt).toBe(new Date('2024-01-03').toISOString())
      expect(completeTodo).toHaveBeenCalledWith({ id: '1' }, expect.anything())
    })

    it('DELETE /api/todos/:id deletes a todo', async () => {
      const deleteTodo = vi.fn().mockResolvedValue({ success: true })
      vi.mocked(getTodoClient).mockReturnValue({
        client: { deleteTodo } as unknown as Client<typeof TodosService>,
        options: { headers: { authorization: `Bearer ${accessToken}` } },
      })

      const request = new Request('https://test.example.com/api/todos/1', {
        method: 'DELETE',
        headers: { Cookie: `__Host-session=${sessionId}` },
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      expect(response.status).toBe(204)
      expect(deleteTodo).toHaveBeenCalledWith({ id: '1' }, expect.anything())
    })
  })

  describe('GET /api/info', () => {
    const sessionId = 'session-456'
    const accessToken = 'token-456'
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext

    beforeEach(() => {
      setupSession(sessionId, accessToken)
    })

    it('returns only version and environment, not the protobuf-es $typeName field', async () => {
      const getServerInfo = vi.fn().mockResolvedValue({
        $typeName: 'template.v1.GetServerInfoResponse',
        version: '1.2.3',
        environment: 'production',
      })
      vi.mocked(createClient).mockReturnValue({ getServerInfo } as unknown as Client<typeof TemplateService>)

      const request = new Request('https://test.example.com/api/info', {
        headers: { Cookie: `__Host-session=${sessionId}` },
      })
      const response = await worker.fetch(request, TEST_ENV, ctx)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ version: '1.2.3', environment: 'production' })
      expect(getServerInfo).toHaveBeenCalled()
    })
  })

  it('fetches Auth0 discovery once and reuses it across requests', async () => {
    // Every request runs cspContributions(), which reads OIDC discovery. The auth
    // instance (and its cache) is built once per isolate, so all the requests made
    // by this file's tests -- dozens by now -- share a single discovery fetch.
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
    for (let i = 0; i < 5; i++) {
      await worker.fetch(new Request('https://test.example.com/api/me'), TEST_ENV, ctx)
    }

    expect(discoveryFetches).toBe(1)
  })

  describe('/api/* rate limiting', () => {
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext

    const getMe = (sessionId?: string, headers: Record<string, string> = {}) =>
      worker.fetch(
        new Request('https://test.example.com/api/me', {
          headers: { ...(sessionId ? { Cookie: `__Host-session=${sessionId}` } : {}), ...headers },
        }),
        TEST_ENV,
        ctx,
      )

    const setupTwoUsers = () => {
      const now = Math.floor(Date.now() / 1000)
      const session = (sub: string) => ({
        _type: 'session',
        accessToken: `token-${sub}`,
        expiresAt: now + 3600,
        createdAt: now,
        user: { sub },
      })
      vi.mocked(TEST_ENV.SESSION_KV.get).mockImplementation(async (key: string, type?: string) => {
        const found =
          key === 'session:session-a' ? session('user-123') : key === 'session:session-b' ? session('user-456') : null
        if (!found) return null
        return type === 'json' ? found : JSON.stringify(found)
      })
    }

    it('turns unauthenticated requests away with 401 before they reach the limiter', async () => {
      // The CF-Connecting-IP header gives the limiter something to key on. If it ran
      // ahead of auth (as it once did), this IP would start getting 429s after 30.
      const statuses = new Set<number>()
      for (let i = 0; i < 65; i++) {
        statuses.add((await getMe(undefined, { 'cf-connecting-ip': '203.0.113.9' })).status)
      }

      expect([...statuses]).toEqual([401])
      expect(TEST_ENV.SESSION_KV.put).not.toHaveBeenCalled()
    })

    it('limits an authenticated user by their own sub, without touching other users', async () => {
      setupTwoUsers()

      // No CF-Connecting-IP header here, so bezzie skips limiting entirely unless it
      // keyed on the user -- a 429 at all proves identity keying. 65 requests
      // guarantees the limit is crossed even if the 60s window rolls over mid-loop.
      const responses: Response[] = []
      for (let i = 0; i < 65; i++) responses.push(await getMe('session-a'))

      const limited = responses.find((r) => r.status === 429)
      expect(limited).toBeDefined()
      expect(limited?.headers.get('Retry-After')).toBe('60')

      expect((await getMe('session-b')).status).toBe(200)
    })
  })
})
