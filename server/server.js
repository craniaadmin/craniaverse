// ============================================================
// CraniaVerse backend — a small registration API
// ------------------------------------------------------------
// Data lives in PocketBase (see server/pb.js). The HTTP edge
// of this file is unchanged from the JSON-file era, so the
// React admin and the public forms work without modification.
//
//   GET  /api/health         -> { ok: true }
//   GET  /api/registrations  -> [ record, ... ]
//   POST /api/registrations  -> creates a record
//   DELETE /api/registrations/:id -> removes a record
//   ...
//
// Run:  npm install  &&  npm start     (listens on http://localhost:4000)
// ============================================================
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { registrationToRecord, makeSeedRecord } from './mapping.js'
import { sendRegistrationEmails, sendBoothSignupEmail } from './email.js'
import { generateFeeSchedulePdf } from './pdf-fee-schedule.js'
import {
  authRequired,
  checkPassword,
  makeSessionCookie,
  clearSessionCookie,
  readSession,
} from './auth.js'
import {
  loadRegistrations, saveRegistrations,
  loadStaff,         saveStaff,
  loadPrograms,      savePrograms,
  loadRules,         saveRules,
  loadComments,      saveCommentsForTab,
  loadStaffBoard,    saveStaffBoard,
  loadInventory,     saveInventory,
  loadFinance,       saveFinance,
  loadProjects,      saveProjects,
  loadTodo,          saveTodo,
  loadBoothSignups,  upsertBoothSignup, deleteBoothSignup,
  loadForms,         saveForms,
  loadSubmissions,   createSubmission,
  deleteSubmission,  deleteSubmissionsForForm,
} from './pb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })
const PORT = process.env.PORT || 4000

const DEFAULT_RULES = [
  { id: 'present', reason: 'Present', delta: 1 },
  { id: 'no-shirt', reason: 'No Shirt', delta: -5 },
]

const DEFAULT_STAFF = [
  {
    id: 'staff-tas',
    firstName: 'Tas', lastName: 'Karim', gender: '', dob: '', age: '',
    email: 'tas@craniaverse.ca', phone: '', role: 'Teacher', startDate: '',
    address: '', city: '', province: 'Ontario', postalCode: '',
    emergencyName: '', emergencyPhone: '',
    notes: ['Lead math instructor', 'Available Mon–Wed'],
    active: true,
  },
  {
    id: 'staff-rob',
    firstName: 'Rob', lastName: 'Singh', gender: '', dob: '', age: '',
    email: 'rob@craniaverse.ca', phone: '', role: 'Teacher', startDate: '',
    address: '', city: '', province: 'Ontario', postalCode: '',
    emergencyName: '', emergencyPhone: '',
    notes: [],
    active: true,
  },
]

// ---- in-memory cache + write coalescing --------------------
// Each "load*" function in pb.js does a getFullList round-trip
// to PocketBase. The original JSON-file code freely called
// load() inside every endpoint and that was cheap. To keep the
// same ergonomics without 25 round-trips per request, we cache
// each store and refresh from PocketBase on demand.
const cache = {
  registrations: null,
  staff:         null,
  programs:      null,
  rules:         null,
  inventory:     null,
  forms:         null,
}

async function getRegistrations() {
  if (cache.registrations) return cache.registrations
  cache.registrations = await loadRegistrations()
  return cache.registrations
}
async function commitRegistrations(records) {
  cache.registrations = records
  await saveRegistrations(records)
}

async function getStaff() {
  if (cache.staff) return cache.staff
  let staff = await loadStaff()
  if (staff.length === 0) {
    staff = [...DEFAULT_STAFF]
    await saveStaff(staff)
  }
  cache.staff = staff
  return cache.staff
}
async function commitStaff(staff) {
  cache.staff = staff
  await saveStaff(staff)
}

async function getPrograms() {
  if (cache.programs) return cache.programs
  cache.programs = await loadPrograms()
  return cache.programs
}
async function commitPrograms(programs) {
  cache.programs = programs
  await savePrograms(programs)
}

async function getRules() {
  if (cache.rules) return cache.rules
  let rules = await loadRules()
  if (rules.length === 0) {
    rules = [...DEFAULT_RULES]
    await saveRules(rules)
  }
  cache.rules = rules
  return cache.rules
}
async function commitRules(rules) {
  cache.rules = rules
  await saveRules(rules)
}

