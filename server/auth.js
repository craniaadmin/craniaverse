// ============================================================
// Session auth for the admin API.
// ------------------------------------------------------------
// Each person has their own account (see users.js). On successful
// login the server sets an httpOnly cookie holding a base64 JSON
// payload + an HMAC-SHA256 signature (SESSION_SECRET), carrying who
// they are and what level they have. The authRequired middleware
// verifies that cookie on every non-public /api/* request, and
// roleRequired then checks the level against the route.
//
// Sessions last 3 hours. The browser is told when it expires so it
// can warn first and save anything outstanding, but the server does
// not take the client's word for it — the expiry is inside the
// signed payload.
//
// Required env (server/.env):
//   ADMIN_PASSWORD   — password for the seeded first admin account
//   SESSION_SECRET   — random 32+ char string used to sign cookies
// ============================================================
import crypto from 'crypto'
import { permits } from './users.js'

const COOKIE_NAME = 'crv_session'
export const SESSION_HOURS = 3
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

const b64urlDecode = (s) => {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET must be set in server/.env (32+ random chars)')
  }
  return s
}

function sign(payloadObj) {
  const payload = b64url(JSON.stringify(payloadObj))
  const sig = b64url(crypto.createHmac('sha256', secret()).update(payload).digest())
  return `${payload}.${sig}`
}

function verify(token) {
  if (!token || typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = b64url(crypto.createHmac('sha256', secret()).update(payload).digest())
  // Constant-time compare
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let obj
  try { obj = JSON.parse(b64urlDecode(payload).toString('utf8')) } catch { return null }
  if (!obj || typeof obj.exp !== 'number') return null
  if (Date.now() >= obj.exp) return null
  return obj
}

export function makeSessionCookie(user) {
  const now = Date.now()
  const exp = now + SESSION_MS
  const token = sign({ uid: user?.id || '', role: user?.role || 'staff', iat: now, exp })
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${Math.floor(SESSION_MS / 1000)}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  // ngrok/craniaverse is always https; safe to force Secure.
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return { cookie: parts.join('; '), expiresAt: exp }
}

export function clearSessionCookie() {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function parseCookies(header = '') {
  const out = {}
  header.split(';').forEach((raw) => {
    const [k, ...rest] = raw.trim().split('=')
    if (!k) return
    out[k] = rest.join('=')
  })
  return out
}

export function readSession(req) {
  const cookies = parseCookies(req.headers.cookie || '')
  return verify(cookies[COOKIE_NAME])
}

export function checkPassword(input) {
  const admin = process.env.ADMIN_PASSWORD || ''
  if (!admin) return false
  const a = Buffer.from(String(input || ''))
  const b = Buffer.from(admin)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ---- login throttling ---------------------------------------
/* The CAPTCHA raises the cost of a scripted guess; this caps how many
   guesses are possible at all. Counted per account and per source
   address, because either one alone leaves a hole: per-account lets
   one host work through every account, per-address lets a botnet work
   through one account. */
const LOCK_AFTER = 6
const LOCK_MS = 15 * 60 * 1000
const attempts = new Map()

const nowMs = () => Date.now()

function bucket(key) {
  const b = attempts.get(key)
  if (!b || b.until < nowMs()) return { count: 0, until: 0 }
  return b
}

export function loginBlocked(email, ip) {
  for (const key of [`e:${email}`, `i:${ip}`]) {
    const b = attempts.get(key)
    if (b && b.count >= LOCK_AFTER && b.until > nowMs()) {
      return Math.ceil((b.until - nowMs()) / 60000)
    }
  }
  return 0
}

export function noteLoginFailure(email, ip) {
  for (const key of [`e:${email}`, `i:${ip}`]) {
    const b = bucket(key)
    const count = b.count + 1
    attempts.set(key, { count, until: nowMs() + LOCK_MS })
  }
  if (attempts.size > 2000) {
    for (const [k, v] of attempts) if (v.until < nowMs()) attempts.delete(k)
  }
}

export function clearLoginFailures(email, ip) {
  attempts.delete(`e:${email}`)
  attempts.delete(`i:${ip}`)
}

// Test seam — the attempt counters are process-wide state.
export function __resetAttempts() { attempts.clear() }

// ---- Public-path allowlist ---------------------------------
// Anything not matched here that starts with /api/ requires a
// valid session. Public HTML endpoints (`/register`, `/sign-up`,
// etc.) are not /api/ and are never gated here.
//
// Notes:
//   - GET /api/forms/:key returns a single form definition and is
//     needed to render the public form page.
//   - GET /api/forms (no id) returns the admin list and is NOT
//     public.
const PUBLIC_MATCHERS = [
  (m, p) => m === 'GET'  && p === '/api/health',
  (m, p) => m === 'POST' && p === '/api/login',
  (m, p) => m === 'POST' && p === '/api/logout',
  (m, p) => m === 'GET'  && p === '/api/me',
  (m, p) => m === 'POST' && p === '/api/registrations',
  (m, p) => m === 'POST' && p === '/api/booth-signup',
  (m, p) => m === 'GET'  && /^\/api\/forms\/[^/]+$/.test(p),
  (m, p) => m === 'POST' && /^\/api\/forms\/[^/]+\/submit$/.test(p),
  //   - The registration form builds its class list and its day/time
  //     options from the live catalogue. Without these it renders an
  //     empty form for everyone except a logged-in admin, whose session
  //     cookie makes it look like it works. Both are reads of what the
  //     school publicly offers; /api/locations returns ids and names only.
  (m, p) => m === 'GET'  && p === '/api/programs',
  (m, p) => m === 'GET'  && p === '/api/locations',
  //   - /api/program-spots is how the form knows a class is full. It is a
  //     count per session and nothing else — no names, no records — so it
  //     says only what a "3 spots left" label on the form already says.
  (m, p) => m === 'GET'  && p === '/api/program-spots',
  // Test-runner status: names + error strings only, no credentials.
  // Public so the scheduled Claude agent can poll without a stored password.
  (m, p) => m === 'GET'  && p === '/api/tests/last-run',
]

export function isPublicApi(method, pathname) {
  return PUBLIC_MATCHERS.some(fn => fn(method, pathname))
}

export function authRequired(req, res, next) {
  // Only guard /api/ traffic; static assets + HTML are never gated
  // here (public HTML routes handle their own visibility, and the
  // SPA index.html is deliberately public so the login screen can
  // load).
  if (!req.path.startsWith('/api/')) return next()
  if (isPublicApi(req.method, req.path)) return next()
  if (readSession(req)) return next()
  return res.status(401).json({ error: 'not authenticated' })
}
