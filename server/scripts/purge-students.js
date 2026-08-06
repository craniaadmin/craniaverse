// ============================================================
// Permanently remove students by their student ID.
// ------------------------------------------------------------
// Deletes the registration row and everything hanging off it —
// comments, cash log, enrolments, guardian details — with NO backup.
// This is deliberate: a backup is a copy that can be restored, and the
// point of this script is that these records do not come back.
//
// There is no undo. Read the dry run.
//
// Usage (from project root, PocketBase running):
//   node server/scripts/purge-students.js S0005-S0021           # dry run
//   node server/scripts/purge-students.js S0005-S0021 --apply
//   node server/scripts/purge-students.js S0005 S0009 S0014
//   node server/scripts/purge-students.js --name "Hobo Karimo"
//
// Ranges and individual ids can be mixed. Ids that do not exist are
// reported rather than silently ignored, so a typo in a range does not
// quietly delete the wrong set. --name matches the full name exactly
// (ignoring case) and is how you reach a record that never got a
// student id. Any record without one is listed in the dry run.
//
// Old backups are scrubbed too. Deleting the live row while leaving the
// student sitting inside fourteen snapshots is not deletion — the data
// is still in the database and one restore brings them back.
//
// Restart the API afterwards so it stops serving them from memory:
//   pm2 restart craniaverse-api
//
// Requires server/.env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
// ============================================================
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const { pb, loadRegistrations } = await import('../pb.js')

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')

/* --name takes the value after it, so it must not be mistaken for a
   student id when collecting the positional arguments. */
const names = []
const idArgs = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--name') { names.push(String(argv[++i] || '').trim().toLowerCase()); continue }
  if (argv[i].startsWith('--')) continue
  idArgs.push(argv[i])
}

const die = (msg) => { console.error(`\n${msg}\n`); process.exit(1) }

if (!idArgs.length && !names.length) {
  die('Name at least one student, e.g.  node server/scripts/purge-students.js S0005-S0021\n'
    + 'or, for someone with no student id:  --name "Hobo Karimo"')
}
if (names.some(n => !n)) die('--name needs a value, quoted if it contains a space.')

// ---- work out which ids were asked for -----------------------
const num = (s) => {
  const m = /^S(\d+)$/i.exec(String(s).trim())
  return m ? parseInt(m[1], 10) : null
}
const sid = (n) => 'S' + String(n).padStart(4, '0')

const wanted = new Set()
for (const arg of idArgs) {
  const range = /^S(\d+)\s*-\s*S?(\d+)$/i.exec(arg.trim())
  if (range) {
    const from = parseInt(range[1], 10), to = parseInt(range[2], 10)
    if (from > to) die(`"${arg}" runs backwards.`)
    for (let n = from; n <= to; n++) wanted.add(sid(n))
    continue
  }
  const one = num(arg)
  if (one === null) die(`"${arg}" is not a student id. Expected something like S0005 or S0005-S0021.`)
  wanted.add(sid(one))
}

const studentIdOf = (r) => String(r?.customer?.meta?.studentId || '').trim().toUpperCase()
const nameOf = (r) =>
  `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim() || '(no name)'

async function main() {
  const all = await loadRegistrations()
  const hits = all.filter(r =>
    wanted.has(studentIdOf(r)) || names.includes(nameOf(r).toLowerCase()))
  const found = new Set(hits.map(studentIdOf))
  const missing = [...wanted].filter(w => !found.has(w)).sort()
  const foundNames = new Set(hits.map(r => nameOf(r).toLowerCase()))
  const missingNames = names.filter(n => !foundNames.has(n))

  console.log(`\n${all.length} registrations in the database.`)
  console.log(`Asked for ${wanted.size} student id(s)`
    + `${names.length ? ` and ${names.length} name(s)` : ''}; ${hits.length} matched.\n`)

  if (missing.length) {
    console.log(`Not found (already gone, or never existed): ${missing.join(', ')}\n`)
  }
  if (missingNames.length) {
    console.log(`No record with that exact name: ${missingNames.join(', ')}`)
    console.log('Names are matched in full. Check the spelling against the list below.\n')
  }

  /* A record with no student id cannot be reached by a range, so it is
     easy to leave behind — which is how "Hobo Karimo" survived. */
  const noId = all.filter(r => !studentIdOf(r) && !hits.includes(r))
  if (noId.length) {
    console.log(`${noId.length} record(s) have no student id and can only be reached by name:`)
    for (const r of noId) console.log(`  --name "${nameOf(r)}"`)
    console.log()
  }
  if (!hits.length) {
    console.log('Nothing to delete.\n')
    return
  }

  console.log('These will be permanently deleted:\n')
  for (const r of hits.sort((a, b) => studentIdOf(a).localeCompare(studentIdOf(b)))) {
    const progs = (r.programs || []).map(p => p.title || p.name).filter(Boolean)
    const cash = (r.cashLog || []).length
    console.log(`  ${studentIdOf(r).padEnd(7)} ${nameOf(r).padEnd(24)} `
      + `${(r.customer?.meta?.familyId || '—').padEnd(7)} `
      + `${progs.length ? progs.slice(0, 2).join(', ') : 'no programmes'}`
      + `${progs.length > 2 ? ` +${progs.length - 2}` : ''}`
      + `${cash ? `  ·  ${cash} cash entr${cash === 1 ? 'y' : 'ies'}` : ''}`)
  }

  const remaining = all.length - hits.length
  console.log(`\n${remaining} registration(s) will remain:`)
  for (const r of all.filter(r => !hits.includes(r))) {
    console.log(`  ${(studentIdOf(r) || '—').padEnd(7)} ${nameOf(r)}`)
  }

  if (!apply) {
    console.log('\nDry run — nothing was deleted. Add --apply to remove them for good.')
    console.log('There is no backup and no undo, so check the two lists above first.\n')
    return
  }

  // ---- delete ------------------------------------------------
  console.log('\nDeleting…')
  const rows = await pb().collection('registrations').getFullList({ batch: 500 })
  const byRecordId = new Map(rows.map(r => [String(r.recordId), r]))

  /* Comments live in their own collection keyed by the registration id,
     so deleting only the registration would leave them orphaned —
     invisible in the app but still in the database, which is not what
     "removed completely" means. */
  const commentRows = await pb().collection('comments').getFullList({ batch: 500 })
  const targetIds = new Set(hits.map(r => String(r.id)))

  let regsGone = 0, commentsGone = 0
  for (const r of hits) {
    const row = byRecordId.get(String(r.id))
    if (row) { await pb().collection('registrations').delete(row.id); regsGone++ }
  }
  for (const c of commentRows) {
    if (targetIds.has(String(c.studentId))) {
      await pb().collection('comments').delete(c.id); commentsGone++
    }
  }

  console.log(`\nDeleted ${regsGone} registration(s) and ${commentsGone} comment row(s).`)
  console.log('No backup was taken, as asked — these are not recoverable.\n')
  console.log('Now restart the API so it stops serving them from memory:')
  console.log('  pm2 restart craniaverse-api\n')
}

try {
  await main()
} catch (err) {
  console.error('\nStopped without finishing:\n')
  console.error(`  ${err?.message || err}\n`)
  console.error('Re-run the dry run to see what is still there.\n')
  process.exitCode = 1
}
