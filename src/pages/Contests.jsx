import { useState } from 'react'
import { Search } from 'lucide-react'
import { useStore } from '../data/store'

const STATUSES = ['Waiting', 'Submitted', 'Complete', 'Cancelled']

const STATUS_STYLE = {
  Waiting:   { background: '#fff3cd', color: '#7a5a00' },
  Submitted: { background: '#d4edda', color: '#1a5c2a' },
  Complete:  { background: '#cce5ff', color: '#0a3a6a' },
  Cancelled: { background: '#f8d7da', color: '#7a1a1a' },
}

const today = new Date()
today.setHours(0, 0, 0, 0)

// Returns bg/text colors for the reg deadline cell, or null if no highlight needed
function deadlineStyle(dateStr) {
  if (!dateStr) return null
  const diff = (new Date(dateStr) - today) / 86400000 // days
  if (diff < 0)   return { bg: '#9e9e9e', text: '#fff' } // past → gray
  if (diff <= 2)  return { bg: '#e53935', text: '#fff' } // ≤2 days → red
  if (diff <= 14) return { bg: '#f9a825', text: '#fff' } // ≤2 weeks → yellow
  return null
}

function isContest(p) {
  return (p.title || '').toUpperCase().includes('CONTEST') ||
         (p.category || '').toUpperCase().includes('CONTEST')
}

const cellInput = {
  width: '100%', border: 'none', outline: 'none', background: 'transparent',
  fontSize: 13, fontFamily: 'inherit', color: 'inherit', padding: '9px 10px',
}

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