async function getInventory() {
  if (cache.inventory) return cache.inventory
  cache.inventory = await loadInventory()
  return cache.inventory
}
async function commitInventory(items) {
  cache.inventory = items
  await saveInventory(items)
}

async function getForms() {
  if (cache.forms) return cache.forms
  cache.forms = await loadForms()
  return cache.forms
}
async function commitForms(forms) {
  cache.forms = forms
  await saveForms(forms)
}

// ---- registrations: one-time migration of legacy records ---
// Earlier records may be missing the programs / cashLog
// fields. Pull all records, patch in-memory, and write back
// only if something changed.
async function migrateRegistrations() {
  const records = await getRegistrations()
  let changed = false
  records.forEach((r) => {
    if (!Array.isArray(r.programs)) {
      r.programs = r.registration?.program
        ? [{ year: '25_26', program: r.registration.program }]
        : []
      changed = true
    }
    if (!Array.isArray(r.cashLog)) {
      r.cashLog = []
      changed = true
    }
  })
  if (changed) await commitRegistrations(records)
}

// ---- one-time seed if database is empty --------------------
// If the registrations collection is empty (first boot, no
// import yet), drop in a single seed record so the admin UI
// has something to render.
async function seedIfEmpty() {
  const records = await getRegistrations()
  if (records.length === 0) {
    await commitRegistrations([makeSeedRecord()])
  }
}

// ---- app ---------------------------------------------------
const app = express()
// CORS with credentials on so the browser sends the session cookie
// even when the admin runs on a different origin during dev.
app.use(cors({
  credentials: true,
  origin: (origin, cb) => cb(null, true), // reflect any origin — we're behind ngrok in prod
}))
app.use(express.json({ limit: '1mb' }))

// ---- auth: login / logout / me + gate all admin API ---------
// Public HTML routes (/register, /form/:id, /sign-up, ...) and the
// public /api/* subset are allowlisted inside auth.js. Everything
// else under /api/ requires a valid session cookie.
app.post('/api/login', (req, res) => {
  const { password } = req.body || {}
  if (!checkPassword(password)) return res.status(401).json({ error: 'Wrong password' })
  res.setHeader('Set-Cookie', makeSessionCookie())
  res.json({ ok: true })
})
app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie())
  res.json({ ok: true })
})
app.get('/api/me', (req, res) => {
  const session = readSession(req)
  if (!session) return res.status(401).json({ authed: false })
  res.json({ authed: true })
})

app.use(authRequired)

const ALLOWED_FRAME_ANCESTORS = process.env.ALLOWED_FRAME_ANCESTORS
  || "'self' https://crania-schools.com https://www.crania-schools.com"
app.use((req, res, next) => {
  const embeddable =
    req.path === '/register' ||
    req.path === '/staff-form' ||
    req.path === '/sign-up' ||
    req.path === '/booth-signup' ||
    req.path.startsWith('/form/')
  if (embeddable) {
    res.setHeader('Content-Security-Policy', `frame-ancestors ${ALLOWED_FRAME_ANCESTORS}`)
  }
  next()
})

