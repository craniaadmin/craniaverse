// ============================================================
// One-off cleanup: remove leftover test-suite registrations.
// ------------------------------------------------------------
// The continuous smoke tests (tests/logic-tests.js) POST a fake
// registration named "PB-Test <tag>", assert on it, then DELETE it.
// If a run is interrupted (or the delete ever fails) the record is
// left behind, and over many 15-minute runs these accumulate and
// show up in Students / Customers / Class Lists.
//
// This script talks to PocketBase directly (not through the API or
// its in-memory cache), so it's the most reliable way to sweep them.
// It matches registrations whose student first name is exactly
// "PB-Test" — the fixed prefix the test always uses — so real
// families are never touched.
//
// Usage (from project root, with PocketBase running, server/.env set):
//   node server/scripts/cleanup-test-records.js           # dry run — lists only
//   node server/scripts/cleanup-test-records.js --apply    # actually delete
//
// Requires server/.env:
//   PB_URL=http://127.0.0.1:8090
//   PB_ADMIN_EMAIL=...
//   PB_ADMIN_PASSWORD=...
// ============================================================
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

const APPLY = process.argv.includes('--apply')

// The test always uses this exact first name. Keep it in sync with
// tests/logic-tests.js (studentFirstName: 'PB-Test').
const TEST_FIRST_NAME = 'PB-Test'

if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set in server/.env')
  process.exit(1)
}

const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

async function main() {
  await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)

  const rows = await pb.collection('registrations').getFullList({ batch: 500 })
  const junk = rows.filter(r => {
    const fn = r.payload?.student?.firstName
    return String(fn || '').trim() === TEST_FIRST_NAME
  })

  if (junk.length === 0) {
    console.log(`No test records found (student.firstName === "${TEST_FIRST_NAME}"). Nothing to clean up.`)
    return
  }

  console.log(`Found ${junk.length} test record(s):`)
  for (const r of junk) {
    const s = r.payload?.student || {}
    console.log(`  · ${r.payload?.displayName || `${s.firstName || ''} ${s.lastName || ''}`.trim()}` +
      `   (recordId=${r.recordId}, pbId=${r.id})`)
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing deleted. Re-run with --apply to delete these ${junk.length} record(s).`)
    return
  }

  let deleted = 0
  for (const r of junk) {
    try {
      await pb.collection('registrations').delete(r.id)
      deleted++
    } catch (err) {
      console.error(`  ! failed to delete pbId=${r.id}: ${err?.message || err}`)
    }
  }
  console.log(`\nDeleted ${deleted} of ${junk.length} test record(s).`)
}

main().catch(err => {
  console.error('cleanup failed:', err?.message || err)
  process.exit(1)
})
