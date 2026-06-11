// ============================================================
// CraniaVerse backend — a small registration API
// ------------------------------------------------------------
// Stores submissions in a plain JSON file (server/data.json) — no
// database engine to install. Fine for a single-location school.
//
//   GET  /api/health         -> { ok: true }
//   GET  /api/registrations  -> [ record, ... ]   (admin app reads this)
//   POST /api/registrations  -> creates a record  (forms write this)
//   DELETE /api/registrations/:id -> removes a record
//
// Run:  npm install  &&  npm start     (listens on http://localhost:4000)
// ============================================================
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { registrationToRecord, makeSeedRecord } from './mapping.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, 'data.json')
const COMMENTS_FILE = path.join(__dirname, 'comments.json')
const RULES_FILE = path.join(__dirname, 'rules.json')
const STAFF_FILE = path.join(__dirname, 'staff.json')
const PROGRAMS_FILE = path.join(__dirname, 'programs.json')
const PROGRAMS_SEED = path.join(__dirname, '..', 'src', 'data', 'programsData.json')
const STAFF_BOARD_FILE = path.join(__dirname, 'staff-board.json')
const PORT = process.env.PORT || 4000

const DEFAULT_RULES = [
  { id: 'present', reason: 'Present', delta: 1 },
  { id: 'no-shirt', reason: 'No Shirt', delta: -5 },
]

// ---- registrations store -----------------------------------
function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr
  } catch {
    // file missing or unreadable — fall through to seed
  }
  const seeded = [makeSeedRecord()]
  save(seeded)
  return seeded
}
function save(records) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2))
}

// ---- comments store ----------------------------------------
// Shape: { [studentId]: { [tabKey]: [ row, ... ] } }
function loadComments() {
  try {
    const raw = fs.readFileSync(COMMENTS_FILE, 'utf8')
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') return obj
  } catch {}
  return {}
}
function saveComments(data) {
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(data, null, 2))
}

// ---- migrate records missing the programs / cashLog fields ------------
function migrate() {
  const records = load()
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
  if (changed) save(records)
}
migrate()

// ---- staff store -------------------------------------------
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
function loadStaff() {
  try {
    const raw = fs.readFileSync(STAFF_FILE, 'utf8')
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr
  } catch {}
  saveStaff(DEFAULT_STAFF)
  return DEFAULT_STAFF
}
function saveStaff(staff) {
  fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 2))
}

// ---- rules store -------------------------------------------
function loadRules() {
  try {
    const raw = fs.readFileSync(RULES_FILE, 'utf8')
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr
  } catch {}
  saveRules(DEFAULT_RULES)
  return DEFAULT_RULES
}
function saveRules(rules) {
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2))
}

// ---- app ---------------------------------------------------
const app = express()
app.use(cors())                       // allow the form + Vite dev server (any origin) for local use
app.use(express.json({ limit: '1mb' }))

// Allow the public school website to embed /register and /staff-form in an iframe.
// Override with the ALLOWED_FRAME_ANCESTORS env var (space-separated origins).
// Default locks embedding to the official school site.
const ALLOWED_FRAME_ANCESTORS = process.env.ALLOWED_FRAME_ANCESTORS
  || "'self' https://crania-schools.com https://www.crania-schools.com"
