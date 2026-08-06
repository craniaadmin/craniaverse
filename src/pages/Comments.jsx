// Comments — a cross-student view over the same lesson rows shown at
// the bottom of each Student's own page (Comments tab). No separate
// storage: this page reads/writes the same PocketBase `comments`
// collection via useCommentsRows(), so editing a lesson's notes here
// immediately shows up on that student's own page, and vice versa —
// there is only ever one copy of this data.
//
// Same two-view structure as the Attendance page:
//  - Register (default): one day at a time, grouped by class/program,
//    with the same Prev/Today/Next navigator.
//  - History: the full filterable spreadsheet across all dates.
// Columns are the Student page's own Comments-tab fields (Lesson
// Plan, Homework Completed, Performance, Behaviour, Homework
// Assigned, Parent Communication, Teacher) minus Attendance and
// Uniform, which live on the Attendance page. Every cell is directly
// editable in place on both views.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useCommentsRows } from '../data/useCommentsRows'
import PageActions, { PAGEACTIONS_CSS } from '../components/PageActions'
import useActionHistory from '../data/useActionHistory'

const COMMENT_FIELDS = [
  { key: 'lessonPlan',        label: 'Lesson Plan',          width: 180 },
  { key: 'homeworkCompleted', label: 'Homework Completed',   width: 150 },
  { key: 'performance',       label: 'Performance',          width: 160 },
  { key: 'behaviour',         label: 'Behaviour',            width: 150 },
  { key: 'homeworkAssigned',  label: 'Homework Assigned',    width: 150 },
  { key: 'parentComm',        label: 'Parent Communication', width: 160 },
  { key: 'teacher',           label: 'Teacher',              width: 110 },
]

