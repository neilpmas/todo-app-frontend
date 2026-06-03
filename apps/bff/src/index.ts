import { Hono } from 'hono'
import { createBezzie, providers, cloudflareKVAdapter } from 'bezzie'
import { createClient } from '@connectrpc/connect'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import { TemplateService } from '@template/proto'

export interface Env {
  SESSION_KV: KVNamespace
  AUTH0_CLIENT_ID: string
  AUTH0_CLIENT_SECRET: string
  AUTH0_AUDIENCE: string
  APP_BASE_URL: string
  BACKEND_URL: string
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const auth = createBezzie({
      ...providers.auth0(new URL(env.APP_BASE_URL).hostname),
      clientId: env.AUTH0_CLIENT_ID,
      clientSecret: env.AUTH0_CLIENT_SECRET,
      audience: env.AUTH0_AUDIENCE,
      adapter: cloudflareKVAdapter(env.SESSION_KV),
      baseUrl: env.APP_BASE_URL,
    })

    const app = new Hono<{ Bindings: Env }>()
    app.route('/auth', auth.routes())
    app.get('/api/me', auth.middleware(), (c) => c.json(c.var.user))

    app.get('/api/info', auth.middleware(), async (c) => {
      const transport = createGrpcWebTransport({ baseUrl: c.env.BACKEND_URL })
      const client = createClient(TemplateService, transport)
      const info = await client.getServerInfo({})
      return c.json(info)
    })

    return app.fetch(request, env, ctx)
  }
}
