/* THROWAWAY verification harness — deleted before the turn ends. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StoreProvider } from './data/store'

import Projects from './pages/Projects'
import Programs from './pages/Programs'
import ClassLists from './pages/ClassLists'
import CraniaStore from './pages/CraniaStore'
import Contests from './pages/Contests'
import Keys from './pages/Keys'
import Inventory from './pages/Inventory'

const SESS = { day: 1, start: '16:30', end: '17:30', locationId: 'loc_boardwalk', instructor: 'Rob' }
const PROGRAMS = [
  { id: 'p1', name: 'FLEX MATH', category: 'FLEX', number: '1',
    offerings: [{ id: 'o1', ...SESS }], sessions: [SESS] },
]
const REGS = [
  { id: 'r1', displayName: 'Ada Lovelace',
    student: { firstName: 'Ada', lastName: 'Lovelace', grade: '5', school: 'Elm', craniaCash: 12 },
    customer: { meta: {}, guardian1: { 'First Name': 'Grace', 'Last Name': 'Lovelace', 'Phone (Mobile)': '555-1000', Email: 'g@x.com' }, guardian2: {}, emergency: {}, address: {} },
    programs: [{ program: 'FLEX MATH', title: 'FLEX MATH', year: '26_27', schedule: 'Mon 4:30 pm', status: 'Active', active: true }],
    cashLog: [] },
]
const STORE_ITEMS = [
  { id: 'i1', num: '001', name: 'Pencil', category: 'Supplies', sub: 'Writing', sku: 'PN1',
    qty: 5, reorder: 2, cost: 1, tax: 13, price: 2, location: 'Shelf A', notes: '' },
]

const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' ? input : String(input?.url || input)
  const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  if (path.includes('/backups')) return json([])
  if (path.includes('/backup') || path.includes('/restore')) return json({ ok: true })
  if (path === '/api/registrations') return json(REGS)
  if (path === '/api/programs') return json(PROGRAMS)
  if (path === '/api/programs-state') return json({ locations: [{ id: 'loc_boardwalk', name: 'Boardwalk' }] })
  if (path === '/api/projects') return json({ cards: [], colOrder: null, resetTime: '08:00', clearGoalsTime: '00:00', lastResetAt: '2026-08-06T08:00:00Z' })
  if (path === '/api/craniaStore' || path === '/api/crania-store' || path === '/api/store') return json({ items: STORE_ITEMS, log: [], categoryColors: {}, subColors: {}, extraSubs: [], subOrder: {} })
  if (path === '/api/contests') return json({ extras: {}, manual: [], hidden: [], hiddenCols: {}, colOrder: [] })
  if (path === '/api/stock') return json({ items: [], log: [] })
  if (path === '/api/staff') return json([{ id: 's1', staffId: 'E1', firstName: 'Rob', lastName: 'Stone', active: true, documents: {}, keys: [{ description: 'Front door', dateOut: '2024-09-02', dateIn: '', formSigned: true }] }])
  if (path === '/api/rules') return json([])
  if (path === '/api/comments') return json({})
  if (path === '/api/calendar') return json({ calendars: [], events: [] })
  if (path === '/api/contacts') return json({ contacts: [] })
  if (path === '/api/finance') return json({ invoices: [], payments: [], meta: {} })
  return json({}, 404)
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) return <pre id="crash" style={{ color: '#c00', padding: 20 }}>CRASH: {String(this.state.err?.message || this.state.err)}</pre>
    return this.props.children
  }
}

const PAGES = { Projects, Programs, ClassLists, CraniaStore, Contests, Keys, Inventory }
const which = new URLSearchParams(location.search).get('page') || 'Projects'
const Page = PAGES[which]

createRoot(document.getElementById('root')).render(
  <Boundary>
    <StoreProvider>
      <div className="app"><main className="app-main">
        {Page ? <Page onNavigate={() => {}} /> : <div>no such page: {which}</div>}
      </main></div>
    </StoreProvider>
  </Boundary>,
)
