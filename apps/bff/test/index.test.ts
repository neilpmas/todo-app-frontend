import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { ExecutionContext } from '@cloudflare/workers-types'
import type { Client } from '@connectrpc/connect'
import { TodosService } from '@template/proto'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import worker from '../src/index'
import type { Env } from '../src'
import { getTodoClient } from '../src/lib/todoClient'
import { ConnectError, Code } from '@connectrpc/connect'

vi.mock('../src/lib/todoClient', () => ({
  getTodoClient: vi.fn(),
}))

vi.stubGlobal('fetch', async (url: string) => {
  if (url.includes('.well-known/openid-configuration')) {
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
})
