// ============================================================
// User accounts and privilege levels.
// ------------------------------------------------------------
// Until now the whole app shared one ADMIN_PASSWORD, so there was
// nobody to attach a privilege level to. Each person now has their
// own account and one of three roles.
//
//   admin      everything, including accounts, backups and deletion
//   staff      day-to-day work; no deletion, no settings, no accounts
//   readonly   can read; every write is refused
//
// Levels are enforced on the server (see auth.js). Hiding a menu item
// in the browser is a courtesy, not a control — anyone can call the
// API directly, so that is where the check has to live.
// ============================================================
import crypto from 'crypto'

export const ROLES = ['admin', 'staff', 'readonly']
export const ROLE_LABELS = { admin: 'Admin', staff: 'Staff', readonly: 'Read-only' }

export const isRole = (r) => ROLES.includes(String(r || '').toLowerCase())
export const normaliseRole = (r) => (isRole(r) ? String(r).toLowerCase() : 'staff')

// ---- password hashing ---------------------------------------
// scrypt from node's own crypto: no dependency to keep current, and
// deliberately slow, so a stolen database is not a list of passwords.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(String(password), salt, SCRYPT.keylen, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, keyHex] = String(stored || '').split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(keyHex, 'hex')
    const key = crypto.scryptSync(String(password), salt, expected.length,
      { N: Number(N), r: Number(r), p: Number(p) })
    return key.length === expected.length && crypto.timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

/* Passwords people pick for a shared admin tool are the ones that get
   guessed. This refuses only what is genuinely weak rather than
   demanding a symbol and a capital, which mostly produces Password1!. */
export const MIN_PASSWORD = 9

export function passwordProblem(password) {
  const p = String(password || '')
  if (p.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (/^\d+$/.test(p)) return 'Digits alone are too easy to guess — add some words.'
  if (/^(.)\1+$/.test(p)) return 'That is the same character repeated.'
  const common = ['password', 'craniaverse', 'crania', 'letmein', 'qwerty', 'welcome', 'admin']
  const low = p.toLowerCase()
  if (common.some(w => low === w || low === w + '1' || low === w + '123')) {
    return 'That is one of the first passwords anyone would try.'
  }
  return null
}

export const normaliseEmail = (e) => String(e || '').trim().toLowerCase()

export function initialsFor(user) {
  const name = String(user?.name || '').trim()
  if (name) {
    const parts = name.split(/\s+/)
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
  }
  return normaliseEmail(user?.email).slice(0, 2).toUpperCase() || '??'
}

/* What the browser is allowed to know about an account. The hash never
   leaves the server, not even to an admin — there is no screen that
   needs it, and one that showed it would be a mistake waiting to be
   copied somewhere. */
export function publicUser(u) {
  if (!u) return null
  return {
    id: u.id,
    email: normaliseEmail(u.email),
    name: u.name || '',
    role: normaliseRole(u.role),
    active: u.active !== false,
    createdAt: u.createdAt || '',
    lastLoginAt: u.lastLoginAt || '',
    initials: initialsFor(u),
  }
}

export function makeUser({ email, name, password, role }) {
  return {
    id: `user-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
    email: normaliseEmail(email),
    name: String(name || '').trim(),
    passwordHash: hashPassword(password),
    role: normaliseRole(role),
    active: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: '',
  }
}

// ---- what each level may do ---------------------------------
/* Admin-only by path. Everything here either hands out access, moves
   the whole database around, or cannot be undone. */
const ADMIN_ONLY = [
  /^\/api\/users(\/|$)/,
  /^\/api\/[a-z-]+\/backups?(\/|$)/,
  /^\/api\/[a-z-]+\/restore(\/|$)/,
  /^\/api\/registrations\/restore$/,
  /^\/api\/rules(\/|$)/,
]

export function permits(role, method, pathname) {
  const r = normaliseRole(role)
  const m = String(method || 'GET').toUpperCase()
  const readOnlyMethod = m === 'GET' || m === 'HEAD' || m === 'OPTIONS'

  if (r === 'admin') return { ok: true }

  if (r === 'readonly') {
    return readOnlyMethod
      ? { ok: true }
      : { ok: false, reason: 'Your account has read-only access, so it cannot change anything.' }
  }

  // staff
  if (ADMIN_ONLY.some(re => re.test(pathname))) {
    return { ok: false, reason: 'That area is limited to admin accounts.' }
  }
  if (m === 'DELETE') {
    return { ok: false, reason: 'Deleting records is limited to admin accounts.' }
  }
  return { ok: true }
}