const hasNotes = (row) => COMMENT_FIELDS.some(f => (row[f.key] || '').trim())

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
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function fmtDateLong(iso) {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const daysAgo = (iso) => {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return Infinity
  return Math.round((Date.now() - d.getTime()) / 86400000)
}

export default function Comments({ onNavigate }) {
  const { flatRows, updateRow, loading, status, studentCount } = useCommentsRows()
  const [view, setView] = useState('register') // 'register' | 'history'
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const today = todayISO()

  // History-view filters
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('all')
  const [showBlank, setShowBlank] = useState(false)

  /* Undo/redo. Every hook on this page has to be called before the
     `if (loading)` return below — a hook that only runs on the second
     render is a "rendered more hooks than during the previous render"
     crash, and the page dies on open. Keep them all up here. */
  const hist = useActionHistory()
  const pushHist = hist.push

  // The note as it stands, read at the moment of the change rather than
  // closed over from a render — two teachers can be writing at once.
  const rowsRef = useRef(flatRows)
  rowsRef.current = flatRows

  /* Writing a note is typing, so a burst of keystrokes in one box is one
     step. The stack entry is pushed on the first keystroke and its "after"
     value is kept in a holder the closures read, so Undo is available
     immediately and still lands on the whole word rather than the first
     letter of it. */
  const burst = useRef(null)
  const endBurst = useCallback(() => {
    if (burst.current) { clearTimeout(burst.current.timer); burst.current = null }
  }, [])
  useEffect(() => endBurst, [endBurst])

  const editCell = useCallback((r, field, value) => {
    const key = `${r.studentId}::${r.tabKey}::${r.rowIdx}::${field}`
    updateRow(r.studentId, r.tabKey, r.rowIdx, field, value)

    const open = burst.current
    if (open && open.key === key) {
      open.holder.to = value
      clearTimeout(open.timer)
      open.timer = setTimeout(() => { burst.current = null }, 700)
      return
    }

    const live = rowsRef.current.find(x => x.studentId === r.studentId
      && x.tabKey === r.tabKey && x.rowIdx === r.rowIdx) || r
    const holder = { from: live.row?.[field] ?? '', to: value }
    if (holder.from === value) return
    const label = `${r.studentName} — ${(COMMENT_FIELDS.find(f => f.key === field) || {}).label || field}`
    const write = (v) => { endBurst(); updateRow(r.studentId, r.tabKey, r.rowIdx, field, v) }
    pushHist({ label, undo: () => write(holder.from), redo: () => write(holder.to) })
    burst.current = { key, holder, timer: setTimeout(() => { burst.current = null }, 700) }
  }, [updateRow, pushHist, endBurst])

  const programs = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const r of flatRows) {
      if (r.program && !seen.has(r.program)) { out.push(r.program); seen.add(r.program) }
    }
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [flatRows])

  const dated = useMemo(() => flatRows.filter(r => r.row.date), [flatRows])
  const withNotes = useMemo(() => dated.filter(r => hasNotes(r.row)), [dated])

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

  const dayMetrics = useMemo(() => ({
    total: dayRows.length,
    classes: dayGroups.length,
    withNotes: dayRows.filter(r => hasNotes(r.row)).length,
  }), [dayRows, dayGroups])

  // ---------- History view ----------
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pool = showBlank ? dated : withNotes
    return pool
      .filter(r => programFilter === 'all' || r.program === programFilter)
      .filter(r => {
        if (!q) return true
        const hay = [r.studentName, r.program, ...COMMENT_FIELDS.map(f => r.row[f.key])]
          .join(' ').toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => b.row.date.localeCompare(a.row.date) || a.studentName.localeCompare(b.studentName))
  }, [dated, withNotes, showBlank, programFilter, search])

  const metrics = useMemo(() => {
    const students = new Set(withNotes.map(r => r.studentId))
    const thisWeek = withNotes.filter(r => daysAgo(r.row.date) <= 7 && daysAgo(r.row.date) >= 0).length
    return { entries: withNotes.length, students: students.size, thisWeek }
  }, [withNotes])

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <style>{COMMENT_CSS}</style>

      <style>{PAGEACTIONS_CSS}</style>
      <PageActions
        {...hist}
        onUndo={() => { endBurst(); hist.onUndo() }}
        onRedo={() => { endBurst(); hist.onRedo() }}
        csvName={view === 'register' ? `crania-lesson-notes-${selectedDate}` : 'crania-lesson-notes'}
        csvColumns={[
          { key: 'student', label: 'Student' },
          { key: 'program', label: 'Program' },
          { key: 'lessonNo', label: 'Lesson #' },
          { key: 'date', label: 'Date' },
          ...COMMENT_FIELDS.map(f => ({ key: f.key, label: f.label })),
        ]}
        csvRows={() => (view === 'register' ? dayRows : visible).map(r => ({
          student: r.studentName,
          program: r.program || '',
          lessonNo: r.row.lessonNo ?? '',
          date: r.row.date || '',
          ...Object.fromEntries(COMMENT_FIELDS.map(f => [f.key, r.row[f.key] || ''])),
        }))}
        backupCollection="comments"
        backupHint="Snapshots of every lesson note and register mark (last 14 kept)."
      >
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
      </PageActions>

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <MetricTile label="Scheduled" value={dayMetrics.total} hint={`${dayMetrics.classes} classes`} />
            <MetricTile label="With Notes" value={dayMetrics.withNotes} color={dayMetrics.withNotes > 0 ? '#2b7a2e' : 'var(--ink)'} />
            <MetricTile label="Without Notes" value={dayMetrics.total - dayMetrics.withNotes} />
          </div>

          {/* Class groups */}
          {dayGroups.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--brand-shadow)', padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              No classes scheduled on {fmtDate(selectedDate)}.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {dayGroups.map(([program, rows]) => (
                <ClassGroup key={program} program={program} rows={rows} onNavigate={onNavigate} editCell={editCell} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <MetricTile label="Entries With Notes" value={metrics.entries} hint={`across ${studentCount} students`} />
            <MetricTile label="Students With Notes" value={metrics.students} />
            <MetricTile label="This Week" value={metrics.thisWeek} hint="entries in the last 7 days" />
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
              <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search student, program, or notes…"
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showBlank} onChange={e => setShowBlank(e.target.checked)} />
              Show lessons with no notes yet
            </label>
            {(search || programFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setProgramFilter('all') }}
                style={{ background: 'transparent', border: 'none', color: 'var(--brand-dark-blue)',
                         textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
              >Clear</button>
            )}
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 10, overflow: 'auto', boxShadow: 'var(--brand-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 140 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 90 }} />
                {COMMENT_FIELDS.map(f => <col key={f.key} style={{ width: f.width }} />)}
              </colgroup>
              <thead>
                <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
                  <Th>Student</Th>
                  <Th>Program</Th>
                  <Th align="center">Lesson</Th>
                  <Th>Date</Th>
                  {COMMENT_FIELDS.map(f => <Th key={f.key}>{f.label}</Th>)}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={4 + COMMENT_FIELDS.length} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                    {withNotes.length === 0
                      ? 'No comments yet — they appear here once a teacher logs notes on a lesson.'
                      : 'No entries match your filters.'}
                  </td></tr>
                )}
                {visible.map((r, i) => (
                  <tr key={`${r.studentId}::${r.tabKey}::${r.rowIdx}`} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
                    <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                      <NameLink onClick={() => onNavigate && onNavigate('Students', r.studentId)}>{r.studentName}</NameLink>
                    </td>
                    <td style={{ padding: '8px 12px', verticalAlign: 'top', color: 'var(--ink-soft)' }}>{r.program}</td>
                    <td style={{ padding: '8px 12px', verticalAlign: 'top', textAlign: 'center', color: 'var(--ink-soft)' }}>{r.row.lessonNo}</td>
                    <td style={{ padding: '8px 12px', verticalAlign: 'top', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                      {fmtDate(r.row.date)}<br /><span style={{ fontSize: 11 }}>{r.row.day}</span>
                    </td>
                    {COMMENT_FIELDS.map(f => (
                      <CommentCell key={f.key} value={r.row[f.key]} onChange={v => updateRow(r.studentId, r.tabKey, r.rowIdx, f.key, v)} />
                    ))}
                  </tr>
                ))}
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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 140 }} />
            <col style={{ width: 60 }} />
            {COMMENT_FIELDS.map(f => <col key={f.key} style={{ width: f.width }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: '#fafaf7', borderBottom: '1px solid #f0ede3' }}>
              <Th light>Student</Th>
              <Th light align="center">Lesson</Th>
              {COMMENT_FIELDS.map(f => <Th light key={f.key}>{f.label}</Th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.studentId}::${r.tabKey}::${r.rowIdx}`} style={{ borderTop: i > 0 ? '1px solid #f0ede3' : 'none' }}>
                <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                  <NameLink onClick={() => onNavigate && onNavigate('Students', r.studentId)}>{r.studentName}</NameLink>
                </td>
                <td style={{ padding: '8px 12px', verticalAlign: 'top', textAlign: 'center', color: 'var(--ink-soft)' }}>{r.row.lessonNo}</td>
                {COMMENT_FIELDS.map(f => (
                  <CommentCell key={f.key} value={r.row[f.key]} onChange={v => updateRow(r.studentId, r.tabKey, r.rowIdx, f.key, v)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Shared bits ----------
const selStyle = {
  padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4',
  borderRadius: 8, background: '#fff', color: 'var(--brand-dark-brown)',
}

function Th({ children, align = 'left', light }) {
  return <th style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
    padding: '10px 12px', textAlign: align, whiteSpace: 'nowrap',
    color: light ? 'var(--ink-soft)' : undefined,
  }}>{children}</th>
}

// One editable notes cell — shared by the History table and every
// Register class-card table, so both views use the exact same
// editing widget and the exact same onChange -> updateRow() write
// path (i.e. one place this ever writes data, not two).
/* The focus ring is CSS, not a style mutated in an onFocus handler. The
   handler version was undone by the next render — and this box re-renders
   on every keystroke, so the ring vanished the moment you started typing. */
const COMMENT_CSS = `
.cmt-note{width:100%;min-height:40px;box-sizing:border-box;border:1px solid #d5d0c4;
    outline:none;resize:vertical;font-family:inherit;font-size:12.5px;background:#fff;
    padding:6px 8px;border-radius:6px;color:var(--ink)}
.cmt-note:focus{border-color:#5FA09E;box-shadow:0 0 0 1px #5FA09E}
.cmt-note::placeholder{color:#b9b3a6}
`

function CommentCell({ value, onChange }) {
  /* The box is always drawn. It used to be transparent until focused, so a
     lesson with no note looked like empty space and you had to know to click
     there — the one thing this page is for was the thing you could not see.
     Focus deepens the border rather than conjuring one. */
  return (
    <td style={{ padding: '2px' }}>
      <textarea
        className="cmt-note"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={Math.max(2, (value || '').split('\n').length)}
        placeholder="Add a note…"
      />
    </td>
  )
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
