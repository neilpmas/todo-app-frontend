import { log } from './log'

// @connectrpc/connect-web hardcodes `redirect: "error"`, which is valid in
// browser fetch() but not implemented by the Cloudflare Workers runtime
// (only "follow" and "manual" are supported). Strip it before delegating
// to the real fetch so the Connect transport works under wrangler/Workers.
export async function workersFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { redirect, ...rest } = init ?? {}
  void redirect
  // x-request-id is already set by getTodoClient/getTransport callers on the
  // outgoing headers -- read it back here so this lower-level log line
  // correlates with the same request, not just the top-level one in index.ts.
  const requestId = new Headers(init?.headers).get('x-request-id') ?? undefined
  const res = await fetch(input, rest)
  if (!res.ok) {
    const cloned = res.clone()
    const text = await cloned.text()
    log.error('backend fetch returned non-ok response', {
      requestId,
      status: res.status,
      contentType: res.headers.get('content-type'),
      body: text.slice(0, 500),
    })
  }
  return res
}