export default function Contests({ onNavigate }) {
  const { programs } = useStore()
  const [extras, setExtras] = useState(() => load('contests-extras', {}))
  const [manual, setManual] = useState(() => load('contests-manual', []))
  const [search, setSearch] = useState('')

  const updateExtra = (id, key, val) =>
    setExtras(prev => { const next = { ...prev, [id]: { ...prev[id], [key]: val } }; save('contests-extras', next); return next })

  const updateManual = (id, key, val) =>
    setManual(prev => { const next = prev.map(r => r.id === id ? { ...r, [key]: val } : r); save('contests-manual', next); return next })

  const addRow = () => {
    const id = 'manual-' + Date.now()
    setManual(prev => { const next = [...prev, { id, org: '', contest: '', regDeadline: '', contestDate: '', numOrdered: '', status: 'Waiting' }]; save('contests-manual', next); return next })
  }

  // Build rows from contest programs + manual additions
  // Use title as fallback key since program IDs may be undefined from the API
  const programRows = programs.filter(isContest).map((p, i) => {
    const key = String(p.id != null ? p.id : p.title ?? i)
    const words = (p.title || '').split(/\s+/)
    const ci = words.findIndex(w => w.toUpperCase() === 'CONTEST')
    const defaultOrg     = ci >= 0 ? (words[ci + 1] ?? '') : ''
    const defaultContest = ci >= 0 ? (words[ci + 2] ?? '') : p.title
    return {
      id: key,
      fromProgram: true,
      contest: extras[key]?.contest ?? defaultContest,
      org:          extras[key]?.org          ?? defaultOrg,
      regDeadline:  extras[key]?.regDeadline  ?? '',
      contestDate:  extras[key]?.contestDate  ?? '',
      numOrdered:   extras[key]?.numOrdered   ?? '',
      status:       extras[key]?.status       ?? 'Waiting',
    }
  })

  const allRows = [...programRows, ...manual]

  const visible = allRows.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return r.org.toLowerCase().includes(s) || r.contest.toLowerCase().includes(s)
  })

  const update = (row, key, val) =>
    row.fromProgram ? updateExtra(row.id, key, val) : updateManual(row.id, key, val)

  const COLS = [
    { key: 'org',          label: 'Org.',             width: 70  },
    { key: 'contest',      label: 'Contest',          width: 140 },
    { key: 'regDeadline',  label: 'Reg. Deadline',    width: 130 },
    { key: 'contestDate',  label: 'Contest Date',     width: 120 },
    { key: 'numOrdered',   label: 'No. Ordered',      width: 110 },
    { key: 'status',       label: 'Status',           width: 120 },
  ]

  return (
    <div className="page">
      <h2 className="page-title">Contests</h2>

      {/* Search bar */}
      <div style={{
        background: 'var(--logo-teal)', borderRadius: '10px 10px 0 0', padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Search size={17} color="rgba(255,255,255,0.7)" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contests…"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: '#fff', fontFamily: 'inherit' }}
        />
        <style>{`input::placeholder { color: rgba(255,255,255,0.6); }`}</style>
        <button onClick={addRow} style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6,
          color: '#fff', width: 30, height: 30, fontSize: 20, fontWeight: 700,
          cursor: 'pointer', display: 'grid', placeItems: 'center',
        }}>+</button>
      </div>

      {/* Table */}
      <div style={{ border: '2px solid var(--logo-teal)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: '#3d8e90' }}>
                {COLS.map(c => (
                  <th key={c.key} style={{
                    padding: '9px 10px', textAlign: 'left', fontSize: 12,
                    fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', letterSpacing: '.3px',
                  }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={String(r.id ?? i)} style={{ borderBottom: '1px solid var(--line)', background: i % 2 === 0 ? '#fff' : '#fafbfb' }}>

                  {/* Org */}
                  <td style={{ padding: 0 }}>
                    <input value={r.org} onChange={e => update(r, 'org', e.target.value)}
                      style={cellInput} placeholder="—" />
                  </td>

                  {/* Contest — from programs: read-only label; manual: editable */}
                  <td style={{ padding: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {r.fromProgram ? (
                        <span style={{ ...cellInput, color: '#1a5c7a', textDecoration: 'underline', display: 'block', flex: 1 }}>
                          {r.contest}
                        </span>
                      ) : (
                        <input
                          value={r.contest}
                          onChange={e => update(r, 'contest', e.target.value)}
                          style={{ ...cellInput, color: '#1a5c7a', textDecoration: r.contest ? 'underline' : 'none', flex: 1 }}
                          placeholder="—"
                        />
                      )}
                      {r.contest && (
                        <button
                          title="View in Programs"
                          onClick={() => onNavigate && onNavigate('Programs')}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--logo-teal)', padding: '0 6px', fontSize: 13, fontWeight: 700,
                          }}>→</button>
                      )}
                    </div>
                  </td>

                  {/* Reg. Deadline */}
                  {(() => { const ds = deadlineStyle(r.regDeadline); return (
                  <td style={{ padding: 0, background: ds?.bg ?? 'transparent' }}>
                    <input
                      type="date"
                      value={r.regDeadline}
                      onChange={e => update(r, 'regDeadline', e.target.value)}
                      style={{ ...cellInput, color: ds?.text ?? 'var(--ink)', fontWeight: ds ? 700 : 400 }}
                    />
                  </td>
                  )})()}

                  {/* Contest Date */}
                  <td style={{ padding: 0 }}>
                    <input
                      type="date"
                      value={r.contestDate}
                      onChange={e => update(r, 'contestDate', e.target.value)}
                      style={cellInput}
                    />
                  </td>

                  {/* No. Ordered */}
                  <td style={{ padding: 0 }}>
                    <input
                      type="number"
                      min="0"
                      value={r.numOrdered}
                      onChange={e => update(r, 'numOrdered', e.target.value)}
                      style={{ ...cellInput, textAlign: 'center' }}
                      placeholder="0"
                    />
                  </td>

                  {/* Status */}
                  <td style={{ padding: '4px 6px' }}>
                    <select
                      value={r.status}
                      onChange={e => update(r, 'status', e.target.value)}
                      style={{
                        width: '100%', border: 'none', outline: 'none',
                        borderRadius: 6, padding: '5px 8px', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                        ...(STATUS_STYLE[r.status] || {}),
                      }}
                    >
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}

              {/* Empty filler rows */}
              {Array.from({ length: Math.max(0, 8 - visible.length) }).map((_, i) => (
                <tr key={'empty-' + i} style={{ borderBottom: '1px solid var(--line)', background: (visible.length + i) % 2 === 0 ? '#fff' : '#fafbfb' }}>
                  {COLS.map(c => <td key={c.key} style={{ height: 36 }} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  )
}
