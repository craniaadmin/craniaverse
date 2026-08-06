import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useFinance, money, invoiceBalance, invoiceStatus, daysBetween, todayISO } from '../data/finance'
import { PageShell, Loading, OfflineBanner, SummaryStrip, Th, Td } from '../components/FinanceUI'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const PIE_COLORS = ['#5FA09E', '#00B0F0', '#FFD757', '#9966ff', '#92D050', '#FF9900', '#20bab5', '#FF0000']

export default function Accounting() {
  const { invoices, payments, loading, status } = useFinance()

  const summary = useMemo(() => {
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    let invoicedYTD = 0, collectedYTD = 0, outstanding = 0, overdue = 0
    for (const inv of invoices) {
      if (inv.status === 'void') continue
      const { total, applied, balance } = invoiceBalance(inv, payments)
      const invDate = new Date((inv.date || '') + 'T00:00:00')
      if (!Number.isNaN(invDate.getTime()) && invDate >= yearStart) invoicedYTD += total
      outstanding += balance
      if (invoiceStatus(inv, payments, now) === 'overdue') overdue += balance
    }
    for (const p of payments) {
      const d = new Date((p.date || '') + 'T00:00:00')
      if (!Number.isNaN(d.getTime()) && d >= yearStart) collectedYTD += Number(p.amount || 0)
    }
    return { invoicedYTD, collectedYTD, outstanding, overdue }
  }, [invoices, payments])

  // Revenue by month (last 12 months) — from payments received.
  const monthlyRevenue = useMemo(() => {
    const now = new Date()
    const buckets = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        received: 0, invoiced: 0,
      })
    }
    const map = Object.fromEntries(buckets.map(b => [b.key, b]))
    for (const p of payments) {
      const d = new Date((p.date || '') + 'T00:00:00')
      if (Number.isNaN(d.getTime())) continue
      const k = `${d.getFullYear()}-${d.getMonth()}`
      if (map[k]) map[k].received += Number(p.amount || 0)
    }
    for (const inv of invoices) {
      if (inv.status === 'void') continue
      const d = new Date((inv.date || '') + 'T00:00:00')
      if (Number.isNaN(d.getTime())) continue
      const k = `${d.getFullYear()}-${d.getMonth()}`
      if (map[k]) map[k].invoiced += Number(inv.total || 0)
    }
    return buckets
  }, [invoices, payments])

  // Revenue by program (all-time, from paid amount attributed to invoices).
  const byProgram = useMemo(() => {
    const totals = {}
    for (const inv of invoices) {
      if (inv.status === 'void') continue
      const key = inv.program?.trim() || 'Unassigned'
      const { applied } = invoiceBalance(inv, payments)
      totals[key] = (totals[key] || 0) + applied
    }
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [invoices, payments])

  // Aging buckets on outstanding balances.
  const aging = useMemo(() => {
    const today = todayISO()
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90Plus: 0 }
    const rows = []
    for (const inv of invoices) {
      if (inv.status === 'void') continue
      const { balance } = invoiceBalance(inv, payments)
      if (balance <= 0) continue
      const overdueDays = inv.dueDate ? daysBetween(inv.dueDate, today) : 0
      let bucket = 'current'
      if (overdueDays > 90)      { buckets.d90Plus += balance; bucket = '90+' }
      else if (overdueDays > 60) { buckets.d90    += balance; bucket = '61–90' }
      else if (overdueDays > 30) { buckets.d60    += balance; bucket = '31–60' }
      else if (overdueDays > 0)  { buckets.d30    += balance; bucket = '1–30' }
      else                       { buckets.current += balance }
      rows.push({ inv, balance, overdueDays, bucket })
    }
    rows.sort((a, b) => b.overdueDays - a.overdueDays)
    return { buckets, rows }
  }, [invoices, payments])

  if (loading) return <PageShell><Loading /></PageShell>

  return (
    <PageShell>
      <div className="page-head">
      </div>

      {status === 'offline' && <OfflineBanner />}

      <SummaryStrip
        cells={[
          { label: 'Invoiced YTD',   value: money(summary.invoicedYTD) },
          { label: 'Collected YTD',  value: money(summary.collectedYTD), color: '#2b7a2e' },
          { label: 'Outstanding',    value: money(summary.outstanding),  color: summary.outstanding > 0 ? '#8a6a00' : 'var(--ink)' },
          { label: 'Overdue',        value: money(summary.overdue),      color: summary.overdue > 0 ? '#a12626' : 'var(--ink)' },
        ]}
      />

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 14px 8px' }}>
          <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>REVENUE — LAST 12 MONTHS</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyRevenue} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef1f3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B6455' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#9A948A' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip formatter={v => money(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="invoiced" name="Invoiced" fill="#A6E2F9" radius={[3, 3, 0, 0]} barSize={14} />
                <Bar dataKey="received" name="Received" fill="#5FA09E" radius={[3, 3, 0, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 14px 8px' }}>
          <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>COLLECTED BY PROGRAM</div>
          <div style={{ height: 260 }}>
            {byProgram.length === 0 ? (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No payments recorded yet.
              </div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byProgram} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                    {byProgram.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Aging */}
      <div className="card" style={{ padding: '16px 18px', marginBottom: 20 }}>
        <div className="small muted" style={{ fontWeight: 700, marginBottom: 10 }}>OUTSTANDING BY AGE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          <AgingCell label="Current"   value={aging.buckets.current} tone="calm" />
          <AgingCell label="1–30 days"  value={aging.buckets.d30}     tone="calm" />
          <AgingCell label="31–60 days" value={aging.buckets.d60}     tone="warn" />
          <AgingCell label="61–90 days" value={aging.buckets.d90}     tone="warn" />
          <AgingCell label="90+ days"   value={aging.buckets.d90Plus} tone="danger" />
        </div>
      </div>

      {/* Outstanding invoices detail */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(20,30,45,.07)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', background: '#fafbfc' }}>
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--logo-teal)' }}>
            Open Invoices
          </span>
          <span style={{ marginLeft: 10, color: 'var(--muted)', fontSize: 12 }}>
            {aging.rows.length} with a balance
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: '#f5f7f8', borderBottom: '1px solid var(--line)' }}>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th>Due</Th>
              <Th>Age</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {aging.rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                Nothing outstanding.
              </td></tr>
            )}
            {aging.rows.map((r, idx) => (
              <tr key={r.inv.id} style={{ borderBottom: idx < aging.rows.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <Td style={{ fontWeight: 700, color: 'var(--logo-teal)' }}>{r.inv.number}</Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>{r.inv.customerName}</div>
                  {r.inv.studentName && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.inv.studentName}</div>}
                </Td>
                <Td style={{ color: 'var(--ink-soft)' }}>{r.inv.dueDate || '—'}</Td>
                <Td>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                    background: r.overdueDays > 60 ? '#fde0e0' : r.overdueDays > 30 ? '#fff4d6' : r.overdueDays > 0 ? '#fff8db' : '#e6f5e6',
                    color:      r.overdueDays > 60 ? '#a12626' : r.overdueDays > 30 ? '#8a6a00' : r.overdueDays > 0 ? '#8a6a00' : '#2b7a2e',
                  }}>
                    {r.overdueDays > 0 ? `${r.overdueDays}d overdue` : 'Current'}
                  </span>
                </Td>
                <Td align="right" style={{ fontWeight: 700 }}>{money(r.balance)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}

function AgingCell({ label, value, tone }) {
  const toneColors = {
    calm:   { bg: '#fafbfc', fg: 'var(--ink)' },
    warn:   { bg: '#fff8db', fg: '#8a6a00' },
    danger: { bg: '#fde0e0', fg: '#a12626' },
  }
  const c = toneColors[tone] || toneColors.calm
  return (
    <div style={{
      background: c.bg, border: '1px solid var(--line)', borderRadius: 8,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c.fg, marginTop: 4 }}>{money(value)}</div>
    </div>
  )
}
