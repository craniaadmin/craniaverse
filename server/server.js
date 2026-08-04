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
import { currentAcademicYear } from '../src/data/scheduleUtils.js'
import { buildEnrolmentIndex, sessionsOf, sessionKey } from '../src/data/enrolment.js'
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
  loadProgramsState, saveProgramsState,
  loadRules,         saveRules,
  loadComments,      saveCommentsForTab,
  loadStaffBoard,    saveStaffBoard,
  loadInventory,     saveInventory,
  loadFinance,       saveFinance,
  loadProjects,      saveProjects,
  loadItAccounts,    saveItAccounts,
  loadCalendar,      saveCalendar,
  listCalendarBackups, createCalendarBackup, restoreCalendarBackup,
  loadMarketingCalendar, saveMarketingCalendar,
  loadStock,         saveStock,
  loadCraniaStore,   saveCraniaStore,
  loadContests,      saveContests,
  loadTodo,          saveTodo,
  listTodoBackups,   createTodoBackup,  restoreTodoBackup,
  listChecklistBackups, createChecklistBackup, restoreChecklistBackup,
  listProjectBackups, createProjectBackup, restoreProjectBackup,
  listProgramsBackups, createProgramsBackup, restoreProgramsBackup,
  listCustomersBackups, createCustomersBackup, restoreCustomersBackup,
  loadBoothSignups,  upsertBoothSignup, deleteBoothSignup,
  loadForms,         saveForms,
  loadSubmissions,   createSubmission,
  deleteSubmission,  deleteSubmissionsForForm,
  loadSurveys,       saveSurveys,
  loadSurveySubmissions,   createSurveySubmission,
  deleteSurveySubmission,  deleteSurveySubmissionsForSurvey,
  loadCampaigns,     saveCampaigns,
  loadLeads,         saveLeads,
  loadContacts,      saveContacts,
} from './pb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })
const PORT = process.env.PORT || 4000

const DEFAULT_RULES = [
  { id: 'present', reason: 'Present', delta: 1 },
  { id: 'no-shirt', reason: 'No Shirt', delta: -5 },
]

// The original hardcoded Family Feedback Survey, now the first-class
// "built-in" survey row — still editable/deletable like any other,
// but always present on first boot so nothing is lost by moving to a
// multi-survey model.
const DEFAULT_SURVEY = {
  id: 'survey-family-feedback',
  title: 'Family Feedback Survey',
  intro: 'Dear Parents,\n\nThank you for taking the time to fill out this survey. We value your opinion! Complete your responses by February 28, 2025 to be entered into a draw for $100 OFF your next month (if contact information is provided; draw date Mar 1, 2025).\n\nThis survey is fully anonymous and personal data is completely optional. The survey should take approximately three (3) minutes to fill out, and we thank you again for taking the time out of your day.\n\nResponses will be used to enhance your experience at Crania Schools and may be used for Crania Schools publications.\n\nWith gratitude,\nCrania Schools',
  questions: [
    { id: 'q2', type: 'radio', text: 'What is your age?',
      options: ['<30', '31–40', '41–50', '>50', 'Prefer not to answer'] },
    { id: 'q3', type: 'radio', text: 'What is your approximate average household income?',
      options: ['< $50,000', '$50,000 – $74,999', '$75,000 – $99,999', '$100,000 – $124,999', '$125,000 – $149,999', '> $150,000', 'Prefer not to answer'] },
    { id: 'q4', type: 'checkbox', text: 'What program(s) is your child enrolled in at Crania Schools?', note: 'Select all that apply.',
      options: ['Flex Math', 'Flex English', 'Math Enrichment', 'Teknokids (Robotics)', 'Teknokids (Coding)', 'Piano', 'Private Lessons (Math)', 'Private Lessons (Robotics)', 'Private Lessons (Coding)', 'Not attending any programs at the moment'] },
    { id: 'q5', type: 'radio', text: 'As a previous, current, or future customer of Crania Schools, my expectations have:',
      options: ['Been Exceeded', 'Been Met', 'Almost Been Met', 'Been Somewhat Met', 'Not Been Met'] },
    { id: 'q6', type: 'radio', text: 'I believe the cost of Crania Schools is:',
      options: ['Below Average', 'Average', 'Above Average'] },
    { id: 'q7', type: 'radio', text: 'The value I receive from Crania Schools:',
      options: ['Is Above My Expectations', 'Meets My Expectations', 'Is Below My Expectations'] },
    { id: 'q8', type: 'radio', text: 'The schedule/hours offered by Crania Schools are:',
      options: ['Very Convenient', 'Moderately Convenient', 'Neither Convenient nor Inconvenient', 'Moderately Inconvenient', 'Very Inconvenient'] },
    { id: 'q9', type: 'radio', text: 'The location of Crania Schools is:',
      options: ['Very Convenient', 'Moderately Convenient', 'Neither Convenient nor Inconvenient', 'Moderately Inconvenient', 'Very Inconvenient'] },
    { id: 'q10', type: 'radio', text: 'I am _________ with the quality of the Crania Schools facility.',
      options: ['Very Satisfied', 'Moderately Satisfied', 'Neither Satisfied nor Dissatisfied', 'Moderately Dissatisfied', 'Very Dissatisfied'] },
    { id: 'q11', type: 'radio', text: 'The attitude of the teachers at Crania Schools is:',
      options: ['Great', 'Good', 'Fair'] },
    { id: 'q12', type: 'textarea', text: 'Please share some comments about your overall experience, or any other thoughts you may have regarding Crania Schools:' },
    { id: 'q13', type: 'stars', text: 'How would you rate Crania Schools overall?', required: true },
  ],
  createdAt: new Date(0).toISOString(),
}

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
  programsState: null,
  rules:         null,
  inventory:     null,
  forms:         null,
  surveys:       null,
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

