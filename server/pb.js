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
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __pbDir = path.dirname(fileURLToPath(import.meta.url))

// ---- IT-accounts symmetric encryption (AES-256-GCM) ---------
// Passwords + notes for the IT Accounts page are encrypted at rest
// in the PocketBase payload. The API stays cleartext-in-transit
// (HTTPS handles the wire). This mitigates DB-leak / backup exposure
// only; it does NOT prevent someone with a valid admin session
// from reading passwords over the API.
//
// The key is derived by SHA-256 of IT_ACCOUNTS_ENC_KEY (preferred)
// or SESSION_SECRET (fallback so existing installs work without
// extra config). Rotate by setting a new key and running a script
// that walks all records, decrypts with the old key, re-encrypts
// with the new one — TODO if/when we need it.
const ENC_ALGO = 'aes-256-gcm'
const ENC_PREFIX = 'enc:v1:'

function encKey() {
  const raw = process.env.IT_ACCOUNTS_ENC_KEY || process.env.SESSION_SECRET || ''
  if (!raw || raw.length < 16) {
    throw new Error('IT_ACCOUNTS_ENC_KEY or SESSION_SECRET must be set (32+ chars) to encrypt IT-accounts secrets')
  }
  return crypto.createHash('sha256').update(raw).digest() // 32 bytes for AES-256
}

function encryptSecret(plain) {
  if (plain == null || plain === '') return ''
  const str = typeof plain === 'string' ? plain : String(plain)
  // Idempotent: if it's already ciphertext, return as-is so a
  // load-then-save round-trip doesn't double-encrypt.
  if (str.startsWith(ENC_PREFIX)) return str
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ENC_ALGO, encKey(), iv)
  const ct = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: enc:v1:<iv_b64>:<ct||tag_b64>  (tag = last 16 bytes)
  return ENC_PREFIX + iv.toString('base64') + ':' + Buffer.concat([ct, tag]).toString('base64')
}

function decryptSecret(stored) {
  if (stored == null || stored === '') return ''
  const str = typeof stored === 'string' ? stored : String(stored)
  // Legacy plaintext (pre-encryption records or the seed) → return
  // as-is; the next PUT will migrate it to ciphertext transparently.
  if (!str.startsWith(ENC_PREFIX)) return str
  try {
    const rest = str.slice(ENC_PREFIX.length)
    const idx = rest.indexOf(':')
    if (idx === -1) return ''
    const iv = Buffer.from(rest.slice(0, idx), 'base64')
    const data = Buffer.from(rest.slice(idx + 1), 'base64')
    if (data.length < 16) return ''
    const tag = data.slice(-16)
    const ct = data.slice(0, -16)
    const decipher = crypto.createDecipheriv(ENC_ALGO, encKey(), iv)
    decipher.setAuthTag(tag)
    return decipher.update(ct, undefined, 'utf8') + decipher.final('utf8')
  } catch (err) {
    // Wrong key, tampered ciphertext, or corrupted payload.
    console.error('[itAccounts] decrypt failed for a secret; returning empty')
    return ''
  }
}

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

// recordId = number + location, not number alone: the same catalog
// number legitimately appears on more than one row when a program is
// offered at multiple locations (Boardwalk, Waterloo East, ...), each
// getting its own row with its own offerings. Keying on number alone
// would collide against the unique index and one location's row would
// silently overwrite the other's.
const programRecordId = (p) => `${p.number}::${p.location || ''}`

