// Crania Cash — restyled to match the rest of the app family (Calendar,
// Contests, Inventory, Emergency Contacts): page-head + action toggle,
// metric tiles, brand-palette toolbar, dark-blue table header with
// striped rows, and pill-style quick-apply buttons. Data flow is
// unchanged — still backed by useStore() (registrations + rules).

import { useMemo, useState, useEffect } from 'react'
import { ChevronLeft, Search, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../data/store'

function fmtTs(ts) {
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '—' }
}

// ─── Shared bits (match Contests / Emergency Contacts styling) ────────────
function Th({ children, align = 'left' }) {
  return <th style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
    padding: '10px 12px', textAlign: align, whiteSpace: 'nowrap',
  }}>{children}</th>
}

function MetricTile({ label, value, hint, color, onClick, active }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? '#eefaff' : '#fff',
        border: '1px solid ' + (active ? 'var(--brand-dark-blue)' : 'var(--line)'),
        borderRadius: 10, padding: '12px 16px',
        boxShadow: '0 1px 3px rgba(20,30,45,.06)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background .12s, border-color .12s',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

// ─── Student detail (log + actions) ────────────────────────────────────────
function StudentCashDetail({ record, onBack }) {
  const { rules, addCashEntry } = useStore()
  const [customDelta, setCustomDelta] = useState('')
  const [customReason, setCustomReason] = useState('')

  const balance = record.student.craniaCash || 0
  const log = [...(record.cashLog || [])].reverse() // newest first

  const apply = (delta, reason) => {
    if (!Number.isFinite(delta)) return
    addCashEntry(record.id, { delta, reason })
  }

  const submitCustom = () => {
    const d = Number(customDelta)
    if (!Number.isFinite(d) || d === 0) return
    apply(d, customReason || (d > 0 ? 'Added' : 'Removed'))
    setCustomDelta('')
    setCustomReason('')
  }

  return (
    <div>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--brand-dark-blue)', fontWeight: 700, fontSize: 13,
        marginBottom: 14, padding: 0,
      }}>
        <ChevronLeft size={16} /> All Students
      </button>

      {/* Balance card */}
      <div style={{
        background: '#fff', borderRadius: 10, boxShadow: 'var(--brand-shadow)',
        borderTop: `3px solid ${balance < 0 ? '#a12626' : 'var(--brand-dark-blue)'}`,
        padding: '18px 20px', marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{record.student.firstName} {record.student.lastName}</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: balance < 0 ? '#a12626' : 'var(--brand-dark-blue)', lineHeight: 1 }}>
            {balance}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 2 }}>
            Crania Cash
          </div>
        </div>
      </div>

      {/* Quick rule buttons */}
      <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--brand-shadow)', padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Quick Apply</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {rules.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No rules defined yet — add some in the Rules tab.</div>
          ) : rules.map(rule => {
            const positive = rule.delta >= 0
            return (
              <button key={rule.id} onClick={() => apply(rule.delta, rule.reason)} style={{
                background: positive ? '#dff5e0' : '#fde0e0',
                color: positive ? '#2b7a2e' : '#a12626',
                border: 'none', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {rule.reason} <span style={{ fontWeight: 800 }}>({positive ? '+' : ''}{rule.delta})</span>
              </button>
            )
          })}
        </div>

        {/* Custom entry */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', borderTop: '1px solid #f0ede3', paddingTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Custom</span>
          <input
            type="number"
            value={customDelta}
            onChange={e => setCustomDelta(e.target.value)}
            placeholder="±amount"
            style={{ width: 100, padding: '7px 10px', border: '1px solid #d5d0c4', borderRadius: 8, fontSize: 13 }}
          />
          <input
            value={customReason}
            onChange={e => setCustomReason(e.target.value)}
            placeholder="Reason"
            style={{ flex: 1, minWidth: 140, padding: '7px 10px', border: '1px solid #d5d0c4', borderRadius: 8, fontSize: 13 }}
          />
          <button onClick={submitCustom} style={{
            background: 'var(--brand-light-blue)', color: 'var(--brand-dark-brown)', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            Add Entry
          </button>
        </div>
      </div>

      {/* Log */}
      <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--brand-shadow)' }}>
        {log.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No activity yet — apply a rule or a custom entry above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
                <Th>When</Th>
                <Th>Reason</Th>
                <Th align="right">Change</Th>
              </tr>
            </thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{fmtTs(e.ts)}</td>
                  <td style={{ padding: '8px 12px' }}>{e.reason}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: e.delta >= 0 ? '#2b7a2e' : '#a12626' }}>
                    {e.delta >= 0 ? '+' : ''}{e.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Rules editor ──────────────────────────────────────────────────────────
function RulesEditor() {
  const { rules, updateRules } = useStore()
  const [draft, setDraft] = useState(rules)
  const [dirty, setDirty] = useState(false)

  // sync if upstream rules change and we haven't edited
  useEffect(() => { if (!dirty) setDraft(rules) }, [rules, dirty])

  const setRow = (i, patch) => {
    setDirty(true)
    setDraft(d => d.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  const remove = (i) => {
    setDirty(true)
    setDraft(d => d.filter((_, idx) => idx !== i))
  }
  const add = () => {
    setDirty(true)
    setDraft(d => [...d, { id: 'r' + Date.now(), reason: '', delta: 0 }])
  }
  const save = () => {
    updateRules(draft.filter(r => r.reason.trim()))
    setDirty(false)
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--brand-shadow)', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '14px 16px', borderBottom: '1px solid #f0ede3', background: '#fafaf7',
      }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          Define quick-apply rules — each one becomes a button on a student's page.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={add} style={{
            background: 'var(--brand-light-blue)', color: 'var(--brand-dark-brown)', border: 'none', borderRadius: 8,
            padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}><Plus size={14} /> Add Rule</button>
          <button onClick={save} disabled={!dirty} style={{
            background: dirty ? 'var(--brand-dark-blue)' : '#cbd1d6', color: '#fff', border: 'none', borderRadius: 8,
            padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
          }}>Save Changes</button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
            <Th>Reason</Th>
            <Th align="right">Crania Cash</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {draft.length === 0 ? (
            <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              No rules yet — click "+ Add Rule" to create one.
            </td></tr>
          ) : draft.map((r, i) => (
            <tr key={r.id || i} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
              <td style={{ padding: '6px 12px' }}>
                <input
                  value={r.reason}
                  onChange={e => setRow(i, { reason: e.target.value })}
                  placeholder="e.g., Brought completed homework"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d5d0c4', borderRadius: 8, fontSize: 13 }}
                />
              </td>
              <td style={{ padding: '6px 12px', width: 140 }}>
                <input
                  type="number"
                  value={r.delta}
                  onChange={e => setRow(i, { delta: Number(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d5d0c4', borderRadius: 8, fontSize: 13, textAlign: 'right' }}
                />
              </td>
              <td style={{ padding: '6px 12px', width: 40, textAlign: 'center' }}>
                <button onClick={() => remove(i)} title="Remove rule" style={{
                  background: 'transparent', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', padding: 4,
                }}><Trash2 size={13} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Student list with search ──────────────────────────────────────────────
function StudentList({ onSelect }) {
  const { records } = useStore()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => records
    .filter(r => {
      if (!search) return true
      const name = `${r.student.firstName} ${r.student.lastName}`.toLowerCase()
      return name.includes(search.toLowerCase())
    })
    .sort((a, b) => (a.student.firstName || '').localeCompare(b.student.firstName || '', undefined, { sensitivity: 'base' })),
  [records, search])

  return (
    <div>
      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            style={{
              width: '100%', padding: '7px 8px 7px 30px', fontSize: 13,
              border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff',
            }}
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ background: 'transparent', border: 'none', color: 'var(--brand-dark-blue)',
                     textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
          >Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, overflow: 'auto', boxShadow: 'var(--brand-shadow)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
              <Th>Name</Th>
              <Th align="right">Crania Cash</Th>
              <Th align="right">Entries</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                {records.length === 0 ? 'No students yet.' : 'No students match your search.'}
              </td></tr>
            )}
            {filtered.map((r, i) => {
              const cash = r.student.craniaCash || 0
              const entries = (r.cashLog || []).length
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  style={{
                    borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.student.firstName} {r.student.lastName}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 15, fontWeight: 800, color: cash < 0 ? '#a12626' : 'var(--brand-dark-blue)' }}>
                    {cash}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ink-soft)' }}>{entries}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────
export default function CraniaCash() {
  const { records, status } = useStore()
  const [tab, setTab] = useState('students') // 'students' | 'rules'
  const [detailId, setDetailId] = useState(null)
  const detailRecord = detailId ? records.find(r => r.id === detailId) : null

  // Summary metrics for the Students tab.
  const metrics = useMemo(() => {
    let total = 0, negative = 0, sum = 0
    for (const r of records) {
      total += 1
      const cash = r.student?.craniaCash || 0
      sum += cash
      if (cash < 0) negative += 1
    }
    return { total, negative, sum }
  }, [records])

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head">
        <h2 className="page-title">Crania Cash</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: 'students', l: 'Students' }, { k: 'rules', l: 'Rules' }].map(t => (
            <button key={t.k} onClick={() => { setTab(t.k); setDetailId(null) }} style={{
              border: `1.5px solid ${tab === t.k ? 'var(--brand-dark-blue)' : '#e2ded2'}`,
              background: tab === t.k ? '#5FA09E18' : '#fff',
              color: tab === t.k ? 'var(--brand-dark-blue)' : 'var(--brand-dark-brown)',
              borderRadius: 8, padding: '7px 16px', fontSize: 13,
              fontWeight: 700, cursor: 'pointer',
            }}>{t.l}</button>
          ))}
        </div>
      </div>

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — showing cached data.
        </div>
      )}

      {tab === 'students' && !detailRecord && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          <MetricTile label="Students" value={metrics.total} hint="registered students" />
          <MetricTile label="Total Balance" value={metrics.sum} hint="Crania Cash across all students"
            color={metrics.sum < 0 ? '#a12626' : 'var(--brand-dark-blue)'} />
          <MetricTile label="Negative Balances" value={metrics.negative}
            color={metrics.negative > 0 ? '#a12626' : 'var(--ink)'} hint="students below zero" />
        </div>
      )}

      {tab === 'students' && (detailRecord
        ? <StudentCashDetail record={detailRecord} onBack={() => setDetailId(null)} />
        : <StudentList onSelect={setDetailId} />
      )}

      {tab === 'rules' && <RulesEditor />}
    </div>
  )
}
