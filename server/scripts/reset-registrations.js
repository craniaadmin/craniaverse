// ============================================================
// Clear every registration and replace them with two test students.
// ------------------------------------------------------------
// Scope is deliberately narrow: `registrations` and the per-student
// `comments` rows that hang off them. Programs, calendar, to-do,
// projects, inventory, staff, rules, store and everything else are
// left exactly as they are — the test students enrol in real programs
// from the existing catalogue, so those have to survive.
//
// Before deleting anything it dumps EVERY collection to a timestamped
// JSON file, so this is recoverable even though it is destructive.
//
// Usage (from project root, PocketBase running):
//   node server/scripts/reset-registrations.js            # dry run
//   node server/scripts/reset-registrations.js --apply    # do it
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

const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

/* Every collection pb-setup knows about — dumped wholesale before the
   delete, so a mistake here is recoverable from disk. */
const ALL_COLLECTIONS = [
  'registrations', 'staff', 'programs', 'rules', 'comments', 'staffBoard',
  'inventory', 'forms', 'todo', 'todo_backups', 'calendar_backups',
  'checklist_backups', 'project_backups', 'programs_backups', 'programs_state',
  'boothSignups', 'finance', 'projects', 'itAccounts', 'calendar', 'stock',
  'craniaStore', 'contests', 'marketingCalendar', 'formSubmissions', 'surveys',
  'surveySubmissions', 'campaigns', 'leads', 'contacts',
]

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/* Fee rows run Sept→Aug; a fresh enrolment has registration and materials
   settled and the monthly columns still open. */
const freshFees = () => ({
  reg: 'paid', mat: 'paid',
  aug: '', sep: '', oct: '', nov: '', dec: '',
  jan: '', feb: '', mar: '', apr: '', may: '', jun: '', jul: '',
})

const guardian = (first, last, rel, email) => ({
  'First Name': first, 'Last Name': last, 'Relationship': rel,
  'Phone (Home)': '(519) 555-0100', 'Phone (Mobile)': '(519) 555-0101',
  'Email': email, 'Street Address': '1 Test Lane', 'Unit': '',
  'City': 'Waterloo', 'Province': 'Ontario', 'Postal Code': 'N2L 0A1',
  'Occupation': 'Tester',
})

function makeStudent({ id, first, last, gender, dob, age, grade, programs }) {
  const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.test`
  return {
    id,
    displayName: `${first} ${last}`,
    createdAt: new Date().toISOString(),
    student: {
      firstName: first, lastName: last, gender, dob, age, email, grade,
      school: 'Test Public School', medical: '', notes: [], assessments: [],
      login: { username: '— generate —', password: '— generate —' },
      craniaCash: 0,
    },
    customer: {
      student: {
        'First Name': first, 'Last Name': last, 'Gender': gender, 'DOB': dob,
        'Current Age': age, 'Email': email, 'Current Grade': grade,
        'School': 'Test Public School', 'Report Card': '', 'Medical Conditions': '',
      },
      guardian1: guardian('Pat', last, 'Parent', `pat.${last.toLowerCase()}@example.test`),
      guardian2: guardian('Sam', last, 'Parent', `sam.${last.toLowerCase()}@example.test`),
      emergency: {
        'First Name': 'Alex', 'Last Name': 'Neighbour', 'Relationship': 'Neighbour',
        'Phone (Mobile)': '(519) 555-0199', 'Email': 'alex@example.test',
      },
    },
    programs: programs.map(p => ({
      active: true, status: 'Active', year: '26_27',
      program: p.name, rate: `$${p.cost}`, rateUnit: p.costUnit || '/term',
      fees: freshFees(), payment: 'Pending',
    })),
    cashLog: [],
  }
}

async function main() {
  console.log(`Authenticating against ${PB_URL} …`)
  await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD)
  console.log('  ✓ authenticated\n')

  // ---- pick two real programs per student from the live catalogue ----
  const progRows = await pb.collection('programs').getFullList({ batch: 500 })
  const catalogue = progRows.map(r => r.payload || {}).filter(p => p.name)
  const pick = (name) => catalogue.find(p => p.name === name)
  const wanted = [
    ['FLEX MATH - SINGLE', 'TEKNOKIDS CODING: SCRATCH'],
    ['MATH ENRICHMENT - LEVEL 2', 'TEKNOKIDS EARLY'],
  ]
  const resolved = wanted.map(pair => pair.map(pick))
  const missing = wanted.flat().filter(n => !pick(n))
  if (missing.length) {
    console.error(`✗ These programs are not in the catalogue: ${missing.join(', ')}`)
    console.error('  Programs must exist before students can enrol in them. Aborting.')
    process.exit(1)
  }

  // ---- dump everything before touching a thing ----
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dumpPath = path.join(SERVER_DIR, `backup-before-reset-${stamp}.json`)
  const dump = {}
  let total = 0
  for (const name of ALL_COLLECTIONS) {
    try {
      const rows = await pb.collection(name).getFullList({ batch: 500 })
      dump[name] = rows
      total += rows.length
    } catch (err) {
      dump[name] = { error: String(err?.message || err) }
    }
  }
  const regs = Array.isArray(dump.registrations) ? dump.registrations : []
  const comments = Array.isArray(dump.comments) ? dump.comments : []

  console.log('Current contents:')
  console.log(`  registrations : ${regs.length}`)
  console.log(`  comments      : ${comments.length}`)
  console.log(`  (everything else is left untouched — ${total} rows dumped in total)\n`)

  console.log('Will create:')
  resolved.forEach((pair, i) => {
    const who = i === 0 ? 'Test Studentone' : 'Test Studenttwo'
    console.log(`  ${who} → ${pair.map(p => p.name).join('  +  ')}`)
  })
  console.log()

  if (!APPLY) {
    console.log('Dry run — nothing was written or deleted.')
    console.log('Re-run with --apply to take the backup, clear registrations and add the test students.')
    return
  }

  fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2))
  console.log(`  ✓ backup written to ${dumpPath}`)

  let del = 0
  for (const r of regs) { await pb.collection('registrations').delete(r.id); del++ }
  console.log(`  ✓ deleted ${del} registration${del === 1 ? '' : 's'}`)

  let delC = 0
  for (const c of comments) { await pb.collection('comments').delete(c.id); delC++ }
  console.log(`  ✓ deleted ${delC} orphaned comment row${delC === 1 ? '' : 's'}`)

  const students = [
    makeStudent({
      id: uid(), first: 'Test', last: 'Studentone', gender: 'Female',
      dob: 'Mar 4, 2016', age: '10.4', grade: '5', programs: resolved[0],
    }),
    makeStudent({
      id: uid(), first: 'Test', last: 'Studenttwo', gender: 'Male',
      dob: 'Sep 18, 2017', age: '8.9', grade: '3', programs: resolved[1],
    }),
  ]
  for (const s of students) {
    await pb.collection('registrations').create({
      recordId: s.id, displayName: s.displayName, createdAt: s.createdAt, payload: s,
    })
    console.log(`  ✓ created ${s.displayName} (${s.programs.length} programs)`)
  }

  console.log('\n✓ Done. Restart the API so it drops its cached registrations:')
  console.log('    pm2 restart craniaverse-api')
}

main().catch(err => {
  console.error('\n✗ Failed:', err?.response || err?.message || err)
  process.exit(1)
})
