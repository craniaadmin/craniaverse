import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, RadialBarChart, RadialBar,
} from 'recharts'
import {
  CheckSquare, Square, Check, X, ChevronDown, Search,
  AlertTriangle, Calendar as CalendarIcon,
} from 'lucide-react'
import { useStore } from '../data/store'
import { useFinance, money, invoiceBalance, invoiceStatus, formatDate } from '../data/finance'

const API_BASE = import.meta.env?.VITE_API_URL || ''

const MONTHLY_TARGET = 20000 // Monthly-revenue gauge target ($). Adjust as needed.
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ---- helpers ------------------------------------------------

// Robustly parse a record's createdAt into a Date. Older seed records
// use free-text values like "Seed record (offline)" so we return null
// for anything that isn't clearly a date.
function parseRegDate(s) {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d
}

function StatusCard({ title, children, onOpen, badge }) {
  return (
    <div className="status-card">
      <div className="sc-head" onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
        <span>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {badge != null && <Badge n={badge} />}
          <ChevronDown size={16} />
        </span>
      </div>
      <div className="sc-body">{children}</div>
    </div>
  )
}

function Badge({ n }) {
  if (!n) return null
  return (
    <span style={{
      background: 'var(--logo-teal)', color: '#fff', borderRadius: 999,
      padding: '1px 8px', fontSize: 11, fontWeight: 700,
    }}>{n}</span>
  )
}

// ---- data hooks used only by the dashboard ------------------

function useTodo() {
  const [todo, setTodo] = useState({ items: [], lists: [] })
  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/todo`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive && j) setTodo({ items: j.items || [], lists: j.lists || [] }) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  return todo
}

function useInventory() {
  const [items, setItems] = useState([])
  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/inventory`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.json() : [])
      .then(j => { if (alive && Array.isArray(j)) setItems(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  return items
}

// Read the (browser-local) calendar the CalendarView page writes to.
// Only shows plain non-recurring events; recurring events would need
// the rrule expansion logic and aren't worth the bundle bloat here.
function useUpcomingCalendar(days = 7) {
  const [events, setEvents] = useState([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('crania_calendar_events')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + days)
      const upcoming = parsed
        .filter(e => e.startDate && !e.recurrence?.freq)
        .map(e => ({ ...e, _d: new Date(e.startDate + 'T00:00:00') }))
        .filter(e => e._d >= today && e._d <= cutoff)
        .sort((a, b) => a._d - b._d)
        .slice(0, 5)
      setEvents(upcoming)
    } catch { /* ignore */ }
  }, [days])
  return events
}

// ---- Dashboard ----------------------------------------------

