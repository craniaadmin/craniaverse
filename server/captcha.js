// ============================================================
// Self-hosted CAPTCHA for the login screen.
// ------------------------------------------------------------
// The server draws a short code into an SVG and hands back an
// HMAC-signed token holding the answer. Nothing is stored between
// requests except the ids of tokens already spent, so this works
// behind the tunnel with no third-party account and nothing about
// whoever is looking at the page leaves the machine.
//
// What it is for: stopping a script from hammering /api/login. It
// will not stop someone determined enough to read the SVG. The
// lockout in auth.js is the control that actually limits guessing;
// this raises the cost of the cheap automated version.
// ============================================================
import crypto from 'crypto'

const TTL_MS = 5 * 60 * 1000
// 0/O, 1/I/L and 5/S are the pairs people misread most, so they are
// left out rather than made larger — a CAPTCHA nobody can pass is a
// broken login screen.
const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789'
const LENGTH = 5

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET must be set in server/.env (32+ random chars)')
  }
  return s
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

const b64urlDecode = (s) => {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

const hmac = (payload) => b64url(crypto.createHmac('sha256', secret()).update(payload).digest())

/* A correct answer must not be replayable: without this, a script
   solves one image and then reuses that token for every guess, which
   is the whole attack the CAPTCHA is meant to cost them. Spent ids
   are held only until they would expire anyway. */
const spent = new Map()
function burn(jti, exp) {
  spent.set(jti, exp)
  if (spent.size > 500) {
    const now = Date.now()
    for (const [k, v] of spent) if (v < now) spent.delete(k)
  }
}

const rand = (n) => crypto.randomInt(0, n)
const pick = (arr) => arr[rand(arr.length)]

function randomCode() {
  let out = ''
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[rand(ALPHABET.length)]
  return out
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* Drawn rather than shipped as a font-rendered string: each glyph gets
   its own rotation, offset and colour, over noise lines, so lifting the
   answer needs actual image work instead of reading the markup. */
function renderSvg(code) {
  const W = 200, H = 64
  const ink = ['#2E2516', '#3d7f7d', '#5FA09E', '#7a6417']
  let glyphs = ''
  const step = (W - 30) / code.length
  for (let i = 0; i < code.length; i++) {
    const x = 18 + i * step + rand(6) - 3
    const y = 42 + rand(10) - 5
    const rot = rand(41) - 20
    const size = 27 + rand(7)
    glyphs += `<text x="${x}" y="${y}" font-size="${size}" font-family="Georgia,serif" `
      + `font-weight="700" fill="${pick(ink)}" transform="rotate(${rot} ${x} ${y})">`
      + `${esc(code[i])}</text>`
  }
  let noise = ''
  for (let i = 0; i < 5; i++) {
    noise += `<line x1="${rand(W)}" y1="${rand(H)}" x2="${rand(W)}" y2="${rand(H)}" `
      + `stroke="${pick(ink)}" stroke-width="1" opacity="0.35" />`
  }
  for (let i = 0; i < 24; i++) {
    noise += `<circle cx="${rand(W)}" cy="${rand(H)}" r="1" fill="${pick(ink)}" opacity="0.3" />`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" `
    + `role="img" aria-label="Verification image">`
    + `<rect width="${W}" height="${H}" fill="#F1F3F4" rx="8" />`
    + noise + glyphs + `</svg>`
}

export function createChallenge() {
  const code = randomCode()
  const body = {
    jti: crypto.randomBytes(9).toString('hex'),
    ans: crypto.createHash('sha256').update(code.toUpperCase()).digest('hex'),
    exp: Date.now() + TTL_MS,
  }
  const payload = b64url(JSON.stringify(body))
  return { token: `${payload}.${hmac(payload)}`, svg: renderSvg(code) }
}

/* Returns a reason rather than a bare false so the login screen can
   say "that code has expired, here is a new one" instead of making
   someone guess why a correct-looking answer was refused. */
export function verifyChallenge(token, answer) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' }
  const dot = token.indexOf('.')
  if (dot < 0) return { ok: false, reason: 'malformed' }
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = hmac(payload)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'malformed' }

  let obj
  try { obj = JSON.parse(b64urlDecode(payload).toString('utf8')) } catch { return { ok: false, reason: 'malformed' } }
  if (!obj?.jti || !obj?.ans || typeof obj.exp !== 'number') return { ok: false, reason: 'malformed' }
  if (Date.now() >= obj.exp) return { ok: false, reason: 'expired' }
  if (spent.has(obj.jti)) return { ok: false, reason: 'expired' }

  const given = crypto.createHash('sha256')
    .update(String(answer || '').trim().toUpperCase()).digest('hex')
  const x = Buffer.from(given), y = Buffer.from(obj.ans)
  const match = x.length === y.length && crypto.timingSafeEqual(x, y)
  // Spend it either way: one image, one attempt.
  burn(obj.jti, obj.exp)
  return match ? { ok: true } : { ok: false, reason: 'wrong' }
}

// Test seam — the spent-token map is process-wide state.
export function __resetSpent() { spent.clear() }