// ---- host guard for the public sign-up subdomain -----------
// SIGNUP_HOSTS is a comma-separated list of hostnames that should
// only serve the sign-up form and its POST endpoint — every other
// URL 404s so nothing about the admin app leaks. Configure via
// server/.env:
//   SIGNUP_HOSTS=crania-signup.ngrok.app,sign-up.crania-schools.com
// Requests on any other host are unaffected.
const SIGNUP_HOSTS = new Set(
  String(process.env.SIGNUP_HOSTS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
)
const BOOTH_SIGNUP_FILE_PATH = path.join(__dirname, '..', 'public', 'booth-signup.html')
app.use((req, res, next) => {
  if (SIGNUP_HOSTS.size === 0) return next()
  const host = String(req.hostname || '').toLowerCase()
  if (!SIGNUP_HOSTS.has(host)) return next()

  // On the sign-up host: only serve the kiosk and let its POST
  // submission through. Everything else — the SPA, admin API,
  // login, PDFs, submissions viewer — is 404.
  if (req.method === 'GET' && (req.path === '/' || req.path === '/sign-up' || req.path === '/booth-signup')) {
    return res.sendFile(BOOTH_SIGNUP_FILE_PATH)
  }
  if (req.method === 'POST' && req.path === '/api/booth-signup') return next()
  if (req.method === 'GET' && req.path === '/api/health') return next()
  return res.status(404).send('Not found')
})

// Wrap an async route handler so unhandled rejections become a 500
// instead of crashing the process.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const FORM_FILE = path.join(__dirname, '..', 'public', 'registration.html')
app.get('/register', (_req, res) => res.sendFile(FORM_FILE))

const STAFF_FORM_FILE = path.join(__dirname, '..', 'public', 'staff-form.html')
app.get('/staff-form', (_req, res) => res.sendFile(STAFF_FORM_FILE))

const CUSTOM_FORM_FILE = path.join(__dirname, '..', 'public', 'form.html')
app.get('/form/:id', (_req, res) => res.sendFile(CUSTOM_FORM_FILE))

const BOOTH_SIGNUP_FILE = path.join(__dirname, '..', 'public', 'booth-signup.html')
app.get('/sign-up',      (_req, res) => res.sendFile(BOOTH_SIGNUP_FILE))
// Old URL kept as an alias so any links already shared keep working.
app.get('/booth-signup', (_req, res) => res.sendFile(BOOTH_SIGNUP_FILE))

// Production: serve built React admin from /dist
const DIST_DIR = path.join(__dirname, '..', 'dist')
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^\/(?!api|register|staff-form|form\/|booth-signup|sign-up).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

app.get('/api/registrations', wrap(async (_req, res) => {
  res.json(await getRegistrations())
}))

// Shared helper: take a per-student form, save it (creating or merging into
// an existing record) and return the resulting record. Mutates `records`.
function processStudentForm(records, perStudentForm) {
  const record = registrationToRecord(perStudentForm)

  const norm = (s) => String(s || '').trim().toLowerCase()
  const key = {
    fn: norm(perStudentForm.studentFirstName),
    ln: norm(perStudentForm.studentLastName),
    em: norm(perStudentForm.studentEmail),
  }
  const existing = records.find((r) => {
    const rfn = norm(r.student?.firstName)
    const rln = norm(r.student?.lastName)
    const rem = norm(r.student?.email)
    if (rfn !== key.fn || rln !== key.ln) return false
    if (key.em && rem) return key.em === rem
    return true
  })

  if (existing) {
    const sigOf = (p) => `${p.program || ''}|${p.schedule || ''}|${p.platform || ''}`.toLowerCase()
    const existingSigs = new Set((existing.programs || []).map(sigOf))
    const newPrograms = (record.programs || []).filter((p) => !existingSigs.has(sigOf(p)))
    existing.programs = [...(existing.programs || []), ...newPrograms]
    console.log(`[registration] ~ merged ${newPrograms.length} program(s) into ${existing.displayName} (${existing.id})`)
    return existing
  }

  records.push(record)
  console.log(`[registration] + ${record.displayName} (${record.id})`)
  return record
}

app.post('/api/registrations', wrap(async (req, res) => {
  const body = req.body || {}

  if (body.website) {
    return res.status(201).json({ ok: true })
  }

  if (Array.isArray(body.students)) {
    if (body.students.length === 0) {
      return res.status(400).json({ error: 'students array is empty' })
    }
    for (const s of body.students) {
      if (!String(s.studentFirstName || '').trim() || !String(s.studentLastName || '').trim()) {
        return res.status(400).json({ error: 'studentFirstName and studentLastName are required for each student' })
      }
    }

    const records = await getRegistrations()
    const created = body.students.map((s) => {
      const perStudentForm = { ...body, ...s }
      delete perStudentForm.students
      return processStudentForm(records, perStudentForm)
    })
    await commitRegistrations(records)

    sendRegistrationEmails(body, created).catch(() => {})
    return res.status(201).json(created)
  }

  const form = body
  if (!String(form.studentFirstName || '').trim() || !String(form.studentLastName || '').trim()) {
    return res.status(400).json({ error: 'studentFirstName and studentLastName are required' })
  }
  const records = await getRegistrations()
  const record = processStudentForm(records, form)
  await commitRegistrations(records)
  sendRegistrationEmails(form, record).catch(() => {})
  res.status(record === records[records.length - 1] ? 201 : 200).json(record)
}))

app.delete('/api/registrations/:id', wrap(async (req, res) => {
  const records = await getRegistrations()
  const next = records.filter((r) => r.id !== req.params.id)
  await commitRegistrations(next)
  res.json({ deleted: records.length - next.length })
}))

app.put('/api/registrations/:id/student', wrap(async (req, res) => {
  const records = await getRegistrations()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  records[idx] = { ...records[idx], student: { ...records[idx].student, ...req.body } }
  await commitRegistrations(records)
  res.json({ ok: true })
}))

app.put('/api/registrations/:id/customer', wrap(async (req, res) => {
  const records = await getRegistrations()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  records[idx] = { ...records[idx], customer: { ...records[idx].customer, ...req.body } }
  await commitRegistrations(records)
  res.json({ ok: true })
}))

app.put('/api/registrations/:id/programs', wrap(async (req, res) => {
  const programs = req.body
  if (!Array.isArray(programs)) return res.status(400).json({ error: 'body must be an array' })
  const records = await getRegistrations()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  records[idx] = { ...records[idx], programs }
  await commitRegistrations(records)
  res.json({ ok: true })
}))

app.put('/api/registrations/:id/craniaCash', wrap(async (req, res) => {
  const { craniaCash } = req.body
  if (typeof craniaCash !== 'number' || craniaCash < 0) return res.status(400).json({ error: 'craniaCash must be a non-negative number' })
  const records = await getRegistrations()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  records[idx] = { ...records[idx], student: { ...records[idx].student, craniaCash } }
  await commitRegistrations(records)
  res.json({ ok: true })
}))

app.get('/api/comments/:studentId', wrap(async (req, res) => {
  const all = await loadComments()
  res.json(all[req.params.studentId] || {})
}))

app.put('/api/comments/:studentId/:tabKey', wrap(async (req, res) => {
  const { studentId, tabKey } = req.params
  const rows = req.body
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'body must be an array of rows' })
  await saveCommentsForTab(studentId, tabKey, rows)
  res.json({ ok: true })
}))

