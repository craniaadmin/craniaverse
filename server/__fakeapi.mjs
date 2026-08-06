// A stand-in API that mounts the real auth, captcha, users and role
// code over an in-memory user list — so the login screen, the account
// menu and the timeout can be driven for real without PocketBase.
process.env.SESSION_SECRET = 'harness-secret-that-is-long-enough-xxxx'
process.env.ADMIN_PASSWORD = 'first-admin-password'

import express from 'express'
import cors from 'cors'
import { pathToFileURL } from 'url'
import path from 'path'

const SERVER = process.argv[2]
const imp = (f) => import(pathToFileURL(path.join(SERVER, f)).href)

const {
  authRequired, roleRequired, makeSessionCookie, clearSessionCookie, readSession,
  loginBlocked, noteLoginFailure, clearLoginFailures,
} = await imp('auth.js')
const { createChallenge, verifyChallenge } = await imp('captcha.js')
const {
  ROLES, isRole, normaliseRole, normaliseEmail, hashPassword, verifyPassword,
  passwordProblem, makeUser, publicUser,
} = await imp('users.js')

let users = [
  makeUser({ email: 'admin@craniaverse.ca', name: 'Ada Admin', password: 'first-admin-password', role: 'admin' }),
  makeUser({ email: 'sam@craniaverse.ca', name: 'Sam Staff', password: 'staff-password-1', role: 'staff' }),
  makeUser({ email: 'rae@craniaverse.ca', name: 'Rae Reader', password: 'reader-password-1', role: 'readonly' }),
]
const DUMMY = hashPassword('x'.repeat(20))

const app = express()
app.use(cors({ credentials: true, origin: (o, cb) => cb(null, true) }))
app.use(express.json())
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

app.get('/api/captcha', (_q, res) => res.json(createChallenge()))

app.post('/api/login', wrap(async (req, res) => {
  const { email, password, captchaToken, captchaAnswer } = req.body || {}
  const addr = normaliseEmail(email)
  const ip = req.ip || 'test'
  const locked = loginBlocked(addr, ip)
  if (locked) return res.status(429).json({ error: `Too many failed attempts. Try again in ${locked} minutes.` })
  const cap = verifyChallenge(captchaToken, captchaAnswer)
  if (!cap.ok) {
    return res.status(400).json({
      error: cap.reason === 'expired' ? 'That verification image expired. Here is a new one.'
        : 'The verification code did not match.', captcha: cap.reason })
  }
  const user = users.find(u => normaliseEmail(u.email) === addr)
  const ok = user && user.active !== false && verifyPassword(password, user.passwordHash)
  if (!ok) { if (!user) verifyPassword(password, DUMMY); noteLoginFailure(addr, ip)
    return res.status(401).json({ error: 'Wrong email or password.' }) }
  clearLoginFailures(addr, ip)
  const { cookie, expiresAt } = makeSessionCookie(user)
  res.setHeader('Set-Cookie', cookie)
  user.lastLoginAt = new Date().toISOString()
  res.json({ ok: true, user: publicUser(user), expiresAt })
}))

app.post('/api/logout', (_q, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie()); res.json({ ok: true })
})
app.get('/api/me', (req, res) => {
  const s = readSession(req)
  if (!s) return res.status(401).json({ authed: false })
  const user = users.find(u => u.id === s.uid)
  if (!user || user.active === false) return res.status(401).json({ authed: false })
  res.json({ authed: true, user: publicUser(user), expiresAt: s.exp })
})
app.post('/api/session/extend', (req, res) => {
  const s = readSession(req)
  if (!s) return res.status(401).json({ error: 'not authenticated' })
  const user = users.find(u => u.id === s.uid)
  const { cookie, expiresAt } = makeSessionCookie(user)
  res.setHeader('Set-Cookie', cookie); res.json({ ok: true, expiresAt })
})

