import { Hono, type Context } from 'hono'
import { createBezzie, providers, cloudflareKVAdapter } from 'bezzie'
import { createClient, ConnectError, Code } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { TemplateService, type Todo } from '@template/proto'
import { timestampDate } from '@bufbuild/protobuf/wkt'
import { getTodoClient } from './lib/todoClient'
import { workersFetch } from './lib/workersFetch'

const serializeTodo = (todo: Todo) => ({
  ...todo,
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
}

export default {
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

    const app = new Hono<{ Bindings: Env }>()
    app.route('/auth', auth.routes())
    app.get('/api/me', auth.middleware(), (c) => c.json(c.var.user))

    const handleConnectError = (err: unknown, c: Context) => {
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
      if (err instanceof ConnectError) {
        console.error('ConnectError code=' + err.code + ' message=' + err.message + ' rawMessage=' + err.rawMessage)
      } else {
        console.error('Non-ConnectError:', err)
      }
      return c.json({ error: 'Internal Server Error' }, 500)
    }

    app.get('/api/info', auth.middleware(), async (c) => {
      const transport = createConnectTransport({ baseUrl: `${c.env.BACKEND_URL}/connect`, useBinaryFormat: true, fetch: workersFetch })
      const client = createClient(TemplateService, transport)
      try {
        const info = await client.getServerInfo({}, { headers: { authorization: `Bearer ${c.var.accessToken}` } })
        return c.json(info)
      } catch (err) {
        return handleConnectError(err, c)
      }
    })

    app.get('/api/todos', auth.middleware(), async (c) => {
      const { client, options } = getTodoClient(c.env.BACKEND_URL, c.var.accessToken)
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
      const { client, options } = getTodoClient(c.env.BACKEND_URL, c.var.accessToken)
      try {
        const todo = await client.createTodo({ title }, options)
        return c.json(serializeTodo(todo), 201)
      } catch (err) {
        return handleConnectError(err, c)
      }
    })

    app.patch('/api/todos/:id', auth.middleware(), async (c) => {
      const id = c.req.param('id')
      const { client, options } = getTodoClient(c.env.BACKEND_URL, c.var.accessToken)
      try {
        const todo = await client.completeTodo({ id }, options)
        return c.json(serializeTodo(todo))
      } catch (err) {
        return handleConnectError(err, c)
      }
    })

    app.delete('/api/todos/:id', auth.middleware(), async (c) => {
      const id = c.req.param('id')
      const { client, options } = getTodoClient(c.env.BACKEND_URL, c.var.accessToken)
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
