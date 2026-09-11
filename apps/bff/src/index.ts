import { Hono, type Context } from 'hono'
import { createBezzie, providers, cloudflareKVAdapter } from 'bezzie'
import { createClient, ConnectError, Code } from '@connectrpc/connect'
import { TemplateService, type Todo } from '@template/proto'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import * as Sentry from '@sentry/cloudflare'
import { getTodoClient } from './lib/todoClient'
import { getTransport } from './lib/transport'
import { log } from './lib/log'

// protobuf-es messages carry a $typeName field (and other internal shape) that
// shouldn't leak into the JSON API -- pick only the fields the frontend actually uses.
const serializeTodo = (todo: Todo) => ({
  id: todo.id,
  userId: todo.userId,
  title: todo.title,
  completedAt: todo.completedAt ? timestampDate(todo.completedAt).toISOString() : null,
  createdAt: todo.createdAt ? timestampDate(todo.createdAt).toISOString() : null,
})

export interface Env {
  SESSION_KV: KVNamespace
  AUTH0_DOMAIN: string
  AUTH0_CLIENT_ID: string
  AUTH0_CLIENT_SECRET: string
  AUTH0_AUDIENCE: string
  APP_BASE_URL: string
  BACKEND_URL: string
  // Optional -- unset SENTRY_DSN is a documented no-op in the SDK, not an error.
  SENTRY_DSN?: string
}

type Variables = {
  requestId: string
}

const worker = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const isLocal = new URL(env.APP_BASE_URL).hostname === 'localhost'
    const auth = createBezzie({
      ...providers.auth0(env.AUTH0_DOMAIN),
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
      audience: env.AUTH0_AUDIENCE,
      adapter: cloudflareKVAdapter(env.SESSION_KV),
      baseUrl: env.APP_BASE_URL,
      defaultReturnTo: '/dashboard',
      secureCookies: !isLocal,
    })

    const app = new Hono<{ Bindings: Env; Variables: Variables }>()

    // Runs before auth, so every request gets one log line -- including auth
    // failures and 404s, which previously logged nothing at all. The request id
    // is threaded onto outgoing backend calls (x-request-id) so a single id
    // greps across both services' logs for the same request.
    app.use('*', async (c, next) => {
      const requestId = crypto.randomUUID()
      c.set('requestId', requestId)
      c.header('X-Request-Id', requestId)
      const startedAt = Date.now()
      await next()
      log.info('request completed', {
        requestId,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
        userSub: c.var.user?.sub,
      })
    })

    app.route('/auth', auth.routes())
    app.get('/api/me', auth.middleware(), (c) => c.json(c.var.user))

    const handleConnectError = (err: unknown, c: Context<{ Bindings: Env; Variables: Variables }>) => {
      if (err instanceof ConnectError) {
        switch (err.code) {
          case Code.NotFound:
            return c.json({ error: 'Not Found' }, 404)
          case Code.PermissionDenied:
            return c.json({ error: 'Permission Denied' }, 403)
          case Code.Unauthenticated:
            return c.json({ error: 'Unauthenticated' }, 401)
        }
      }
      // Only reached for ConnectError codes not handled above (i.e. genuinely
      // unexpected ones, not the routine NotFound/PermissionDenied/Unauthenticated
      // cases) and non-Connect errors -- both are worth Sentry's attention.
      Sentry.captureException(err, { extra: { requestId: c.var.requestId } })
      if (err instanceof ConnectError) {
        log.error('backend call failed', {
          requestId: c.var.requestId,
          connectErrorCode: err.code,
          message: err.message,
          rawMessage: err.rawMessage,
        })
      } else {
        log.error('backend call failed with a non-Connect error', {
          requestId: c.var.requestId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return c.json({ error: 'Internal Server Error' }, 500)
    }

    app.get('/api/info', auth.middleware(), async (c) => {
      const client = createClient(TemplateService, getTransport(c.env.BACKEND_URL))
      try {
        const info = await client.getServerInfo(
          {},
          { headers: { authorization: `Bearer ${c.var.accessToken}`, 'x-request-id': c.var.requestId } },
        )
        return c.json({ version: info.version, environment: info.environment })
      } catch (err) {
        return handleConnectError(err, c)
      }
    })

    app.get('/api/todos', auth.middleware(), async (c) => {
      const { client, options } = getTodoClient(c.env.BACKEND_URL, c.var.accessToken, c.var.requestId)
      try {
        const response = await client.getTodos({}, options)
        return c.json(response.todos.map(serializeTodo))
      } catch (err) {
        return handleConnectError(err, c)
      }
    })

    app.post('/api/todos', auth.middleware(), async (c) => {
      const { title } = await c.req.json<{ title: string }>()
      if (!title || title.trim() === '') {
        return c.json({ error: 'Title is required' }, 400)
      }
      const { client, options } = getTodoClient(c.env.BACKEND_URL, c.var.accessToken, c.var.requestId)
      try {
        const todo = await client.createTodo({ title }, options)
        return c.json(serializeTodo(todo), 201)
      } catch (err) {
        return handleConnectError(err, c)
      }
    })

    app.patch('/api/todos/:id', auth.middleware(), async (c) => {
      const id = c.req.param('id')
      const { client, options } = getTodoClient(c.env.BACKEND_URL, c.var.accessToken, c.var.requestId)
      try {
        const todo = await client.completeTodo({ id }, options)
        return c.json(serializeTodo(todo))
      } catch (err) {
        return handleConnectError(err, c)
      }
    })

    app.delete('/api/todos/:id', auth.middleware(), async (c) => {
      const id = c.req.param('id')
      const { client, options } = getTodoClient(c.env.BACKEND_URL, c.var.accessToken, c.var.requestId)
      try {
        const response = await client.deleteTodo({ id }, options)
        if (response.success) {
          return c.body(null, 204)
        }
        return c.json({ error: 'Failed to delete todo' }, 500)
      } catch (err) {
        return handleConnectError(err, c)
      }
    })

    return app.fetch(request, env, ctx)
  }
}

// Error tracking only for now, no performance tracing -- matches the backend's
// Sentry config, and keeps a free-tier event quota from getting eaten by spans
// nothing here needs yet.
export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  }),
  worker,
)
