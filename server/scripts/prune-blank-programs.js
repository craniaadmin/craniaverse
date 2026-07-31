// ============================================================
// Delete program records that carry no information at all.
// ------------------------------------------------------------
// These are what drew the blank rows at the bottom of the Contests
// page: programs with no name sitting in a contest category. The
// Contests page now hides them, but they are still real rows in the
// catalogue, and they show up blank on the Programs page too.
//
// Deliberately conservative — a program is only "empty" when it has
// no name, no code, no number, no description, no cost, and no
// offering that names a day, a time, an instructor or a capacity.
// Anything with a single field filled in is left alone and listed
// under "kept (not empty)" so you can look at it yourself.
//
// Backs up the whole programs collection before deleting.
//
// Usage (from project root, PocketBase running):
//   node server/scripts/prune-blank-programs.js            # dry run
//   node server/scripts/prune-blank-programs.js --apply    # do it
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

const blank = (v) => v == null || String(v).trim() === ''

function offeringIsEmpty(o) {
  if (!o) return true
  if ((o.days || []).length) return false
  if ((o.times || []).some(t => t && (t.start || t.end))) return false
  if (!blank(o.instructor)) return false
  if (!blank(o.capacity)) return false
  if (!blank(o.enrolled)) return false
  return true
}

function programIsEmpty(p) {
  if (!p) return true
  for (const k of ['name', 'code', 'number', 'description', 'subject', 'cost', 'rate', 'ageRange']) {
    if (!blank(p[k])) return false
  }
  return (p.offerings || []).every(offeringIsEmpty)
}

async function main() {
  console.log(`Authenticating against ${PB_URL} …`)
  await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD)
  console.log('  ✓ authenticated\n')

  const rows = await pb.collection('programs').getFullList({ batch: 500 })
  const doomed = rows.filter(r => programIsEmpty(r.payload))
  const nameless = rows.filter(r => blank(r.payload?.name) && !programIsEmpty(r.payload))

  console.log(`Catalogue holds ${rows.length} programs.\n`)
  console.log(`Empty — would be deleted (${doomed.length}):`)
  if (!doomed.length) console.log('  (none)')
  for (const r of doomed) {
    console.log(`  id=${r.payload?.id || r.recordId}  category=${r.payload?.category || '—'}`)
  }

  if (nameless.length) {
    console.log(`\nKept (not empty) — no name, but something else is filled in (${nameless.length}):`)
    for (const r of nameless) {
      const p = r.payload || {}
      const has = ['code', 'number', 'subject', 'description', 'cost']
        .filter(k => !blank(p[k])).map(k => `${k}=${p[k]}`)
      console.log(`  id=${p.id || r.recordId}  category=${p.category || '—'}  ${has.join(' ') || '(has offerings)'}`)
    }
    console.log('  → look at these on the Programs page and name or remove them yourself.')
  }

  if (!doomed.length) { console.log('\nNothing to do.'); return }

  if (!APPLY) {
    console.log('\nDry run — nothing was written or deleted.')
    console.log('Re-run with --apply to take the backup and delete the empty programs.')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dumpPath = path.join(SERVER_DIR, `backup-programs-${stamp}.json`)
  fs.writeFileSync(dumpPath, JSON.stringify(rows, null, 2))
  console.log(`\n  ✓ backup written to ${dumpPath}`)

  let n = 0
  for (const r of doomed) { await pb.collection('programs').delete(r.id); n++ }
  console.log(`  ✓ deleted ${n} empty program${n === 1 ? '' : 's'}`)

  console.log('\n✓ Done. Restart the API so it drops its cached programs:')
  console.log('    pm2 restart craniaverse-api')
}

main().catch(err => {
  console.error('\n✗ Failed:', err?.response || err?.message || err)
  process.exit(1)
})