app.use((req, res, next) => {
  if (req.path === '/register' || req.path === '/staff-form') {
    res.setHeader('Content-Security-Policy', `frame-ancestors ${ALLOWED_FRAME_ANCESTORS}`)
  }
  next()
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Serve the standalone registration form at /register
const FORM_FILE = path.join(__dirname, '..', 'public', 'registration.html')
app.get('/register', (_req, res) => res.sendFile(FORM_FILE))

// Serve the standalone staff information form at /staff-form
const STAFF_FORM_FILE = path.join(__dirname, '..', 'public', 'staff-form.html')
app.get('/staff-form', (_req, res) => res.sendFile(STAFF_FORM_FILE))

// In production, serve the built React admin from /dist (created by `npm run build`).
// Anything that's not an API route, /register, or /staff-form falls back to index.html
// so the in-app navigation works.
const DIST_DIR = path.join(__dirname, '..', 'dist')
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^\/(?!api|register|staff-form).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

app.get('/api/registrations', (_req, res) => {
  res.json(load())
})

app.post('/api/registrations', (req, res) => {
  const form = req.body || {}
  // Minimal server-side guard so junk doesn't create blank records.
  if (!String(form.studentFirstName || '').trim() || !String(form.studentLastName || '').trim()) {
    return res.status(400).json({ error: 'studentFirstName and studentLastName are required' })
  }
  if (form.website) {
    // honeypot field was filled -> almost certainly a bot. Pretend success, store nothing.
    return res.status(201).json({ ok: true })
  }
  const record = registrationToRecord(form)
  const records = load()

  // Dedupe: if a student with the same first/last name (+ email when present)
  // already exists, merge incoming programs into the existing record instead
  // of creating a duplicate.
  const norm = (s) => String(s || '').trim().toLowerCase()
  const incomingKey = {
    fn: norm(form.studentFirstName),
    ln: norm(form.studentLastName),
    em: norm(form.studentEmail),
  }
  const existing = records.find((r) => {
    const rfn = norm(r.student?.firstName)
    const rln = norm(r.student?.lastName)
    const rem = norm(r.student?.email)
    if (rfn !== incomingKey.fn || rln !== incomingKey.ln) return false
    // If both sides have an email, require match; otherwise name match is enough.
    if (incomingKey.em && rem) return incomingKey.em === rem
    return true
  })

  if (existing) {
    // Append only new programs (same program+schedule+platform is treated as already-on-file)
    const sigOf = (p) => `${p.program || ''}|${p.schedule || ''}|${p.platform || ''}`.toLowerCase()
    const existingSigs = new Set((existing.programs || []).map(sigOf))
    const newPrograms = (record.programs || []).filter((p) => !existingSigs.has(sigOf(p)))
    existing.programs = [...(existing.programs || []), ...newPrograms]
    save(records)
    console.log(`[registration] ~ merged ${newPrograms.length} program(s) into ${existing.displayName} (${existing.id})`)
    return res.status(200).json(existing)
  }

  records.push(record)
  save(records)
  console.log(`[registration] + ${record.displayName} (${record.id})`)
  res.status(201).json(record)
})

app.delete('/api/registrations/:id', (req, res) => {
  const records = load()
  const next = records.filter((r) => r.id !== req.params.id)
  save(next)
  res.json({ deleted: records.length - next.length })
})

// PUT /api/registrations/:id/student  -> update student fields
app.put('/api/registrations/:id/student', (req, res) => {
  const records = load()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  records[idx] = { ...records[idx], student: { ...records[idx].student, ...req.body } }
  save(records)
  res.json({ ok: true })
})

// PUT /api/registrations/:id/customer  -> update customer (guardian/emergency) fields
app.put('/api/registrations/:id/customer', (req, res) => {
  const records = load()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  records[idx] = { ...records[idx], customer: { ...records[idx].customer, ...req.body } }
  save(records)
  res.json({ ok: true })
})

// PUT /api/registrations/:id/programs  -> replace programs list for a student
app.put('/api/registrations/:id/programs', (req, res) => {
  const programs = req.body
  if (!Array.isArray(programs)) return res.status(400).json({ error: 'body must be an array' })
  const records = load()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  records[idx] = { ...records[idx], programs }
  save(records)
  res.json({ ok: true })
})

// PUT /api/registrations/:id/craniaCash  -> update student's crania cash
app.put('/api/registrations/:id/craniaCash', (req, res) => {
  const { craniaCash } = req.body
  if (typeof craniaCash !== 'number' || craniaCash < 0) return res.status(400).json({ error: 'craniaCash must be a non-negative number' })
  const records = load()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  records[idx] = { ...records[idx], student: { ...records[idx].student, craniaCash } }
  save(records)
  res.json({ ok: true })
})

// GET /api/comments/:studentId  -> { tabKey: [rows] }
app.get('/api/comments/:studentId', (req, res) => {
  const all = loadComments()
  res.json(all[req.params.studentId] || {})
})

// PUT /api/comments/:studentId/:tabKey  -> save rows for one tab
app.put('/api/comments/:studentId/:tabKey', (req, res) => {
  const { studentId, tabKey } = req.params
  const rows = req.body
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'body must be an array of rows' })
  const all = loadComments()
  if (!all[studentId]) all[studentId] = {}
  all[studentId][tabKey] = rows
  saveComments(all)
  res.json({ ok: true })
})

