// One-shot: push server/programs.json into PocketBase's `programs`
// collection, replacing whatever is there now.
// ------------------------------------------------------------
// Why this exists: GET /api/programs only auto-seeds from the bundled
// JSON when the collection is completely EMPTY, and pb-setup.js's
// importPrograms() only upserts — it never deletes rows that aren't
// in the file anymore. Neither of those cleanly replaces an
// already-populated collection. This script does, by calling the
// same savePrograms() the live app uses when you save changes on the
// Programs page: it upserts every row in the file and deletes any
// existing row not present in it.
//
// Usage (from project root, with PocketBase already running):
//   node server/scripts/reimport-programs.js
//
// Requires server/.env to have PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
// (same as pb-setup.js).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { loadPrograms, savePrograms } from '../pb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

async function main() {
  const file = path.join(SERVER_DIR, 'programs.json')
  const programs = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(programs) || programs.length === 0) {
    console.error('server/programs.json is missing or empty — aborting.')
    process.exit(1)
  }

  const before = await loadPrograms()
  console.log(`Programs currently in the database: ${before.length}`)
  console.log(`Importing ${programs.length} rows from server/programs.json ...`)

  await savePrograms(programs)

  const after = await loadPrograms()
  console.log(`Done. Programs in the database now: ${after.length}`)
}

main().catch((err) => {
  console.error('\n✗ Import failed:', err?.response || err?.message || err)
  process.exit(1)
})
