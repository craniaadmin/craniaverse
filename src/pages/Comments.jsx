// Comments — a cross-student feed over the same lesson rows shown at
// the bottom of each Student's own page. No separate storage: this
// page reads/writes the same PocketBase `comments` collection via
// useCommentsRows(), so editing a lesson's notes here immediately
// shows up on that student's own page, and vice versa.
import { useMemo, useState } from 'react'
import { Search, Edit2 } from 'lucide-react'
import { useCommentsRows } from '../data/useCommentsRows'

const COMMENT_FIELDS = [
  { key: 'lessonPlan',         label: 'Lesson Plan' },
  { key: 'homeworkCompleted',  label: 'Homework Completed' },
  { key: 'performance',        label: 'Performance' },
  { key: 'behaviour',          label: 'Behaviour' },
  { key: 'homeworkAssigned',   label: 'Homework Assigned' },
  { key: 'parentComm',         label: 'Parent Communication' },
  { key: 'teacher',            label: 'Teacher' },
]

const hasNotes = (row) => COMMENT_FIELDS.some(f => (row[f.key] || '').trim())

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const daysAgo = (iso) => {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return Infinity
  return Math.round((Date.now() - d.getTime()) / 86400000)
}

export default function Comments({ onNavigate }) {
  const { flatRows, updateRowFields, loading, status, studentCount } = useCommentsRows()
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('all')
  const [showBlank, setShowBlank] = useState(false)
  const [editing, setEditing] = useState(null) // the flat row entry being edited

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
        <h2 className="page-title">Comments</h2>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head">
        <h2 className="page-title">Comments</h2>
      </div>

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — showing cached data.
        </div>
      )}

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

      {/* Feed */}
      {visible.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--brand-shadow)', padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          {withNotes.length === 0
            ? 'No comments yet — they appear here once a teacher logs notes on a lesson.'
            : 'No entries match your filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(r => (
            <CommentCard
              key={`${r.studentId}::${r.tabKey}::${r.rowIdx}`}
              entry={r}
              onOpenStudent={() => onNavigate && onNavigate('Students', r.studentId)}
              onEdit={() => setEditing(r)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateRowFields(editing.studentId, editing.tabKey, editing.rowIdx, patch)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

// ---------- Card ----------
function CommentCard({ entry, onOpenStudent, onEdit }) {
  const { row } = entry
  const filled = COMMENT_FIELDS.filter(f => (row[f.key] || '').trim())
  return (
    <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--brand-shadow)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: filled.length ? 10 : 0 }}>
        <NameLink onClick={onOpenStudent}>{entry.studentName}</NameLink>
        <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{entry.program}</span>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(row.date)} · Lesson {row.lessonNo}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onEdit}
          title="Edit notes"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4, display: 'inline-flex' }}
        ><Edit2 size={14} /></button>
      </div>
      {filled.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px 20px' }}>
          {filled.map(f => (
            <div key={f.key} style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink-soft)' }}>{f.label}: </span>
              <span style={{ color: 'var(--ink)' }}>{row[f.key]}</span>
            </div>
          ))}
        </div>
      )}
      {filled.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No notes yet — click the pencil to add some.</div>
      )}
    </div>
  )
}

// ---------- Edit modal ----------
function EditModal({ entry, onClose, onSave }) {
  const [draft, setDraft] = useState(() => {
    const out = {}
    for (const f of COMMENT_FIELDS) out[f.key] = entry.row[f.key] || ''
    return out
  })

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <h2>{entry.studentName} — {entry.program}</h2>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -10, marginBottom: 16 }}>
          {fmtDate(entry.row.date)} · Lesson {entry.row.lessonNo}
        </div>

        {COMMENT_FIELDS.map(f => (
          <div className="kb-field" key={f.key}>
            <label>{f.label}</label>
            <textarea
              rows={f.key === 'lessonPlan' || f.key === 'performance' ? 3 : 2}
              value={draft[f.key]}
              onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
            />
          </div>
        ))}

        <div className="kb-actions">
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={() => onSave(draft)}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Shared bits ----------
const selStyle = {
  padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4',
  borderRadius: 8, background: '#fff', color: 'var(--brand-dark-brown)',
}

function MetricTile({ label, value, hint }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px',
      boxShadow: '0 1px 3px rgba(20,30,45,.06)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function NameLink({ children, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        color: 'var(--brand-dark-blue)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        textDecoration: 'underline', textDecorationColor: 'transparent',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = 'var(--brand-dark-blue)' }}
      onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = 'transparent' }}
    >{children}</span>
  )
}
