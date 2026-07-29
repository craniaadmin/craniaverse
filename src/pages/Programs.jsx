import { useMemo, useState } from 'react'
import { Plus, Filter, Search, Edit2, Trash2, Download } from 'lucide-react'
import { useStore } from '../data/store'

// Convert "16:30" / "16:30:00" -> "4:30 pm"
function fmtTime(t) {
  if (!t) return ''
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return t
  let h = parseInt(m[1], 10)
  const min = m[2]
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${min} ${ampm}`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PLATFORMS = ['In-Person', 'Online', 'In-Person/Online']
const PERIODS = ['/week', '/month', '/term', '/year']
const COST_UNITS = ['', '/week', '/month', '/term', '/year', '/session', '/class']

// ─── Number / Code generators ──────────────────────────────────────────────
// TODO: replace with the real equation once defined. Deterministic
// placeholders so new rows aren't blank.
function generateNumber(p, existingProgramsCount) {
  return String(90000 + existingProgramsCount)
}
function generateCode(p) {
  const slug = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  const loc = (p.location || 'TBD').slice(0, 2).toUpperCase()
  return [loc, slug(p.category), slug(p.subject), slug(p.title)].filter(Boolean).join('-') || 'TBD'
}

const HEAD_STYLE = {
  background: '#3d8e90', color: '#fff', fontWeight: 700, fontSize: 11,
  letterSpacing: '.4px', padding: '5px 8px', borderRadius: 5, textAlign: 'left',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  display: 'flex', alignItems: 'center', height: 26, boxSizing: 'border-box',
}

const CELL_BOX = {
  background: '#eef1f2', borderRadius: 5, padding: '5px 8px',
  fontSize: 12, color: 'var(--ink)', height: 26, boxSizing: 'border-box',
  display: 'flex', alignItems: 'center', minWidth: 0,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

// Compact widths sized to fit the longest expected content.
const GRID_COLS = '70px 70px 170px 110px 80px 210px 70px 100px 80px 110px 100px 380px 70px'
const TABLE_MIN_WIDTH = 1634

function blankProgram() {
  return {
    number: '', code: '', category: '', subject: '',
    gradeFrom: '', gradeTo: '', title: 'NEW PROGRAM', year: '', ageRange: '',
    duration: '', sessions: 1, period: '/week', rateHr: null, fees: null,
    costUnit: '', totalHours: null, description: '',
    location: '', active: true, offerings: [],
  }
}
function blankOffering() {
  return { active: true, day: 'Mon', start: '16:30', end: '17:25', spots: null, platform: 'In-Person', teacher: '' }
}

// Fields the user can filter by
const FILTER_FIELDS = [
  { key: 'number', label: 'Number' },
  { key: 'code', label: 'Code' },
  { key: 'category', label: 'Category' },
  { key: 'subject', label: 'Subject' },
  { key: 'title', label: 'Program Title' },
  { key: 'location', label: 'Location' },
]

function offeringWeeklyHours(prog) {
  if (prog.period && prog.period !== '/week') return 0
  const mins = Number(prog.duration) || 0
  const activeCount = (prog.offerings || []).filter(o => o.active !== false).length
  return (mins * activeCount) / 60
}

export default function Programs() {
  const { staff, programs, setPrograms } = useStore()
  const teacherOptions = useMemo(
    () => staff.map(s => `${s.firstName} ${s.lastName}`.trim()).filter(Boolean).sort(),
    [staff]
  )
  const [filter, setFilter] = useState({ field: null, value: null }) // { field: 'category', value: 'FLEX' }
  const [filterOpen, setFilterOpen] = useState(false)
  const [activePane, setActivePane] = useState(FILTER_FIELDS[2].key) // default to Category
  const [search, setSearch] = useState('')
  const [availFilter, setAvailFilter] = useState('all') // all | open | full
  const [editing, setEditing] = useState(null) // null | { mode:'new'|'edit', program, index }

  // Unique values for the currently hovered/active filter field
  const valuesForField = useMemo(() => {
    if (!activePane) return []
    const set = new Set(programs.map(p => p[activePane]).filter(Boolean))
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
  }, [programs, activePane])

  const q = search.trim().toLowerCase()
  const visible = useMemo(() => {
    let list = programs
    if (filter.field && filter.value != null) list = list.filter(p => p[filter.field] === filter.value)
    if (q) {
      list = list.filter(p => {
        const hay = [p.title, p.number, p.code, p.category, p.subject, p.location,
          ...(p.offerings || []).map(o => o.teacher)].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
    }
    if (availFilter !== 'all') {
      list = list.filter(p => {
        const openOfferings = (p.offerings || []).filter(o => o.active !== false && (o.spots == null || o.spots > 0))
        return availFilter === 'open' ? openOfferings.length > 0 : openOfferings.length === 0 && (p.offerings || []).length > 0
      })
    }
    return list
  }, [programs, filter, q, availFilter])

  const filterLabel = filter.field
    ? `${FILTER_FIELDS.find(f => f.key === filter.field)?.label}: ${filter.value}`
    : 'Filter'

  // ── Metrics ──
  const metrics = useMemo(() => {
    const activeCount = programs.filter(p => p.active !== false).length
    const scheduledEntries = programs.reduce((n, p) => n + (p.offerings || []).length, 0)
    let spotsOpen = 0, classesWithSpots = 0
    for (const p of programs) {
      for (const o of (p.offerings || [])) {
        if (o.active === false) continue
        if (o.spots != null && o.spots > 0) { spotsOpen += o.spots; classesWithSpots++ }
      }
    }
    const weeklyHours = programs.reduce((n, p) => n + offeringWeeklyHours(p), 0)
    return { activeCount, scheduledEntries, spotsOpen, classesWithSpots, weeklyHours }
  }, [programs])

  const toggleProgram = (i) => {
    setPrograms(p => p.map((row, idx) => idx === i ? { ...row, active: !row.active } : row))
  }
  const toggleOffering = (i, j) => {
    setPrograms(p => p.map((row, idx) => idx === i
      ? { ...row, offerings: row.offerings.map((o, oi) => oi === j ? { ...o, active: !o.active } : o) }
      : row))
  }
  const setOfferingTeacher = (i, j, teacher) => {
    setPrograms(p => p.map((row, idx) => idx === i
      ? { ...row, offerings: row.offerings.map((o, oi) => oi === j ? { ...o, teacher } : o) }
      : row))
  }
  const addProgram = () => {
    const np = blankProgram()
    np.number = generateNumber(np, programs.length)
    np.code = generateCode(np)
    setEditing({ mode: 'new', program: np, index: null })
  }
  const editProgram = (i) => setEditing({ mode: 'edit', program: programs[i], index: i })
  const deleteProgram = (i) => {
    const p = programs[i]
    if (!confirm(`Delete "${p.title || 'this program'}" (${p.location || 'no location'})? This also deletes its ${(p.offerings || []).length} scheduled offering(s).`)) return
    setPrograms(list => list.filter((_, idx) => idx !== i))
  }
  const saveProgram = (form) => {
    if (editing.mode === 'new') {
      setPrograms(list => [form, ...list])
    } else {
      setPrograms(list => list.map((row, idx) => idx === editing.index ? form : row))
    }
    setEditing(null)
  }

  const exportCsv = () => {
    const header = ['Number', 'Code', 'Category', 'Subject', 'Title', 'Year', 'Grade From', 'Grade To',
      'Duration (min)', 'Sessions', 'Period', 'Rate/Hr', 'Fees', 'Cost Per', 'Total Hrs', 'Location', 'Active',
      'Offering Day', 'Offering Start', 'Offering End', 'Offering Spots', 'Offering Platform', 'Offering Teacher']
    const rows = []
    for (const p of programs) {
      const base = [p.number, p.code, p.category, p.subject, p.title, p.year, p.gradeFrom, p.gradeTo,
        p.duration, p.sessions, p.period, p.rateHr, p.fees, p.costUnit, p.totalHours, p.location, p.active]
      if (!p.offerings || p.offerings.length === 0) {
        rows.push([...base, '', '', '', '', '', ''])
      } else {
        for (const o of p.offerings) rows.push([...base, o.day, o.start, o.end, o.spots, o.platform, o.teacher])
      }
    }
    const csv = [header, ...rows].map(row => row.map(cell => {
      const str = cell == null ? '' : String(cell)
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'crania-programs.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="page-title" style={{ marginRight: 'auto' }}>Programs</h2>
        <button className="icon-btn" onClick={exportCsv} title="Export CSV" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '8px 12px' }}>
          <Download size={15} /> Export CSV
        </button>
        <button className="icon-btn solid" onClick={addProgram} title="Add new program">
          <Plus size={22} />
        </button>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <MetricTile label="Programs" value={programs.length} hint={`${metrics.scheduledEntries} scheduled entries`} />
        <MetricTile label="Active" value={metrics.activeCount} hint={`${programs.length - metrics.activeCount} inactive`} />
        <MetricTile label="Spots Open" value={metrics.spotsOpen} hint={`across ${metrics.classesWithSpots} classes`} color="#a12626" />
        <MetricTile label="Weekly Hours" value={metrics.weeklyHours.toFixed(1)} hint="contact hours across the week" color="var(--brand-dark-blue)" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search programs, instructors, codes…"
            style={{ width: '100%', padding: '7px 8px 7px 30px', fontSize: 13, border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }}
          />
        </div>
        <select value={availFilter} onChange={e => setAvailFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }}>
          <option value="all">Any Availability</option>
          <option value="open">Spots Open</option>
          <option value="full">Full</option>
        </select>

        {/* Category/field filter */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setFilterOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: filter.field ? 'var(--logo-teal)' : '#eef1f2',
              color: filter.field ? '#fff' : 'var(--ink)',
              border: 'none', borderRadius: 8, padding: '8px 14px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <Filter size={16} />
            {filterLabel}
            {filter.field && (
              <span
                onClick={(e) => { e.stopPropagation(); setFilter({ field: null, value: null }) }}
                style={{ marginLeft: 4, opacity: .8, padding: '0 4px' }}
                title="Clear filter"
              >×</span>
            )}
          </button>
          {filterOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 10,
              background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,.1)',
              display: 'grid', gridTemplateColumns: '140px 320px',
              height: 360, overflow: 'hidden',
            }}>
              <div style={{ borderRight: '1px solid var(--line)', background: '#fafbfb', overflowY: 'auto', minHeight: 0 }}>
                {FILTER_FIELDS.map(f => (
                  <div
                    key={f.key}
                    onClick={() => setActivePane(f.key)}
                    style={{
                      padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                      background: activePane === f.key ? '#fff' : 'transparent',
                      fontWeight: activePane === f.key ? 700 : 500,
                      color: activePane === f.key ? 'var(--logo-teal)' : 'var(--ink-soft)',
                      borderLeft: activePane === f.key ? '3px solid var(--logo-teal)' : '3px solid transparent',
                    }}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
              <div style={{ overflowY: 'auto', minHeight: 0 }}>
                {valuesForField.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>No values.</div>
                ) : valuesForField.map(v => {
                  const isActive = filter.field === activePane && filter.value === v
                  return (
                    <div
                      key={v}
                      onClick={() => { setFilter({ field: activePane, value: v }); setFilterOpen(false) }}
                      style={{
                        padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                        background: isActive ? 'rgba(61,142,144,.10)' : 'transparent',
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? 'var(--logo-teal)' : 'var(--ink)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f5f5f5' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                      title={v}
                    >
                      {v}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)' }}>{visible.length} of {programs.length}</div>
      </div>

      {/* Scroll container */}
      <div style={{
        overflow: 'auto', width: '100%', maxWidth: '100%',
        height: 'calc(100vh - 300px)',
        border: '1px solid var(--line)', borderRadius: 8, background: '#fff',
      }}>

      <div style={{
        display: 'grid', gridTemplateColumns: GRID_COLS,
        gap: 6, marginBottom: 10, minWidth: TABLE_MIN_WIDTH,
        position: 'sticky', top: 0, zIndex: 5,
        background: '#fff', padding: '12px 12px 6px',
      }}>
        <div style={HEAD_STYLE}>Active</div>
        <div style={HEAD_STYLE}>Number</div>
        <div style={HEAD_STYLE}>Code</div>
        <div style={HEAD_STYLE}>Category</div>
        <div style={HEAD_STYLE}>Subject</div>
        <div style={HEAD_STYLE}>Program Title</div>
        <div style={HEAD_STYLE}>Duration</div>
        <div style={HEAD_STYLE}>Sessions</div>
        <div style={HEAD_STYLE}>Rate/Hr</div>
        <div style={HEAD_STYLE}>Fees</div>
        <div style={HEAD_STYLE}>Location</div>
        <div style={HEAD_STYLE}>Offerings</div>
        <div style={HEAD_STYLE}></div>
      </div>

      {visible.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic' }}>
          No programs match this filter.
        </div>
      )}

      {visible.map((p) => {
        const i = programs.indexOf(p)
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: GRID_COLS,
            gap: 6, marginBottom: 5, alignItems: 'start',
            opacity: p.active ? 1 : 0.5, minWidth: TABLE_MIN_WIDTH,
            padding: '0 10px',
          }}>
            <div style={{ ...CELL_BOX, justifyContent: 'center', background: 'transparent' }}>
              <input
                type="checkbox"
                checked={p.active}
                onChange={() => toggleProgram(i)}
                style={{ width: 18, height: 18, accentColor: 'var(--logo-teal)', cursor: 'pointer' }}
              />
            </div>
            <div style={CELL_BOX}>{p.number}</div>
            <div style={CELL_BOX}>{p.code}</div>
            <div style={CELL_BOX}>{p.category}</div>
            <div style={CELL_BOX}>{p.subject}</div>
            <div style={{ ...CELL_BOX, fontWeight: 600 }}>{p.title}</div>
            <div style={CELL_BOX}>{p.duration ? `${p.duration} min` : ''}</div>
            <div style={CELL_BOX}>
              {p.sessions ?? ''}{p.period ? ` ${p.period}` : ''}
            </div>
            <div style={CELL_BOX}>{p.rateHr ? `$${p.rateHr.toFixed(2)}` : ''}</div>
            <div style={CELL_BOX}>
              {p.fees ? `$${p.fees}` : ''}{p.fees ? (p.costUnit || ' /month') : ''}
            </div>
            <div style={CELL_BOX}>{p.location}</div>

            {/* Offerings sub-panel — read-only preview; edit via the pencil icon */}
            <div style={{
              background: '#eef1f2', borderRadius: 5, padding: '5px 8px',
              minWidth: 0, maxHeight: 170, overflowY: 'auto', overflowX: 'hidden',
            }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '32px 44px 90px 44px 1fr',
                gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)',
                textDecoration: 'underline', paddingBottom: 3,
              }}>
                <div>Active</div>
                <div>Day</div>
                <div>Time</div>
                <div>Spots</div>
                <div>Teacher</div>
              </div>
              {p.offerings.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '4px 0' }}>
                  No offerings yet.
                </div>
              ) : p.offerings.map((o, j) => (
                <div key={j} style={{
                  display: 'grid', gridTemplateColumns: '32px 44px 90px 44px 1fr',
                  gap: 4, fontSize: 11, padding: '1px 0',
                  opacity: o.active ? 1 : 0.5,
                }}>
                  <div>
                    <input
                      type="checkbox"
                      checked={o.active}
                      onChange={() => toggleOffering(i, j)}
                      style={{ width: 14, height: 14, accentColor: 'var(--logo-teal)', cursor: 'pointer' }}
                    />
                  </div>
                  <div>{o.day}</div>
                  <div>{fmtTime(o.start)}</div>
                  <div>{o.spots ?? ''}</div>
                  <select
                    value={o.teacher || ''}
                    onChange={(e) => setOfferingTeacher(i, j, e.target.value)}
                    title={o.teacher || ''}
                    style={{
                      minWidth: 0, width: '100%',
                      fontFamily: 'inherit', fontSize: 11,
                      color: o.teacher ? 'var(--ink)' : 'var(--muted)',
                      background: 'transparent', border: '1px solid transparent',
                      borderRadius: 3, padding: '1px 2px', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--line)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}
                  >
                    <option value="">—</option>
                    {o.teacher && !teacherOptions.includes(o.teacher) && (
                      <option value={o.teacher}>{o.teacher}</option>
                    )}
                    {teacherOptions.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ ...CELL_BOX, background: 'transparent', justifyContent: 'center', gap: 4 }}>
              <button className="icon-btn" title="Edit program" onClick={() => editProgram(i)} style={{ padding: 4 }}>
                <Edit2 size={14} />
              </button>
              <button className="icon-btn" title="Delete program" onClick={() => deleteProgram(i)} style={{ padding: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )
      })}

      </div>

      {editing && (
        <ProgramModal
          mode={editing.mode}
          initial={editing.program}
          teacherOptions={teacherOptions}
          onClose={() => setEditing(null)}
          onSave={saveProgram}
          onDelete={editing.mode === 'edit' ? () => { deleteProgram(editing.index); setEditing(null) } : null}
        />
      )}
    </div>
  )
}

function MetricTile({ label, value, hint, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 3px rgba(20,30,45,.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

// ─── Program editor (add/edit) ─────────────────────────────────────────────
// Offerings are edited as part of THIS SAME program object — "add
// offering" always appends to program.offerings[], it never creates a
// second top-level program row. That's the fix for the bug in the
// source mockup/export, where "add another time slot" created a whole
// new duplicate program entry instead (see the programs-import notes
// in server/programs.json's git history / commit message).
function ProgramModal({ mode, initial, teacherOptions, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(initial)
  const set = (patch) => setForm(f => ({ ...f, ...patch }))

  const setOffering = (idx, patch) => {
    setForm(f => ({ ...f, offerings: f.offerings.map((o, i) => i === idx ? { ...o, ...patch } : o) }))
  }
  const addOffering = () => setForm(f => ({ ...f, offerings: [...(f.offerings || []), blankOffering()] }))
  const removeOffering = (idx) => setForm(f => ({ ...f, offerings: f.offerings.filter((_, i) => i !== idx) }))

  const handleSave = () => {
    if (!form.title.trim()) { alert('Please enter a program title.'); return }
    onSave({
      ...form,
      title: form.title.trim(),
      number: String(form.number || '').trim(),
      code: String(form.code || '').trim(),
      duration: form.duration === '' ? '' : Number(form.duration),
      sessions: form.sessions === '' ? '' : Number(form.sessions),
      rateHr: form.rateHr === '' || form.rateHr == null ? null : Number(form.rateHr),
      fees: form.fees === '' || form.fees == null ? null : Number(form.fees),
      totalHours: form.totalHours === '' || form.totalHours == null ? null : Number(form.totalHours),
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Program' : 'New Program'}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12 }}>
          <div className="kb-field"><label>Program #</label><input value={form.number} onChange={e => set({ number: e.target.value })} /></div>
          <div className="kb-field"><label>Program Name</label><input value={form.title} onChange={e => set({ title: e.target.value })} autoFocus /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Program Code</label><input value={form.code} onChange={e => set({ code: e.target.value })} /></div>
          <div className="kb-field"><label>Year</label><input value={form.year} onChange={e => set({ year: e.target.value })} placeholder="e.g. 2026–27" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Category</label><input value={form.category} onChange={e => set({ category: e.target.value })} /></div>
          <div className="kb-field"><label>Subject</label><input value={form.subject} onChange={e => set({ subject: e.target.value })} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Grade From</label><input value={form.gradeFrom} onChange={e => set({ gradeFrom: e.target.value })} /></div>
          <div className="kb-field"><label>Grade To</label><input value={form.gradeTo} onChange={e => set({ gradeTo: e.target.value })} /></div>
          <div className="kb-field"><label>Location</label><input value={form.location} onChange={e => set({ location: e.target.value })} placeholder="e.g. Boardwalk" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Duration (min)</label><input type="number" min="0" value={form.duration} onChange={e => set({ duration: e.target.value })} /></div>
          <div className="kb-field"><label># of Lessons</label><input type="number" min="0" value={form.sessions} onChange={e => set({ sessions: e.target.value })} /></div>
          <div className="kb-field"><label>Per</label>
            <select value={form.period} onChange={e => set({ period: e.target.value })}>
              <option value="">—</option>
              {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Rate ($/hr)</label><input type="number" min="0" step="0.01" value={form.rateHr ?? ''} onChange={e => set({ rateHr: e.target.value })} /></div>
          <div className="kb-field"><label>Fees ($)</label><input type="number" min="0" step="0.01" value={form.fees ?? ''} onChange={e => set({ fees: e.target.value })} /></div>
          <div className="kb-field"><label>Cost Per</label>
            <select value={form.costUnit} onChange={e => set({ costUnit: e.target.value })}>
              {COST_UNITS.map(c => <option key={c} value={c}>{c || 'one-time'}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Total Hrs</label><input type="number" min="0" step="0.01" value={form.totalHours ?? ''} onChange={e => set({ totalHours: e.target.value })} /></div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginTop: 22 }}>
            <input type="checkbox" checked={!!form.active} onChange={e => set({ active: e.target.checked })} /> Active
          </label>
        </div>
        <div className="kb-field"><label>Comments / Notes</label><textarea rows={2} value={form.description} onChange={e => set({ description: e.target.value })} /></div>

        {/* Offerings — day/time/location slots. Always edits this program's own array. */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Offerings</div>
          {(form.offerings || []).length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 8 }}>No offerings yet — add a day/time below.</div>
          )}
          {(form.offerings || []).map((o, idx) => (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '30px 90px 100px 100px 70px 1fr 1fr 26px',
              gap: 6, alignItems: 'center', marginBottom: 6,
            }}>
              <input type="checkbox" checked={o.active !== false} onChange={e => setOffering(idx, { active: e.target.checked })}
                style={{ accentColor: 'var(--logo-teal)' }} />
              <select value={o.day} onChange={e => setOffering(idx, { day: e.target.value })} style={{ fontSize: 12, padding: '5px 4px', border: '1px solid #d5d0c4', borderRadius: 6 }}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <input type="time" value={o.start} onChange={e => setOffering(idx, { start: e.target.value })} style={{ fontSize: 12, padding: '5px 4px', border: '1px solid #d5d0c4', borderRadius: 6 }} />
              <input type="time" value={o.end} onChange={e => setOffering(idx, { end: e.target.value })} style={{ fontSize: 12, padding: '5px 4px', border: '1px solid #d5d0c4', borderRadius: 6 }} />
              <input type="number" min="0" placeholder="spots" value={o.spots ?? ''} onChange={e => setOffering(idx, { spots: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ fontSize: 12, padding: '5px 4px', border: '1px solid #d5d0c4', borderRadius: 6 }} />
              <select value={o.platform || ''} onChange={e => setOffering(idx, { platform: e.target.value })} style={{ fontSize: 12, padding: '5px 4px', border: '1px solid #d5d0c4', borderRadius: 6 }}>
                <option value="">—</option>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input list="progTeacherList" placeholder="Teacher" value={o.teacher || ''} onChange={e => setOffering(idx, { teacher: e.target.value })}
                style={{ fontSize: 12, padding: '5px 4px', border: '1px solid #d5d0c4', borderRadius: 6 }} />
              <button onClick={() => removeOffering(idx)} title="Remove offering"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}>×</button>
            </div>
          ))}
          <datalist id="progTeacherList">
            {teacherOptions.map(t => <option key={t} value={t} />)}
          </datalist>
          <button
            onClick={addOffering}
            style={{
              marginTop: 4, background: 'transparent', border: '1px dashed var(--brand-dark-blue)',
              borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
              color: 'var(--brand-dark-blue)', cursor: 'pointer', width: '100%',
            }}>
            + Add offering
          </button>
        </div>

        <div className="kb-actions">
          {onDelete && <button className="del" onClick={onDelete}>Delete</button>}
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
