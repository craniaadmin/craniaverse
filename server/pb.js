// ============================================================
// PocketBase client + store helpers.
// ------------------------------------------------------------
// The Express layer (server.js) is unchanged at the HTTP edge,
// but every load*/save* function in this file talks to a
// PocketBase collection instead of a JSON file. The shape of
// the data returned/accepted is identical to the old JSON file,
// so the rest of server.js doesn't need to know PocketBase
// exists.
//
// Collections (all defined by scripts/pb-setup.js):
//   registrations  { recordId, displayName, createdAt, payload }
//   staff          { recordId, payload }
//   programs       { recordId, payload }
//   rules          { recordId, payload }
//   comments       { studentId, tabKey, rows }
//   staffBoard     { payload }   (singleton — only one row)
//
// The "payload" field holds the full original JSON record so
// the migration is lossless and reversible.
// ============================================================
import PocketBase from 'pocketbase'

// The PocketBase client is created lazily on the first call so that
// process.env is read AFTER server.js has called dotenv.config().
// (ES module top-level code in this file would otherwise run before
// the importer's body, leaving the env vars empty.)
let _pb = null
let authPromise = null

export function pb() {
  if (!_pb) {
    const url = process.env.PB_URL || 'http://127.0.0.1:8090'
    _pb = new PocketBase(url)
    _pb.autoCancellation(false)
  }
  return _pb
}

function logPbError(label, err) {
  console.error(`[pb] ${label} failed`, {
    url:           err?.url,
    status:        err?.status,
    message:       err?.message,
    data:          err?.response?.data ?? err?.data,
    originalError: err?.originalError?.message,
  })
}

async function ensureAuth() {
  const client = pb()
  if (client.authStore.isValid) return
  const email = process.env.PB_ADMIN_EMAIL || ''
  const password = process.env.PB_ADMIN_PASSWORD || ''
  if (!email || !password) {
    throw new Error('PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD must be set in server/.env')
  }
  console.log(`[pb] authenticating as ${email} against ${client.baseURL}`)
  if (!authPromise) {
    authPromise = client.collection('_superusers')
      .authWithPassword(email, password)
      .then((r) => {
        console.log(`[pb] auth ok, token prefix=${r?.token?.slice(0, 16)}`)
        return r
      })
      .catch((err) => {
        authPromise = null
        logPbError('auth', err)
        throw err
      })
  }
  await authPromise
}

async function getFullList(collection) {
  await ensureAuth()
  try {
    // No explicit sort: PocketBase v0.23+ requires opt-in `autodate`
    // fields for `created`/`updated`, which our pb-setup doesn't add.
    // Order doesn't matter for our load/save logic (Map lookups).
    return await pb().collection(collection).getFullList({ batch: 500 })
  } catch (err) {
    logPbError(`getFullList(${collection})`, err)
    throw err
  }
}

async function findByRecordId(collection, recordId) {
  await ensureAuth()
  try {
    return await pb().collection(collection).getFirstListItem(`recordId="${String(recordId).replace(/"/g, '\\"')}"`)
  } catch (err) {
    if (err?.status === 404) return null
    throw err
  }
}

// ---- registrations ---------------------------------------
// Returns the array of registration records exactly as they
// used to live in data.json.
export async function loadRegistrations() {
  const rows = await getFullList('registrations')
  return rows.map(r => r.payload || {})
}

// Replace the entire registrations table with the given array.
// Diff-based to avoid recreating untouched rows.
export async function saveRegistrations(records) {
  await ensureAuth()
  const existing = await getFullList('registrations')
  const byRecordId = new Map(existing.map(r => [r.recordId, r]))
  const incomingIds = new Set(records.map(r => String(r.id)))

  for (const rec of records) {
    const recordId = String(rec.id)
    const payload = { ...rec }
    const data = {
      recordId,
      displayName: rec.displayName || '',
      createdAt: rec.createdAt || '',
      payload,
    }
    const found = byRecordId.get(recordId)
    if (found) {
      await pb().collection('registrations').update(found.id, data)
    } else {
      await pb().collection('registrations').create(data)
    }
  }
  // delete rows that are no longer in the incoming list
  for (const row of existing) {
    if (!incomingIds.has(row.recordId)) {
      await pb().collection('registrations').delete(row.id)
    }
  }
}

