import { useState, useEffect } from 'react'
import { useStore } from '../data/store'

function fmtTs(ts) {
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '—' }
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
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--logo-teal)', fontWeight: 700, fontSize: 14,
        marginBottom: 12, padding: 0,
      }}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        All Students
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <h2 className="page-title" style={{ margin: 0 }}>{record.student.firstName} {record.student.lastName}</h2>
        <div style={{ fontSize: 28, fontWeight: 800, color: balance < 0 ? '#c62828' : '#2c7a7b' }}>
          {balance} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Crania Cash</span>
        </div>
      </div>

      {/* Quick rule buttons */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>Quick Apply</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {rules.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No rules defined. Add some on the Rules tab.</div>
          ) : rules.map(rule => {
            const positive = rule.delta >= 0
            return (
              <button key={rule.id} onClick={() => apply(rule.delta, rule.reason)} style={{
                background: positive ? '#e0f2e8' : '#fde0e0',
                color: positive ? '#1f6b3a' : '#a02020',
                border: `1px solid ${positive ? '#a8d5b8' : '#e8a0a0'}`,
                borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {rule.reason} <span style={{ fontWeight: 800 }}>({positive ? '+' : ''}{rule.delta})</span>
              </button>
            )
          })}
        </div>

        {/* Custom entry */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Custom</span>
          <input
            type="number"
            value={customDelta}
            onChange={e => setCustomDelta(e.target.value)}
            placeholder="±amount"
            style={{ width: 100, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
          />
          <input
            value={customReason}
            onChange={e => setCustomReason(e.target.value)}
            placeholder="Reason"
            style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
          />
          <button onClick={submitCustom} style={{
            background: '#2c7a7b', color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            Add Entry
          </button>
        </div>
      </div>

      {/* Log */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#f5f5f5', padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Activity Log
        </div>
        {log.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 }}>
            No activity yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>When</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Reason</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Change</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={i} style={{ borderBottom: i < log.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ink-soft)' }}>{fmtTs(e.ts)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ink)' }}>{e.reason}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: e.delta >= 0 ? '#1f6b3a' : '#c62828' }}>
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
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Define quick-apply rules — each one becomes a button on a student's page.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={add} style={{
            background: '#eef1f2', color: 'var(--ink)', border: 'none', borderRadius: 6,
            padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>+ Add Rule</button>
          <button onClick={save} disabled={!dirty} style={{
            background: dirty ? '#2c7a7b' : '#cbd1d6', color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
          }}>Save Changes</button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            <th style={{ padding: '10px 6px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Reason</th>
            <th style={{ padding: '10px 6px', textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 600, width: 120 }}>Crania Cash</th>
            <th style={{ width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {draft.length === 0 ? (
            <tr><td colSpan={3} style={{ padding: 22, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 }}>No rules. Click "+ Add Rule" to create one.</td></tr>
          ) : draft.map((r, i) => (
            <tr key={r.id || i} style={{ borderBottom: i < draft.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <td style={{ padding: '8px 6px' }}>
                <input
                  value={r.reason}
                  onChange={e => setRow(i, { reason: e.target.value })}
                  placeholder="e.g., Brought completed homework"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
                />
              </td>
              <td style={{ padding: '8px 6px' }}>
                <input
                  type="number"
                  value={r.delta}
                  onChange={e => setRow(i, { delta: Number(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
                />
              </td>
              <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                <button onClick={() => remove(i)} title="Remove rule" style={{
                  background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 16, padding: 6,
                }}>×</button>
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

  const filtered = records
    .filter(r => {
      if (!search) return true
      const name = `${r.student.firstName} ${r.student.lastName}`.toLowerCase()
      return name.includes(search.toLowerCase())
    })
    .sort((a, b) => (a.student.firstName || '').localeCompare(b.student.firstName || '', undefined, { sensitivity: 'base' }))

  return (
    <div>
      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--logo-teal)', borderRadius: '10px 10px 0 0', padding: '14px 20px',
      }}>
        <svg width="18" height="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search students…"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: '#fff', fontFamily: 'inherit' }}
        />
        <style>{`input::placeholder { color: rgba(255,255,255,0.6); }`}</style>
      </div>

      <div style={{ border: '2px solid var(--logo-teal)', borderTop: 'none', borderRadius: '0 0 10px 10px', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', background: '#3d8e90', padding: '11px 20px' }}>
          {['Name', 'Crania Cash', 'Entries'].map(h => (
            <div key={h} style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{h}</div>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14, fontStyle: 'italic' }}>No students found.</div>
        ) : filtered.map((r, i) => {
          const cash = r.student.craniaCash || 0
          const entries = (r.cashLog || []).length
          return (
            <div key={r.id} onClick={() => onSelect(r.id)} style={{
              display: 'grid', gridTemplateColumns: '1fr 120px 120px',
              padding: '13px 20px', alignItems: 'center', cursor: 'pointer',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
              background: i % 2 === 0 ? '#fff' : '#fafbfb',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.student.firstName} {r.student.lastName}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: cash < 0 ? '#c62828' : '#2c7a7b' }}>{cash}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{entries}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────
export default function CraniaCash() {
  const { records } = useStore()
  const [tab, setTab] = useState('students') // 'students' | 'rules'
  const [detailId, setDetailId] = useState(null)
  const detailRecord = detailId ? records.find(r => r.id === detailId) : null

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <h2 className="page-title">Crania Cash</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--line)' }}>
        {[{ k: 'students', l: 'Students' }, { k: 'rules', l: 'Rules' }].map(t => (
          <button key={t.k} onClick={() => { setTab(t.k); setDetailId(null) }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 18px', fontSize: 14,
            fontWeight: tab === t.k ? 700 : 500,
            color: tab === t.k ? 'var(--logo-teal)' : 'var(--ink-soft)',
            borderBottom: tab === t.k ? '3px solid var(--logo-teal)' : '3px solid transparent',
            marginBottom: -1,
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'students' && (detailRecord
        ? <StudentCashDetail record={detailRecord} onBack={() => setDetailId(null)} />
        : <StudentList onSelect={setDetailId} />
      )}

      {tab === 'rules' && <RulesEditor />}
    </div>
  )
}
