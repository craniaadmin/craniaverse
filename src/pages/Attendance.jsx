// Attendance — a cross-student view over the same lesson rows shown
// at the bottom of each Student's own page (Comments tab). There is
// no separate attendance storage: this page reads/writes the same
// PocketBase `comments` collection via useCommentsRows(), so marking
// attendance here immediately shows up on that student's own page,
// and vice versa.
//
// Two views:
//  - Register (default): one day at a time, grouped by class/program
//    — how attendance actually gets taken. Prev/Today/Next navigation
//    mirrors the Calendar page.
//  - History: the full filterable log across all students/dates, for
//    lookback and search.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useCommentsRows } from '../data/useCommentsRows'
import { ATTEND_STYLE, ATTEND_LABEL } from '../data/scheduleUtils'

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayISO = () => isoOf(new Date())
const addDaysISO = (iso, delta) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return isoOf(d)
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtDateLong(iso) {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function Attendance({ onNavigate }) {
  const { flatRows, updateRow, loading, status, studentCount } = useCommentsRows()
  const [view, setView] = useState('register') // 'register' | 'history'
  const [selectedDate, setSelectedDate] = useState(todayISO())

  // History-view filters
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [includeFuture, setIncludeFuture] = useState(false)
  const today = todayISO()

  const programs = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const r of flatRows) {
      if (r.program && !seen.has(r.program)) { out.push(r.program); seen.add(r.program) }
    }
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [flatRows])

  const dated = useMemo(() => flatRows.filter(r => r.row.date), [flatRows])

  // ---------- Register view ----------
  const dayRows = useMemo(() => dated.filter(r => r.row.date === selectedDate), [dated, selectedDate])

  const dayGroups = useMemo(() => {
    const map = new Map()
    for (const r of dayRows) {
      if (!map.has(r.program)) map.set(r.program, [])
      map.get(r.program).push(r)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.studentName.localeCompare(b.studentName, undefined, { sensitivity: 'base' }))
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
  }, [dayRows])

  const dayMetrics = useMemo(() => {
    let present = 0, late = 0, absent = 0, unmarked = 0
    for (const r of dayRows) {
      const a = (r.row.attendance || '').toUpperCase()
      if (a === 'P') present++
      else if (a === 'L') late++
      else if (a === 'A') absent++
      else unmarked++
    }
    return { total: dayRows.length, present, late, absent, unmarked }
  }, [dayRows])

  // ---------- History view ----------
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return dated
      .filter(r => includeFuture || r.row.date <= today)
      .filter(r => programFilter === 'all' || r.program === programFilter)
      .filter(r => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'unmarked') return !r.row.attendance
        return (r.row.attendance || '').toUpperCase() === statusFilter
      })
      .filter(r => !q || r.studentName.toLowerCase().includes(q) || r.program.toLowerCase().includes(q))
      .sort((a, b) => b.row.date.localeCompare(a.row.date) || a.studentName.localeCompare(b.studentName))
  }, [dated, search, programFilter, statusFilter, includeFuture, today])

  const historyMetrics = useMemo(() => {
    const pastLogged = dated.filter(r => r.row.date <= today)
    let present = 0, late = 0, absent = 0, unmarked = 0
    for (const r of pastLogged) {
      const a = (r.row.attendance || '').toUpperCase()
      if (a === 'P') present++
      else if (a === 'L') late++
      else if (a === 'A') absent++
      else unmarked++
    }
    const marked = pastLogged.length - unmarked
    const presentPct = marked > 0 ? Math.round((present / marked) * 100) : 0
    return { total: pastLogged.length, present, late, absent, unmarked, presentPct }
  }, [dated, today])

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head">
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: 'register', l: 'Register' }, { k: 'history', l: 'History' }].map(t => (
            <button key={t.k} onClick={() => setView(t.k)} style={{
              border: `1.5px solid ${view === t.k ? 'var(--brand-dark-blue)' : '#e2ded2'}`,
              background: view === t.k ? '#5FA09E18' : '#fff',
              color: view === t.k ? 'var(--brand-dark-blue)' : 'var(--brand-dark-brown)',
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

      {view === 'register' ? (
        <>
          {/* Date navigator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap',
            background: '#fff', padding: '10px 14px', borderRadius: 10, boxShadow: 'var(--brand-shadow)',
          }}>
            <button className="cal-navbtn" onClick={() => setSelectedDate(d => addDaysISO(d, -1))} title="Previous day">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setSelectedDate(todayISO())}
              style={{
                background: 'var(--brand-light-brown)', color: 'var(--brand-dark-brown)',
                border: 'none', padding: '7px 18px', borderRadius: 8, fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
              }}
            >Today</button>
            <button className="cal-navbtn" onClick={() => setSelectedDate(d => addDaysISO(d, 1))} title="Next day">
              <ChevronRight size={18} />
            </button>
            <span style={{ fontSize: 18, fontWeight: 700, marginLeft: 4 }}>
              {fmtDateLong(selectedDate)}
              {selectedDate === today && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--brand-dark-blue)',
                               background: '#5FA09E18', borderRadius: 999, padding: '2px 9px', verticalAlign: 2 }}>TODAY</span>
              )}
            </span>
            <div style={{ flex: 1 }} />
            <input
              type="date"
              value={selectedDate}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d5d0c4', borderRadius: 8, fontSize: 13 }}
            />
          </div>

          {/* Day metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <MetricTile label="Scheduled" value={dayMetrics.total} hint={`${dayGroups.length} classes`} />
            <MetricTile label="Present" value={dayMetrics.present} color="#2b7a2e" />
            <MetricTile label="Late / Absent" value={`${dayMetrics.late} / ${dayMetrics.absent}`}
              color={(dayMetrics.late + dayMetrics.absent) > 0 ? '#a12626' : 'var(--ink)'} />
            <MetricTile label="Unmarked" value={dayMetrics.unmarked}
              color={dayMetrics.unmarked > 0 ? '#8a6a00' : 'var(--ink)'} />
          </div>

          {/* Class groups */}
          {dayGroups.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--brand-shadow)', padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              No classes scheduled on {fmtDate(selectedDate)}.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {dayGroups.map(([program, rows]) => (
                <ClassGroup key={program} program={program} rows={rows} onNavigate={onNavigate} updateRow={updateRow} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
            <MetricTile label="Lessons Logged" value={historyMetrics.total} hint={`${studentCount} students`} />
            <MetricTile label="Present" value={historyMetrics.present} color="#2b7a2e"
              hint={`${historyMetrics.presentPct}% of marked lessons`} />
            <MetricTile label="Late" value={historyMetrics.late} color={historyMetrics.late > 0 ? '#8a6a00' : 'var(--ink)'} />
            <MetricTile label="Absent" value={historyMetrics.absent} color={historyMetrics.absent > 0 ? '#a12626' : 'var(--ink)'} />
            <MetricTile label="Unmarked" value={historyMetrics.unmarked}
              color={historyMetrics.unmarked > 0 ? '#8a6a00' : 'var(--ink)'} hint="past lessons, no code yet" />
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
              <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search student or program…"
                style={{
                  width: '100%', padding: '7px 8px 7px 30px', fontSize: 13,
                  border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff',
                }}
              />
            </div>
            <select value={programFilter} onChange={e => setProgramFilter(e.target.value)} style={selStyle}>
              <option value="all">All Programs</option>
              {programs.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle}>
              <option value="all">All Statuses</option>
              <option value="P">Present</option>
              <option value="L">Late</option>
              <option value="A">Absent</option>
              <option value="unmarked">Unmarked</option>
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeFuture} onChange={e => setIncludeFuture(e.target.checked)} />
              Include future lessons
            </label>
            {(search || programFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setProgramFilter('all'); setStatusFilter('all') }}
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
                  <Th>Student</Th>
                  <Th>Program</Th>
                  <Th>Date</Th>
                  <Th align="center">Lesson #</Th>
                  <Th align="center">Attendance</Th>
                  <Th align="center">Uniform</Th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                    {dated.length === 0
                      ? 'No lessons logged yet — attendance appears here once a student has at least one scheduled program.'
                      : 'No lessons match your filters.'}
                  </td></tr>
                )}
                {visible.map((r, i) => {
                  const attendStyle = r.row.attendance ? (ATTEND_STYLE[r.row.attendance.toUpperCase()] || {}) : {}
                  return (
                    <tr key={`${r.studentId}::${r.tabKey}::${r.rowIdx}`} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <NameLink onClick={() => onNavigate && onNavigate('Students', r.studentId)}>{r.studentName}</NameLink>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{r.program}</td>
                      <td style={{ padding: '8px 12px' }}>{fmtDate(r.row.date)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--ink-soft)' }}>{r.row.lessonNo}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <select
                          value={r.row.attendance || ''}
                          onChange={e => updateRow(r.studentId, r.tabKey, r.rowIdx, 'attendance', e.target.value)}
                          title={r.row.attendance ? ATTEND_LABEL[r.row.attendance.toUpperCase()] : 'Not marked'}
                          style={{
                            border: 'none', outline: 'none', cursor: 'pointer',
                            borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700,
                            fontFamily: 'inherit', textAlign: 'center', minWidth: 56,
                            background: attendStyle.background || '#f1f1f1',
                            color: attendStyle.color || '#888',
                          }}
                        >
                          <option value="">—</option>
                          <option value="P">P</option>
                          <option value="L">L</option>
                          <option value="A">A</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <select
                          value={r.row.uniform || ''}
                          onChange={e => updateRow(r.studentId, r.tabKey, r.rowIdx, 'uniform', e.target.value)}
                          style={{
                            border: '1px solid #e2ded2', outline: 'none', cursor: 'pointer',
                            borderRadius: 6, padding: '4px 8px', fontSize: 12, fontFamily: 'inherit',
                            background: '#fff', color: 'var(--ink-soft)',
                          }}
                        >
                          <option value=""></option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                          <option value="Borrowed">Borrowed</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Register: one class-group card ----------
function ClassGroup({ program, rows, onNavigate, updateRow }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--brand-shadow)', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        background: 'var(--brand-dark-blue)', color: '#fff',
      }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{program}</span>
        <span style={{
          marginLeft: 'auto', background: 'rgba(255,255,255,.25)', borderRadius: 999,
          fontSize: 11, fontWeight: 700, padding: '2px 9px',
        }}>{rows.length} student{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div>
        {rows.map((r, i) => {
          const attendStyle = r.row.attendance ? (ATTEND_STYLE[r.row.attendance.toUpperCase()] || {}) : {}
          return (
            <div key={`${r.studentId}::${r.tabKey}::${r.rowIdx}`} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px',
              borderTop: i > 0 ? '1px solid #f0ede3' : 'none',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <NameLink onClick={() => onNavigate && onNavigate('Students', r.studentId)}>{r.studentName}</NameLink>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lesson {r.row.lessonNo}</span>
              <select
                value={r.row.uniform || ''}
                onChange={e => updateRow(r.studentId, r.tabKey, r.rowIdx, 'uniform', e.target.value)}
                style={{
                  border: '1px solid #e2ded2', outline: 'none', cursor: 'pointer',
                  borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit',
                  background: '#fff', color: 'var(--ink-soft)', width: 92,
                }}
              >
                <option value="">Uniform</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Borrowed">Borrowed</option>
              </select>
              <select
                value={r.row.attendance || ''}
                onChange={e => updateRow(r.studentId, r.tabKey, r.rowIdx, 'attendance', e.target.value)}
                title={r.row.attendance ? ATTEND_LABEL[r.row.attendance.toUpperCase()] : 'Not marked'}
                style={{
                  border: 'none', outline: 'none', cursor: 'pointer',
                  borderRadius: 999, padding: '5px 14px', fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', textAlign: 'center', minWidth: 64,
                  background: attendStyle.background || '#f1f1f1',
                  color: attendStyle.color || '#888',
                }}
              >
                <option value="">Mark</option>
                <option value="P">Present</option>
                <option value="L">Late</option>
                <option value="A">Absent</option>
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Shared bits ----------
const selStyle = {
  padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4',
  borderRadius: 8, background: '#fff', color: 'var(--brand-dark-brown)',
}

function Th({ children, align = 'left' }) {
  return <th style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
    padding: '10px 12px', textAlign: align, whiteSpace: 'nowrap',
  }}>{children}</th>
}

function MetricTile({ label, value, hint, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px',
      boxShadow: '0 1px 3px rgba(20,30,45,.06)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function NameLink({ children, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        color: 'var(--brand-dark-blue)', fontWeight: 600, cursor: 'pointer',
        textDecoration: 'underline', textDecorationColor: 'transparent',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = 'var(--brand-dark-blue)' }}
      onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = 'transparent' }}
    >{children}</span>
  )
}
