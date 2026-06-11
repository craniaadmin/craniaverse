import { useState, useMemo } from 'react'
import { Plus, Filter } from 'lucide-react'
import { useStore } from '../data/store'

// Convert "16:30:00" → "4:30 pm"
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

// ─── Number / Code generators ──────────────────────────────────────────────
// TODO: replace with the real equation when defined.
// Inputs available on `p`: category, subject, location, gradeFrom, gradeTo, title, etc.
// Currently returns deterministic placeholder strings so new rows aren't blank.
function generateNumber(p, existingProgramsCount) {
  // TBD equation — placeholder: sequential 5-digit number starting at 90000
  return String(90000 + existingProgramsCount)
}
function generateCode(p) {
  // TBD equation — placeholder: LOC-CAT-SUBJECT-TITLE
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
const GRID_COLS = '70px 70px 170px 110px 80px 210px 70px 100px 80px 110px 100px 380px'
const TABLE_MIN_WIDTH = 1564

function blankProgram() {
  return {
    number: '', code: '', category: '', subject: '',
    gradeFrom: '', gradeTo: '', title: 'NEW PROGRAM',
    duration: '', sessions: null, period: '/week', rateHr: null, fees: null,
    location: '', active: true, offerings: [],
  }
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

export default function Programs() {
  const { staff, programs, setPrograms } = useStore()
  const teacherOptions = useMemo(
    () => staff.map(s => `${s.firstName} ${s.lastName}`.trim()).filter(Boolean).sort(),
    [staff]
  )
  const [filter, setFilter] = useState({ field: null, value: null }) // { field: 'category', value: 'FLEX' }
  const [filterOpen, setFilterOpen] = useState(false)
  const [activePane, setActivePane] = useState(FILTER_FIELDS[2].key) // default to Category

  // Unique values for the currently hovered/active filter field
  const valuesForField = useMemo(() => {
    if (!activePane) return []
    const set = new Set(programs.map(p => p[activePane]).filter(Boolean))
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
  }, [programs, activePane])

  const visible = useMemo(() => {
    if (!filter.field || filter.value == null) return programs
    return programs.filter(p => p[filter.field] === filter.value)
  }, [programs, filter])

  const filterLabel = filter.field
    ? `${FILTER_FIELDS.find(f => f.key === filter.field)?.label}: ${filter.value}`
    : 'Filter'

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
    setPrograms(p => {
      const np = blankProgram()
      np.number = generateNumber(np, p.length)
      np.code = generateCode(np)
      return [np, ...p]
    })
    setFilter({ field: null, value: null })
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="page-title" style={{ marginRight: 'auto' }}>Programs</h2>

        {/* Filter */}
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
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 10,
              background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,.1)',
              display: 'grid', gridTemplateColumns: '140px 320px',
              height: 360, overflow: 'hidden',
            }}>
              {/* Left pane: field selector */}
              <div style={{
                borderRight: '1px solid var(--line)', background: '#fafbfb',
                overflowY: 'auto', minHeight: 0,
              }}>
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
              {/* Right pane: values */}
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

        <button className="icon-btn solid" onClick={addProgram} title="Add new program">
          <Plus size={22} />
        </button>
      </div>

      {/* Scroll container — bounds both axes inside the viewport so scrollbars are reachable from the top */}
      <div style={{
        overflow: 'auto',
        width: '100%', maxWidth: '100%',
        height: 'calc(100vh - 220px)', // leaves room for top nav + page header + breathing room
        border: '1px solid var(--line)', borderRadius: 8,
        background: '#fff',
      }}>

      {/* Header — sticky to top of the scroll container so it stays visible as you scroll rows */}
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
              {p.fees ? `$${p.fees}` : ''}{p.fees ? ' /month' : ''}
            </div>
            <div style={CELL_BOX}>{p.location}</div>

            {/* Offerings sub-panel — caps row height so the whole table stays compact */}
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
          </div>
        )
      })}

      </div> {/* /horizontal scroll container */}
    </div>
  )
}
