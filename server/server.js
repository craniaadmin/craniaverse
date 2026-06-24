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
import { sendRegistrationEmails } from './email.js'
import {
  loadRegistrations, saveRegistrations,
  loadStaff,         saveStaff,
  loadPrograms,      savePrograms,
  loadRules,         saveRules,
  loadComments,      saveCommentsForTab,
  loadStaffBoard,    saveStaffBoard,
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
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const ALLOWED_FRAME_ANCESTORS = process.env.ALLOWED_FRAME_ANCESTORS
  || "'self' https://crania-schools.com https://www.crania-schools.com"
app.use((req, res, next) => {
  if (req.path === '/register' || req.path === '/staff-form') {
    res.setHeader('Content-Security-Policy', `frame-ancestors ${ALLOWED_FRAME_ANCESTORS}`)
  }
  next()
})

// Wrap an async route handler so unhandled rejections become a 500
// instead of crashing the process.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const FORM_FILE = path.join(__dirname, '..', 'public', 'registration.html')
app.get('/register', (_req, res) => res.sendFile(FORM_FILE))

const STAFF_FORM_FILE = path.join(__dirname, '..', 'public', 'staff-form.html')
app.get('/staff-form', (_req, res) => res.sendFile(STAFF_FORM_FILE))

// Production: serve built React admin from /dist
const DIST_DIR = path.join(__dirname, '..', 'dist')
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^\/(?!api|register|staff-form).*/, (_req, res) => {
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
