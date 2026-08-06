// ============================================================
// What is actually in the registrations table, and where did it
// come from.
// ------------------------------------------------------------
// Groups every registration by the shape of its name so test data,
// duplicates and real families are easy to tell apart, and shows when
// each was created. Read-only unless you pass --delete-tests.
//
// Usage (from project root, PocketBase running):
//   node server/scripts/audit-registrations.js
//   node server/scripts/audit-registrations.js --delete-tests
//   node server/scripts/audit-registrations.js --delete-tests --apply
//
// --delete-tests only ever removes records whose student first name is
// exactly "PB-Test" — the fixed name the smoke test uses. It is a dry
// run until you add --apply.
//
// IMPORTANT: the API caches the whole registrations list in memory and
// rewrites it on the next save. Deleting here while the API is running
// means the next write puts everything back. Restart it afterwards:
//   pm2 restart craniaverse-api
//
// Requires server/.env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
// ============================================================
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const { loadRegistrations, saveRegistrations } = await import('../pb.js')

const argv = process.argv.slice(2)
const wantDelete = argv.includes('--delete-tests')
const apply = argv.includes('--apply')

const TEST_FIRST_NAME = 'PB-Test'

const nameOf = (r) =>
  `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim() || '(no name)'

const when = (r) => {
  const raw = r.createdAt || r.receivedAt || ''
  const d = new Date(raw)
  return isNaN(d.getTime()) ? String(raw || '—') : d.toISOString().slice(0, 16).replace('T', ' ')
}

async function main() {
  const all = await loadRegistrations()
  console.log(`\n${all.length} registrations\n`)

  const tests = all.filter(r => String(r.student?.firstName || '').trim() === TEST_FIRST_NAME)
  const rest = all.filter(r => !tests.includes(r))

  if (tests.length) {
    const times = tests.map(when).sort()
    console.log(`Smoke-test leftovers (first name "${TEST_FIRST_NAME}"): ${tests.length}`)
    console.log(`  earliest ${times[0]}   latest ${times[times.length - 1]}`)
    console.log('  These are created by the every-15-minutes test run and should')
    console.log('  delete themselves. Any still here means the cleanup failed.\n')
  } else {
    console.log(`No "${TEST_FIRST_NAME}" leftovers.\n`)
  }

  /* Same student name more than once is not necessarily wrong — siblings
     re-register, and one child can hold several enrolments — but it is
     the first thing to look at when a list looks doubled. */
  const byName = new Map()
  for (const r of rest) {
    const n = nameOf(r).toLowerCase()
    if (!byName.has(n)) byName.set(n, [])
    byName.get(n).push(r)
  }
  const dupes = [...byName.entries()].filter(([, v]) => v.length > 1)
  if (dupes.length) {
    console.log(`Names appearing more than once: ${dupes.length}`)
    for (const [, group] of dupes.sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
      console.log(`  ${nameOf(group[0]).padEnd(28)} x${group.length}   ${group.map(when).join('  ')}`)
    }
    console.log()
  }

  console.log('Created per day:')
  const perDay = new Map()
  for (const r of all) {
    const d = when(r).slice(0, 10)
    perDay.set(d, (perDay.get(d) || 0) + 1)
  }
  for (const [d, n] of [...perDay.entries()].sort()) {
    console.log(`  ${d}  ${'#'.repeat(Math.min(n, 60))} ${n}`)
  }
  console.log()

  if (!wantDelete) {
    console.log('Read-only. Add --delete-tests to remove the smoke-test leftovers.\n')
    return
  }
  if (!tests.length) {
    console.log('Nothing to delete.\n')
    return
  }
  if (!apply) {
    console.log(`Would delete ${tests.length} "${TEST_FIRST_NAME}" records. Re-run with --apply.\n`)
    return
  }

  await saveRegistrations(rest)
  console.log(`Deleted ${tests.length}. ${rest.length} registrations remain.\n`)
  console.log('Now restart the API, or its cached copy will write them straight back:')
  console.log('  pm2 restart craniaverse-api\n')
}

try {
  await main()
} catch (err) {
  console.error('\nCould not read the registrations:\n')
  console.error(`  ${err?.message || err}\n`)
  process.exitCode = 1
}