export default function Dashboard({ onNavigate }) {
  const { records, staff, programs, status: recStatus } = useStore()
  const { invoices, payments } = useFinance()
  const todo = useTodo()
  const inventory = useInventory()
  const upcoming = useUpcomingCalendar()

  // Registrations exclude the local seed placeholder record.
  const realRecords = useMemo(() => records.filter(r => r.id !== 'seed'), [records])
  const activePrograms = useMemo(() => programs.filter(p => p.active !== false), [programs])
  const activeStaff = useMemo(() => staff.filter(s => s.active !== false), [staff])

  // Family count: dedupe records by guardian1 email → each family = 1 customer.
  const customerCount = useMemo(() => {
    const seen = new Set()
    for (const r of realRecords) {
      const g = r.customer?.guardian1
      const key = (g?.Email || g?.email || `${g?.['First Name'] || ''} ${g?.['Last Name'] || ''}`).trim().toLowerCase()
      if (key) seen.add(key)
    }
    return seen.size
  }, [realRecords])

  // Monthly revenue this month = payments dated in the current month.
  const now = new Date()
  const monthRevenue = useMemo(() => {
    let s = 0
    for (const p of payments) {
      const d = new Date((p.date || '') + 'T00:00:00')
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        s += Number(p.amount || 0)
      }
    }
    return s
  }, [payments])
  const monthPct = Math.min(100, Math.round((monthRevenue / MONTHLY_TARGET) * 100))
  const gaugeData = [{ name: 'rev', value: monthPct, fill: '#5FA09E' }]

  // Revenue by program (target = sum of invoice.total, actual = amount collected).
  const revenueByProgram = useMemo(() => {
    const map = {}
    for (const inv of invoices) {
      if (inv.status === 'void') continue
      const key = inv.program?.trim() || 'Unassigned'
      if (!map[key]) map[key] = { name: key, target: 0, actual: 0 }
      const { total, applied } = invoiceBalance(inv, payments)
      map[key].target += total
      map[key].actual += applied
    }
    return Object.values(map).sort((a, b) => b.target - a.target).slice(0, 5)
  }, [invoices, payments])

  // Registrations per month, last 12 months.
  const regTrend = useMemo(() => {
    const buckets = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, Registrations: 0 })
    }
    const map = Object.fromEntries(buckets.map(b => [b.key, b]))
    for (const r of realRecords) {
      const d = parseRegDate(r.createdAt)
      if (!d) continue
      const k = `${d.getFullYear()}-${d.getMonth()}`
      if (map[k]) map[k].Registrations += 1
    }
    return buckets
  }, [realRecords])

  // Right-column: open todo items (top 5 by due date)
  const openTasks = useMemo(() => {
    return [...(todo.items || [])]
      .filter(i => !i.done)
      .sort((a, b) => {
        if (!a.due && !b.due) return 0
        if (!a.due) return 1
        if (!b.due) return -1
        return a.due.localeCompare(b.due)
      })
      .slice(0, 4)
  }, [todo])

  // Payment-pending = invoices with a balance, sorted by most-overdue first.
  const pendingPayments = useMemo(() => {
    return invoices
      .filter(inv => inv.status !== 'void' && inv.status !== 'draft')
      .map(inv => ({ inv, _b: invoiceBalance(inv, payments), _s: invoiceStatus(inv, payments) }))
      .filter(x => x._b.balance > 0)
      .sort((a, b) => (a.inv.dueDate || '').localeCompare(b.inv.dueDate || ''))
      .slice(0, 4)
  }, [invoices, payments])

  // Recent registrations for STUDENTS + CUSTOMERS cards.
  const recentRecords = useMemo(() => {
    return [...realRecords]
      .sort((a, b) => (parseRegDate(b.createdAt)?.getTime() || 0) - (parseRegDate(a.createdAt)?.getTime() || 0))
      .slice(0, 4)
  }, [realRecords])

  // Low-stock inventory items.
  const lowStock = useMemo(() => {
    return inventory.filter(i => (i.qty || 0) <= 5).sort((a, b) => (a.qty || 0) - (b.qty || 0)).slice(0, 4)
  }, [inventory])

  return (
    <div className="page">
      <h2 className="page-title">Dashboard</h2>

      {recStatus === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00', padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          Working offline — showing cached data.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20 }}>
        {/* ---------- Left: charts ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="small muted" style={{ fontWeight: 700 }}>MONTHLY REVENUE</div>
              <div style={{ position: 'relative', height: 132 }}>
                <ResponsiveContainer>
                  <RadialBarChart innerRadius="74%" outerRadius="100%" data={gaugeData} startAngle={180} endAngle={0}>
                    <RadialBar background dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, textAlign: 'center', fontSize: 26, fontWeight: 800, color: '#2E2516' }}>
                  {money(monthRevenue)}
                </div>
              </div>
              <div className="small muted" style={{ textAlign: 'center' }}>
                {monthPct}% of {money(MONTHLY_TARGET)} target
              </div>
            </div>
            <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
              <Stat n={realRecords.length} label="Registrations" />
              <Stat n={customerCount} label="Customers" />
              <Stat n={activePrograms.length} label="Programs running" />
              <Stat n={activeStaff.length} label="Active staff" />
            </div>
          </div>

          <div className="card" style={{ padding: '16px 14px 8px' }}>
            <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>REVENUE BY PROGRAM</div>
            <div style={{ height: 210 }}>
              {revenueByProgram.length === 0 ? (
                <EmptyChart label="No invoices yet — revenue will appear here once you start invoicing." />
              ) : (
                <ResponsiveContainer>
                  <BarChart data={revenueByProgram} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eef1f3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B6455' }} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: '#9A948A' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip formatter={v => money(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="target" name="Invoiced" fill="#2E2516" radius={[3, 3, 0, 0]} barSize={16} />
                    <Bar dataKey="actual" name="Collected" fill="#A6E2F9" radius={[3, 3, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: '16px 14px 8px' }}>
            <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>REGISTRATIONS — LAST 12 MONTHS</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={regTrend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef1f3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9A948A' }} interval={0} angle={-30} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11, fill: '#9A948A' }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Registrations" stroke="#5FA09E" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ---------- Right: status cards ---------- */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, alignContent: 'start' }}>
          <StatusCard title="TASKS" onOpen={() => onNavigate('To Do')} badge={openTasks.length}>
            {openTasks.length === 0 && <Empty label="No open tasks" />}
            {openTasks.map(t => (
              <div className="sc-row" key={t.id} title={t.text}>
                <Square size={15} color="#5b9494" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</span>
              </div>
            ))}
          </StatusCard>

          <StatusCard title="CALENDAR" onOpen={() => onNavigate('Calendar')} badge={upcoming.length}>
            {upcoming.length === 0 && <Empty label="Nothing in next 7 days" />}
            {upcoming.map(ev => (
              <div className="sc-row" key={ev.id} title={ev.title}>
                <CalendarIcon size={14} color="#5b9494" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong style={{ color: 'var(--ink-soft)' }}>{formatDate(ev.startDate).replace(', ' + now.getFullYear(), '')}</strong>
                  {' · '}{ev.title}
                </span>
              </div>
            ))}
          </StatusCard>

          <StatusCard title="INVENTORY" onOpen={() => onNavigate('Inventory')} badge={lowStock.length}>
            {lowStock.length === 0 && <Empty label="All items stocked" />}
            {lowStock.map(i => (
              <div className="sc-row" key={i.id}>
                {i.qty === 0
                  ? <X size={14} color="#fff" style={{ background: '#c62828', borderRadius: '50%', padding: 2 }} />
                  : <AlertTriangle size={14} color="#cc7800" />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i.name} — <span style={{ color: i.qty === 0 ? '#c62828' : '#cc7800', fontWeight: 700 }}>{i.qty}</span>
                </span>
              </div>
            ))}
          </StatusCard>

          <StatusCard title="PAYMENT PENDING" onOpen={() => onNavigate('Invoices')} badge={pendingPayments.length}>
            {pendingPayments.length === 0 && <Empty label="Nothing pending" />}
            {pendingPayments.map(({ inv, _b, _s }) => (
              <div className="sc-row" key={inv.id} title={`${inv.number} · ${inv.customerName}`}>
                {_s === 'overdue'
                  ? <X size={14} color="#fff" style={{ background: '#c62828', borderRadius: '50%', padding: 2 }} />
                  : <CheckSquare size={14} color="#cc7800" />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inv.customerName} — <strong>{money(_b.balance)}</strong>
                </span>
              </div>
            ))}
          </StatusCard>

          <StatusCard title="STUDENTS" onOpen={() => onNavigate('Students')} badge={realRecords.length}>
            {recentRecords.length === 0 && <Empty label="No registrations yet" />}
            {recentRecords.map(r => (
              <div className="sc-row" key={r.id}>
                <CheckSquare size={14} color="#5b9494" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.displayName || `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim() || '—'}
                </span>
              </div>
            ))}
          </StatusCard>

          <StatusCard title="CUSTOMERS" onOpen={() => onNavigate('Customers')} badge={customerCount}>
            {recentRecords.length === 0 && <Empty label="No customers yet" />}
            {recentRecords.map(r => {
              const g = r.customer?.guardian1 || {}
              const name = `${g['First Name'] || ''} ${g['Last Name'] || ''}`.trim() || '—'
              return (
                <div className="sc-row" key={r.id}>
                  <CheckSquare size={14} color="#5b9494" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
              )
            })}
          </StatusCard>

          <StatusCard title="STAFF" onOpen={() => onNavigate('Staff Information')} badge={activeStaff.length}>
            {activeStaff.length === 0 && <Empty label="No staff on file" />}
            {activeStaff.slice(0, 4).map(s => (
              <div className="sc-row" key={s.id}>
                <CheckSquare size={14} color="#5b9494" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {`${s.firstName || ''} ${s.lastName || ''}`.trim()}
                  {s.role && <span className="muted"> — {s.role}</span>}
                </span>
              </div>
            ))}
          </StatusCard>

          <StatusCard title="PROGRAMS" onOpen={() => onNavigate('Programs')} badge={activePrograms.length}>
            {activePrograms.length === 0 && <Empty label="No active programs" />}
            {activePrograms.slice(0, 4).map(p => (
              <div className="sc-row" key={p.number || p.code || p.title}>
                <CheckSquare size={14} color="#5b9494" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
              </div>
            ))}
          </StatusCard>

          <StatusCard title="SEARCH">
            <div className="sc-row">
              <Search size={16} color="#8b95a3" />
              <span className="muted small">Search records…</span>
            </div>
          </StatusCard>
        </div>
      </div>
    </div>
  )
}

function Stat({ n, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#2c7a7b', minWidth: 48 }}>{n}</div>
      <div className="muted small">{label}</div>
    </div>
  )
}

function Empty({ label = 'No items' }) {
  return <div className="sc-empty">{label}</div>
}

function EmptyChart({ label }) {
  return (
    <div style={{
      height: '100%', display: 'grid', placeItems: 'center',
      color: 'var(--muted)', fontSize: 12, padding: 20, textAlign: 'center',
    }}>
      {label}
    </div>
  )
}