app.post('/api/registrations/:id/cashEntry', wrap(async (req, res) => {
  const { delta, reason } = req.body || {}
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return res.status(400).json({ error: 'delta must be a finite number' })
  }
  const records = await getRegistrations()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  const rec = records[idx]
  const log = Array.isArray(rec.cashLog) ? rec.cashLog : []
  const entry = { ts: new Date().toISOString(), delta, reason: String(reason || '').trim() || '—' }
  const newBalance = (rec.student?.craniaCash || 0) + delta
  records[idx] = {
    ...rec,
    cashLog: [...log, entry],
    student: { ...rec.student, craniaCash: newBalance },
  }
  await commitRegistrations(records)
  res.json({ ok: true, balance: newBalance, entry })
}))

app.get('/api/rules', wrap(async (_req, res) => res.json(await getRules())))
app.put('/api/rules', wrap(async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'body must be an array' })
  const cleaned = req.body
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      id: String(r.id || Math.random().toString(36).slice(2, 9)),
      reason: String(r.reason || '').trim(),
      delta: Number(r.delta) || 0,
    }))
  await commitRules(cleaned)
  res.json({ ok: true, rules: cleaned })
}))

app.get('/api/programs', wrap(async (_req, res) => {
  let programs = await getPrograms()
  if (programs.length === 0) {
    // first run on a fresh DB — seed from the bundled programsData.json
    try {
      const seedPath = path.join(__dirname, '..', 'src', 'data', 'programsData.json')
      const raw = fs.readFileSync(seedPath, 'utf8')
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) {
        await commitPrograms(arr)
        programs = arr
      }
    } catch {}
  }
  res.json(programs)
}))

app.put('/api/programs', wrap(async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'body must be an array' })
  await commitPrograms(req.body)
  res.json({ ok: true })
}))

app.put('/api/programs/decrement-spots', wrap(async (req, res) => {
  const decrements = req.body || []
  if (!Array.isArray(decrements)) return res.status(400).json({ error: 'body must be an array of {programIdx, offeringIdx}' })
  const programs = await getPrograms()
  let count = 0
  decrements.forEach(function(d) {
    const programIdx = parseInt(d.programIdx, 10)
    const offeringIdx = parseInt(d.offeringIdx, 10)
    if (!isNaN(programIdx) && !isNaN(offeringIdx)) {
      const p = programs[programIdx]
      if (p && p.offerings && p.offerings[offeringIdx]) {
        const spots = p.offerings[offeringIdx].spots
        if (spots > 0) {
          p.offerings[offeringIdx].spots--
          count++
        }
      }
    }
  })
  if (count > 0) await commitPrograms(programs)
  res.json({ ok: true, decremented: count })
}))

