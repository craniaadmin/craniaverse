// ============================================================
// One-shot PocketBase setup script.
// ------------------------------------------------------------
// Creates the six collections this app uses, then imports each
// JSON file in server/ into the matching collection. Safe to
// re-run: existing collections are reused, existing records
// (matched by recordId) are updated instead of duplicated.
//
// Usage (from project root, with PocketBase already running):
//   node server/scripts/pb-setup.js            # create collections only
//   node server/scripts/pb-setup.js --import   # also load server/*.json
//
// Requires server/.env to have:
//   PB_URL=http://127.0.0.1:8090
//   PB_ADMIN_EMAIL=...
//   PB_ADMIN_PASSWORD=...
// ============================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import PocketBase from 'pocketbase'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

const PB_URL            = process.env.PB_URL            || 'http://127.0.0.1:8090'
const PB_ADMIN_EMAIL    = process.env.PB_ADMIN_EMAIL
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD

if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set in server/.env')
  process.exit(1)
}

const IMPORT_DATA = process.argv.slice(2).includes('--import')

const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

const collectionSpecs = [
  {
    name: 'registrations',
    fields: [
      { name: 'recordId',    type: 'text', required: true,  presentable: true },
      { name: 'displayName', type: 'text', required: false, presentable: true },
      { name: 'createdAt',   type: 'text', required: false },
      { name: 'payload',     type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_registrations_recordId` ON `registrations` (`recordId`)'],
  },
  {
    // Not `users`: PocketBase ships a built-in `users` auth collection,
    // and reusing it meant every write failed against a schema wanting
    // an email and a password rather than our recordId/payload pair.
    name: 'accounts',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 1048576 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_accounts_recordId` ON `accounts` (`recordId`)'],
  },
  {
    name: 'staff',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_staff_recordId` ON `staff` (`recordId`)'],
  },
  {
    name: 'programs',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_programs_recordId` ON `programs` (`recordId`)'],
  },
  {
    name: 'rules',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_rules_recordId` ON `rules` (`recordId`)'],
  },
  {
    name: 'comments',
    fields: [
      { name: 'studentId', type: 'text', required: true,  presentable: true },
      { name: 'tabKey',    type: 'text', required: true,  presentable: true },
      { name: 'rows',      type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_comments_student_tab` ON `comments` (`studentId`, `tabKey`)'],
  },
  {
    name: 'staffBoard',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'inventory',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_inventory_recordId` ON `inventory` (`recordId`)'],
  },
  {
    name: 'forms',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_forms_recordId` ON `forms` (`recordId`)'],
  },
  {
    name: 'todo',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'todo_backups',
    fields: [
      { name: 'label',   type: 'text', required: false },
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'calendar_backups',
    fields: [
      { name: 'label',   type: 'text', required: false },
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'checklist_backups',
    fields: [
      { name: 'label',   type: 'text', required: false },
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'project_backups',
    fields: [
      { name: 'label',   type: 'text', required: false },
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'programs_backups',
    fields: [
      { name: 'label',   type: 'text', required: false },
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'customers_backups',
    fields: [
      { name: 'label',   type: 'text', required: false },
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    // One shared backup store for every page's settings gear, tagged
    // with which collection each snapshot came from.
    name: 'snapshots',
    fields: [
      { name: 'source',  type: 'text', required: true, presentable: true },
      { name: 'label',   type: 'text', required: false },
      { name: 'payload', type: 'json', required: false, maxSize: 20971520 },
    ],
    indexes: [],
  },
  {
    name: 'staff_backups',
    fields: [
      { name: 'label',   type: 'text', required: false },
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'programs_state',
    fields: [
      { name: 'recordId', type: 'text', required: true, presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_programs_state_recordId` ON `programs_state` (`recordId`)'],
  },
  {
    name: 'boothSignups',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },   // = email (lowercase)
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_boothSignups_recordId` ON `boothSignups` (`recordId`)'],
  },
  {
    name: 'finance',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'projects',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'itAccounts',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'calendar',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'stock',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'craniaStore',
    fields: [
      // 20 MB — items carry base64 image data URLs.
      { name: 'payload', type: 'json', required: false, maxSize: 20971520 },
    ],
    indexes: [],
  },
  {
    name: 'contests',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'marketingCalendar',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'formSubmissions',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'formId',   type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_formSubmissions_recordId` ON `formSubmissions` (`recordId`)'],
  },
  {
    name: 'surveys',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_surveys_recordId` ON `surveys` (`recordId`)'],
  },
  {
    name: 'surveySubmissions',
    fields: [
      { name: 'recordId', type: 'text', required: true,  presentable: true },
      { name: 'surveyId', type: 'text', required: true,  presentable: true },
      { name: 'payload',  type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_surveySubmissions_recordId` ON `surveySubmissions` (`recordId`)'],
  },
  {
    name: 'campaigns',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'leads',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
  {
    name: 'contacts',
    fields: [
      { name: 'payload', type: 'json', required: false, maxSize: 5242880 },
    ],
    indexes: [],
  },
]

async function ensureCollection(spec) {
  try {
    const existing = await pb.collections.getOne(spec.name)
    console.log(`  · collection "${spec.name}" already exists`)
    return existing
  } catch (err) {
    if (err?.status !== 404) throw err
  }
  const created = await pb.collections.create({
    name: spec.name,
    type: 'base',
    fields: spec.fields,
    indexes: spec.indexes,
  })
  console.log(`  + created collection "${spec.name}"`)
  return created
}

function readJsonIfExists(filename) {
  const full = path.join(SERVER_DIR, filename)
  if (!fs.existsSync(full)) return null
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (err) {
    console.warn(`  ! could not parse ${filename}: ${err.message}`)
    return null
  }
}

async function getByRecordId(collectionName, recordId) {
  try {
    return await pb.collection(collectionName).getFirstListItem(
      `recordId="${String(recordId).replace(/"/g, '\\"')}"`
    )
  } catch (err) {
    if (err?.status === 404) return null
    throw err
  }
}

async function upsertByRecordId(collectionName, recordId, data) {
  const existing = await getByRecordId(collectionName, recordId)
  if (existing) {
    await pb.collection(collectionName).update(existing.id, data)
    return 'updated'
  }
  await pb.collection(collectionName).create(data)
  return 'created'
}

async function importRegistrations() {
  const records = readJsonIfExists('data.json')
  if (!Array.isArray(records)) return
  let c = 0, u = 0
  for (const rec of records) {
    const recordId = String(rec.id)
    const action = await upsertByRecordId('registrations', recordId, {
      recordId,
      displayName: rec.displayName || '',
      createdAt: rec.createdAt || '',
      payload: rec,
    })
    if (action === 'created') c++; else u++
  }
  console.log(`  · registrations: ${c} created, ${u} updated`)
}

async function importStaff() {
  const records = readJsonIfExists('staff.json')
  if (!Array.isArray(records)) return
  let c = 0, u = 0
  for (const rec of records) {
    const recordId = String(rec.id)
    const action = await upsertByRecordId('staff', recordId, { recordId, payload: rec })
    if (action === 'created') c++; else u++
  }
  console.log(`  · staff: ${c} created, ${u} updated`)
}

async function importPrograms() {
  let records = readJsonIfExists('programs.json')
  if (!Array.isArray(records)) {
    // fall back to the bundled seed if no programs.json yet
    records = readJsonIfExists(path.join('..', 'src', 'data', 'programsData.json'))
  }
  if (!Array.isArray(records)) {
    // the bundled seed may be { locations, programs }
    const bundled = readJsonIfExists(path.join('..', 'src', 'data', 'programsData.json'))
    if (bundled && Array.isArray(bundled.programs)) records = bundled.programs
  }
  if (!Array.isArray(records)) return
  let c = 0, u = 0, skipped = 0
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    // Each program row already has a stable id in the template data.
    // Use it as the PocketBase record key so rows with the same catalog
    // number but different offerings do not collapse.
    const recordId = String(rec.id || '').trim() || `prog-${uid()}`
    if (!rec.id) rec.id = recordId
    try {
      const action = await upsertByRecordId('programs', recordId, { recordId, payload: rec })
      if (action === 'created') c++; else u++
    } catch (err) {
      console.warn(`  ! skipped program row ${i} (${recordId}): ${err?.message || err}`)
      skipped++
    }
  }
  console.log(`  · programs: ${c} created, ${u} updated${skipped ? `, ${skipped} skipped` : ''}`)
}

async function importProgramsState() {
  let state = readJsonIfExists(path.join('..', 'src', 'data', 'programsData.json'))
  if (!state || typeof state !== 'object') state = readJsonIfExists('programs.json')
  if (!state || typeof state !== 'object' || Array.isArray(state)) return
  const payload = {
    locations: Array.isArray(state.locations) ? state.locations : [],
    colOrder: Array.isArray(state.colOrder) ? state.colOrder : [],
    hiddenCols: state.hiddenCols || {},
    categoryOrder: Array.isArray(state.categoryOrder) ? state.categoryOrder : [],
    subjOrder: Array.isArray(state.subjOrder) ? state.subjOrder : [],
    catColors: state.catColors || {},
    subjColors: state.subjColors || {},
  }
  // The bundled seed historically stored subjOrder as an object in some places.
  if (!Array.isArray(payload.subjOrder)) payload.subjOrder = []
  const action = await upsertByRecordId('programs_state', 'singleton', { recordId: 'singleton', payload })
  console.log(`  · programs_state: 1 ${action}`)
}

async function importRules() {
  const records = readJsonIfExists('rules.json')
  if (!Array.isArray(records)) return
  let c = 0, u = 0
  for (const rec of records) {
    const recordId = String(rec.id)
    const action = await upsertByRecordId('rules', recordId, { recordId, payload: rec })
    if (action === 'created') c++; else u++
  }
  console.log(`  · rules: ${c} created, ${u} updated`)
}

async function importComments() {
  const obj = readJsonIfExists('comments.json')
  if (!obj || typeof obj !== 'object') return
  let c = 0, u = 0
  for (const [studentId, tabs] of Object.entries(obj)) {
    if (!tabs || typeof tabs !== 'object') continue
    for (const [tabKey, rows] of Object.entries(tabs)) {
      let existing = null
      try {
        existing = await pb.collection('comments').getFirstListItem(
          `studentId="${studentId}" && tabKey="${tabKey.replace(/"/g, '\\"')}"`
        )
      } catch (err) {
        if (err?.status !== 404) throw err
      }
      const data = { studentId, tabKey, rows: Array.isArray(rows) ? rows : [] }
      if (existing) {
        await pb.collection('comments').update(existing.id, data)
        u++
      } else {
        await pb.collection('comments').create(data)
        c++
      }
    }
  }
  console.log(`  · comments: ${c} created, ${u} updated`)
}

async function importStaffBoard() {
  const board = readJsonIfExists('staff-board.json')
  if (!board || typeof board !== 'object') return
  const rows = await pb.collection('staffBoard').getFullList({ batch: 50 })
  if (rows.length === 0) {
    await pb.collection('staffBoard').create({ payload: board })
    console.log('  · staffBoard: 1 created')
  } else {
    await pb.collection('staffBoard').update(rows[0].id, { payload: board })
    console.log('  · staffBoard: 1 updated')
  }
}

async function main() {
  console.log(`Authenticating against ${PB_URL} ...`)
  await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
  console.log('  ✓ authenticated\n')

  console.log('Ensuring collections:')
  for (const spec of collectionSpecs) {
    await ensureCollection(spec)
  }

  /* The seed import is opt-in. It re-creates every record in the JSON
     files, so running this script to add a collection — which is the
     only reason anyone runs it now — also put every registration in
     data.json back, including ones deliberately deleted. The
     collections are the safe, idempotent part; the data is not. */
  if (!IMPORT_DATA) {
    console.log('\nSkipping the JSON seed import (collections only).')
    console.log('Pass --import to load server/*.json into the database.')
  } else {
    console.log('\nImporting JSON data:')
    await importRegistrations()
    await importStaff()
    await importPrograms()
    await importProgramsState()
    await importRules()
    await importComments()
    await importStaffBoard()
  }

  console.log('\n✓ PocketBase setup complete.')
}

main().catch((err) => {
  console.error('\n✗ Setup failed:', err?.response || err?.message || err)
  process.exit(1)
})
