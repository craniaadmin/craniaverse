// Contests — server-backed via GET/PUT /api/contests (singleton
// payload: extras + manual + hidden). Contest programs from
// useStore().programs auto-populate as rows; manual rows can be
// added on top. Program-derived rows can be "hidden" (not deleted).
// Debounced PUT on every mutation, same pattern as Projects /
// Calendar / IT Accounts / Crania Store.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Trash2, ExternalLink } from 'lucide-react'
import { useStore } from '../data/store'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const STATUSES = ['Waiting', 'Submitted', 'Complete', 'Cancelled']

// Status pill palette matching the Invoices page for visual cohesion.
const STATUS_STYLE = {
  Waiting:   { bg: '#fff4d6', fg: '#8a6a00' },
  Submitted: { bg: '#e4f2fb', fg: '#1c6ea4' },
  Complete:  { bg: '#dff5e0', fg: '#2b7a2e' },
  Cancelled: { bg: '#eef1f4', fg: '#5b6573' },
}

const today = new Date(); today.setHours(0, 0, 0, 0)

function deadlineStyle(dateStr) {
  if (!dateStr) return null
  const diff = (new Date(dateStr) - today) / 86400000
  if (diff < 0)   return { bg: '#eee', fg: '#5b6573', label: 'past' }
  if (diff <= 2)  return { bg: '#fde0e0', fg: '#a12626', label: 'imminent' }
  if (diff <= 14) return { bg: '#fff4d6', fg: '#8a6a00', label: 'soon' }
  return null
}

const isContest = (p) =>
  (p.title || '').toUpperCase().includes('CONTEST') ||
  (p.category || '').toUpperCase().includes('CONTEST')

// ---- store hook (server-backed, debounced PUT) ----
function useContests() {
  const [data, setData] = useState({ extras: {}, manual: [], hidden: [] })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading') // 'loading' | 'online' | 'offline'
  const saveTimer = useRef(null)
  const latest = useRef(data)
  latest.current = data

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/contests`, { headers: HEADERS })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(j => {
        if (!alive) return
        let extras = j.extras && typeof j.extras === 'object' ? j.extras : {}
        let manual = Array.isArray(j.manual) ? j.manual : []
        let hidden = Array.isArray(j.hidden) ? j.hidden : []

        // One-shot migration from the pre-server localStorage store.
        // If the server has nothing yet but the browser has old rows,
        // upload them and clear localStorage so we don't run twice.
        const serverEmpty = Object.keys(extras).length === 0 && manual.length === 0 && hidden.length === 0
        if (serverEmpty) {
          const lsExtras = tryLoad('contests-extras', {})
          const lsManual = tryLoad('contests-manual', [])
          const lsHidden = tryLoad('contests-hidden', [])
          const lsAny =
            (lsExtras && Object.keys(lsExtras).length) ||
            (Array.isArray(lsManual) && lsManual.length) ||
            (Array.isArray(lsHidden) && lsHidden.length)
          if (lsAny) {
            extras = lsExtras || {}
            manual = Array.isArray(lsManual) ? lsManual : []
            hidden = Array.isArray(lsHidden) ? lsHidden : []
            fetch(`${API_BASE}/api/contests`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...HEADERS },
              body: JSON.stringify({ extras, manual, hidden }),
            }).then(() => {
              try {
                localStorage.removeItem('contests-extras')
                localStorage.removeItem('contests-manual')
                localStorage.removeItem('contests-hidden')
              } catch { /* ignore */ }
            }).catch(() => {})
          }
        }

        setData({ extras, manual, hidden })
        setStatus('online')
      })
      .catch(() => alive && setStatus('offline'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const mutate = useCallback((mut) => {
    setData(prev => {
      const next = {
        extras: { ...prev.extras },
        manual: [...prev.manual],
        hidden: [...prev.hidden],
      }
      mut(next)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/contests`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify(latest.current),
        }).catch(() => {})
      }, 350)
      return next
    })
  }, [])

  return { data, loading, status, mutate }
}

// Cell-editor input styling — flat, invisible until focus so the
// table reads as a document but is fully editable in place.
const cellInput = {
  width: '100%', border: '1px solid transparent', outline: 'none', background: 'transparent',
  fontSize: 13, fontFamily: 'inherit', color: 'inherit',
  padding: '6px 8px', borderRadius: 6,
}

