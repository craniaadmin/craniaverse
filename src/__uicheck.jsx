/* THROWAWAY verification harness — deleted before the turn ends.
   Renders one real page against an in-memory API so the layout changes can
   be measured without signing in. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StoreProvider } from './data/store'

import CraniaCash from './pages/CraniaCash'
import Projects from './pages/Projects'
import ToDo from './pages/ToDo'
import Programs from './pages/Programs'
import Inventory from './pages/Inventory'

const PROG = {
  program: 'Flex Math', title: 'Flex Math', year: '26_27', schedule: 'Mon 4:30 pm',
  active: true, fee: 100, day: 'Mon', time: '4:30 pm', location: 'Boardwalk',
}

const db = {
  registrations: [
    {
      id: 'r1', displayName: 'Ada Lovelace', createdAt: '2026-01-05T10:00:00Z',
      student: { firstName: 'Ada', lastName: 'Lovelace', grade: '5', craniaCash: 12 },
      customer: { meta: { studentId: 'S0001', familyId: 'F0001' }, guardian1: {}, guardian2: {}, emergency: {}, address: {} },
      programs: [PROG],
      cashLog: [{ ts: '2026-01-06T10:00:00Z', delta: 10, reason: 'Present' }],
    },
    {
      id: 'r2', displayName: 'Alan Turing', createdAt: '2026-01-06T10:00:00Z',
      student: { firstName: 'Alan', lastName: 'Turing', grade: '6', craniaCash: -3 },
      customer: { meta: { studentId: 'S0002', familyId: 'F0002' }, guardian1: {}, guardian2: {}, emergency: {}, address: {} },
      programs: [PROG], cashLog: [],
    },
  ],
  rules: [
    { id: 'present', reason: 'Present', delta: 1, when: { field: 'attendance', value: 'P' } },
    { id: 'no-shirt', reason: 'No Shirt', delta: -5, when: null },
  ],
  projects: {
    cards: [], colOrder: null, updatedAt: '2026-08-06T10:00:00Z',
    resetTime: '08:00', clearGoalsTime: '00:00', clearGoals: true,
    lastResetAt: '2026-08-06T08:00:00Z',
  },
  todo: { lists: [], items: [], checklists: [] },
  stock: { items: [], log: [] },
  programsList: [],
}

const json = (v, status = 200) => new Response(JSON.stringify(v === undefined ? null : v),
  { status, headers: { 'Content-Type': 'application/json' } })

window.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' ? input : String(input?.url || input)
  const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  const method = (init.method || 'GET').toUpperCase()
  let body = null
  try { body = init.body ? JSON.parse(init.body) : null } catch { body = init.body }

  if (path.includes('/backups')) return json([{ id: 'b1', label: '2026-08-06, 11:45 a.m.', count: 2, created: '2026-08-06T11:45:00Z' }])
  if (path.includes('/backup') || path.includes('/restore')) return json({ ok: true })
  if (path === '/api/registrations') return json(db.registrations)
  if (path === '/api/rules') { if (method === 'PUT') db.rules = body; return json(db.rules) }
  if (path === '/api/projects') { if (method === 'PUT') db.projects = { ...db.projects, ...body }; return json(db.projects) }
  if (path === '/api/todo') return json(db.todo)
  if (path === '/api/checklist') return json(db.todo)
  if (path === '/api/stock') return json(db.stock)
  if (path === '/api/programs') return json(db.programsList)
  if (path === '/api/programs-state') return json({})
  if (path === '/api/comments') return json({})
  if (path === '/api/staff') return json([])
  if (path === '/api/calendar') return json({ calendars: [], events: [] })
  if (path === '/api/contacts') return json({ contacts: [] })
  if (path === '/api/finance') return json({ invoices: [], payments: [], meta: {} })
  return json({}, 404)
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      return <pre id="crash" style={{ color: '#c00', padding: 20 }}>
        CRASH: {String(this.state.err?.message || this.state.err)}
      </pre>
    }
    return this.props.children
  }
}

const PAGES = { CraniaCash, Projects, ToDo, Programs, Inventory }
const which = new URLSearchParams(location.search).get('page') || 'CraniaCash'
const Page = PAGES[which]

createRoot(document.getElementById('root')).render(
  <Boundary>
    <StoreProvider>
      <div className="app">
        <main className="app-main">
          {Page ? <Page onNavigate={() => {}} /> : <div>no such page: {which}</div>}
        </main>
      </div>
    </StoreProvider>
  </Boundary>,
)