async function getProgramsState() {
  if (cache.programsState) return cache.programsState
  cache.programsState = await loadProgramsState()
  return cache.programsState
}
async function commitProgramsState(state) {
  cache.programsState = state
  await saveProgramsState(state)
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

async function getSurveys() {
  if (cache.surveys) return cache.surveys
  let surveys = await loadSurveys()
  if (surveys.length === 0) {
    surveys = [DEFAULT_SURVEY]
    await saveSurveys(surveys)
  }
  cache.surveys = surveys
  return cache.surveys
}
async function commitSurveys(surveys) {
  cache.surveys = surveys
  await saveSurveys(surveys)
}

// ---- registrations: one-time migration of legacy records ---
// Earlier records may be missing the programs / cashLog /
// student.notes fields. Pull all records, patch in-memory, and
// write back only if something changed.
async function migrateRegistrations() {
  const records = await getRegistrations()
  let changed = false
  records.forEach((r) => {
    if (!Array.isArray(r.programs)) {
      r.programs = r.registration?.program
        ? [{ year: currentAcademicYear(), program: r.registration.program }]
        : []
      changed = true
    }
    if (!Array.isArray(r.cashLog)) {
      r.cashLog = []
      changed = true
    }
    // The Students page reads student.notes as an array. A record saved
    // before the field existed has none, which used to take the whole
    // detail view down rather than showing an empty notes box.
    if (r.student && !Array.isArray(r.student.notes)) {
      r.student.notes = typeof r.student.notes === 'string' && r.student.notes
        ? r.student.notes.split('\n')
        : []
      changed = true
    }
  })
  if (changed) await commitRegistrations(records)
}

// ---- one-time seed if database is empty --------------------
// If the registrations collection is empty (first boot, no
// import yet), drop in a single seed record so the admin UI
// has something to render.
//
// Off unless SEED_IF_EMPTY=true. An empty registrations table is
// now far more likely to be deliberate — someone has just cleared
// it to start over — than to be a fresh install, and re-creating a
// record on the next restart quietly undoes that.
async function seedIfEmpty() {
  if (String(process.env.SEED_IF_EMPTY || '').toLowerCase() !== 'true') return
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
// 25 MB accommodates PUT /api/crania-store payloads with base64
// item images. Most requests are far smaller.
app.use(express.json({ limit: '25mb' }))

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

// ---- test-runner feedback (public) ---------------------
// Returns the latest continuous-tests summary written by
// tests/run.js. Public because the payload is just test names
// and error strings — no credentials, nothing sensitive — and
// making it public lets the scheduled Claude agent poll it
// without needing a stored admin password.
const LAST_RUN_FILE = path.join(__dirname, '..', 'tests', 'logs', 'last-run.json')
app.get('/api/tests/last-run', wrap(async (_req, res) => {
  try {
    const text = fs.readFileSync(LAST_RUN_FILE, 'utf8')
    res.type('application/json').send(text)
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return res.status(404).json({ error: 'no test run recorded yet' })
    }
    throw err
  }
}))

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
//
// The merge-into-existing behavior exists for the public registration form,
// where the same student may register for multiple programs and we want one
// record per student. But it matches on name alone when there's no email
// (see below), so it's WRONG for the admin "+ Add Student / Family" buttons:
// every blank add is named "New Student", so a second add would merge into
// the first instead of creating a distinct family. Callers that always want
// a fresh record pass `forceNew`.
function processStudentForm(records, perStudentForm, forceNew = false) {
  const record = registrationToRecord(perStudentForm)

  if (!forceNew) {
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
  // Admin "+ Add" buttons pass forceNew so repeated blank adds each become
  // a distinct record/family rather than merging by name. Strip it before
  // it's stored as part of the record's `registration` snapshot.
  const forceNew = form.forceNew === true
  delete form.forceNew
  // The Leads page's "Convert to Customer" action also creates a record
  // through this same route, but the family never submitted a real
  // registration — sending them a "registration confirmation" email
  // would be wrong. internalNoEmail opts a caller out of that send;
  // it's never set by the public registration form.
  const skipEmail = form.internalNoEmail === true
  delete form.internalNoEmail
  const records = await getRegistrations()
  const record = processStudentForm(records, form, forceNew)
  await commitRegistrations(records)
  if (!skipEmail) sendRegistrationEmails(form, record).catch(() => {})
  res.status(record === records[records.length - 1] ? 201 : 200).json(record)
}))

