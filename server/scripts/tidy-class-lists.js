// ============================================================
// One-off cleanup for the two things that made Class Lists wrong.
// ------------------------------------------------------------
// 1. Drop the mis-filed duplicate program. There are two records named
//    MATH ENRICHMENT - LEVEL 1: the real one under FLEX, and a copy
//    filed under PRIVATE PIANO LESSONS. Students with no schedule text
//    were landing in whichever came first.
//
// 2. Backfill missing schedule text on registrations. Class Lists routes
//    a student to a session by matching that free text against the
//    program's timetable, so an enrolment saved without it shows up as
//    "schedule doesn't match a listed session". Where the text is blank
//    and the program is in the catalogue, write the program's own first
//    session. Enrolments that already carry text are never touched —
//    those disagreements are real and want a human.
//
// Backs up `programs` and `registrations` before writing.
//
// Usage (from project root, PocketBase running):
//   node server/scripts/tidy-class-lists.js            # dry run
//   node server/scripts/tidy-class-lists.js --apply    # do it
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

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const norm = (s) => String(s || '').trim().toUpperCase()

function fmtTime(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1], 10)
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m[2]} ${ampm}`
}

/* Same shape Class Lists parses: "Mon 4:30 pm". */
function firstSchedule(program) {
  for (const o of (program.offerings || [])) {
    const day = (o.days || [])[0]
    const time = (o.times || [])[0]
    if (day == null && !time) continue
    return [day == null ? '' : DOW[day], fmtTime(time && time.start)].filter(Boolean).join(' ')
  }
  return ''
}

async function main() {
  console.log(`Authenticating against ${PB_URL} …`)
  await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD)
  console.log('  ✓ authenticated\n')

  const progRows = await pb.collection('programs').getFullList({ batch: 500 })
  const regRows = await pb.collection('registrations').getFullList({ batch: 500 })

  // ---- 1. the mis-filed duplicate ----
  const doomed = progRows.filter(r => {
    const p = r.payload || {}
    return norm(p.name) === 'MATH ENRICHMENT - LEVEL 1' && norm(p.category) === 'PRIVATE PIANO LESSONS'
  })
  const survivors = progRows.filter(r => !doomed.includes(r))

  console.log('Programs to remove:')
  if (doomed.length === 0) console.log('  (none — already gone)')
  for (const r of doomed) {
    console.log(`  ${r.payload.name}  [${r.payload.category}]  id=${r.payload.id}`)
  }
  const stillThere = survivors.filter(r => norm(r.payload?.name) === 'MATH ENRICHMENT - LEVEL 1')
  console.log(`  → ${stillThere.length} copy of that name would remain` +
    (stillThere.length ? ` (${stillThere.map(r => r.payload.category).join(', ')})` : ''))
  if (doomed.length && stillThere.length === 0) {
    console.error('\n✗ That would delete the only copy of MATH ENRICHMENT - LEVEL 1. Aborting.')
    process.exit(1)
  }
  console.log()

  // ---- 2. missing schedule text ----
  const catalogue = new Map()
  for (const r of survivors) {
    const p = r.payload || {}
    if (p.name) catalogue.set(norm(p.name), p)
  }

  const edits = [] // { row, payload, changes: [{ program, schedule }] }
  let noSchedNoProgram = 0
  for (const row of regRows) {
    const payload = row.payload || {}
    const changes = []
    for (const entry of (payload.programs || [])) {
      if (!entry.program) continue
      if (String(entry.schedule || '').trim()) continue
      const prog = catalogue.get(norm(entry.program))
      if (!prog) { noSchedNoProgram++; continue }
      const when = firstSchedule(prog)
      if (!when) continue
      entry.schedule = when
      changes.push({ program: entry.program, schedule: when })
    }
    if (changes.length) edits.push({ row, payload, changes })
  }

  console.log('Schedules to backfill:')
  if (edits.length === 0) console.log('  (none)')
  for (const e of edits) {
    console.log(`  ${e.payload.displayName || e.row.recordId}`)
    for (const c of e.changes) console.log(`      ${c.program} → "${c.schedule}"`)
  }
  if (noSchedNoProgram) {
    console.log(`  (${noSchedNoProgram} blank-schedule enrolment${noSchedNoProgram === 1 ? '' : 's'} name a program` +
      ' not in the catalogue — nothing to copy from, left alone)')
  }
  console.log()

  if (!APPLY) {
    console.log('Dry run — nothing was written or deleted.')
    console.log('Re-run with --apply to take the backup and make these changes.')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dumpPath = path.join(SERVER_DIR, `backup-before-tidy-${stamp}.json`)
  fs.writeFileSync(dumpPath, JSON.stringify({ programs: progRows, registrations: regRows }, null, 2))
  console.log(`  ✓ backup written to ${dumpPath}`)

  for (const r of doomed) {
    await pb.collection('programs').delete(r.id)
    console.log(`  ✓ deleted program ${r.payload.name} [${r.payload.category}]`)
  }

  for (const e of edits) {
    await pb.collection('registrations').update(e.row.id, { payload: e.payload })
    console.log(`  ✓ updated ${e.payload.displayName || e.row.recordId}`)
  }

  console.log('\n✓ Done. Restart the API so it drops its cached programs and registrations:')
  console.log('    pm2 restart craniaverse-api')
}

main().catch(err => {
  console.error('\n✗ Failed:', err?.response || err?.message || err)
  process.exit(1)
})
