/* THROWAWAY verification harness — deleted before the turn ends. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StoreProvider } from './data/store'
import Customers from './pages/Customers'
import Students from './pages/Students'

const PROG = { program: 'FLEX MATH', title: 'FLEX MATH', year: '26_27', schedule: 'Mon 4:30 pm', active: true, status: 'Active' }
const REGS = [{
  id: 'r1', displayName: 'Ada Lovelace',
  student: { firstName: 'Ada', lastName: 'Lovelace', grade: '5', school: 'Elm', craniaCash: 0 },
  customer: { meta: { studentId: 'S1', familyId: 'F1' }, guardian1: { 'First Name': 'Grace', 'Last Name': 'Lovelace' }, guardian2: {}, emergency: {}, address: {} },
  programs: [PROG], cashLog: [],
}]
const PROGRAMS = [{ id: 'p1', name: 'FLEX MATH', category: 'FLEX', offerings: [], sessions: [] }]

const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input) => {
  const raw = typeof input === 'string' ? input : String(input?.url || input)
  const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  if (path.includes('/backups')) return json([])
  if (path === '/api/registrations') return json(REGS)
  if (path === '/api/programs') return json(PROGRAMS)
  if (path === '/api/programs-state') return json({ catColors: { FLEX: '#A6E2F9' } })
  if (path === '/api/comments') return json({})
  if (path === '/api/rules') return json([])
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
    if (this.state.err) return <pre id="crash" style={{ color: '#c00', padding: 20 }}>CRASH: {String(this.state.err?.message || this.state.err)}</pre>
    return this.props.children
  }
}

const PAGES = { Customers, Students }
const which = new URLSearchParams(location.search).get('page') || 'Customers'
const Page = PAGES[which]
createRoot(document.getElementById('root')).render(
  <Boundary>
    <StoreProvider>
      <div className="app"><main className="app-main">
        <Page onNavigate={() => {}} />
      </main></div>
    </StoreProvider>
  </Boundary>,
)