// ---- staff -----------------------------------------------
export async function loadStaff() {
  const rows = await getFullList('staff')
  return rows.map(r => r.payload || {})
}

export async function saveStaff(staff) {
  await ensureAuth()
  const existing = await getFullList('staff')
  const byRecordId = new Map(existing.map(r => [r.recordId, r]))
  const incomingIds = new Set(staff.map(s => String(s.id)))

  for (const member of staff) {
    const recordId = String(member.id)
    const data = { recordId, payload: { ...member } }
    const found = byRecordId.get(recordId)
    if (found) {
      await pb().collection('staff').update(found.id, data)
    } else {
      await pb().collection('staff').create(data)
    }
  }
  for (const row of existing) {
    if (!incomingIds.has(row.recordId)) {
      await pb().collection('staff').delete(row.id)
    }
  }
}

// ---- programs --------------------------------------------
// Programs are keyed by "number" rather than "id".
export async function loadPrograms() {
  const rows = await getFullList('programs')
  return rows.map(r => r.payload || {})
}

export async function savePrograms(programs) {
  await ensureAuth()
  const existing = await getFullList('programs')
  const byRecordId = new Map(existing.map(r => [r.recordId, r]))
  const incomingIds = new Set(programs.map(p => String(p.number)))

  for (const program of programs) {
    const recordId = String(program.number)
    const data = { recordId, payload: { ...program } }
    const found = byRecordId.get(recordId)
    if (found) {
      await pb().collection('programs').update(found.id, data)
    } else {
      await pb().collection('programs').create(data)
    }
  }
  for (const row of existing) {
    if (!incomingIds.has(row.recordId)) {
      await pb().collection('programs').delete(row.id)
    }
  }
}

// ---- rules -----------------------------------------------
export async function loadRules() {
  const rows = await getFullList('rules')
  return rows.map(r => r.payload || {})
}

export async function saveRules(rules) {
  await ensureAuth()
  const existing = await getFullList('rules')
  const byRecordId = new Map(existing.map(r => [r.recordId, r]))
  const incomingIds = new Set(rules.map(r => String(r.id)))

  for (const rule of rules) {
    const recordId = String(rule.id)
    const data = { recordId, payload: { ...rule } }
    const found = byRecordId.get(recordId)
    if (found) {
      await pb().collection('rules').update(found.id, data)
    } else {
      await pb().collection('rules').create(data)
    }
  }
  for (const row of existing) {
    if (!incomingIds.has(row.recordId)) {
      await pb().collection('rules').delete(row.id)
    }
  }
}

// ---- comments --------------------------------------------
// Comments are keyed { [studentId]: { [tabKey]: [rows] } }.
// Stored as one row per (studentId, tabKey) pair in PocketBase.
export async function loadComments() {
  const rows = await getFullList('comments')
  const result = {}
  for (const row of rows) {
    if (!result[row.studentId]) result[row.studentId] = {}
    result[row.studentId][row.tabKey] = row.rows || []
  }
  return result
}

// Save rows for a single (studentId, tabKey) pair — used by
// PUT /api/comments/:studentId/:tabKey. Avoids touching the
// rest of the comments table.
export async function saveCommentsForTab(studentId, tabKey, rowsArray) {
  await ensureAuth()
  let existing = null
  try {
    existing = await pb().collection('comments').getFirstListItem(
      `studentId="${studentId}" && tabKey="${tabKey}"`
    )
  } catch (err) {
    if (err?.status !== 404) throw err
  }
  const data = { studentId, tabKey, rows: rowsArray }
  if (existing) {
    await pb().collection('comments').update(existing.id, data)
  } else {
    await pb().collection('comments').create(data)
  }
}

// ---- staff board (singleton) -----------------------------
const DEFAULT_STAFF_BOARD = {
  lists: [
    { id: 'l1', title: 'To Do', cards: [] },
    { id: 'l2', title: 'In Progress', cards: [] },
    { id: 'l3', title: 'Done', cards: [] },
  ],
}

