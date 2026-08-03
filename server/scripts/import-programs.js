// ============================================================
// Replace the live programs catalogue with the one in the repo.
// ------------------------------------------------------------
// src/data/programsData.json is the source of truth: 59 programs,
// one per name, 110 offerings. The live PocketBase copy was seeded
// from an older version of that file and has been edited through the
// Programs page ever since, so the two have drifted.
//
// The dry run prints the drift — which programs are only live, only
// in the file, and which fields differ on the ones in both — and
// writes nothing. --apply then replaces `programs` and
// `programs_state` wholesale from the file.
//
// Enrolment and instructor are deliberately NOT carried over from the
// file: it holds blanks for both. Anything typed into those fields
// live is preserved unless --overwrite-staffing is passed.
//
// Usage (from project root, PocketBase running):
//   node server/scripts/import-programs.js                  # dry run
//   node server/scripts/import-programs.js --apply
//   node server/scripts/import-programs.js --apply --overwrite-staffing
//   node server/scripts/import-programs.js --file some-export.json
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
const ROOT = path.join(SERVER_DIR, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const EMAIL = process.env.PB_ADMIN_EMAIL
const PASSWORD = process.env.PB_ADMIN_PASSWORD
const APPLY = process.argv.includes('--apply')
const OVERWRITE_STAFFING = process.argv.includes('--overwrite-staffing')
const fileArg = process.argv.indexOf('--file')
const FILE = fileArg > -1 && process.argv[fileArg + 1]
  ? path.resolve(process.argv[fileArg + 1])
  : path.join(ROOT, 'src', 'data', 'programsData.json')

if (!EMAIL || !PASSWORD) {
  console.error('✗ PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set in server/.env')
  process.exit(1)
}

const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

const SCALARS = ['number', 'code', 'name', 'subject', 'category', 'ageRange', 'duration',
  'sessions', 'period', 'rate', 'totalHours', 'description', 'year', 'gradeFrom', 'gradeTo',
  'platform', 'cost', 'costUnit', 'active']

const sessionCount = (p) => (p.offerings || []).reduce(
  (n, o) => n + (((o.days || []).length || 1) * ((o.times || []).length || 1)), 0)

/* Compares what a class actually runs, not the record's internal ids —
   an offering that was split or re-keyed but kept its slots is not drift. */
function offeringShape(p) {
  return (p.offerings || []).map(o => [
    o.locationId || '',
    (o.days || []).slice().sort((a, b) => a - b).join(','),
    (o.times || []).map(t => `${t.start}-${t.end}`).sort().join(','),
    o.capacity == null ? '' : o.capacity,
  ].join('|')).sort()
}

const j = (v) => JSON.stringify(v)

async function main() {
  console.log(`Reading ${path.relative(ROOT, FILE)}`)
  const file = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const wanted = Array.isArray(file.programs) ? file.programs : []
  if (!wanted.length) {
    console.error('✗ That file has no programs. Refusing to wipe the catalogue.')
    process.exit(1)
  }
  const { programs: _drop, ...wantedState } = file

  const dupes = wanted.length - new Set(wanted.map(p => String(p.name || '').trim().toUpperCase())).size
  console.log(`  ${wanted.length} programs, ${wanted.reduce((n, p) => n + (p.offerings || []).length, 0)} offerings, `
    + `${wanted.reduce((n, p) => n + sessionCount(p), 0)} sessions`
    + (dupes ? `  (${dupes} duplicate names)` : '  (no duplicate names)'))

  console.log(`\nAuthenticating against ${PB_URL} …`)
  await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD)
  console.log('  ✓ authenticated\n')

  const rows = await pb.collection('programs').getFullList({ batch: 500 })
  const live = rows.map(r => r.payload || {})
  console.log(`Live catalogue: ${live.length} programs, `
    + `${live.reduce((n, p) => n + (p.offerings || []).length, 0)} offerings, `
    + `${live.reduce((n, p) => n + sessionCount(p), 0)} sessions\n`)

  const liveById = new Map(live.map(p => [String(p.id), p]))
  const wantById = new Map(wanted.map(p => [String(p.id), p]))

  const onlyLive = live.filter(p => !wantById.has(String(p.id)))
  const onlyFile = wanted.filter(p => !liveById.has(String(p.id)))

  console.log(`Only in the live database — would be REMOVED (${onlyLive.length}):`)
  if (!onlyLive.length) console.log('  (none)')
  for (const p of onlyLive) {
    console.log(`  ${p.id}  ${p.name || '(unnamed)'}  [${p.category || '—'}]  ${sessionCount(p)} sessions`)
  }

  console.log(`\nOnly in the file — would be ADDED (${onlyFile.length}):`)
  if (!onlyFile.length) console.log('  (none)')
  for (const p of onlyFile) {
    console.log(`  ${p.id}  ${p.name}  [${p.category}]  ${sessionCount(p)} sessions`)
  }

  let changed = 0
  const staffingKept = []
  console.log('\nIn both, but different:')
  for (const w of wanted) {
    const l = liveById.get(String(w.id))
    if (!l) continue
    const notes = []
    for (const f of SCALARS) if (j(l[f]) !== j(w[f])) notes.push(`${f}: ${j(l[f])} → ${j(w[f])}`)
    const ls = offeringShape(l), ws = offeringShape(w)
    if (j(ls) !== j(ws)) {
      notes.push(`schedule: ${ls.length} offering(s) → ${ws.length}`)
      for (const s of ls.filter(x => !ws.includes(x))) notes.push(`    live only: ${s}`)
      for (const s of ws.filter(x => !ls.includes(x))) notes.push(`    file only: ${s}`)
    }
    // Staffing typed in live has nothing to overwrite it with in the file.
    for (const o of (l.offerings || [])) {
      if (String(o.instructor || '').trim() || String(o.enrolled || '').trim()) {
        staffingKept.push(`${l.name} · ${o.locationId} · instructor=${j(o.instructor)} enrolled=${j(o.enrolled)}`)
      }
    }
    if (notes.length) { changed++; console.log(`  ${w.id}  ${w.name}`); notes.forEach(n => console.log(`      ${n}`)) }
  }
  if (!changed) console.log('  (none)')

  if (staffingKept.length) {
    console.log(`\nInstructor / enrolment set live but blank in the file (${staffingKept.length}):`)
    staffingKept.slice(0, 20).forEach(s => console.log(`  ${s}`))
    if (staffingKept.length > 20) console.log(`  … and ${staffingKept.length - 20} more`)
    console.log(OVERWRITE_STAFFING
      ? '  → --overwrite-staffing given: these WILL be cleared.'
      : '  → these will be carried over onto the imported records.')
  }

  console.log(`\nSummary: ${onlyFile.length} added, ${onlyLive.length} removed, ${changed} changed.`)

  if (!APPLY) {
    console.log('\nDry run — nothing was written.')
    console.log('Re-run with --apply to back up and replace the catalogue.')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dumpPath = path.join(SERVER_DIR, `backup-programs-${stamp}.json`)
  const stateRows = await pb.collection('programs_state').getFullList({ batch: 500 })
  fs.writeFileSync(dumpPath, JSON.stringify({ programs: rows, programs_state: stateRows }, null, 2))
  console.log(`\n  ✓ backup written to ${path.relative(ROOT, dumpPath)}`)

  /* Carry staffing across unless told otherwise — it is real operational
     data that only exists live, and the file has nothing to replace it. */
  const payloads = wanted.map(w => {
    const p = JSON.parse(JSON.stringify(w))
    if (OVERWRITE_STAFFING) return p
    const l = liveById.get(String(w.id))
    if (!l) return p
    for (const o of (p.offerings || [])) {
      const match = (l.offerings || []).find(x =>
        x.locationId === o.locationId &&
        (x.days || []).slice().sort().join(',') === (o.days || []).slice().sort().join(','))
      if (!match) continue
      if (!String(o.instructor || '').trim() && String(match.instructor || '').trim()) o.instructor = match.instructor
      if (!String(o.enrolled || '').trim() && String(match.enrolled || '').trim()) o.enrolled = match.enrolled
    }
    return p
  })

  const byRecordId = new Map(rows.map(r => [r.recordId, r]))
  const incoming = new Set(payloads.map(p => String(p.id)))
  let created = 0, updated = 0, removed = 0
  for (const p of payloads) {
    const data = { recordId: String(p.id), payload: p }
    const found = byRecordId.get(String(p.id))
    if (found) { await pb.collection('programs').update(found.id, data); updated++ }
    else { await pb.collection('programs').create(data); created++ }
  }
  for (const r of rows) {
    if (!incoming.has(String(r.recordId))) { await pb.collection('programs').delete(r.id); removed++ }
  }
  console.log(`  ✓ ${created} created, ${updated} updated, ${removed} removed`)

  // View state (locations, categories, colours, column order) travels with it.
  const existingState = stateRows.find(r => r.recordId === 'singleton')
  const stateData = { recordId: 'singleton', payload: wantedState }
  if (existingState) await pb.collection('programs_state').update(existingState.id, stateData)
  else await pb.collection('programs_state').create(stateData)
  console.log('  ✓ programs_state replaced (locations, categories, colours, column order)')

  console.log('\n✓ Done. Restart the API so it drops its cached catalogue:')
  console.log('    pm2 restart craniaverse-api')
}

main().catch(err => {
  console.error('\n✗ Failed:', err?.response || err?.message || err)
  process.exit(1)
})
