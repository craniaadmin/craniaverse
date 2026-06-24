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

async function ensureAuth() {
  const client = pb()
  if (client.authStore.isValid) return
  const email = process.env.PB_ADMIN_EMAIL || ''
  const password = process.env.PB_ADMIN_PASSWORD || ''
  if (!email || !password) {
    throw new Error('PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD must be set in server/.env')
  }
  if (!authPromise) {
    authPromise = client.collection('_superusers')
      .authWithPassword(email, password)
      .catch((err) => { authPromise = null; throw err })
  }
  await authPromise
}

async function getFullList(collection) {
  await ensureAuth()
  return pb().collection(collection).getFullList({ batch: 500, sort: 'created' })
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