export async function loadStaffBoard() {
  const rows = await getFullList('staffBoard')
  if (rows.length === 0) {
    await saveStaffBoard(DEFAULT_STAFF_BOARD)
    return DEFAULT_STAFF_BOARD
  }
  return rows[0].payload || DEFAULT_STAFF_BOARD
}

export async function saveStaffBoard(board) {
  await ensureAuth()
  const rows = await getFullList('staffBoard')
  if (rows.length === 0) {
    await pb().collection('staffBoard').create({ payload: board })
  } else {
    await pb().collection('staffBoard').update(rows[0].id, { payload: board })
  }
}

// ---- inventory ------------------------------------------
export async function loadInventory() {
  const rows = await getFullList('inventory')
  return rows.map(r => r.payload || {})
}

export async function saveInventory(items) {
  await ensureAuth()
  const existing = await getFullList('inventory')
  const byRecordId = new Map(existing.map(r => [r.recordId, r]))
  const incomingIds = new Set(items.map(i => String(i.id)))

  for (const item of items) {
    const recordId = String(item.id)
    const data = { recordId, payload: { ...item } }
    const found = byRecordId.get(recordId)
    if (found) {
      await pb().collection('inventory').update(found.id, data)
    } else {
      await pb().collection('inventory').create(data)
    }
  }
  for (const row of existing) {
    if (!incomingIds.has(row.recordId)) {
      await pb().collection('inventory').delete(row.id)
    }
  }
}

// ---- todo (singleton payload with lists + items + checklists) ---
const DEFAULT_TODO = { lists: [], items: [], checklists: [] }

export async function loadTodo() {
  const rows = await getFullList('todo')
  if (rows.length === 0) return DEFAULT_TODO
  const p = rows[0].payload || {}
  return {
    lists:      Array.isArray(p.lists) ? p.lists : [],
    items:      Array.isArray(p.items) ? p.items : [],
    checklists: Array.isArray(p.checklists) ? p.checklists : [],
  }
}

export async function saveTodo(payload) {
  await ensureAuth()
  const rows = await getFullList('todo')
  if (rows.length === 0) {
    await pb().collection('todo').create({ payload })
  } else {
    await pb().collection('todo').update(rows[0].id, { payload })
  }
}

// ---- projects (kanban board — singleton payload) --------
// Schema mirrors the "crania-projects.json" file the client's
// v20 kanban mockup writes to disk, so exports/imports round-trip.
// If the collection is empty on first load we seed with the client's
// existing 3-card board (dropped from her local JSON file).
const PROJECTS_SEED = {
  cards: [
    {
      id: 'mrkvsii538eaz', col: 'daily', project: '', task: 'dsfg', who: '',
      due: '', comments: [
        { id: 'mrkvsii53kwtm', date: '2026-07-14', time: '12:44',
          author: 'asdf', text: 'asdf', read: true },
      ], color: '#5FA09E', days: [1, 2, 3, 4, 5, 6, 0],
      dayDate: '2026-07-15', tags: ['sdfg'], goals: [],
      created: '2026-07-14T16:44:15.149Z',
      archived: false, archivedFrom: '', archivedAt: '',
    },
    {
      id: 'mrkq0iyhmafe4', col: 'notes', project: '', task: 'asdf', who: '',
      due: '', comments: [
        { id: 'mrkq090o7dcjj', date: '2026-07-14', time: '10:02',
          author: 'eat pototoes', text: 'sam', read: true },
        { id: 'mrl8266j2swrq', date: '2026-07-14', time: '18:27',
          author: 'kelly', text: 'eat more potatoes', read: false },
        { id: 'mrl82i188amm4', date: '2026-07-14', time: '18:27',
          author: 'john', text: 'and more potatotoes', read: false },
      ], color: '#5FA09E', days: [], dayDate: '', tags: ['asdf'], goals: [],
      created: '2026-07-14T14:02:31.289Z',
      archived: false, archivedFrom: '', archivedAt: '',
    },
    {
      id: 'mrks5uaayam6i', col: 'notes', project: '', task: 'buy chocolate',
      who: '', due: '', comments: [
        { id: 'mrks5dd51ku8u', date: '2026-07-14', time: '11:02',
          author: 'fdg', text: 'sfg', read: false },
      ], color: '#5FA09E', days: [], dayDate: '', tags: [], goals: [],
      created: '2026-07-14T15:02:38.482Z',
      archived: false, archivedFrom: '', archivedAt: '',
    },
  ],
  updatedAt: '2026-07-15T00:15:30.453Z',
  lastReset: '2026-07-15',
  lastResetAt: 1784116800000,
  resetTime: '08:00',
  lastBackup: '2026-07-15',
  lastBackupAt: '2026-07-15T13:09:49.623Z',
  clearGoals: false,
  clearGoalsTime: '00:00',
  lastGoalsClear: '2026-07-15',
  lastGoalsClearAt: 1784088000000,
  colOrder: ['notes', 'goals', 'daily', 'todo', 'doing', 'done'],
}