// POST /api/registrations/:id/cashEntry  -> append cash log entry, update balance
app.post('/api/registrations/:id/cashEntry', (req, res) => {
  const { delta, reason } = req.body || {}
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return res.status(400).json({ error: 'delta must be a finite number' })
  }
  const records = load()
  const idx = records.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  const rec = records[idx]
  const log = Array.isArray(rec.cashLog) ? rec.cashLog : []
  const entry = { ts: new Date().toISOString(), delta, reason: String(reason || '').trim() || '—' }
  const newBalance = (rec.student?.craniaCash || 0) + delta // can go negative
  records[idx] = {
    ...rec,
    cashLog: [...log, entry],
    student: { ...rec.student, craniaCash: newBalance },
  }
  save(records)
  res.json({ ok: true, balance: newBalance, entry })
})

// GET / PUT /api/rules
app.get('/api/rules', (_req, res) => res.json(loadRules()))
app.put('/api/rules', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'body must be an array' })
  const cleaned = req.body
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      id: String(r.id || Math.random().toString(36).slice(2, 9)),
      reason: String(r.reason || '').trim(),
      delta: Number(r.delta) || 0,
    }))
  saveRules(cleaned)
  res.json({ ok: true, rules: cleaned })
})

// ---- programs store ----------------------------------------
function loadPrograms() {
  try {
    const raw = fs.readFileSync(PROGRAMS_FILE, 'utf8')
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr
  } catch {}
  // first run — seed from the bundled programsData.json
  try {
    const raw = fs.readFileSync(PROGRAMS_SEED, 'utf8')
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      savePrograms(arr)
      return arr
    }
  } catch {}
  savePrograms([])
  return []
}
function savePrograms(programs) {
  fs.writeFileSync(PROGRAMS_FILE, JSON.stringify(programs, null, 2))
}

app.get('/api/programs', (_req, res) => res.json(loadPrograms()))
app.put('/api/programs', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'body must be an array' })
  savePrograms(req.body)
  res.json({ ok: true })
})

// ---- decrement spots for registered offerings ---------------
app.put('/api/programs/decrement-spots', (req, res) => {
  const decrements = req.body || []
  if (!Array.isArray(decrements)) return res.status(400).json({ error: 'body must be an array of {programIdx, offeringIdx}' })
  const programs = loadPrograms()
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
  if (count > 0) savePrograms(programs)
  res.json({ ok: true, decremented: count })
})

// ---- staff hub (Trello-style board) ------------------------
const DEFAULT_STAFF_BOARD = {
  lists: [
    { id: 'l1', title: 'To Do', cards: [] },
    { id: 'l2', title: 'In Progress', cards: [] },
    { id: 'l3', title: 'Done', cards: [] },
  ],
}
function loadStaffBoard() {
  try {
    const raw = fs.readFileSync(STAFF_BOARD_FILE, 'utf8')
    const obj = JSON.parse(raw)
    if (obj && Array.isArray(obj.lists)) return obj
  } catch {}
  saveStaffBoard(DEFAULT_STAFF_BOARD)
  return DEFAULT_STAFF_BOARD
}
function saveStaffBoard(board) {
  fs.writeFileSync(STAFF_BOARD_FILE, JSON.stringify(board, null, 2))
}
app.get('/api/staff-board', (_req, res) => res.json(loadStaffBoard()))
app.put('/api/staff-board', (req, res) => {
  const body = req.body
  if (!body || !Array.isArray(body.lists)) return res.status(400).json({ error: 'body must have a lists array' })
  saveStaffBoard(body)
  res.json({ ok: true })
})

// ---- staff endpoints ---------------------------------------
app.get('/api/staff', (_req, res) => res.json(loadStaff()))

app.post('/api/staff', (req, res) => {
  const body = req.body || {}
  if (!String(body.firstName || '').trim() || !String(body.lastName || '').trim()) {
    return res.status(400).json({ error: 'firstName and lastName are required' })
  }
  const staff = loadStaff()
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
  saveStaff(staff)
  res.status(201).json(record)
})

app.put('/api/staff/:id', (req, res) => {
  const staff = loadStaff()
  const idx = staff.findIndex((s) => s.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  staff[idx] = { ...staff[idx], ...req.body, id: staff[idx].id }
  saveStaff(staff)
  res.json({ ok: true })
})

app.delete('/api/staff/:id', (req, res) => {
  const staff = loadStaff()
  const next = staff.filter((s) => s.id !== req.params.id)
  saveStaff(next)
  res.json({ deleted: staff.length - next.length })
})

app.listen(PORT, () => {
  console.log(`CraniaVerse API listening on http://localhost:${PORT}`)
  console.log(`Data file: ${DATA_FILE}`)
})