export default function Contests({ onNavigate }) {
  const { programs } = useStore()
  const { data, loading, status: fetchStatus, mutate } = useContests()
  const { extras, manual, hidden } = data
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const updateExtra = (id, key, val) =>
    mutate(d => {
      d.extras = { ...d.extras, [id]: { ...(d.extras[id] || {}), [key]: val } }
    })

  const updateManual = (id, key, val) =>
    mutate(d => {
      d.manual = d.manual.map(r => r.id === id ? { ...r, [key]: val } : r)
    })

  const deleteRow = (row) => {
    if (!confirm(`Remove "${row.contest || row.org || 'this row'}" from the list?`)) return
    if (row.fromProgram) {
      mutate(d => { if (!d.hidden.includes(row.id)) d.hidden.push(row.id) })
    } else {
      mutate(d => { d.manual = d.manual.filter(r => r.id !== row.id) })
    }
  }

  const addRow = () => {
    const id = 'manual-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    mutate(d => {
      d.manual.push({
        id, org: '', contest: '', regDeadline: '', contestDate: '',
        numOrdered: '', status: 'Waiting',
      })
    })
  }

  // Build rows: contest-tagged programs + manual additions.
  const programRows = useMemo(() => {
    return programs.filter(isContest).filter(p => {
      const key = String(p.id != null ? p.id : p.title ?? '')
      return !hidden.includes(key)
    }).map((p, i) => {
      const key = String(p.id != null ? p.id : p.title ?? i)
      const words = (p.title || '').split(/\s+/)
      const ci = words.findIndex(w => w.toUpperCase() === 'CONTEST')
      const rest = ci >= 0 ? words.slice(ci + 1).filter(w => w !== '-') : []
      const defaultOrg     = rest[0] ?? ''
      const defaultContest = rest[1] ?? (ci >= 0 ? '' : p.title)
      return {
        id: key,
        fromProgram: true,
        contest:     extras[key]?.contest     ?? defaultContest,
        org:         extras[key]?.org         ?? defaultOrg,
        regDeadline: extras[key]?.regDeadline ?? '',
        contestDate: extras[key]?.contestDate ?? '',
        numOrdered:  extras[key]?.numOrdered  ?? '',
        status:      extras[key]?.status      ?? 'Waiting',
      }
    })
  }, [programs, extras, hidden])

  const allRows = useMemo(() => [...programRows, ...manual], [programRows, manual])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      return (r.org || '').toLowerCase().includes(q) ||
             (r.contest || '').toLowerCase().includes(q)
    })
  }, [allRows, search, statusFilter])

  // Aggregate metrics for the summary tiles.
  const metrics = useMemo(() => {
    const counts = { total: allRows.length, waiting: 0, submitted: 0, complete: 0, dueSoon: 0 }
    for (const r of allRows) {
      if (r.status === 'Waiting')   counts.waiting++
      if (r.status === 'Submitted') counts.submitted++
      if (r.status === 'Complete')  counts.complete++
      const ds = deadlineStyle(r.regDeadline)
      if (ds && (ds.label === 'imminent' || ds.label === 'soon') && r.status !== 'Complete') counts.dueSoon++
    }
    return counts
  }, [allRows])

  const update = (row, key, val) =>
    row.fromProgram ? updateExtra(row.id, key, val) : updateManual(row.id, key, val)

  if (loading) {
    return (
      <div className="page">
        <h2 className="page-title">Contests</h2>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Contests</h2>
        <button
          onClick={addRow}
          style={{
            background: 'var(--brand-light-blue)', color: 'var(--brand-dark-brown)',
            border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 700,
            borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Plus size={14} /> Add Row
        </button>
      </div>

      {fetchStatus === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      {/* Metrics — click a status tile to filter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricTile label="Total"      value={metrics.total}    hint="contests tracked" />
        <MetricTile label="Waiting"    value={metrics.waiting}
          color={metrics.waiting > 0 ? '#8a6a00' : 'var(--ink)'}
          onClick={() => setStatusFilter(statusFilter === 'Waiting' ? 'all' : 'Waiting')}
          active={statusFilter === 'Waiting'} />
        <MetricTile label="Submitted"  value={metrics.submitted}
          color={metrics.submitted > 0 ? '#1c6ea4' : 'var(--ink)'}
          onClick={() => setStatusFilter(statusFilter === 'Submitted' ? 'all' : 'Submitted')}
          active={statusFilter === 'Submitted'} />
        <MetricTile label="Due Soon"   value={metrics.dueSoon}
          color={metrics.dueSoon > 0 ? '#a12626' : 'var(--ink)'}
          hint="≤ 14 days & not complete" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search organisation or contest…"
            style={{
              width: '100%', padding: '7px 8px 7px 30px', fontSize: 13,
              border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff',
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4',
            borderRadius: 8, background: '#fff', color: 'var(--brand-dark-brown)',
          }}
        >
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search || statusFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('all') }}
            style={{
              background: 'transparent', border: 'none', color: 'var(--brand-dark-blue)',
              textDecoration: 'underline', cursor: 'pointer', fontSize: 13,
            }}
          >Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, overflow: 'auto',
                    boxShadow: '0 1px 3px rgba(46,37,22,.15)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
              <Th>Organisation</Th>
              <Th>Contest</Th>
              <Th>Reg. Deadline</Th>
              <Th>Contest Date</Th>
              <Th align="center">Ordered</Th>
              <Th align="center">Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                {allRows.length === 0
                  ? 'No contests yet — click + Add Row to start, or add a contest-tagged program under Programs.'
                  : 'No contests match your filters.'}
              </td></tr>
            )}
            {visible.map((r, i) => {
              const ds = deadlineStyle(r.regDeadline)
              return (
                <tr key={String(r.id ?? i)} style={{
                  borderTop: '1px solid #f0ede3',
                  background: i % 2 ? '#fafaf7' : '#fff',
                }}>
                  {/* Organisation */}
                  <td style={{ padding: '3px 6px' }}>
                    <input
                      value={r.org}
                      onChange={e => update(r, 'org', e.target.value)}
                      placeholder="—"
                      style={cellInput}
                    />
                  </td>

                  {/* Contest */}
                  <td style={{ padding: '3px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {r.fromProgram ? (
                        <span style={{
                          ...cellInput,
                          color: 'var(--brand-dark-blue)', fontWeight: 700,
                          borderColor: 'transparent',
                        }}>{r.contest || '—'}</span>
                      ) : (
                        <input
                          value={r.contest}
                          onChange={e => update(r, 'contest', e.target.value)}
                          placeholder="—"
                          style={{ ...cellInput, color: 'var(--brand-dark-blue)', fontWeight: 700 }}
                        />
                      )}
                      {r.fromProgram && (
                        <button
                          title="View in Programs"
                          onClick={() => onNavigate && onNavigate('Programs')}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: 'var(--brand-dark-blue)', padding: 2, display: 'inline-flex',
                          }}
                        ><ExternalLink size={13} /></button>
                      )}
                    </div>
                  </td>

                  {/* Reg. Deadline */}
                  <td style={{ padding: '3px 6px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: ds?.bg || 'transparent', borderRadius: 6,
                      padding: ds ? '2px 4px' : 0,
                    }}>
                      <input
                        type="date"
                        value={r.regDeadline}
                        onChange={e => update(r, 'regDeadline', e.target.value)}
                        style={{
                          ...cellInput,
                          color: ds?.fg || 'inherit',
                          fontWeight: ds ? 700 : 400,
                          background: 'transparent',
                        }}
                      />
                    </div>
                  </td>

                  {/* Contest Date */}
                  <td style={{ padding: '3px 6px' }}>
                    <input
                      type="date"
                      value={r.contestDate}
                      onChange={e => update(r, 'contestDate', e.target.value)}
                      style={cellInput}
                    />
                  </td>

                  {/* Ordered */}
                  <td style={{ padding: '3px 6px' }}>
                    <input
                      type="number"
                      min="0"
                      value={r.numOrdered}
                      onChange={e => update(r, 'numOrdered', e.target.value)}
                      placeholder="0"
                      style={{ ...cellInput, textAlign: 'center' }}
                    />
                  </td>

                  {/* Status */}
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <StatusSelect value={r.status} onChange={val => update(r, 'status', val)} />
                  </td>

                  {/* Delete */}
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <button
                      onClick={() => deleteRow(r)}
                      title={r.fromProgram ? 'Hide this program row' : 'Delete row'}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--ink-soft)', padding: 4,
                      }}
                    ><Trash2 size={13} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Small components ----------
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
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function StatusSelect({ value, onChange }) {
  const style = STATUS_STYLE[value] || STATUS_STYLE.Waiting
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        border: 'none', outline: 'none', cursor: 'pointer',
        borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700,
        letterSpacing: '.4px', textTransform: 'uppercase', fontFamily: 'inherit',
        background: style.bg, color: style.fg,
        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        paddingRight: 22,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 3l3 4 3-4' stroke='${encodeURIComponent(style.fg)}' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 6px center',
      }}
    >
      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}
