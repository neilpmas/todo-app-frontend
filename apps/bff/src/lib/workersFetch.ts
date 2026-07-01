// @connectrpc/connect-web hardcodes `redirect: "error"`, which is valid in
// browser fetch() but not implemented by the Cloudflare Workers runtime
// (only "follow" and "manual" are supported). Strip it before delegating
// to the real fetch so the Connect transport works under wrangler/Workers.
export async function workersFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { redirect, ...rest } = init ?? {}
  void redirect
  const res = await fetch(input, rest)
  if (!res.ok) {
    const cloned = res.clone()
    const text = await cloned.text()
    console.error('workersFetch non-ok response:', res.status, 'content-type=' + res.headers.get('content-type'), 'body=' + text.slice(0, 500))
  }
  return res
}