app.get('/api/staff-board', wrap(async (_req, res) => res.json(await loadStaffBoard())))
app.put('/api/staff-board', wrap(async (req, res) => {
  const body = req.body
  if (!body || !Array.isArray(body.lists)) return res.status(400).json({ error: 'body must have a lists array' })
  await saveStaffBoard(body)
  res.json({ ok: true })
}))

app.get('/api/staff', wrap(async (_req, res) => res.json(await getStaff())))

app.post('/api/staff', wrap(async (req, res) => {
  const body = req.body || {}
  if (!String(body.firstName || '').trim() || !String(body.lastName || '').trim()) {
    return res.status(400).json({ error: 'firstName and lastName are required' })
  }
  const staff = await getStaff()
  const id = `staff-${Date.now().toString(36)}`
  const record = {
    id,
    firstName: '', lastName: '', gender: '', dob: '', age: '',
    email: '', phone: '', role: 'Teacher', startDate: '',
    address: '', city: '', province: '', postalCode: '',
    emergencyName: '', emergencyPhone: '',
    notes: [], active: true,
    ...body,
  }
  staff.push(record)
  await commitStaff(staff)
  res.status(201).json(record)
}))

app.put('/api/staff/:id', wrap(async (req, res) => {
  const staff = await getStaff()
  const idx = staff.findIndex((s) => s.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  staff[idx] = { ...staff[idx], ...req.body, id: staff[idx].id }
  await commitStaff(staff)
  res.json({ ok: true })
}))

app.delete('/api/staff/:id', wrap(async (req, res) => {
  const staff = await getStaff()
  const next = staff.filter((s) => s.id !== req.params.id)
  await commitStaff(next)
  res.json({ deleted: staff.length - next.length })
}))

// ---- inventory ------------------------------------------
app.get('/api/inventory', wrap(async (_req, res) => res.json(await getInventory())))

app.post('/api/inventory', wrap(async (req, res) => {
  const items = await getInventory()
  const id = Math.max(0, ...items.map(i => i.id || 0)) + 1
  const record = {
    id,
    category: String(req.body.category || '').trim(),
    name: String(req.body.name || '').trim(),
    size: req.body.size || null,
    qty: Number(req.body.qty) || 0,
    price: Number(req.body.price) || 0,
  }
  items.push(record)
  await commitInventory(items)
  res.status(201).json(record)
}))

app.put('/api/inventory/:id', wrap(async (req, res) => {
  const items = await getInventory()
  const idx = items.findIndex((i) => i.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  items[idx] = {
    ...items[idx],
    category: req.body.category !== undefined ? String(req.body.category).trim() : items[idx].category,
    name: req.body.name !== undefined ? String(req.body.name).trim() : items[idx].name,
    size: req.body.size !== undefined ? req.body.size : items[idx].size,
    qty: req.body.qty !== undefined ? Number(req.body.qty) : items[idx].qty,
    price: req.body.price !== undefined ? Number(req.body.price) : items[idx].price,
  }
  await commitInventory(items)
  res.json({ ok: true })
}))

app.delete('/api/inventory/:id', wrap(async (req, res) => {
  const items = await getInventory()
  const next = items.filter((i) => i.id !== Number(req.params.id))
  await commitInventory(next)
  res.json({ deleted: items.length - next.length })
}))

// ---- booth signups (Crania Schools booth kiosk) --------
// Public POST: upsert-by-email so a family can submit multiple
// forms (assessment, open house, agenda order) under the same email.
// Admin GET: list all sign-ups (used by the Forms page).
app.post('/api/booth-signup', wrap(async (req, res) => {
  const body = req.body || {}
  const email = String(body.email || '').toLowerCase().trim()
  if (!email) return res.status(400).json({ error: 'email is required' })
  try {
    const result = await upsertBoothSignup(body)
    if (result.conflict) return res.status(409).json(result)

    // Fire-and-forget: notify events@ with the full merged record.
    // Which form triggered this submission is inferred from the fields
    // present on the request body (not the merged record, so we don't
    // re-notify about assessments the family booked days ago).
    const kind = body.assessDate ? 'assessment'
      : body.openHouse ? 'openHouse'
      : body.agenda    ? 'agenda'
      : null
    if (kind) {
      sendBoothSignupEmail(result.entry, kind)
        .catch(err => console.error('[booth-email]', err))
    }

    res.json({ ok: true, count: result.count })
  } catch (err) {
    console.error('[booth-signup]', err)
    res.status(500).json({ error: err?.message || 'save failed' })
  }
}))

app.get('/api/booth-signup', wrap(async (_req, res) => {
  const list = await loadBoothSignups()
  // Newest first
  list.sort((a, b) => (b.when || '').localeCompare(a.when || ''))
  res.json(list)
}))

app.delete('/api/booth-signup/:email', wrap(async (req, res) => {
  await deleteBoothSignup(req.params.email)
  res.json({ ok: true })
}))

// ---- fee schedule PDF + email ---------------------------
// The client posts the fully-computed schedule (timeline + numbers)
// and we render it to a PDF via pdfkit. Two endpoints share the
// same generator: /pdf downloads the buffer, /email attaches it to
// a SendGrid message to the parent.
app.post('/api/fee-schedule/pdf', wrap(async (req, res) => {
  const pdf = await generateFeeSchedulePdf(req.body || {})
  const filename = (req.body?.filename || 'tuition-schedule.pdf').replace(/[^\w.-]+/g, '_')
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(pdf)
}))

// ---- todo (singleton {lists, items, checklists}) --------
app.get('/api/todo', wrap(async (_req, res) => res.json(await loadTodo())))
app.put('/api/todo', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    lists:      Array.isArray(body.lists) ? body.lists : [],
    items:      Array.isArray(body.items) ? body.items : [],
    checklists: Array.isArray(body.checklists) ? body.checklists : [],
  }
  await saveTodo(payload)
  res.json({ ok: true })
}))