export async function savePrograms(programs) {
  await ensureAuth()
  const existing = await getFullList('programs')
  const byRecordId = new Map(existing.map(r => [r.recordId, r]))
  const incomingIds = new Set(programs.map(p => programRecordId(p)))

  for (const program of programs) {
    const recordId = programRecordId(program)
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
  const esc = (s) => String(s).replace(/"/g, '\\"')
  try {
    existing = await pb().collection('comments').getFirstListItem(
      `studentId="${esc(studentId)}" && tabKey="${esc(tabKey)}"`
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
const DEFAULT_TODO = { lists: [], items: [], checklists: [], _migPri: false }

export async function loadTodo() {
  const rows = await getFullList('todo')
  if (rows.length === 0) return DEFAULT_TODO
  const p = rows[0].payload || {}
  return {
    lists:      Array.isArray(p.lists) ? p.lists : [],
    items:      Array.isArray(p.items) ? p.items : [],
    checklists: Array.isArray(p.checklists) ? p.checklists : [],
    _migPri:    !!p._migPri,
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

// ---- todo backups (timestamped snapshots, last 14 kept) --------
const MAX_TODO_BACKUPS = 14

export async function listTodoBackups() {
  await ensureAuth()
  try {
    const rows = await pb().collection('todo_backups').getFullList({
      sort: '-created',
      fields: 'id,label,created',
    })
    return rows.map(r => ({ id: r.id, label: r.label || '', created: r.created }))
  } catch (err) {
    logPbError('backup-list', err)
    throw err
  }
}

export async function createTodoBackup(label) {
  await ensureAuth()
  const todo = await loadTodo()
  console.log('[backup] creating backup, label:', label, 'payload keys:', Object.keys(todo), 'items:', (todo.items || []).length)
  try {
    await pb().collection('todo_backups').create({ label: label || '', payload: todo })
  } catch (err) {
    logPbError('backup-create', err)
    throw err
  }
  // prune old backups beyond MAX_TODO_BACKUPS
  const all = await pb().collection('todo_backups').getFullList({ sort: '-created', fields: 'id' })
  for (const old of all.slice(MAX_TODO_BACKUPS)) {
    await pb().collection('todo_backups').delete(old.id)
  }
}

export async function restoreTodoBackup(backupId) {
  await ensureAuth()
  const row = await pb().collection('todo_backups').getOne(backupId)
  if (!row?.payload) throw new Error('Backup not found or empty')
  await saveTodo(row.payload)
  return row.payload
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

// ---- stock (singleton payload — v44 inventory mockup) --------
// Shape mirrors "crania-inventory.json" from the client's v44 mockup:
//   { items, log, categoryOrder, categoryColors, extraSubs, subOrder, subColors, colOrder, ... }
// Distinct from the legacy `inventory` collection (per-row, different
// shape) — that stays untouched so no old data is lost.
let _stockSeedCache = null
function getStockSeed() {
  if (_stockSeedCache) return _stockSeedCache
  try {
    const raw = fs.readFileSync(path.join(__pbDir, 'data', 'inventory-seed.json'), 'utf8')
    _stockSeedCache = JSON.parse(raw)
  } catch (err) {
    console.error('[stock] failed to load seed:', err?.message || err)
    _stockSeedCache = { items: [], log: [], categoryOrder: [], categoryColors: {}, extraSubs: [], subOrder: {}, subColors: {}, colOrder: [] }
  }
  return _stockSeedCache
}

export async function loadStock() {
  try {
    const rows = await getFullList('stock')
    if (rows.length === 0) return getStockSeed()
    return rows[0].payload || { items: [], log: [] }
  } catch (err) {
    if (err?.status === 404) return getStockSeed()
    throw err
  }
}

export async function saveStock(payload) {
  await ensureAuth()
  const rows = await getFullList('stock')
  if (rows.length === 0) {
    await pb().collection('stock').create({ payload })
  } else {
    await pb().collection('stock').update(rows[0].id, { payload })
  }
}

// ---- crania store (singleton — v20 retail mockup) --------
// Shape mirrors "crania-crania-store.json": same items/log/category
// metadata as `stock`, plus per-item `tax`, `price` (auto:
// ceil(cost*(1+tax/100))*10), and `img` (base64 data URL).
// Separate collection from `stock` so warehouse inventory and
// retail-store inventory don't collide.
let _storeSeedCache = null
function getStoreSeed() {
  if (_storeSeedCache) return _storeSeedCache
  try {
    const raw = fs.readFileSync(path.join(__pbDir, 'data', 'crania-store-seed.json'), 'utf8')
    _storeSeedCache = JSON.parse(raw)
  } catch (err) {
    console.error('[craniaStore] failed to load seed:', err?.message || err)
    _storeSeedCache = { items: [], log: [], categoryOrder: [], categoryColors: {}, extraSubs: [], subOrder: {}, subColors: {}, colOrder: [] }
  }
  return _storeSeedCache
}

export async function loadCraniaStore() {
  try {
    const rows = await getFullList('craniaStore')
    if (rows.length === 0) return getStoreSeed()
    return rows[0].payload || { items: [], log: [] }
  } catch (err) {
    if (err?.status === 404) return getStoreSeed()
    throw err
  }
}

export async function saveCraniaStore(payload) {
  await ensureAuth()
  const rows = await getFullList('craniaStore')
  if (rows.length === 0) {
    await pb().collection('craniaStore').create({ payload })
  } else {
    await pb().collection('craniaStore').update(rows[0].id, { payload })
  }
}

// ---- contests (singleton — per-program extras + manual rows) --
// Payload matches the Contests page's shape:
//   { extras: {[rowKey]: {...fields}}, manual: [{id, ...fields}], hidden: [rowKey] }
// Empty defaults so first-ever load is safe; there's no seed file
// because the Contests page derives most rows from useStore().programs
// on the client.
const CONTESTS_DEFAULT = { extras: {}, manual: [], hidden: [] }

export async function loadContests() {
  try {
    const rows = await getFullList('contests')
    if (rows.length === 0) return CONTESTS_DEFAULT
    const p = rows[0].payload || {}
    return {
      extras: p.extras && typeof p.extras === 'object' ? p.extras : {},
      manual: Array.isArray(p.manual) ? p.manual : [],
      hidden: Array.isArray(p.hidden) ? p.hidden : [],
    }
  } catch (err) {
    if (err?.status === 404) return CONTESTS_DEFAULT
    throw err
  }
}

export async function saveContests(payload) {
  await ensureAuth()
  const rows = await getFullList('contests')
  if (rows.length === 0) {
    await pb().collection('contests').create({ payload })
  } else {
    await pb().collection('contests').update(rows[0].id, { payload })
  }
}

// ---- calendar (singleton payload — events + calendars + hidden) ---
// Shape mirrors "crania-calendar.json" from the client's v18 mockup:
//   { calendars: [{id,name,color}], events: [{id,calId,title,date,allDay,start,end,notes,color?,recur?,exceptions?}], hidden: {} }
// If the collection row doesn't exist yet, seed with the client's
// existing board (10 calendars, ~180 events) loaded from
// server/data/calendar-seed.json. Explicit empty state after that
// is respected — no re-seeding on refresh.
let _calendarSeedCache = null
function getCalendarSeed() {
  if (_calendarSeedCache) return _calendarSeedCache
  try {
    const raw = fs.readFileSync(path.join(__pbDir, 'data', 'calendar-seed.json'), 'utf8')
    _calendarSeedCache = JSON.parse(raw)
  } catch (err) {
    console.error('[calendar] failed to load seed:', err?.message || err)
    _calendarSeedCache = { calendars: [], events: [], hidden: {} }
  }
  return _calendarSeedCache
}

export async function loadCalendar() {
  try {
    const rows = await getFullList('calendar')
    if (rows.length === 0) return getCalendarSeed()
    const p = rows[0].payload || {}
    return {
      calendars: Array.isArray(p.calendars) ? p.calendars : [],
      events:    Array.isArray(p.events)    ? p.events    : [],
      hidden:    p.hidden && typeof p.hidden === 'object' ? p.hidden : {},
    }
  } catch (err) {
    if (err?.status === 404) return getCalendarSeed()
    throw err
  }
}

export async function saveCalendar(payload) {
  await ensureAuth()
  const rows = await getFullList('calendar')
  if (rows.length === 0) {
    await pb().collection('calendar').create({ payload })
  } else {
    await pb().collection('calendar').update(rows[0].id, { payload })
  }
}

// ---- marketing calendar (singleton payload — fully independent) --
// Same shape as the operations calendar above, but its own
// PocketBase collection: no events, categories, or visibility state
// is ever shared with the real school Calendar. Seeded with a small
// starter set of marketing-flavoured categories on first load only.
const MARKETING_CALENDAR_SEED = {
  calendars: [
    { id: 'mkt-social',   name: 'Social Media',    color: '#A6E2F9' },
    { id: 'mkt-email',    name: 'Email Campaigns', color: '#5FA09E' },
    { id: 'mkt-ads',      name: 'Advertising',     color: '#E0DE85' },
    { id: 'mkt-promo',    name: 'Promotions/Events', color: '#20BAB5' },
    { id: 'mkt-blog',     name: 'Blog/Content',    color: '#8C9294' },
  ],
  events: [],
  hidden: {},
}

export async function loadMarketingCalendar() {
  try {
    const rows = await getFullList('marketingCalendar')
    if (rows.length === 0) return MARKETING_CALENDAR_SEED
    const p = rows[0].payload || {}
    return {
      calendars: Array.isArray(p.calendars) ? p.calendars : [],
      events:    Array.isArray(p.events)    ? p.events    : [],
      hidden:    p.hidden && typeof p.hidden === 'object' ? p.hidden : {},
    }
  } catch (err) {
    if (err?.status === 404) return MARKETING_CALENDAR_SEED
    throw err
  }
}

export async function saveMarketingCalendar(payload) {
  await ensureAuth()
  const rows = await getFullList('marketingCalendar')
  if (rows.length === 0) {
    await pb().collection('marketingCalendar').create({ payload })
  } else {
    await pb().collection('marketingCalendar').update(rows[0].id, { payload })
  }
}

// ---- campaigns (singleton payload — marketing campaign tracker) --
const CAMPAIGNS_DEFAULT = { campaigns: [] }

export async function loadCampaigns() {
  try {
    const rows = await getFullList('campaigns')
    if (rows.length === 0) return CAMPAIGNS_DEFAULT
    const p = rows[0].payload || {}
    return { campaigns: Array.isArray(p.campaigns) ? p.campaigns : [] }
  } catch (err) {
    if (err?.status === 404) return CAMPAIGNS_DEFAULT
    throw err
  }
}

export async function saveCampaigns(payload) {
  await ensureAuth()
  const rows = await getFullList('campaigns')
  if (rows.length === 0) {
    await pb().collection('campaigns').create({ payload })
  } else {
    await pb().collection('campaigns').update(rows[0].id, { payload })
  }
}

// ---- leads (singleton payload — marketing CRM pipeline) --
const LEADS_DEFAULT = { leads: [] }

export async function loadLeads() {
  try {
    const rows = await getFullList('leads')
    if (rows.length === 0) return LEADS_DEFAULT
    const p = rows[0].payload || {}
    return { leads: Array.isArray(p.leads) ? p.leads : [] }
  } catch (err) {
    if (err?.status === 404) return LEADS_DEFAULT
    throw err
  }
}

export async function saveLeads(payload) {
  await ensureAuth()
  const rows = await getFullList('leads')
  if (rows.length === 0) {
    await pb().collection('leads').create({ payload })
  } else {
    await pb().collection('leads').update(rows[0].id, { payload })
  }
}

// ---- contacts (singleton payload — business/vendor directory) --
// Standalone address book for people/companies outside the school
// (suppliers, contractors, partner schools, professional services).
// Separate from Customers (families), Staff (employees), and
// Emergency Contacts (derived from registrations) on purpose.
const CONTACTS_DEFAULT = { contacts: [] }

export async function loadContacts() {
  try {
    const rows = await getFullList('contacts')
    if (rows.length === 0) return CONTACTS_DEFAULT
    const p = rows[0].payload || {}
    return { contacts: Array.isArray(p.contacts) ? p.contacts : [] }
  } catch (err) {
    if (err?.status === 404) return CONTACTS_DEFAULT
    throw err
  }
}

export async function saveContacts(payload) {
  await ensureAuth()
  const rows = await getFullList('contacts')
  if (rows.length === 0) {
    await pb().collection('contacts').create({ payload })
  } else {
    await pb().collection('contacts').update(rows[0].id, { payload })
  }
}

// ---- IT accounts (singleton payload — passwords manager) --------
// Shape mirrors "crania-it-accounts.json" from the client's v28
// mockup so JSON imports/exports round-trip. If the row doesn't
// exist yet, seed with the 78-account payload she shared.
//
// TODO: passwords are stored in cleartext inside the payload —
// PocketBase gates access to admins-only, but the mockup itself
// noted "ask Claude for full encryption when you're ready" so we
// should add symmetric encryption of the .pass field before this
// leaves internal use.
const IT_ACCOUNTS_SEED = {
  categories: [
    { id: 'mrmex3lwhjwas', name: 'Misc.', color: '#5FA09E' },
    { id: 'mrmaubyjidc1e', name: 'Email', color: '#5FA09E' },
    { id: 'mrmf2dir3wu6u', name: 'SAAS', color: '#5FA09E' },
    { id: 'mrl9p83qi0qq6', name: 'Finance & Payroll' },
    { id: 'mrl9p83qqy14k', name: 'Tools & Other' },
    { id: 'mrmfan3lcqjsl', name: 'Contests', color: '#5FA09E' },
    { id: 'mrmggezdgsc55', name: 'Marketing', color: '#5FA09E' },
    { id: 'mrl9p83qgda3o', name: 'Social Media' },
    { id: 'mrmgmb9k27sv3', name: 'Utilities/Phone/Internet', color: '#5FA09E' },
    { id: 'mrmgo0l3k6uyw', name: 'Suppliers', color: '#5FA09E' },
    { id: 'mrnsk4elc04ma', name: 'AI', color: '#5FA09E' },
  ],
  accounts: [
    { id: 'mrmgk4zz3ebw0', catId: 'mrl9p83qgda3o', name: 'TikTok',              url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgis81x72fc', catId: 'mrl9p83qgda3o', name: 'Facebook',            url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgjkltaa6h4', catId: 'mrl9p83qgda3o', name: 'Instagram',           url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgjr60122pe', catId: 'mrl9p83qgda3o', name: 'LinkedIn',            url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgk8m0lxx2k', catId: 'mrl9p83qgda3o', name: 'Twitter',             url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmevqj9m9913', catId: 'mrmex3lwhjwas', name: 'Divi',                url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmevygscdr57', catId: 'mrmex3lwhjwas', name: 'ElevenLabs',          url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmew38sj3lnm', catId: 'mrmex3lwhjwas', name: 'GitHub',              url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmewes4ymx6o', catId: 'mrmex3lwhjwas', name: 'ShareASale',          url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmewj92rlsv6', catId: 'mrmex3lwhjwas', name: 'Tidio',               url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmez14cizjge', catId: 'mrmex3lwhjwas', name: 'Airtable',            url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmf2t0jbuasz', catId: 'mrmf2dir3wu6u', name: 'Dropbox',             url: '', user: 'craniaschoolsinc@gmail.com',            pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmf2uebhq8us', catId: 'mrmf2dir3wu6u', name: 'Dropbox',             url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmf2uxfwdxtb', catId: 'mrmf2dir3wu6u', name: 'Dropbox',             url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmf4bui891sh', catId: 'mrmaubyjidc1e', name: 'Google',              url: 'craniaschoolsinc@gmail.com', user: '',            pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmf4vazfa5tt', catId: 'mrmgmb9k27sv3', name: 'Grasshopper',         url: '', user: 'info@crania-schools.com',              pass: '', notes: 'Phone', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmf5ggb1c7l2', catId: 'mrmaubyjidc1e', name: 'Microsoft/Office',    url: '', user: 'craniaschools@gmail.com',               pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmf67qj6c6at', catId: 'mrl9p83qi0qq6', name: 'QBO',                 url: '', user: 'info@crnaia-schools.com',               pass: '', notes: '', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmf6bveh2gj0', catId: 'mrl9p83qi0qq6', name: 'QBO',                 url: '', user: 'boardwalk@crania-schools.com',          pass: '', notes: '', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmf6cne99536', catId: 'mrl9p83qi0qq6', name: 'QBO',                 url: '', user: 'waterlooeast@crania-schools.com',       pass: '', notes: '', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmf6dfhvl6ae', catId: 'mrl9p83qi0qq6', name: 'QBO',                 url: '', user: 'admin@crania-schools.com',              pass: '', notes: '', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmf8yd6lncbl', catId: 'mrmf2dir3wu6u', name: 'Shopify',             url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmf96wiix72t', catId: 'mrmf2dir3wu6u', name: 'Wyze',                url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmf9b2yuce1u', catId: 'mrmgmb9k27sv3', name: 'Youmail',             url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmf9eb6ratj4', catId: 'mrmf2dir3wu6u', name: 'Zoom',                url: '', user: 'admin@crania-schools.com?',             pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgrg266bq2z', catId: 'mrmf2dir3wu6u', name: 'Zoom',                url: '', user: 'boardwalk@crania-schools.com',          pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgrgtzn9hkz', catId: 'mrmf2dir3wu6u', name: 'Zoom',                url: '', user: 'waterlooeast@crania-schools.com',       pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfbvkxdd47b', catId: 'mrmfan3lcqjsl', name: 'Caribou',             url: '', user: 'info@crania-schools.com',              pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfbyxepq253', catId: 'mrmfan3lcqjsl', name: 'CEMC',                url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfc1rmh5j4c', catId: 'mrmfan3lcqjsl', name: 'CMS',                 url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfc5vt89dck', catId: 'mrmfan3lcqjsl', name: 'MAA',                 url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfcg3t897o5', catId: 'mrl9p83qqy14k', name: 'BW Computers',        url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfcjxmlncnr', catId: 'mrl9p83qqy14k', name: 'WE Computers',        url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfd3xt1ze7b', catId: 'mrmaubyjidc1e', name: 'Gmail',               url: '', user: 'craniatech@gmail.com',                 pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfd6y1n1lav', catId: 'mrmaubyjidc1e', name: 'Gmail',               url: '', user: 'craniawaterlooeaststudent@gmail.com',   pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfeyhkb38iv', catId: 'mrmaubyjidc1e', name: 'Gmail',               url: '', user: 'craniaboardwalktech@gmail.com',         pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfdz5ti8wxn', catId: 'mrmaubyjidc1e', name: 'Gmail',               url: '', user: 'waterlooeasttech@gmail.com',            pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfeiz4a3g4d', catId: 'mrmaubyjidc1e', name: 'Gmail',               url: '', user: 'brainbookspublisher@gmail.com',         pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfgbxc4f3us', catId: 'mrmaubyjidc1e', name: 'Gmail',               url: '', user: 'craniaschoolsinc@gmail.com',            pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfj85cwhff7', catId: 'mrmaubyjidc1e', name: 'Outlook',             url: '', user: 'admin@crania-schools.com',              pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfjcfjzktj8', catId: 'mrmaubyjidc1e', name: 'Outlook',             url: '', user: 'boardwalk@crania-schools.com',          pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmfjqogb12yr', catId: 'mrmaubyjidc1e', name: 'Outlook',             url: '', user: 'waterlooeast@crania-schools.com',       pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmhk0qgnl36u', catId: 'mrmaubyjidc1e', name: 'Outlook',             url: '', user: 'payments@crania-schools.com',           pass: '', notes: '', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmhkkz4jo4rm', catId: 'mrmaubyjidc1e', name: 'Outlook',             url: '', user: 'registrations@crania-schools.com',      pass: '', notes: '', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmhlz7rgiclf', catId: 'mrmaubyjidc1e', name: 'Outlook',             url: '', user: 'ai@crania-schools.com',                 pass: '', notes: 'For online classroom login', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmfkdcf874h9', catId: 'mrmaubyjidc1e', name: 'Outlook',             url: '', user: 'craniawaterlooeasttech@outlook.com',    pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmhmosn8wn2t', catId: 'mrmaubyjidc1e', name: 'Outlook',             url: '', user: 'craniatech@outlook.com',                pass: '', notes: '', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmgh6chylcv7', catId: 'mrmggezdgsc55', name: 'Agorapulse',          url: '', user: 'admin@crania-schools.com',              pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmghka9t3ujt', catId: 'mrmggezdgsc55', name: 'bitmoji',             url: '', user: 'admin@crania-schools.com',              pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmghtfky73p0', catId: 'mrmggezdgsc55', name: 'Canva',               url: '', user: 'admin@crania-schools.com',              pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmghvk88gx4q', catId: 'mrmggezdgsc55', name: 'Canva',               url: 'canva.com', user: 'waterlooeast@crania-schools.com', pass: 'At6+f&@JGmkx7juZ', notes: '', color: '#EEF3F6', cost: 100, start: '2026-07-29', active: true },
    { id: 'mrmgikg0m86ya', catId: 'mrmggezdgsc55', name: 'Doodly',              url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgj0v4h6g58', catId: 'mrmggezdgsc55', name: 'GoDaddy',             url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgj8ywyqqkc', catId: 'mrmggezdgsc55', name: 'Google Ads',          url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgjvog4ea5a', catId: 'mrmggezdgsc55', name: 'MailChimp',           url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgkhbzziots', catId: 'mrmggezdgsc55', name: 'Wordpress',           url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgkl3c6jkuz', catId: 'mrmggezdgsc55', name: 'Youtube',             url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgkwswwa72d', catId: 'mrmf2dir3wu6u', name: 'Grammarly',           url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgl1k7yv6pa', catId: 'mrmf2dir3wu6u', name: 'Spotify',             url: '', user: 'boardwalk@crania-schools.com',          pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgl4q7mt58k', catId: 'mrmf2dir3wu6u', name: 'Spotify',             url: '', user: 'waterlooeast@crania-schools.com',       pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgm09j1fl73', catId: 'mrmf2dir3wu6u', name: 'YogaDownload',        url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgn7dbf49rw', catId: 'mrmgmb9k27sv3', name: 'Freedom Mobile',      url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgurzhipng2', catId: 'mrmgmb9k27sv3', name: 'Bell',                url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmguwpqrl5yr', catId: 'mrmgmb9k27sv3', name: 'Ebox',                url: '', user: '',                                     pass: '', notes: '1-75', color: '#EEF3F6', cost: '', start: '' },
    { id: 'mrmgpya70261i', catId: 'mrmgo0l3k6uyw', name: 'Alibaba',             url: '', user: 'info@crania-schools.com',              pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgq8umgp8lu', catId: 'mrmgo0l3k6uyw', name: 'Blank Apparel',       url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgqdnc3tuju', catId: 'mrmgo0l3k6uyw', name: 'Entripy',             url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgqljyl59fm', catId: 'mrmgo0l3k6uyw', name: 'Vistaprint',          url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgwdp11h5u8', catId: 'mrmgmb9k27sv3', name: 'Enbridge',            url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgwgi6ucl96', catId: 'mrmgmb9k27sv3', name: 'Enova',               url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmgwo4le85zl', catId: 'mrmgmb9k27sv3', name: 'Rogers',              url: '', user: '',                                     pass: '', notes: '', color: '#EEF3F6' },
    { id: 'mrmhlu1cksti7', catId: 'mrmaubyjidc1e', name: 'Proton',              url: '', user: 'cschools_ai@proton.me',                pass: '', cost: '', start: '', notes: '', color: '#EEF3F6' },
    { id: 'mrnskwmxasi48', catId: 'mrnsk4elc04ma', name: 'ChatGPT,',            url: '', user: 'ai@crania-schools.com',                pass: '', cost: '', start: '2026-07-16', active: true, notes: '26 yrs old, name is Mrs. Henderson', color: '#EEF3F6' },
  ],
}

// Decrypt every account's sensitive fields on read; encrypt them on
// write. Both `pass` and `notes` are treated as secrets since notes
// commonly holds 2FA codes / security-question answers per the
// mockup's own labeling.
const SECRET_FIELDS = ['pass', 'notes']

function decryptAccounts(accounts) {
  return (accounts || []).map(a => {
    const out = { ...a }
    for (const f of SECRET_FIELDS) if (out[f] != null) out[f] = decryptSecret(out[f])
    return out
  })
}
function encryptAccounts(accounts) {
  return (accounts || []).map(a => {
    const out = { ...a }
    for (const f of SECRET_FIELDS) if (out[f] != null) out[f] = encryptSecret(out[f])
    return out
  })
}

export async function loadItAccounts() {
  try {
    const rows = await getFullList('itAccounts')
    const raw = rows.length === 0
      ? IT_ACCOUNTS_SEED
      : (rows[0].payload || { categories: [], accounts: [] })
    return {
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      accounts:   decryptAccounts(raw.accounts),
    }
  } catch (err) {
    if (err?.status === 404) {
      return {
        categories: IT_ACCOUNTS_SEED.categories,
        accounts:   decryptAccounts(IT_ACCOUNTS_SEED.accounts),
      }
    }
    throw err
  }
}

export async function saveItAccounts(payload) {
  await ensureAuth()
  const encPayload = {
    categories: Array.isArray(payload?.categories) ? payload.categories : [],
    accounts:   encryptAccounts(payload?.accounts),
  }
  const rows = await getFullList('itAccounts')
  if (rows.length === 0) {
    await pb().collection('itAccounts').create({ payload: encPayload })
  } else {
    await pb().collection('itAccounts').update(rows[0].id, { payload: encPayload })
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

// ---- surveys (definitions) -------------------------------
// Same shape/pattern as forms above: a survey is title + intro text +
// an ordered list of questions (radio/checkbox/textarea/stars). Taken
// inside the admin app itself (no public URL, unlike Forms) — a staff
// member hands a tablet to the family, matching how the original
// single hardcoded Family Feedback Survey worked.
export async function loadSurveys() {
  const rows = await getFullList('surveys')
  return rows.map(r => r.payload || {})
}

export async function saveSurveys(surveys) {
  await ensureAuth()
  const existing = await getFullList('surveys')
  const byRecordId = new Map(existing.map(r => [r.recordId, r]))
  const incomingIds = new Set(surveys.map(s => String(s.id)))

  for (const survey of surveys) {
    const recordId = String(survey.id)
    const data = { recordId, payload: { ...survey } }
    const found = byRecordId.get(recordId)
    if (found) {
      await pb().collection('surveys').update(found.id, data)
    } else {
      await pb().collection('surveys').create(data)
    }
  }
  for (const row of existing) {
    if (!incomingIds.has(row.recordId)) {
      await pb().collection('surveys').delete(row.id)
    }
  }
}

// ---- survey submissions -----------------------------------
export async function loadSurveySubmissions(surveyId = null) {
  await ensureAuth()
  const filter = surveyId ? { filter: `surveyId="${String(surveyId).replace(/"/g, '\\"')}"` } : {}
  const rows = await pb().collection('surveySubmissions').getFullList({ batch: 200, ...filter })
  return rows.map(r => r.payload || {})
}

export async function createSurveySubmission(sub) {
  await ensureAuth()
  await pb().collection('surveySubmissions').create({
    recordId: String(sub.id),
    surveyId: String(sub.surveyId),
    payload:  { ...sub },
  })
}

export async function deleteSurveySubmission(id) {
  await ensureAuth()
  try {
    const row = await pb().collection('surveySubmissions')
      .getFirstListItem(`recordId="${String(id).replace(/"/g, '\\"')}"`)
    await pb().collection('surveySubmissions').delete(row.id)
  } catch (err) {
    if (err?.status !== 404) throw err
  }
}

export async function deleteSurveySubmissionsForSurvey(surveyId) {
  await ensureAuth()
  const rows = await pb().collection('surveySubmissions').getFullList({
    batch: 200,
    filter: `surveyId="${String(surveyId).replace(/"/g, '\\"')}"`,
  })
  for (const row of rows) {
    await pb().collection('surveySubmissions').delete(row.id)
  }
}