export async function loadProjects() {
  try {
    const rows = await getFullList('projects')
    // No row → first-ever load, seed with the client's existing board.
    // Once the row exists (even if she then deletes all cards), we
    // respect what's there — never re-seed automatically.
    if (rows.length === 0) return PROJECTS_SEED
    return rows[0].payload || { cards: [], colOrder: ['notes', 'goals', 'daily', 'todo', 'doing', 'done'] }
  } catch (err) {
    if (err?.status === 404) return PROJECTS_SEED
    throw err
  }
}

export async function saveProjects(payload) {
  await ensureAuth()
  const rows = await getFullList('projects')
  if (rows.length === 0) {
    await pb().collection('projects').create({ payload })
  } else {
    await pb().collection('projects').update(rows[0].id, { payload })
  }
}

// ---- finance (singleton payload with invoices + payments + meta) ---
const DEFAULT_FINANCE = {
  invoices: [],
  payments: [],
  meta: { nextInvoiceNumber: 1001, nextReceiptNumber: 1001 },
}

export async function loadFinance() {
  try {
    const rows = await getFullList('finance')
    if (rows.length === 0) return DEFAULT_FINANCE
    const p = rows[0].payload || {}
    return {
      invoices: Array.isArray(p.invoices) ? p.invoices : [],
      payments: Array.isArray(p.payments) ? p.payments : [],
      meta: { ...DEFAULT_FINANCE.meta, ...(p.meta || {}) },
    }
  } catch (err) {
    // Collection missing (pb-setup not run yet) — degrade gracefully.
    if (err?.status === 404) return DEFAULT_FINANCE
    throw err
  }
}

export async function saveFinance(payload) {
  await ensureAuth()
  const rows = await getFullList('finance')
  if (rows.length === 0) {
    await pb().collection('finance').create({ payload })
  } else {
    await pb().collection('finance').update(rows[0].id, { payload })
  }
}

// ---- booth signups (one row per family, keyed by email) ------
// Same upsert semantics as the original localStorage flow: a
// family may submit the assessment form, then come back and RSVP
// for the open house, then order agendas, all under the same
// email — each submission merges into their single record.
export async function loadBoothSignups() {
  const rows = await getFullList('boothSignups')
  return rows.map(r => r.payload || {})
}

function mergeSignup(existing, fields) {
  const next = { ...existing }
  next.name  = fields.name  ?? existing.name  ?? ''
  next.phone = fields.phone ?? existing.phone ?? ''
  next.email = existing.email || fields.email
  next.consent = 'yes'
  if (fields.grade) next.grade = fields.grade
  if (fields.child) next.child = fields.child
  if (fields.openHouse) next.openHouse = 'yes'
  if (fields.assessDate) {
    next.assessDate = fields.assessDate
    next.assessTime = fields.assessTime || ''
  }
  if (fields.agenda) {
    next.agReg   = Number(fields.agReg  || 0)
    next.agIsl   = Number(fields.agIsl  || 0)
    next.agShip  = fields.agShip || ''
    next.agAddr  = fields.agAddr || ''
    next.agTotal = Number(fields.agTotal || 0)
  }
  if (!existing.when) next.when = new Date().toISOString()
  next.updatedAt = new Date().toISOString()
  return next
}

