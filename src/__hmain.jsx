/* THROWAWAY verification harness — deleted before commit.
   Renders one page at a time against an in-memory API so the real
   StoreProvider, useCommentsRows, useFinance etc. all run exactly as they
   do in production, and hooks-order crashes actually fire. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StoreProvider } from './data/store'

import Attendance from './pages/Attendance'
import Comments from './pages/Comments'
import Invoices from './pages/Invoices'
import Logins from './pages/Logins'
import CraniaCash from './pages/CraniaCash'
import Registrations from './pages/Registrations'
import StaffInformation from './pages/StaffInformation'
import Contacts from './pages/Contacts'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TODAY = iso(new Date())
const YESTERDAY = iso(new Date(Date.now() - 86400000))

const blankRow = (n, date, day) => ({
  lessonNo: n, day, date, attendance: '', uniform: '',
  lessonPlan: '', homeworkCompleted: '', performance: '',
  behaviour: '', homeworkAssigned: '', parentComm: '', teacher: '',
})

const PROG = {
  program: 'Flex Math', title: 'Flex Math', year: '26_27', schedule: 'Mon 4:30 pm',
  active: true, fee: 100, day: 'Mon', time: '4:30 pm', location: 'Boardwalk',
}
const TAB = '26_27|Flex Math'

const db = {
  registrations: [
    {
      id: 'r1', displayName: 'Ada Lovelace', createdAt: '2026-01-05T10:00:00Z',
      student: { firstName: 'Ada', lastName: 'Lovelace', grade: '5', school: 'Elm', email: 'ada@x.com', dob: '2015-02-01', craniaCash: 10 },
      customer: {
        meta: { studentId: 'S0001', familyId: 'F0001', source: 'Web', notes: '' },
        guardian1: { 'First Name': 'Grace', 'Last Name': 'Lovelace', Relationship: 'Mother', Phone: '555-1000', Email: 'grace@x.com' },
        guardian2: {}, emergency: { 'First Name': 'Ed', Phone: '555-2000' }, address: {},
      },
      programs: [PROG],
      cashLog: [{ ts: '2026-01-06T10:00:00Z', delta: 10, reason: 'Present' }],
    },
    {
      id: 'r2', displayName: 'Alan Turing', createdAt: '2026-01-06T10:00:00Z',
      student: { firstName: 'Alan', lastName: 'Turing', grade: '6', school: 'Elm', email: 'alan@x.com', dob: '2014-06-23', craniaCash: 0 },
      customer: {
        meta: { studentId: 'S0002', familyId: 'F0002' },
        guardian1: { 'First Name': 'Sara', 'Last Name': 'Turing' }, guardian2: {}, emergency: {}, address: {},
      },
      programs: [PROG],
      cashLog: [],
    },
  ],
  comments: {
    r1: { [TAB]: [blankRow(1, TODAY, 'Mon'), blankRow(2, YESTERDAY, 'Sun')] },
    r2: { [TAB]: [blankRow(1, TODAY, 'Mon')] },
  },
  rules: [{ id: 'present', reason: 'Present', delta: 1, when: { field: 'attendance', value: 'P' } }],
  staff: [
    {
      id: 's1', staffId: 'E0001', firstName: 'Rob', lastName: 'Stone', role: 'Teacher',
      email: 'rob@x.com', phoneMobile: '555-3000', startDate: '2024-09-01', active: true,
      documents: {}, keys: [
        { description: 'Front door', dateOut: '2024-09-02', dateIn: '', formSigned: true },
        { description: 'Supply closet', dateOut: '2024-10-10', dateIn: '2025-01-05', formSigned: false },
      ],
    },
    {
      id: 's2', staffId: 'E0002', firstName: 'Tas', lastName: 'Kim', role: 'Assistant',
      email: 'tas@x.com', phoneMobile: '555-4000', startDate: '2025-01-15', active: true,
      documents: {}, keys: [{ description: 'Back door', dateOut: '2025-02-01', dateIn: '', formSigned: false }],
    },
    { id: 's3', staffId: 'E0003', firstName: 'No', lastName: 'Keys', role: 'Admin', active: true, documents: {}, keys: [] },
  ],
  programs: [],
  programsState: {},
  finance: {
    invoices: [
      { id: 'inv1', number: 'INV-1001', date: '2026-06-01', dueDate: '2026-07-01', customerName: 'Grace Lovelace', customerEmail: 'grace@x.com', studentName: 'Ada Lovelace', program: 'Flex Math', lineItems: [{ id: 'li1', desc: 'June tuition', qty: 1, unitPrice: 289 }], total: 289, notes: '', status: 'sent' },
      { id: 'inv2', number: 'INV-1002', date: '2026-06-02', dueDate: '', customerName: 'Sara Turing', customerEmail: '', studentName: 'Alan Turing', program: 'Flex Math', lineItems: [{ id: 'li2', desc: 'June tuition', qty: 1, unitPrice: 189 }], total: 189, notes: '', status: 'draft' },
    ],
    payments: [{ id: 'pay1', invoiceId: 'inv1', amount: 89, date: '2026-06-05', receiptNumber: 'R-1001' }],
    meta: { nextInvoiceNumber: 1003, nextReceiptNumber: 1002 },
  },
  calendar: { calendars: [{ id: 'cal1', name: 'Afterschool' }], events: [] },
  contacts: [{ id: 'c1', name: 'Vistaprint', category: 'Vendor/Supplier', phone: '555-9', email: 'v@x.com' }],
}

window.__db = db
window.__writes = []
window.__crash = null

const json = (v, status = 200) => new Response(JSON.stringify(v === undefined ? null : v),
  { status, headers: { 'Content-Type': 'application/json' } })

window.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' ? input : String(input?.url || input)
  const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  const method = (init.method || 'GET').toUpperCase()
  let body = null
  try { body = init.body ? JSON.parse(init.body) : null } catch { body = init.body }
  if (method !== 'GET') window.__writes.push({ method, path, body })
  const seg = path.split('/').filter(Boolean) // ['api', ...]
  const rec = (id) => db.registrations.find(r => r.id === id)

  if (path === '/api/registrations' && method === 'GET') return json(db.registrations)
  if (seg[1] === 'registrations' && seg[2] && seg[3] === 'student' && method === 'PUT') {
    const r = rec(seg[2]); if (r) r.student = { ...r.student, ...body }; return json({ ok: true })
  }
  if (seg[1] === 'registrations' && seg[2] && seg[3] === 'customer' && method === 'PUT') {
    const r = rec(seg[2]); if (r) r.customer = { ...r.customer, ...body }; return json({ ok: true })
  }
  if (seg[1] === 'registrations' && seg[2] && seg[3] === 'programs' && method === 'PUT') {
    const r = rec(seg[2]); if (r) r.programs = body; return json({ ok: true })
  }
  if (seg[1] === 'registrations' && seg[2] && seg[3] === 'cashEntry' && method === 'POST') {
    const r = rec(seg[2])
    if (r) {
      r.cashLog = [...(r.cashLog || []), { ts: new Date().toISOString(), delta: body.delta, reason: body.reason }]
      r.student = { ...r.student, craniaCash: (r.student.craniaCash || 0) + body.delta }
    }
    return json({ ok: true })
  }
  if (seg[1] === 'registrations' && seg[3] === 'autoCash') return json({ changed: false })

  if (path === '/api/comments' && method === 'GET') return json(db.comments)
  if (seg[1] === 'comments' && seg[2] && seg[3] && method === 'PUT') {
    const sid = seg[2]; const tab = decodeURIComponent(seg[3])
    db.comments[sid] = { ...(db.comments[sid] || {}), [tab]: body }
    return json({ ok: true })
  }

  if (path === '/api/rules') { if (method === 'PUT') db.rules = body; return json(db.rules) }
  if (path === '/api/staff' && method === 'GET') return json(db.staff)
  if (path === '/api/staff' && method === 'POST') {
    const r = { id: body.id || `staff-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ...body }
    db.staff = [...db.staff.filter(s => s.id !== r.id), r]
    return json(r)
  }
  if (seg[1] === 'staff' && seg[2] && method === 'PUT') {
    db.staff = db.staff.map(s => s.id === seg[2] ? { ...s, ...body } : s)
    return json({ ok: true })
  }
  if (seg[1] === 'staff' && seg[2] && method === 'DELETE') {
    db.staff = db.staff.filter(s => s.id !== seg[2]); return json({ ok: true })
  }
  if (path === '/api/programs') return json(db.programs)
  if (path === '/api/programs-state') return json(db.programsState)
  if (path === '/api/finance') { if (method === 'PUT') db.finance = body; return json(db.finance) }
  if (path === '/api/calendar') return json(db.calendar)
  if (path === '/api/contacts') { if (method === 'PUT') db.contacts = body.contacts; return json({ contacts: db.contacts }) }
  if (path.endsWith('/backups')) return json([])
  return json({}, 404)
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) {
    window.__crash = { message: String(err?.message || err), stack: String(info?.componentStack || '') }
  }
  render() {
    if (this.state.err) {
      return <pre id="crash" style={{ color: '#c00', padding: 20 }}>
        CRASH: {String(this.state.err?.message || this.state.err)}
      </pre>
    }
    return this.props.children
  }
}

const PAGES = {
  Attendance, Comments, Invoices, Logins, CraniaCash, Registrations,
  Staff: StaffInformation, Keys, Contacts,
}

const which = new URLSearchParams(location.search).get('page') || 'Attendance'
const Page = PAGES[which]
window.__page = which

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
