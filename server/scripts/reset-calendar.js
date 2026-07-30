// ============================================================
// Wipe the Calendar and reload it from server/data/calendar-seed.json.
//
// Takes a backup first, so this is reversible from the Calendar's
// Settings → Restore list if the reset turns out to be wrong.
//
// Usage (from project root, PocketBase running):
//   node server/scripts/reset-calendar.js
//   node server/scripts/reset-calendar.js --no-backup
// ============================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

const { loadCalendar, saveCalendar, createCalendarBackup } = await import('../pb.js')

const seedPath = path.join(SERVER_DIR, 'data', 'calendar-seed.json')
let seed
try {
  seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
} catch (err) {
  console.error(`✗ Could not read ${seedPath}: ${err?.message || err}`)
  process.exit(1)
}

const payload = {
  calendars: Array.isArray(seed.calendars) ? seed.calendars : [],
  events: Array.isArray(seed.events) ? seed.events : [],
  hidden: seed.hidden && typeof seed.hidden === 'object' ? seed.hidden : {},
}

if (!payload.calendars.length) {
  console.error('✗ Seed has no calendars — refusing to wipe the live calendar with an empty file.')
  process.exit(1)
}

console.log(`Seed: ${payload.calendars.length} calendars, ${payload.events.length} events`)

let current = null
try {
  current = await loadCalendar()
  console.log(`Live: ${(current?.calendars || []).length} calendars, ${(current?.events || []).length} events`)
} catch (err) {
  console.warn(`  ! could not read the current calendar: ${err?.message || err}`)
}

if (!process.argv.includes('--no-backup')) {
  try {
    await createCalendarBackup(`before reset ${new Date().toLocaleString()}`)
    console.log('  ✓ backed up the current calendar')
  } catch (err) {
    console.error(`✗ Backup failed (${err?.message || err}).`)
    console.error('  Re-run with --no-backup only if you are sure you want to discard the live data.')
    process.exit(1)
  }
}

await saveCalendar(payload)
console.log(`✓ Calendar reset — ${payload.calendars.length} calendars, ${payload.events.length} events.`)
payload.calendars.forEach(c => console.log(`    ${c.color}  ${c.name}`))