// ---- finance (singleton {invoices, payments, meta}) -----
// The whole payload is written on every save. That's fine at the
// expected volume (few thousand transactions per year for a small
// school) and lets the four financial pages share one shape.
app.get('/api/finance', wrap(async (_req, res) => res.json(await loadFinance())))
app.put('/api/finance', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    invoices: Array.isArray(body.invoices) ? body.invoices : [],
    payments: Array.isArray(body.payments) ? body.payments : [],
    meta: {
      nextInvoiceNumber: Number(body.meta?.nextInvoiceNumber) || 1001,
      nextReceiptNumber: Number(body.meta?.nextReceiptNumber) || 1001,
    },
  }
  await saveFinance(payload)
  res.json({ ok: true })
}))

// ---- projects (kanban board — singleton payload) --------
// Same shape as the client's "crania-projects.json" export so
// JSON round-trips cleanly. Whole payload written on every save.
app.get('/api/projects', wrap(async (_req, res) => res.json(await loadProjects())))
app.put('/api/projects', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    cards:            Array.isArray(body.cards) ? body.cards : [],
    updatedAt:        body.updatedAt || new Date().toISOString(),
    lastReset:        body.lastReset || null,
    lastResetAt:      body.lastResetAt || null,
    resetTime:        body.resetTime || '08:00',
    lastBackup:       body.lastBackup || null,
    lastBackupAt:     body.lastBackupAt || null,
    clearGoals:       !!body.clearGoals,
    clearGoalsTime:   body.clearGoalsTime || '00:00',
    lastGoalsClear:   body.lastGoalsClear || null,
    lastGoalsClearAt: body.lastGoalsClearAt || null,
    colOrder:         Array.isArray(body.colOrder) && body.colOrder.length
                        ? body.colOrder
                        : ['notes', 'goals', 'daily', 'todo', 'doing', 'done'],
  }
  await saveProjects(payload)
  res.json({ ok: true })
}))

// ---- forms (custom form builder) ------------------------
// A "form" is a definition: title + ordered field list. Anyone
// with the form's shareable URL (/form/:slug) can submit it, and
// submissions land in the formSubmissions collection.
//
// Each form has:
//   id    — random, immutable. Used as recordId + submissions FK.
//   slug  — derived from title, unique, URL-friendly. Regenerated
//           when the title changes. Public URLs use this.
// The public route accepts either — so old links keep working.

const slugify = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')  // strip accents
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60)