// Test-only: shorten the current session so the warning can be seen.
app.post('/api/__expire-soon', (req, res) => {
  const s = readSession(req)
  const user = users.find(u => u.id === s?.uid)
  if (!user) return res.status(401).json({ error: 'no' })
  const secs = Number(req.body?.seconds ?? 90)
  const { cookie } = makeSessionCookie(user)
  res.setHeader('Set-Cookie', cookie)
  res.json({ ok: true, expiresAt: Date.now() + secs * 1000 })
})

app.use(authRequired)
app.post('/api/users/:id/password', wrap(async (req, res) => {
  const { currentPassword, password } = req.body || {}
  const idx = users.findIndex(u => u.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'No such account.' })
  const self = req.session?.uid === users[idx].id
  const isAdmin = normaliseRole(req.session?.role) === 'admin'
  if (!self && !isAdmin) return res.status(403).json({ error: 'That area is limited to admin accounts.' })
  if (self && !verifyPassword(currentPassword, users[idx].passwordHash)) {
    return res.status(401).json({ error: 'Your current password is not right.' })
  }
  const problem = passwordProblem(password)
  if (problem) return res.status(400).json({ error: problem })
  users[idx].passwordHash = hashPassword(password)
  res.json({ ok: true })
}))
app.use(roleRequired)

app.get('/api/users', (_q, res) => res.json(users.map(publicUser)))
app.post('/api/users', wrap(async (req, res) => {
  const { email, name, password, role } = req.body || {}
  const addr = normaliseEmail(email)
  if (!addr || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return res.status(400).json({ error: 'A valid email address is required.' })
  if (role && !isRole(role)) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` })
  const problem = passwordProblem(password)
  if (problem) return res.status(400).json({ error: problem })
  if (users.some(u => normaliseEmail(u.email) === addr)) return res.status(409).json({ error: 'An account with that email already exists.' })
  const u = makeUser({ email: addr, name, password, role })
  users.push(u); res.status(201).json(publicUser(u))
}))
app.put('/api/users/:id', wrap(async (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'No such account.' })
  const { name, role, active } = req.body || {}
  const next = { ...users[idx] }
  if (typeof name === 'string') next.name = name.trim()
  if (role !== undefined) { if (!isRole(role)) return res.status(400).json({ error: 'bad role' }); next.role = normaliseRole(role) }
  if (active !== undefined) next.active = Boolean(active)
  const admins = users.filter(u => normaliseRole(u.role) === 'admin' && u.active !== false)
  if (admins.length === 1 && admins[0].id === next.id && (normaliseRole(next.role) !== 'admin' || next.active === false)) {
    return res.status(409).json({ error: 'This is the only admin account. Give someone else admin access first.' })
  }
  users[idx] = next; res.json(publicUser(next))
}))
app.delete('/api/users/:id', wrap(async (req, res) => {
  const t = users.find(u => u.id === req.params.id)
  if (!t) return res.status(404).json({ error: 'No such account.' })
  const admins = users.filter(u => normaliseRole(u.role) === 'admin' && u.active !== false)
  if (admins.length === 1 && admins[0].id === t.id) return res.status(409).json({ error: 'This is the only admin account. Give someone else admin access first.' })
  if (req.session?.uid === t.id) return res.status(409).json({ error: 'You cannot delete the account you are signed in with.' })
  users = users.filter(u => u.id !== t.id); res.json({ deleted: 1 })
}))

// Stand-ins for the data routes, so role enforcement can be exercised.
app.get('/api/registrations', (_q, res) => res.json([]))
app.put('/api/registrations/:id/student', (_q, res) => res.json({ ok: true }))
app.delete('/api/registrations/:id', (_q, res) => res.json({ ok: true }))
app.post('/api/customers/backup', (_q, res) => res.json({ ok: true }))
app.get('/api/rules', (_q, res) => res.json([]))
app.get('/api/programs', (_q, res) => res.json([]))
app.get('/api/programs-state', (_q, res) => res.json({}))
app.get('/api/staff', (_q, res) => res.json([]))

app.use((err, _q, res, _n) => { console.error(err); res.status(500).json({ error: 'internal error' }) })
app.listen(4100, () => console.log('fake api on 4100'))
