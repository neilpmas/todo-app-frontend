import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Logout is a same-origin form POST that the BFF answers with a 302 to Auth0's
// /v2/logout. Browsers enforce the submitting page's form-action against that
// redirect, so this page's CSP must allow the Auth0 origin or Logout silently does nothing.
describe('_headers CSP', () => {
  it('allows form-action to the Auth0 origin the BFF redirects logout to', () => {
    const wrangler = readFileSync(resolve(__dirname, '../../bff/wrangler.toml'), 'utf8')
    const domain = /^AUTH0_DOMAIN\s*=\s*"([^"]+)"/m.exec(wrangler)?.[1]
    expect(domain, 'AUTH0_DOMAIN in apps/bff/wrangler.toml').toBeTruthy()

    const headers = readFileSync(resolve(__dirname, '../public/_headers'), 'utf8')
    const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1] ?? ''
    const formAction = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('form-action'))

    expect(formAction).toContain(`https://${domain}`)
  })

  // Cloudflare injects Web Analytics' beacon.min.js into the HTML at the edge; with
  // script-src 'self' alone the browser blocks it and visits are never counted. Its
  // reporting goes back through the site's own /cdn-cgi/rum, which connect-src 'self' covers.
  it('allows the Cloudflare Web Analytics beacon in script-src', () => {
    const headers = readFileSync(resolve(__dirname, '../public/_headers'), 'utf8')
    const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1] ?? ''
    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))

    expect(scriptSrc).toContain('https://static.cloudflareinsights.com')
  })
})