const uniqueSlug = (base, forms, excludeId) => {
  const taken = new Set(forms.filter(f => f.id !== excludeId).map(f => f.slug).filter(Boolean))
  const root = base || 'form'
  if (!taken.has(root)) return root
  let n = 2
  while (taken.has(`${root}-${n}`)) n++
  return `${root}-${n}`
}

const findForm = (forms, key) => forms.find(f =>
  String(f.slug) === String(key) || String(f.id) === String(key)
)

app.get('/api/forms', wrap(async (_req, res) => res.json(await getForms())))

app.get('/api/forms/:key', wrap(async (req, res) => {
  const form = findForm(await getForms(), req.params.key)
  if (!form) return res.status(404).json({ error: 'not found' })
  res.json(form)
}))

app.post('/api/forms', wrap(async (req, res) => {
  const forms = await getForms()
  const id = 'form-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
  const title = String(req.body.title || 'Untitled Form').trim()
  const record = {
    id,
    slug:        uniqueSlug(slugify(title), forms),
    title,
    description: String(req.body.description || '').trim(),
    fields:      Array.isArray(req.body.fields) ? req.body.fields : [],
    createdAt:   new Date().toISOString(),
  }
  forms.push(record)
  await commitForms(forms)
  res.status(201).json(record)
}))

app.put('/api/forms/:id', wrap(async (req, res) => {
  const forms = await getForms()
  const idx = forms.findIndex((f) => String(f.id) === String(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  const current = forms[idx]
  const nextTitle = req.body.title !== undefined ? String(req.body.title).trim() : current.title
  // Regenerate slug when the title changes (or when the form doesn't have one yet).
  const nextSlug = (!current.slug || nextTitle !== current.title)
    ? uniqueSlug(slugify(nextTitle), forms, current.id)
    : current.slug
  forms[idx] = {
    ...current,
    title:       nextTitle,
    slug:        nextSlug,
    description: req.body.description !== undefined ? String(req.body.description).trim() : current.description,
    fields:      Array.isArray(req.body.fields) ? req.body.fields : current.fields,
  }
  await commitForms(forms)
  res.json(forms[idx])
}))

app.delete('/api/forms/:id', wrap(async (req, res) => {
  const forms = await getForms()
  const next = forms.filter((f) => String(f.id) !== String(req.params.id))
  await commitForms(next)
  await deleteSubmissionsForForm(String(req.params.id))
  res.json({ deleted: forms.length - next.length })
}))

// ---- submissions ---
// Public — no auth. Rate-limit / CAPTCHA can be added later.
app.post('/api/forms/:key/submit', wrap(async (req, res) => {
  const form = findForm(await getForms(), req.params.key)
  if (!form) return res.status(404).json({ error: 'form not found' })

  const answers = (req.body && typeof req.body.answers === 'object') ? req.body.answers : {}
  // Enforce required fields server-side.
  for (const field of form.fields || []) {
    if (field.required) {
      const v = answers[field.key]
      const empty = v === undefined || v === null || v === '' ||
                    (Array.isArray(v) && v.length === 0)
      if (empty) return res.status(400).json({ error: `Missing required field: ${field.label || field.key}` })
    }
  }

  const submission = {
    id:          'sub-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    formId:      String(form.id),
    answers,
    submittedAt: new Date().toISOString(),
  }
  await createSubmission(submission)
  res.status(201).json({ ok: true, id: submission.id })
}))

app.get('/api/forms/:id/submissions', wrap(async (req, res) => {
  const subs = await loadSubmissions(String(req.params.id))
  // newest first
  subs.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
  res.json(subs)
}))

app.delete('/api/forms/:formId/submissions/:subId', wrap(async (req, res) => {
  await deleteSubmission(String(req.params.subId))
  res.json({ ok: true })
}))

// Error handler — any thrown error from a wrap()-ed handler lands here
app.use((err, _req, res, _next) => {
  console.error('[api error]', err?.response || err?.message || err)
  res.status(500).json({ error: err?.message || 'internal error' })
})

async function start() {
  try {
    await migrateRegistrations()
    await seedIfEmpty()
  } catch (err) {
    console.error('Startup migration failed:', err?.message || err)
    console.error('The server will still start, but PocketBase may not be reachable yet.')
  }
  app.listen(PORT, () => {
    console.log(`CraniaVerse API listening on http://localhost:${PORT}`)
    console.log(`Backed by PocketBase at ${process.env.PB_URL || 'http://127.0.0.1:8090'}`)
  })
}

start()