app.delete('/api/registrations/:id', wrap(async (req, res) => {
  const records = await getRegistrations()
  const next = records.filter((r) => r.id !== req.params.id)
  await commitRegistrations(next)
  res.json({ deleted: records.length - next.length })
}))

/* Put a deleted registration back exactly as it was, keeping its id.
   This is what makes Undo on the Customers list honest: the POST route
   builds a record from a flat form and mints a new id, so undoing a delete
   through it would return the family without their enrolments or fee
   history. Here the client hands back the whole record it was holding, and
   commitRegistrations writes it under its original id.

   Refuses if the id is already present, so a double-undo cannot duplicate
   a family. */
app.post('/api/registrations/restore', wrap(async (req, res) => {
  const record = req.body
  if (!record || typeof record !== 'object' || !record.id) {
    return res.status(400).json({ error: 'body must be a registration record with an id' })
  }
  const records = await getRegistrations()
  if (records.some((r) => r.id === record.id)) {
    return res.status(409).json({ error: 'a registration with that id already exists' })
  }
  records.push(record)
  await commitRegistrations(records)
  res.status(201).json(record)
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

// Bulk read for the cross-student Attendance / Comments pages — same
// `comments` collection as the per-student route below, just
// unfiltered. Shape: { [studentId]: { [tabKey]: rows[] } }.
app.get('/api/comments', wrap(async (_req, res) => {
  res.json(await loadComments())
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
      const parsed = JSON.parse(raw)
      const arr = Array.isArray(parsed) ? parsed : (parsed.programs || [])
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

/* How many places are left in each session, counted from the registrations
   themselves rather than from a stored tally.

   There used to be a PUT /api/programs/decrement-spots that the form called
   after a successful sign-up. It never worked: it decremented `spots`, a
   field no offering has — they carry `capacity` — so it matched nothing and
   wrote nothing, on all 110 offerings. It was not on the public allowlist
   either, so an actual registrant's call was rejected before it got that
   far, and the form ignored the failure.

   Counting is the better answer regardless. A stored tally only moves one
   way: cancel a registration or delete a student and the seat is never
   given back, so the number drifts away from the register and no one knows
   which to believe. Derived from the registrations it is right by
   construction, including after a deletion.

   Public, and deliberately aggregate — session and a number, never who. */
app.get('/api/program-spots', wrap(async (_req, res) => {
  const [programs, records, state] = await Promise.all([
    getPrograms(), getRegistrations(), getProgramsState(),
  ])
  const locNames = new Map((state?.locations || []).map(l => [l.id, l.name || '']))
  const counts = buildEnrolmentIndex(records, programs, id => locNames.get(id) || '')

  const out = []
  for (const p of (programs || [])) {
    if (!p?.name) continue
    for (const s of sessionsOf(p)) {
      const taken = counts.get(sessionKey(p.name, s.locationId, s.day, s.start)) || 0
      out.push({
        program: p.name,
        locationId: s.locationId || '',
        day: s.day,
        start: s.start || '',
        capacity: s.capacity,
        taken,
        // null capacity means uncapped, which is not the same as full.
        remaining: s.capacity == null ? null : Math.max(0, s.capacity - taken),
      })
    }
  }
  res.json(out)
}))

/* Public: just the site ids and names. The registration form needs them to
   label a class's locations ("Boardwalk (In-Person)"), and programs_state
   as a whole carries admin view state — column order, palettes — that the
   form has no business seeing. */
app.get('/api/locations', wrap(async (_req, res) => {
  const state = await getProgramsState()
  const list = Array.isArray(state?.locations) ? state.locations : []
  res.json(list.map(l => ({ id: l.id, name: l.name || '' })).filter(l => l.id))
}))

// ---- programs backups --------
app.get('/api/programs-state', wrap(async (_req, res) => {
  const state = await getProgramsState()
  if (!state) {
    // Fresh DB: seed from the bundled template file.
    try {
      const seedPath = path.join(__dirname, '..', 'src', 'data', 'programsData.json')
      const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
      const seeded = {
        locations: Array.isArray(parsed.locations) ? parsed.locations : [],
        colOrder: Array.isArray(parsed.colOrder) ? parsed.colOrder : [],
        hiddenCols: parsed.hiddenCols || {},
        categoryOrder: Array.isArray(parsed.categoryOrder) ? parsed.categoryOrder : [],
        subjOrder: Array.isArray(parsed.subjOrder) ? parsed.subjOrder : [],
        catColors: parsed.catColors || {},
        subjColors: parsed.subjColors || {},
      }
      await commitProgramsState(seeded)
      return res.json(seeded)
    } catch {}
  }
  res.json(state || {})
}))

app.put('/api/programs-state', wrap(async (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'body must be an object' })
  await commitProgramsState(req.body)
  res.json({ ok: true })
}))

app.get('/api/programs/backups', wrap(async (_req, res) => res.json(await listProgramsBackups())))
app.post('/api/programs/backup', wrap(async (req, res) => {
  const label = (req.body?.label || '').trim() || new Date().toLocaleString()
  await createProgramsBackup(label)
  res.json({ ok: true })
}))
app.post('/api/programs/restore/:id', wrap(async (req, res) => {
  const payload = await restoreProgramsBackup(req.params.id)
  res.json(payload)
}))

// ---- customers backups --------
app.get('/api/customers/backups', wrap(async (_req, res) => res.json(await listCustomersBackups())))
app.post('/api/customers/backup', wrap(async (req, res) => {
  const label = (req.body?.label || '').trim() || new Date().toLocaleString()
  const info = await createCustomersBackup(label)
  res.json({ ok: true, ...info })
}))
app.post('/api/customers/restore/:id', wrap(async (req, res) => {
  const payload = await restoreCustomersBackup(req.params.id)
  res.json({ ok: true, count: payload.length })
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
    _migPri:    !!body._migPri,
    _migBg:     !!body._migBg,
  }
  await saveTodo(payload)
  res.json({ ok: true })
}))

// ---- todo backups --------
app.get('/api/todo/backups', wrap(async (_req, res) => res.json(await listTodoBackups())))
app.post('/api/todo/backup', wrap(async (req, res) => {
  const label = (req.body?.label || '').trim() || new Date().toLocaleString()
  await createTodoBackup(label)
  res.json({ ok: true })
}))
app.post('/api/todo/restore/:id', wrap(async (req, res) => {
  const payload = await restoreTodoBackup(req.params.id)
  res.json(payload)
}))

// ---- checklist backups --------
app.get('/api/checklist/backups', wrap(async (_req, res) => res.json(await listChecklistBackups())))
app.post('/api/checklist/backup', wrap(async (req, res) => {
  const label = (req.body?.label || '').trim() || new Date().toLocaleString()
  await createChecklistBackup(label)
  res.json({ ok: true })
}))
app.post('/api/checklist/restore/:id', wrap(async (req, res) => {
  const payload = await restoreChecklistBackup(req.params.id)
  res.json(payload)
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

// ---- IT accounts (singleton payload — passwords manager) --
// Shape mirrors "crania-it-accounts.json" from the client mockup:
//   { categories: [{id,name,color}], accounts: [{id,catId,name,url,user,pass,notes,color,cost?,start?,active?}] }
// `pass` and `notes` are encrypted at rest via AES-256-GCM in
// pb.js (see load/saveItAccounts). API responses are cleartext
// over HTTPS; encryption mitigates DB-leak / backup exposure only.
app.get('/api/it-accounts', wrap(async (_req, res) => res.json(await loadItAccounts())))
app.put('/api/it-accounts', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    categories: Array.isArray(body.categories) ? body.categories : [],
    accounts:   Array.isArray(body.accounts)   ? body.accounts   : [],
  }
  await saveItAccounts(payload)
  res.json({ ok: true })
}))

// ---- crania store (singleton — v20 retail mockup) --------
// Same core shape as /api/stock plus per-item tax, price, img.
// See loadCraniaStore for details.
app.get('/api/crania-store', wrap(async (_req, res) => res.json(await loadCraniaStore())))
app.put('/api/crania-store', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    items:           Array.isArray(body.items) ? body.items : [],
    log:             Array.isArray(body.log)   ? body.log   : [],
    categoryOrder:   Array.isArray(body.categoryOrder) ? body.categoryOrder : [],
    categoryColors:  body.categoryColors && typeof body.categoryColors === 'object' ? body.categoryColors : {},
    extraSubs:       Array.isArray(body.extraSubs) ? body.extraSubs : [],
    subOrder:        body.subOrder && typeof body.subOrder === 'object' ? body.subOrder : {},
    subColors:       body.subColors && typeof body.subColors === 'object' ? body.subColors : {},
    colOrder:        Array.isArray(body.colOrder) ? body.colOrder : [],
  }
  await saveCraniaStore(payload)
  res.json({ ok: true })
}))

