/* THROWAWAY verification harness — deleted before the turn ends.
   Renders one real page against an in-memory API so the count line and the
   undo/redo buttons can be exercised without signing in. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StoreProvider } from './data/store'

import Contacts from './pages/Contacts'
import Leads from './pages/Leads'
import Marketing from './pages/Marketing'
import Invoices from './pages/Invoices'
import Payments from './pages/Payments'
import Inventory from './pages/Inventory'
import ITAccounts from './pages/ITAccounts'
import CraniaStore from './pages/CraniaStore'
import Contests from './pages/Contests'
import Keys from './pages/Keys'
import ToDo from './pages/ToDo'
import Customers from './pages/Customers'
import Logins from './pages/Logins'
import StaffInformation from './pages/StaffInformation'

const mkContacts = n => Array.from({ length: n }, (_, i) => ({
  id: 'c' + i, name: 'Contact ' + i, category: i % 2 ? 'Vendor/Supplier' : 'Partner',
  phone: '555-' + i, email: `c${i}@x.com`,
}))
const mkLeads = n => Array.from({ length: n }, (_, i) => ({
  id: 'l' + i, firstName: 'Lead', lastName: 'No' + i, status: i % 2 ? 'New' : 'Won', email: `l${i}@x.com`,
}))
const mkCampaigns = n => Array.from({ length: n }, (_, i) => ({
  id: 'm' + i, name: 'Campaign ' + i, status: i % 2 ? 'Planned' : 'Live', channel: 'Email',
}))
const STAFF = [
  { id: 's1', staffId: 'E1', firstName: 'Rob', lastName: 'Stone', role: 'Teacher', active: true, documents: {},
    keys: [{ description: 'Front door', dateOut: '2024-09-02', dateIn: '', formSigned: true }] },
  { id: 's2', staffId: 'E2', firstName: 'Tas', lastName: 'Kim', role: 'Assistant', active: true, documents: {}, keys: [] },
]
const REGS = Array.from({ length: 4 }, (_, i) => ({
  id: 'r' + i, displayName: 'Kid ' + i,
  student: { firstName: 'Kid', lastName: String(i), grade: '5', school: 'Elm', craniaCash: 0 },
  customer: { meta: { studentId: 'S' + i, familyId: 'F' + i }, guardian1: { 'First Name': 'G', 'Last Name': String(i) }, guardian2: {}, emergency: {}, address: {} },
  programs: [{ program: 'FLEX MATH', title: 'FLEX MATH', year: '26_27', schedule: 'Mon 4:30 pm', active: true, status: 'Active' }],
  cashLog: [],
}))
const INVOICES = Array.from({ length: 5 }, (_, i) => ({
  id: 'inv' + i, number: 'INV-' + i, date: '2026-06-0' + (i + 1), customerName: 'Fam ' + i,
  lineItems: [{ id: 'li', desc: 'x', qty: 1, unitPrice: 100 }], total: 100, status: 'sent',
}))
const PAYMENTS = Array.from({ length: 3 }, (_, i) => ({
  id: 'pay' + i, invoiceId: 'inv' + i, amount: 50, date: '2026-06-05', method: 'Card', receiptNumber: 'R' + i, customerName: 'Fam ' + i,
}))
const STOCK = Array.from({ length: 6 }, (_, i) => ({
  id: 'i' + i, num: '00' + i, name: 'Item ' + i, category: 'Supplies', sub: 'Sub', qty: 5, reorder: 2, cost: 1, tax: 13, price: 2, location: 'A',
}))

const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } })
window.__writes = []
window.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' ? input : String(input?.url || input)
  const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  const method = (init.method || 'GET').toUpperCase()
  if (method !== 'GET') window.__writes.push({ method, path })
  if (path.includes('/backups')) return json([])
  if (path.includes('/backup') || path.includes('/restore')) return json({ ok: true })
  if (path === '/api/contacts') return json({ contacts: mkContacts(7) })
  if (path === '/api/leads') return json({ leads: mkLeads(5) })
  if (path === '/api/marketing' || path === '/api/campaigns') return json({ campaigns: mkCampaigns(4) })
  if (path === '/api/finance') return json({ invoices: INVOICES, payments: PAYMENTS, meta: {} })
  if (path === '/api/stock') return json({ items: STOCK, log: [{ ts: '2026-08-01T10:00:00Z', itemName: 'Item 1', delta: 1, after: 6, user: 'x', note: '' }] })
  if (path === '/api/crania-store') return json({ items: STOCK, log: [], categoryOrder: [], categoryColors: {}, extraSubs: [], subOrder: {}, subColors: {} })
  if (path === '/api/it-accounts' || path === '/api/itaccounts') return json({ categories: [{ id: 'k1', name: 'School', color: '#A6E2F9' }], accounts: [{ id: 'a1', categoryId: 'k1', name: 'Gmail', username: 'u', password: 'p', active: true }] })
  if (path === '/api/contests') return json({ extras: {}, manual: [{ id: 'm1', org: 'CEMC', contest: 'GAUSS', status: 'Waiting' }], hidden: [], hiddenCols: {}, colOrder: [] })
  if (path === '/api/todo') return json({ lists: [{ id: 'L1', name: 'Today' }], items: [{ id: 't1', listId: 'L1', text: 'A', done: false, priority: 'high' }, { id: 't2', listId: 'L1', text: 'B', done: false, priority: 'low' }], checklists: [] })
  if (path === '/api/registrations') return json(REGS)
  if (path === '/api/programs') return json([{ id: 'p1', name: 'FLEX MATH', category: 'FLEX', offerings: [], sessions: [] }])
  if (path === '/api/programs-state') return json({ catColors: { FLEX: '#A6E2F9' } })
  if (path === '/api/staff') return json(STAFF)
  if (path === '/api/rules') return json([])
  if (path === '/api/comments') return json({})
  if (path === '/api/calendar') return json({ calendars: [], events: [] })
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

const PAGES = { Contacts, Leads, Marketing, Invoices, Payments, Inventory, ITAccounts, CraniaStore, Contests, Keys, ToDo, Customers, Logins, StaffInformation }
const which = new URLSearchParams(location.search).get('page') || 'Contacts'
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
