// ============================================================
// Delete every registration belonging to the named families.
// ------------------------------------------------------------
// Families are named by their family reference — the F0005 you
// see in the Family ID column — and a reference covers every
// sibling under it, so deleting F0005 removes all of that
// family's students.
//
// Ranges are accepted, because these are usually consecutive:
//
//   node server/scripts/delete-families.js F0005-F0012
//   node server/scripts/delete-families.js F0005 F0007 F0011
//   node server/scripts/delete-families.js F0005-F0012 --apply
//
// Read-only by default: it lists exactly who would go and stops.
// Add --apply to write, which takes a full backup of the
// registrations collection first.
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

const norm = (s) => String(s || '').trim().toUpperCase()
const refNum = (s) => { const m = /^F(\d+)$/.exec(norm(s)); return m ? Number(m[1]) : null }
const pad = (n) => 'F' + String(n).padStart(4, '0')

// "F0005-F0012" -> every reference in between, inclusive.
function expand(args) {
  const out = new Set()
  for (const a of args) {
    if (a.startsWith('--')) continue
    const range = a.split('-')
    if (range.length === 2 && refNum(range[0]) != null && refNum(range[1]) != null) {
      const lo = refNum(range[0]), hi = refNum(range[1])
      for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) out.add(pad(i))
      continue
    }
    const n = refNum(a)
    if (n != null) out.add(pad(n))
    else console.warn(`  ! ignoring "${a}" — not a family reference like F0005 or F0005-F0012`)
  }
  return out
}

const wanted = expand(process.argv.slice(2))
if (!wanted.size) {
  console.error('Name at least one family, e.g.  node server/scripts/delete-families.js F0005-F0012')
  process.exit(1)
}

const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

async function main() {
  console.log(`Authenticating against ${PB_URL} …`)
  await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD)
  console.log('  ✓ authenticated\n')

  const rows = await pb.collection('registrations').getFullList({ batch: 500 })
  console.log(`Registrations : ${rows.length}`)
  console.log(`Families named: ${[...wanted].join(', ')}\n`)

  const hits = []
  for (const row of rows) {
    const p = row.payload || {}
    const ref = norm(p.customer?.meta?.familyId)
    if (!ref || !wanted.has(ref)) continue
    const name = `${p.student?.firstName || ''} ${p.student?.lastName || ''}`.trim() || '(unnamed)'
    hits.push({ row, ref, name, programs: (p.programs || []).length })
  }

  if (!hits.length) {
    console.log('Nothing matched — those families are already gone.')
    const present = new Set(rows.map(r => norm(r.payload?.customer?.meta?.familyId)).filter(Boolean))
    console.log(`\nFamily references currently in use: ${[...present].sort().join(', ') || '(none)'}`)
    return
  }

  const byRef = new Map()
  for (const h of hits) {
    if (!byRef.has(h.ref)) byRef.set(h.ref, [])
    byRef.get(h.ref).push(h)
  }
  for (const ref of [...byRef.keys()].sort()) {
    const list = byRef.get(ref)
    console.log(`  ${ref}  ${list.length} student${list.length === 1 ? '' : 's'}`)
    for (const h of list) {
      console.log(`        ${h.name}${h.programs ? `  (${h.programs} enrolment${h.programs === 1 ? '' : 's'})` : ''}`)
    }
  }

  const missing = [...wanted].filter(w => !byRef.has(w))
  if (missing.length) console.log(`\nNot found (already deleted?): ${missing.join(', ')}`)

  console.log(`\nWould delete ${hits.length} registration(s) across ${byRef.size} famil${byRef.size === 1 ? 'y' : 'ies'}.`)

  if (!APPLY) {
    console.log('\nRead-only — nothing was deleted.')
    console.log('Add --apply to back up and delete.')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dumpPath = path.join(SERVER_DIR, `backup-registrations-${stamp}.json`)
  fs.writeFileSync(dumpPath, JSON.stringify(rows, null, 2))
  console.log(`\n  ✓ backup of all ${rows.length} registrations written to `
    + path.relative(path.join(SERVER_DIR, '..'), dumpPath))

  for (const h of hits) await pb.collection('registrations').delete(h.row.id)
  console.log(`  ✓ deleted ${hits.length} registration(s)`)

  console.log('\n✓ Done. Restart the API so it drops its cached registrations:')
  console.log('    pm2 restart craniaverse-api')
}

main().catch(err => {
  console.error('\n✗ Failed:', err?.response || err?.message || err)
  process.exit(1)
})