export async function upsertBoothSignup(fields) {
  await ensureAuth()
  const email = String(fields.email || '').toLowerCase().trim()
  if (!email) throw new Error('email is required')
  const recordId = email

  let existing = null
  try {
    existing = await pb().collection('boothSignups')
      .getFirstListItem(`recordId="${recordId.replace(/"/g, '\\"')}"`)
  } catch (err) {
    if (err?.status !== 404) throw err
  }

  const existingPayload = existing?.payload || {}
  // Enforce "already-booked" rules: only assessment + open house are
  // exclusive; agenda orders can happen multiple times.
  if (fields.assessDate && existingPayload.assessDate) {
    return {
      conflict: 'assessment',
      existing: existingPayload,
      message: `This email already has an assessment booked (${existingPayload.assessDate}, ${existingPayload.assessTime}). Ask our team if you need to change it!`,
    }
  }
  if (fields.openHouse && existingPayload.openHouse === 'yes') {
    return {
      conflict: 'openHouse',
      existing: existingPayload,
      message: `Good news — that email is already on the open house list! See you July 30. 🎉`,
    }
  }

  const merged = mergeSignup({ ...existingPayload, email }, fields)
  const data = { recordId, payload: merged }
  if (existing) await pb().collection('boothSignups').update(existing.id, data)
  else          await pb().collection('boothSignups').create(data)

  const rows = await pb().collection('boothSignups').getFullList({ batch: 500 })
  return { ok: true, entry: merged, count: rows.length }
}

export async function deleteBoothSignup(email) {
  await ensureAuth()
  const recordId = String(email || '').toLowerCase().trim()
  if (!recordId) return
  try {
    const row = await pb().collection('boothSignups')
      .getFirstListItem(`recordId="${recordId.replace(/"/g, '\\"')}"`)
    await pb().collection('boothSignups').delete(row.id)
  } catch (err) {
    if (err?.status !== 404) throw err
  }
}

// ---- forms (definitions) --------------------------------
export async function loadForms() {
  const rows = await getFullList('forms')
  return rows.map(r => r.payload || {})
}

export async function saveForms(forms) {
  await ensureAuth()
  const existing = await getFullList('forms')
  const byRecordId = new Map(existing.map(r => [r.recordId, r]))
  const incomingIds = new Set(forms.map(f => String(f.id)))

  for (const form of forms) {
    const recordId = String(form.id)
    const data = { recordId, payload: { ...form } }
    const found = byRecordId.get(recordId)
    if (found) {
      await pb().collection('forms').update(found.id, data)
    } else {
      await pb().collection('forms').create(data)
    }
  }
  for (const row of existing) {
    if (!incomingIds.has(row.recordId)) {
      await pb().collection('forms').delete(row.id)
    }
  }
}

// ---- form submissions -----------------------------------
export async function loadSubmissions(formId = null) {
  await ensureAuth()
  const filter = formId ? { filter: `formId="${String(formId).replace(/"/g, '\\"')}"` } : {}
  const rows = await pb().collection('formSubmissions').getFullList({ batch: 200, ...filter })
  return rows.map(r => r.payload || {})
}

export async function createSubmission(sub) {
  await ensureAuth()
  await pb().collection('formSubmissions').create({
    recordId: String(sub.id),
    formId:   String(sub.formId),
    payload:  { ...sub },
  })
}

export async function deleteSubmission(id) {
  await ensureAuth()
  try {
    const row = await pb().collection('formSubmissions')
      .getFirstListItem(`recordId="${String(id).replace(/"/g, '\\"')}"`)
    await pb().collection('formSubmissions').delete(row.id)
  } catch (err) {
    if (err?.status !== 404) throw err
  }
}

export async function deleteSubmissionsForForm(formId) {
  await ensureAuth()
  const rows = await pb().collection('formSubmissions').getFullList({
    batch: 200,
    filter: `formId="${String(formId).replace(/"/g, '\\"')}"`,
  })
  for (const row of rows) {
    await pb().collection('formSubmissions').delete(row.id)
  }
}
