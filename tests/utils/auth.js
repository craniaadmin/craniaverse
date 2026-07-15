// Session-cookie helper for the test suite.
// Every /api/* endpoint except /api/health, /api/login, /api/me, and the
// public form/booth routes requires a signed cookie. Tests POST once
// against /api/login and thread the returned cookie into subsequent
// fetch calls via `authedFetch`.

import { BASE_URL } from '../config.js'

let cachedCookie = null

// Reads ADMIN_PASSWORD from server/.env (via tests/config.js loading it).
// Fallback env var name TEST_ADMIN_PASSWORD lets CI override without
// leaking the real prod value into other tooling.
function readPassword() {
  return process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || ''
}

export async function loginAndGetCookie() {
  if (cachedCookie) return cachedCookie
  const pw = readPassword()
  if (!pw) {
    throw new Error(
      'No ADMIN_PASSWORD available for tests. Set ADMIN_PASSWORD in server/.env ' +
      '(the same value used to sign in via the UI) or TEST_ADMIN_PASSWORD.',
    )
  }
  const r = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`login failed: HTTP ${r.status} — ${text.slice(0, 200)}`)
  }
  // Extract the crv_session cookie from Set-Cookie. Node's fetch
  // exposes the raw header via getSetCookie() (undici 22+).
  const setCookies = typeof r.headers.getSetCookie === 'function'
    ? r.headers.getSetCookie()
    : [r.headers.get('set-cookie')].filter(Boolean)
  let sessionCookie = null
  for (const c of setCookies) {
    const m = c.match(/^crv_session=([^;]+)/)
    if (m) { sessionCookie = `crv_session=${m[1]}`; break }
  }
  if (!sessionCookie) {
    throw new Error('login succeeded but no crv_session cookie in response')
  }
  cachedCookie = sessionCookie
  return cachedCookie
}

export function clearAuthCache() {
  cachedCookie = null
}

// Drop-in for fetch that adds the session cookie automatically.
export async function authedFetch(path, opts = {}) {
  const cookie = await loginAndGetCookie()
  const headers = {
    ...(opts.headers || {}),
    Cookie: cookie,
  }
  return fetch(`${BASE_URL}${path}`, { ...opts, headers })
}

// Same but returns parsed JSON alongside status/text for convenience.
export async function authedJson(path, opts = {}) {
  const r = await authedFetch(path, opts)
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text }
}