// ---- stock (singleton payload — v44 inventory mockup) --------
// Distinct from the legacy /api/inventory routes (per-row).
app.get('/api/stock', wrap(async (_req, res) => res.json(await loadStock())))
app.put('/api/stock', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    items:           Array.isArray(body.items) ? body.items : [],
    log:             Array.isArray(body.log)   ? body.log   : [],
    categoryOrder:   Array.isArray(body.categoryOrder) ? body.categoryOrder : [],
    categoryColors:  body.categoryColors && typeof body.categoryColors === 'object' ? body.categoryColors : {},
    extraSubs:       Array.isArray(body.extraSubs) ? body.extraSubs : [],
    subOrder:        body.subOrder && typeof body.subOrder === 'object' ? body.subOrder : {},
    subColors:       body.subColors && typeof body.subColors === 'object' ? body.subColors : {},
    colOrder:        Array.isArray(body.colOrder) ? body.colOrder : [],
    hiddenCols:      body.hiddenCols && typeof body.hiddenCols === 'object' ? body.hiddenCols : {},
    groupBy:         !!body.groupBy,
  }
  await saveStock(payload)
  res.json({ ok: true })
}))

// ---- contests (singleton — per-program extras + manual rows) --
// Shape:
//   { extras: {[rowKey]: {org, contest, regDeadline, contestDate, numOrdered, status}},
//     manual: [{id, org, contest, regDeadline, contestDate, numOrdered, status}],
//     hidden: [rowKey], hiddenCols: {[colKey]: true}, colOrder: [colKey] }
// `hidden` hides program-derived rows; `hiddenCols` hides table columns.
app.get('/api/contests', wrap(async (_req, res) => res.json(await loadContests())))
app.put('/api/contests', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    extras: body.extras && typeof body.extras === 'object' ? body.extras : {},
    manual: Array.isArray(body.manual) ? body.manual : [],
    hidden: Array.isArray(body.hidden) ? body.hidden : [],
    hiddenCols: body.hiddenCols && typeof body.hiddenCols === 'object' ? body.hiddenCols : {},
    colOrder: Array.isArray(body.colOrder) ? body.colOrder : [],
  }
  await saveContests(payload)
  res.json({ ok: true })
}))

