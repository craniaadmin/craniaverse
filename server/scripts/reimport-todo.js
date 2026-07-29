// One-shot: push server/todo.json into PocketBase's `todo` collection,
// replacing whatever is there now.
// ------------------------------------------------------------
// Unlike programs (one row per course x location), todo is a single
// singleton row — saveTodo() already does a full create-or-update
// of that one row, so this script is just "read the file, call
// saveTodo()". Missing fields on individual checklist entries (e.g.
// customMode, weekDay) get filled in with defaults by ToDo.jsx's own
// load-time normalization the first time the page opens afterward.
//
// Usage (from project root, with PocketBase already running):
//   node server/scripts/reimport-todo.js
//
// Requires server/.env to have PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
// (same as pb-setup.js).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { loadTodo, saveTodo } from '../pb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

async function main() {
  const file = path.join(SERVER_DIR, 'todo.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const payload = {
    lists: Array.isArray(data.lists) ? data.lists : [],
    items: Array.isArray(data.items) ? data.items : [],
    checklists: Array.isArray(data.checklists) ? data.checklists : [],
    _migPri: !!data._migPri,
  }

  const before = await loadTodo()
  console.log(`Before: ${before.lists.length} lists, ${before.items.length} items, ${before.checklists.length} checklists`)
  console.log(`Importing: ${payload.lists.length} lists, ${payload.items.length} items, ${payload.checklists.length} checklists from server/todo.json ...`)

  await saveTodo(payload)

  const after = await loadTodo()
  console.log(`Done. Now: ${after.lists.length} lists, ${after.items.length} items, ${after.checklists.length} checklists`)
}

main().catch((err) => {
  console.error('\n✗ Import failed:', err?.response || err?.message || err)
  process.exit(1)
})
