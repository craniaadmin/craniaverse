// ============================================================
// Delete every registration, permanently, and leave nothing behind.
// ------------------------------------------------------------
// Empties three collections:
//
//   registrations      every student and the customer, guardian,
//                      enrolment and fee data held on them
//   comments           the per-student notes that hang off them
//   customers_backups  snapshots, which are whole copies of the
//                      registrations table and would otherwise
//                      still hold the data being deleted
//
// Everything else is left alone. Programs, calendar, staff, to-do,
// inventory, forms, surveys, contests and the rest survive — new
// registrations enrol into the existing programme catalogue, so it
// has to be there afterwards.
//
// Before touching anything it dumps EVERY collection to a timestamped
// file on disk. That file is the only way back, so keep it until the
// new data is in and you are happy.
//
//   node server/scripts/wipe-registrations.js            # dry run
//   node server/scripts/wipe-registrations.js --apply    # do it
//
// AFTERWARDS YOU MUST RESTART THE API:
//
//   pm2 restart craniaverse-api
//
// The API holds the registrations table in memory. Until it restarts
// it still has the old list, and the next save of any kind writes
// that whole list back — putting every deleted record straight back.
//
// Requires server/.env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
// ============================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import PocketBase from 'pocketbase'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const EMAIL = process.env.PB_ADMIN_EMAIL
const PASSWORD = process.env.PB_ADMIN_PASSWORD
const APPLY = process.argv.includes('--apply')

if (!EMAIL || !PASSWORD) {
  console.error('✗ PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set in server/.env')
  process.exit(1)
}

// Emptied completely.
const WIPE = ['registrations', 'comments', 'customers_backups']

// Dumped to disk first, so a mistake is recoverable.
const ALL_COLLECTIONS = [
  'registrations', 'comments', 'customers_backups',
  'staff', 'programs', 'rules', 'staffBoard', 'inventory', 'forms', 'todo',
  'todo_backups', 'calendar_backups', 'checklist_backups', 'project_backups',
  'programs_backups', 'programs_state', 'boothSignups', 'finance', 'projects',
  'itAccounts', 'calendar', 'stock', 'craniaStore', 'contests',
  'marketingCalendar', 'formSubmissions', 'surveys', 'surveySubmissions',
  'campaigns', 'leads', 'contacts',
]

const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

async function readAll(name) {
  try {
    return await pb.collection(name).getFullList({ batch: 500 })
  } catch (err) {
    // A collection that does not exist on this install is not an error.
    if (err?.status === 404) return null
    throw err
  }
}

async function main() {
  console.log(`Authenticating against ${PB_URL} …`)
  await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD)
  console.log('  ✓ authenticated\n')

  // ---- what is there now -----------------------------------
  const contents = {}
  for (const name of ALL_COLLECTIONS) {
    const rows = await readAll(name)
    if (rows !== null) contents[name] = rows
  }

  console.log('To be emptied:')
  let total = 0
  for (const name of WIPE) {
    const n = (contents[name] || []).length
    total += n
    console.log(`  ${String(n).padStart(5)}  ${name}`)
  }

  const regs = contents.registrations || []
  if (regs.length) {
    console.log('\nStudents that will be deleted:')
    const names = regs.map(r => {
      const p = r.payload || {}
      const who = `${p.student?.firstName || ''} ${p.student?.lastName || ''}`.trim()
      return who || p.displayName || r.recordId || '(unnamed)'
    }).sort((a, b) => a.localeCompare(b))
    for (const n of names) console.log(`  · ${n}`)
  }

  console.log('\nLeft untouched:')
  for (const name of ALL_COLLECTIONS) {
    if (WIPE.includes(name)) continue
    const n = (contents[name] || []).length
    if (n) console.log(`  ${String(n).padStart(5)}  ${name}`)
  }

  if (!total) {
    console.log('\nNothing to delete — those collections are already empty.')
    return
  }

  if (!APPLY) {
    console.log(`\nRead-only — nothing was deleted. ${total} row(s) would go.`)
    console.log('Add --apply to take a full backup and delete them.')
    return
  }

  // ---- backup, then delete ---------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dumpPath = path.join(SERVER_DIR, `backup-full-${stamp}.json`)
  fs.writeFileSync(dumpPath, JSON.stringify(contents, null, 2))
  const sizeMb = (fs.statSync(dumpPath).size / 1048576).toFixed(1)
  console.log(`\n  ✓ full backup written to `
    + `${path.relative(path.join(SERVER_DIR, '..'), dumpPath)}  (${sizeMb} MB)`)

  for (const name of WIPE) {
    const rows = contents[name] || []
    let done = 0
    for (const row of rows) {
      await pb.collection(name).delete(row.id)
      done++
    }
    console.log(`  ✓ ${name}: deleted ${done}`)
  }

  // ---- prove it ---------------------------------------------
  console.log('\nVerifying …')
  let clean = true
  for (const name of WIPE) {
    const rows = await readAll(name)
    const n = (rows || []).length
    console.log(`  ${name}: ${n} row(s) remaining`)
    if (n) clean = false
  }

  console.log(clean ? '\n✓ Every registration is gone.' : '\n✗ Something is still there — see above.')
  console.log('\nNow restart the API, and do it before anyone touches the app:')
  console.log('    pm2 restart craniaverse-api')
  console.log('\nUntil it restarts the API still holds the old registrations in')
  console.log('memory, and the next save writes that whole list back — which')
  console.log('would undo all of this.')
}

main().catch(err => {
  console.error('\n✗ Failed:', err?.response || err?.message || err)
  process.exit(1)
})