// ---- calendar (singleton payload — calendars + events + hidden) ---
// Shape mirrors "crania-calendar.json" from the client's v18 mockup
// so JSON export/import round-trips cleanly.
app.get('/api/calendar', wrap(async (_req, res) => res.json(await loadCalendar())))
app.put('/api/calendar', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    calendars: Array.isArray(body.calendars) ? body.calendars : [],
    events:    Array.isArray(body.events)    ? body.events    : [],
    hidden:    body.hidden && typeof body.hidden === 'object' ? body.hidden : {},
  }
  await saveCalendar(payload)
  res.json({ ok: true })
}))

// ---- calendar backups --------
app.get('/api/calendar/backups', wrap(async (_req, res) => res.json(await listCalendarBackups())))
app.post('/api/calendar/backup', wrap(async (req, res) => {
  await createCalendarBackup(req.body?.label)
  res.json({ ok: true })
}))
app.post('/api/calendar/restore/:id', wrap(async (req, res) => {
  const data = await restoreCalendarBackup(req.params.id)
  res.json(data)
}))

// ---- marketing calendar (singleton payload — fully independent) ---
// Same shape as /api/calendar above but its own PocketBase collection
// (see loadMarketingCalendar/saveMarketingCalendar in pb.js) — no
// events are ever shared with the operations Calendar.
app.get('/api/marketing-calendar', wrap(async (_req, res) => res.json(await loadMarketingCalendar())))
app.put('/api/marketing-calendar', wrap(async (req, res) => {
  const body = req.body || {}
  const payload = {
    calendars: Array.isArray(body.calendars) ? body.calendars : [],
    events:    Array.isArray(body.events)    ? body.events    : [],
    hidden:    body.hidden && typeof body.hidden === 'object' ? body.hidden : {},
  }
  await saveMarketingCalendar(payload)
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
    hiddenCols:       body.hiddenCols && typeof body.hiddenCols === 'object' ? body.hiddenCols : {},
  }
  await saveProjects(payload)
  res.json({ ok: true })
}))

