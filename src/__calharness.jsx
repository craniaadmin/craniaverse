// TEMPORARY harness: stubs /api/calendar and /api/todo so the page runs without the API.
import { createRoot } from 'react-dom/client'
import CalendarView from './pages/CalendarView.jsx'
import './index.css'
import SEED from '../server/data/calendar-seed.json'

let cal = JSON.parse(JSON.stringify(SEED))
let todo = {
  lists: [{ id: 'l1', name: 'Work' }, { id: 'l2', name: 'Personal' }],
  items: [
    { id: 't1', text: 'Overdue task', priority: 'high', done: false, due: '2020-01-01', listId: 'l1', notes: '' },
    { id: 't2', text: 'Due later', priority: 'high', done: false, due: '2099-01-01', listId: 'l1', notes: '' },
    { id: 't3', text: 'No due date', priority: 'high', done: false, due: '', listId: 'l2', notes: '' },
    { id: 't4', text: 'Low priority (hidden)', priority: 'low', done: false, due: '', listId: 'l2', notes: '' },
  ],
  checklists: [],
}
const real = window.fetch.bind(window)
const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (url, opts) => {
  const u = String(url)
  if (u.includes('/api/calendar/backups')) return json([])
  if (u.includes('/api/calendar')) {
    if (opts?.method === 'PUT') { cal = JSON.parse(opts.body); return json({ ok: true }) }
    return json(cal)
  }
  if (u.includes('/api/todo')) {
    if (opts?.method === 'PUT') { todo = JSON.parse(opts.body); return json({ ok: true }) }
    return json(todo)
  }
  return real(url, opts)
}
window.__peek = () => ({ cal, todo })
createRoot(document.getElementById('root')).render(<CalendarView />)
