// One-shot: push server/inventory.json into PocketBase's `stock`
// collection, replacing whatever is there now.
// ------------------------------------------------------------
// Like todo, stock is a single singleton row -- saveStock() already
// does a full create-or-update of that one row, so this script is
// just "read the file, call saveStock()".
//
// Usage (from project root, with PocketBase already running):
//   node server/scripts/reimport-inventory.js
//
// Requires server/.env to have PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
// (same as pb-setup.js).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { loadStock, saveStock } from '../pb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

async function main() {
  const file = path.join(SERVER_DIR, 'inventory.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const payload = {
    items: Array.isArray(data.items) ? data.items : [],
    log: Array.isArray(data.log) ? data.log : [],
    categoryOrder: Array.isArray(data.categoryOrder) ? data.categoryOrder : [],
    categoryColors: data.categoryColors || {},
    extraSubs: Array.isArray(data.extraSubs) ? data.extraSubs : [],
    subOrder: data.subOrder || {},
    subColors: data.subColors || {},
    colOrder: Array.isArray(data.colOrder) ? data.colOrder : [],
    hiddenCols: data.hiddenCols || {},
    groupBy: !!data.groupBy,
  }

  const before = await loadStock()
  console.log(`Before: ${(before.items || []).length} items, ${(before.log || []).length} log entries`)
  console.log(`Importing: ${payload.items.length} items, ${payload.log.length} log entries from server/inventory.json ...`)

  await saveStock(payload)

  const after = await loadStock()
  console.log(`Done. Now: ${(after.items || []).length} items, ${(after.log || []).length} log entries`)
}

main().catch((err) => {
  console.error('\n✗ Import failed:', err?.response || err?.message || err)
  process.exit(1)
})