// ---- project backups --------
app.get('/api/projects/backups', wrap(async (_req, res) => res.json(await listProjectBackups())))
app.post('/api/projects/backup', wrap(async (req, res) => {
  const label = (req.body?.label || '').trim() || new Date().toLocaleString()
  await createProjectBackup(label)
  res.json({ ok: true })
}))
app.post('/api/projects/restore/:id', wrap(async (req, res) => {
  const payload = await restoreProjectBackup(req.params.id)
  res.json(payload)
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

// ---- surveys (multi-survey builder) ----------------------
// A "survey" is title + intro + an ordered list of questions
// (radio/checkbox/textarea/stars). Unlike Forms there's no public
// URL — surveys are taken inside the admin app itself (staff hands a
// tablet to the family), so every route here sits behind the normal
// auth gate like the rest of /api.
app.get('/api/surveys', wrap(async (_req, res) => res.json(await getSurveys())))

app.get('/api/surveys/:id', wrap(async (req, res) => {
  const survey = (await getSurveys()).find(s => String(s.id) === String(req.params.id))
  if (!survey) return res.status(404).json({ error: 'not found' })
  res.json(survey)
}))

app.post('/api/surveys', wrap(async (req, res) => {
  const surveys = await getSurveys()
  const id = 'survey-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
  const record = {
    id,
    title:     String(req.body.title || 'Untitled Survey').trim(),
    intro:     String(req.body.intro || '').trim(),
    questions: Array.isArray(req.body.questions) ? req.body.questions : [],
    createdAt: new Date().toISOString(),
  }
  surveys.push(record)
  await commitSurveys(surveys)
  res.status(201).json(record)
}))

app.put('/api/surveys/:id', wrap(async (req, res) => {
  const surveys = await getSurveys()
  const idx = surveys.findIndex((s) => String(s.id) === String(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  const current = surveys[idx]
  surveys[idx] = {
    ...current,
    title:     req.body.title !== undefined ? String(req.body.title).trim() : current.title,
    intro:     req.body.intro !== undefined ? String(req.body.intro).trim() : current.intro,
    questions: Array.isArray(req.body.questions) ? req.body.questions : current.questions,
  }
  await commitSurveys(surveys)
  res.json(surveys[idx])
}))

app.delete('/api/surveys/:id', wrap(async (req, res) => {
  const surveys = await getSurveys()
  const next = surveys.filter((s) => String(s.id) !== String(req.params.id))
  await commitSurveys(next)
  await deleteSurveySubmissionsForSurvey(String(req.params.id))
  res.json({ deleted: surveys.length - next.length })
}))

app.post('/api/surveys/:id/submit', wrap(async (req, res) => {
  const survey = (await getSurveys()).find(s => String(s.id) === String(req.params.id))
  if (!survey) return res.status(404).json({ error: 'survey not found' })

  const answers = (req.body && typeof req.body.answers === 'object') ? req.body.answers : {}
  for (const q of survey.questions || []) {
    if (q.required) {
      const v = answers[q.id]
      const empty = v === undefined || v === null || v === '' ||
                    (Array.isArray(v) && v.length === 0)
      if (empty) return res.status(400).json({ error: `Missing required question: ${q.text || q.id}` })
    }
  }

  const submission = {
    id:          'subv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    surveyId:    String(survey.id),
    answers,
    submittedAt: new Date().toISOString(),
  }
  await createSurveySubmission(submission)
  res.status(201).json({ ok: true, id: submission.id })
}))

app.get('/api/surveys/:id/submissions', wrap(async (req, res) => {
  const subs = await loadSurveySubmissions(String(req.params.id))
  subs.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
  res.json(subs)
}))

app.delete('/api/surveys/:surveyId/submissions/:subId', wrap(async (req, res) => {
  await deleteSurveySubmission(String(req.params.subId))
  res.json({ ok: true })
}))

// ---- campaigns (singleton payload — marketing campaign tracker) ---
app.get('/api/campaigns', wrap(async (_req, res) => res.json(await loadCampaigns())))
app.put('/api/campaigns', wrap(async (req, res) => {
  const body = req.body || {}
  await saveCampaigns({ campaigns: Array.isArray(body.campaigns) ? body.campaigns : [] })
  res.json({ ok: true })
}))

// ---- leads (singleton payload — marketing CRM pipeline) ---
app.get('/api/leads', wrap(async (_req, res) => res.json(await loadLeads())))
app.put('/api/leads', wrap(async (req, res) => {
  const body = req.body || {}
  await saveLeads({ leads: Array.isArray(body.leads) ? body.leads : [] })
  res.json({ ok: true })
}))

// ---- contacts (singleton payload — business/vendor directory) ---
app.get('/api/contacts', wrap(async (_req, res) => res.json(await loadContacts())))
app.put('/api/contacts', wrap(async (req, res) => {
  const body = req.body || {}
  await saveContacts({ contacts: Array.isArray(body.contacts) ? body.contacts : [] })
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
