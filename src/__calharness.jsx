// TEMPORARY harness: stubs /api/calendar and /api/todo. Delete with the harness.
import { createRoot } from 'react-dom/client'
import CalendarView from './pages/CalendarView.jsx'
import './index.css'
import SEED from '../server/data/calendar-seed.json'
let cal = JSON.parse(JSON.stringify(SEED))
let todo = { lists: [{ id: 'l1', name: 'Work' }], items: [], checklists: [] }
const real = window.fetch.bind(window)
const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (url, opts) => {
  const u = String(url)
  if (u.includes('/api/calendar/backups')) return json([])
  if (u.includes('/api/calendar')) { if (opts?.method === 'PUT') { cal = JSON.parse(opts.body); return json({ ok: true }) } return json(cal) }
  if (u.includes('/api/todo')) { if (opts?.method === 'PUT') { todo = JSON.parse(opts.body); return json({ ok: true }) } return json(todo) }
  return real(url, opts)
}
window.__peek = () => cal
createRoot(document.getElementById('root')).render(<CalendarView />)
