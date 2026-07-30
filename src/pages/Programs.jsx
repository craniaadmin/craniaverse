import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../data/store'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'ngrok-skip-browser-warning': 'true' }

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

function generateNumber(_p, count) { return String(90000 + count) }
function generateCode(p) {
  const slug = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  const loc = (p.location || 'TBD').slice(0, 2).toUpperCase()
  return [loc, slug(p.category), slug(p.subject), slug(p.title)].filter(Boolean).join('-') || 'TBD'
}

const TABLE_COLS = [
  { id: 'active',    label: 'Active',        w: '62px' },
  { id: 'number',    label: 'Number',        w: '70px' },
  { id: 'code',      label: 'Code',          w: '150px' },
  { id: 'category',  label: 'Category',      w: '130px' },
  { id: 'subject',   label: 'Subject',       w: '90px' },
  { id: 'title',     label: 'Program',       w: '210px' },
  { id: 'duration',  label: 'Duration',      w: '74px' },
  { id: 'sessions',  label: 'Lessons',       w: '100px' },
  { id: 'rateHr',    label: 'Rate/Hr',       w: '80px' },
  { id: 'fees',      label: 'Fees',          w: '110px' },
  { id: 'location',  label: 'Location',      w: '100px' },
  { id: 'offerings', label: 'Offerings',     w: '380px' },
  { id: 'edit',      label: '',              w: '59px' },
]

const FILTER_FIELDS = [
  { key: 'number', label: 'Number' },
  { key: 'code', label: 'Code' },
  { key: 'category', label: 'Category' },
  { key: 'subject', label: 'Subject' },
  { key: 'title', label: 'Program Title' },
  { key: 'location', label: 'Location' },
]

const PG_CSS = `
.pg-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.pg-actions button{background:#fff;border:1px solid #e2ded2;color:var(--brand-dark-brown,#2E2516);padding:6px 12px;font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit}
.pg-actions button:hover{background:#f4f2ea}
.pg-actions button:disabled{opacity:.4;cursor:default}
.pg-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.pg-metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 1px 3px rgba(46,37,22,.15);border-bottom:3px solid #5FA09E;cursor:default}
.pg-metric.m-act{border-bottom-color:#E0DE85}
.pg-metric.m-spots{border-bottom-color:#c0392b}
.pg-metric.m-hours{border-bottom-color:#A6E2F9}
.pg-metric .m-label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.pg-metric .m-value{font-size:24px;font-weight:700;color:#2E2516;font-variant-numeric:tabular-nums}
.pg-metric .m-hint{font-size:11.5px;color:#9a948a;margin-top:3px}
.pg-filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.pg-filters input[type=search]{padding:7px 12px;border:1px solid #D5D0C4;border-radius:8px;font-size:13px;color:#2E2516;background:#fff;width:220px}
.pg-filters input[type=search]::placeholder{color:#9A948A}
.pg-filters input[type=search]:focus{outline:none;border-color:#5FA09E}
.pg-filters select{padding:7px 12px;border:1px solid #D5D0C4;border-radius:8px;font-size:13px;color:#2E2516;background:#fff}
.pg-filters select:focus{outline:none;border-color:#5FA09E}
.pg-card{background:#fff;border-radius:12px 12px 0 0;box-shadow:0 1px 3px rgba(46,37,22,.15);border-left:3px solid #A6E2F9;border-right:3px solid #E0DE85;border-bottom:3px solid #5FA09E;overflow-x:auto}
.pg-card table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:5px 5px;background:#fff}
.pg-card thead th{background:#5FA09E;color:#fff;text-align:center;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;padding:6px 8px;height:26px;white-space:nowrap;border-radius:6px}
.pg-card tbody td{padding:4px 7px;background:#F1F3F4;border-radius:5px;font-size:12px;font-weight:400;vertical-align:middle;white-space:nowrap;line-height:1.35;height:22px;overflow:hidden;text-overflow:ellipsis}
.pg-card tbody tr:hover td{background:#E4EFF3}
.pg-card tbody tr.inactive td{color:#b0a99e}
.pg-card thead th.th-edit{background:transparent}
.pg-card td.td-active{text-align:center;background:transparent}
.pg-card td.td-edit{text-align:center;background:transparent;white-space:nowrap}
.pg-colspop{position:fixed;z-index:200;background:#fff;border:1px solid #E7EBE7;border-radius:12px;box-shadow:0 8px 24px rgba(46,37,22,.22);padding:8px 12px 10px;min-width:190px;max-height:360px;overflow:auto}
.pg-colspop .h{font-size:12px;color:#6B6455;font-weight:700;margin:2px 2px 7px}
.pg-colspop .ch{display:flex;align-items:center;gap:9px;padding:5px 3px;font-size:13px;font-weight:600;cursor:pointer}
.pg-colspop .ch:hover{background:#f4f2ea;border-radius:6px}
.pg-colspop .ch input{margin:0;accent-color:#5FA09E}
.pg-colspop .allrow{border-top:1px solid #EDEAE2;margin-top:4px;padding-top:4px;display:flex;gap:4px}
.pg-colspop .allrow button{background:none;border:none;color:#5FA09E;font-weight:700;font-size:12.5px;text-align:center;padding:6px 8px;border-radius:6px;flex:1;cursor:pointer}
.pg-colspop .allrow button:hover{background:#f4f2ea}
.pg-settings{position:fixed;z-index:200;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(46,37,22,.25);padding:14px;width:300px;top:120px;right:16px}
.pg-settings .sp-title{font-weight:700;font-size:14px;margin-bottom:6px;color:#2E2516}
.pg-settings .sp-hint{font-size:12px;color:#6b6455;line-height:1.4;margin-bottom:4px}
.pg-settings .sp-btnrow{display:flex;gap:8px;margin-top:4px}
.pg-settings .sp-btn{background:#5FA09E;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.pg-settings .sp-btn:hover:not(:disabled){filter:brightness(1.08)}
.pg-settings .sp-btn:disabled{opacity:.5;cursor:default}
.pg-settings .sp-list{margin-top:8px;max-height:170px;overflow-y:auto}
.pg-settings .sp-row{display:flex;align-items:center;padding:5px 6px;border-radius:6px;font-size:12px;margin-bottom:2px;background:#fff}
.pg-settings .sp-row:hover{background:#f4f2ea}
.pg-settings .sp-row .sp-rlabel{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b6455}
.pg-settings .sp-row .sp-btn{padding:3px 8px;font-size:11px}
.rowbtn{background:none;border:none;color:#c9c3b5;padding:0;font-size:12px;line-height:1;width:15px;height:15px;border-radius:4px;cursor:pointer;transition:color .15s}
.rowbtn:hover{background:none}
.rowbtn.rb-pen:hover,.rowbtn.rb-dup:hover{color:#5FA09E}
.rowbtn.rb-del:hover{color:#c0392b}
`

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

function offeringWeeklyHours(prog) {
  if (prog.period && prog.period !== '/week') return 0
  const mins = Number(prog.duration) || 0
  const activeCount = (prog.offerings || []).filter(o => o.active !== false).length
  return (mins * activeCount) / 60
}

export default function Programs() {
  const { staff, programs, setPrograms, registrations } = useStore()
  const teacherOptions = useMemo(
    () => staff.map(s => `${s.firstName} ${s.lastName}`.trim()).filter(Boolean).sort(),
    [staff],
  )

  const [filter, setFilter] = useState({ field: null, value: null })
  const [filterOpen, setFilterOpen] = useState(false)
  const [activePane, setActivePane] = useState(FILTER_FIELDS[2].key)
  const [search, setSearch] = useState('')
  const [availFilter, setAvailFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [hiddenCols, setHiddenCols] = useState({})
  const [colsOpen, setColsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const colsBtnRef = useRef(null)
  const colsPopRef = useRef(null)
  const settingsRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (colsOpen && colsPopRef.current && !colsPopRef.current.contains(e.target)
          && colsBtnRef.current && !colsBtnRef.current.contains(e.target)) setColsOpen(false)
      if (settingsOpen && settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colsOpen, settingsOpen])

  const visCols = useMemo(
    () => TABLE_COLS.filter(c => !hiddenCols[c.id]),
    [hiddenCols],
  )

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
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'crania-programs.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const toggleCol = (colId) => setHiddenCols(prev => {
    const next = { ...prev }
    if (next[colId]) delete next[colId]; else next[colId] = true
    return next
  })
  const anyHidden = TABLE_COLS.some(c => c.id !== 'edit' && hiddenCols[c.id])
  const toggleAllCols = () => {
    if (anyHidden) setHiddenCols({})
    else setHiddenCols(Object.fromEntries(TABLE_COLS.filter(c => c.id !== 'edit').map(c => [c.id, true])))
  }

  const cellVal = (p, col) => {
    switch (col.id) {
      case 'active': return null
      case 'number': return p.number
      case 'code': return p.code
      case 'category': return p.category
      case 'subject': return p.subject
      case 'title': return p.title
      case 'duration': return p.duration ? `${p.duration} min` : ''
      case 'sessions': return `${p.sessions ?? ''}${p.period ? ` ${p.period}` : ''}`
      case 'rateHr': return p.rateHr ? `$${Number(p.rateHr).toFixed(2)}` : ''
      case 'fees': return p.fees ? `$${p.fees}${p.costUnit || ' /month'}` : ''
      case 'location': return p.location
      default: return ''
    }
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <style>{PG_CSS}</style>
      <h2 className="page-title">Programs</h2>

      {/* Toolbar row — matches the v47 template */}
      <div className="pg-actions">
        <button title="Create Schedule Image" onClick={() => alert('Schedule image export coming soon.')}>🖼 Create Schedule</button>
        <button ref={colsBtnRef} title="Choose which columns are shown" onClick={() => setColsOpen(v => !v)}>👁 Columns</button>
        <button title="Settings" onClick={() => setSettingsOpen(v => !v)} style={{ marginLeft: 'auto' }}>⚙</button>
        <button onClick={exportCsv} title="Download all programs as a CSV file">⤓ Export CSV</button>
      </div>

      {colsOpen && (
        <div className="pg-colspop" ref={colsPopRef}
          style={{
            top: colsBtnRef.current ? colsBtnRef.current.getBoundingClientRect().bottom + 6 : 200,
            left: colsBtnRef.current ? Math.min(colsBtnRef.current.getBoundingClientRect().left, window.innerWidth - 220) : 100,
          }}
        >
          <div className="h">Show Columns</div>
          {TABLE_COLS.filter(c => c.id !== 'edit').map(col => (
            <label key={col.id} className="ch">
              <input type="checkbox" checked={!hiddenCols[col.id]} onChange={() => toggleCol(col.id)} />
              <span>{col.label}</span>
            </label>
          ))}
          <div className="allrow">
            <button type="button" onClick={toggleAllCols}>
              {anyHidden ? 'Show All' : 'Hide All'}
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <ProgramsSettingsPopover
          ref={settingsRef}
          onClose={() => setSettingsOpen(false)}
          programs={programs}
          setPrograms={setPrograms}
        />
      )}

      {/* Metrics */}
      <div className="pg-metrics">
        <div className="pg-metric">
          <div className="m-label">Programs</div>
          <div className="m-value">{programs.length}</div>
          <div className="m-hint">{metrics.scheduledEntries} scheduled entries</div>
        </div>
        <div className="pg-metric m-act">
          <div className="m-label">Active</div>
          <div className="m-value">{metrics.activeCount}</div>
          <div className="m-hint">{programs.length - metrics.activeCount} inactive</div>
        </div>
        <div className="pg-metric m-spots">
          <div className="m-label">Spots Open</div>
          <div className="m-value">{metrics.spotsOpen}</div>
          <div className="m-hint">across {metrics.classesWithSpots} classes</div>
        </div>
        <div className="pg-metric m-hours">
          <div className="m-label">Weekly Hours</div>
          <div className="m-value">{metrics.weeklyHours.toFixed(1)}</div>
          <div className="m-hint">contact hours across the week</div>
        </div>
      </div>

      {/* Filters row */}
      <div className="pg-filters">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search programs, instructors, codes…"
        />
        <select value={availFilter} onChange={e => setAvailFilter(e.target.value)}>
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
              background: filter.field ? '#5FA09E' : '#fff',
              color: filter.field ? '#fff' : '#2E2516',
              border: filter.field ? 'none' : '1px solid #D5D0C4', borderRadius: 8, padding: '7px 14px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            🔍 {filterLabel}
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
              background: '#fff', border: '1px solid #E7EBE7', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,.1)',
              display: 'grid', gridTemplateColumns: '140px 320px',
              height: 360, overflow: 'hidden',
            }}>
              <div style={{ borderRight: '1px solid #E7EBE7', background: '#fafbfb', overflowY: 'auto', minHeight: 0 }}>
                {FILTER_FIELDS.map(f => (
                  <div
                    key={f.key}
                    onClick={() => setActivePane(f.key)}
                    style={{
                      padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                      background: activePane === f.key ? '#fff' : 'transparent',
                      fontWeight: activePane === f.key ? 700 : 500,
                      color: activePane === f.key ? '#5FA09E' : '#6B6455',
                      borderLeft: activePane === f.key ? '3px solid #5FA09E' : '3px solid transparent',
                    }}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
              <div style={{ overflowY: 'auto', minHeight: 0 }}>
                {valuesForField.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 13, color: '#9A948A', fontStyle: 'italic' }}>No values.</div>
                ) : valuesForField.map(v => {
                  const isActive = filter.field === activePane && filter.value === v
                  return (
                    <div
                      key={v}
                      onClick={() => { setFilter({ field: activePane, value: v }); setFilterOpen(false) }}
                      style={{
                        padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                        background: isActive ? 'rgba(95,160,158,.10)' : 'transparent',
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#5FA09E' : '#2E2516',
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

        <button onClick={addProgram} style={{
          marginLeft: 'auto', background: '#A6E2F9', color: '#2E2516',
          border: 'none', borderRadius: 8, padding: '8px 14px',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          + Add Program
        </button>
      </div>

      {/* Table */}
      <div className="pg-card">
        <table>
          <thead>
            <tr>
              {visCols.map(col => (
                <th key={col.id} className={col.id === 'edit' ? 'th-edit' : ''}
                  style={{ width: col.w, minWidth: col.w }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={visCols.length} style={{ textAlign: 'center', color: '#9A948A', padding: 40 }}>No programs match this filter.</td></tr>
            )}
            {visible.map((p) => {
              const i = programs.indexOf(p)
              return (
                <tr key={i} className={p.active === false ? 'inactive' : ''}>
                  {visCols.map(col => {
                    if (col.id === 'active') {
                      return (
                        <td key={col.id} className="td-active">
                          <input type="checkbox" checked={p.active !== false} onChange={() => toggleProgram(i)}
                            style={{ width: 14, height: 14, accentColor: '#5FA09E', cursor: 'pointer' }} />
                        </td>
                      )
                    }
                    if (col.id === 'offerings') {
                      return (
                        <td key={col.id} style={{ whiteSpace: 'normal', maxWidth: 380, verticalAlign: 'top', padding: '4px 7px' }}>
                          {(p.offerings || []).length === 0 ? (
                            <span style={{ fontSize: 11, color: '#9a948a', fontStyle: 'italic' }}>No offerings</span>
                          ) : (p.offerings || []).map((o, j) => (
                            <div key={j} style={{
                              display: 'flex', gap: 6, fontSize: 11, padding: '1px 0',
                              opacity: o.active !== false ? 1 : 0.5, alignItems: 'center',
                            }}>
                              <input type="checkbox" checked={o.active !== false} onChange={() => toggleOffering(i, j)}
                                style={{ width: 12, height: 12, accentColor: '#5FA09E', cursor: 'pointer', flex: 'none' }} />
                              <span>{o.day}</span>
                              <span>{fmtTime(o.start)}</span>
                              <span style={{ color: '#9a948a' }}>{o.spots != null ? `${o.spots} spots` : ''}</span>
                              <select
                                value={o.teacher || ''}
                                onChange={(e) => setOfferingTeacher(i, j, e.target.value)}
                                style={{
                                  minWidth: 0, flex: 1,
                                  fontFamily: 'inherit', fontSize: 11,
                                  color: o.teacher ? '#2E2516' : '#9A948A',
                                  background: 'transparent', border: '1px solid transparent',
                                  borderRadius: 3, padding: '1px 2px', cursor: 'pointer',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E7EBE7' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}
                              >
                                <option value="">—</option>
                                {o.teacher && !teacherOptions.includes(o.teacher) && <option value={o.teacher}>{o.teacher}</option>}
                                {teacherOptions.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          ))}
                        </td>
                      )
                    }
                    if (col.id === 'edit') {
                      return (
                        <td key={col.id} className="td-edit">
                          <button className="rowbtn rb-pen" title="Edit" onClick={() => editProgram(i)}>✎</button>
                          {' '}
                          <button className="rowbtn rb-dup" title="Duplicate" onClick={() => {
                            setPrograms(list => {
                              const dup = { ...list[i], number: generateNumber(list[i], list.length), offerings: (list[i].offerings || []).map(o => ({ ...o })) }
                              return [...list.slice(0, i + 1), dup, ...list.slice(i + 1)]
                            })
                          }}>⧉</button>
                          {' '}
                          <button className="rowbtn rb-del" title="Delete" onClick={() => deleteProgram(i)}>✕</button>
                        </td>
                      )
                    }
                    if (col.id === 'title') {
                      return <td key={col.id} style={{ fontWeight: 600 }}>{p.title}</td>
                    }
                    return <td key={col.id}>{cellVal(p, col)}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: '#9A948A', marginTop: 8, textAlign: 'right' }}>
        {visible.length} of {programs.length} programs
      </div>

      {editing && (
        <ProgramModal
          mode={editing.mode}
          initial={editing.program}
          teacherOptions={teacherOptions}
          registrations={registrations}
          onClose={() => setEditing(null)}
          onSave={saveProgram}
          onDelete={editing.mode === 'edit' ? () => { deleteProgram(editing.index); setEditing(null) } : null}
        />
      )}
    </div>
  )
}

// ---------- Settings popover ----------
const ProgramsSettingsPopover = forwardRef(function ProgramsSettingsPopover({ onClose, programs, setPrograms }, ref) {
  const [backups, setBackups] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const loadBackups = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/programs/backups`, { headers: HEADERS })
      if (r.ok) setBackups(await r.json())
    } catch {}
  }, [])

  useEffect(() => { loadBackups() }, [loadBackups])

  const backUp = async () => {
    setBusy(true); setMsg('')
    try {
      const label = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      const r = await fetch(`${API_BASE}/api/programs/backup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify({ label }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setMsg('Backed up!')
      loadBackups()
    } catch (e) { setMsg('Backup failed: ' + e.message) }
    finally { setBusy(false) }
  }

  const restore = async (id) => {
    if (!confirm('Restore this backup? Current data will be replaced.')) return
    setBusy(true); setMsg('')
    try {
      const r = await fetch(`${API_BASE}/api/programs/restore/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...HEADERS },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      if (Array.isArray(data)) setPrograms(() => data)
      setMsg('Restored!')
    } catch (e) { setMsg('Restore failed: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="pg-settings" ref={ref}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="sp-title">Programs Settings</div>
        <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b6455' }} onClick={onClose}>✕</button>
      </div>

      <div className="sp-title" style={{ fontSize: 12.5 }}>Backups</div>
      <div className="sp-hint">Keep up to 14 snapshots. Restore replaces current data.</div>
      <div className="sp-btnrow">
        <button className="sp-btn" disabled={busy} onClick={backUp}>Back Up Now</button>
      </div>

      {msg && <div style={{ fontSize: 12, color: msg.startsWith('Backup') || msg.startsWith('Restored') ? '#20bab5' : '#c94040', marginTop: 6 }}>{msg}</div>}

      {backups && backups.length > 0 && (
        <div className="sp-list">
          {backups.map(b => (
            <div key={b.id} className="sp-row">
              <span className="sp-rlabel">{b.label || new Date(b.created).toLocaleString()}</span>
              <button className="sp-btn" disabled={busy} onClick={() => restore(b.id)}>Restore</button>
            </div>
          ))}
        </div>
      )}
      {backups && backups.length === 0 && <div className="sp-hint" style={{ marginTop: 6 }}>No backups yet.</div>}
    </div>
  )
})

// ---------- Program modal (add/edit) ----------
function ProgramModal({ mode, initial, teacherOptions, registrations, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(initial)
  const set = (patch) => setForm(f => ({ ...f, ...patch }))

  const setOffering = (idx, patch) => {
    setForm(f => ({ ...f, offerings: f.offerings.map((o, i) => i === idx ? { ...o, ...patch } : o) }))
  }
  const addOffering = () => setForm(f => ({ ...f, offerings: [...(f.offerings || []), blankOffering()] }))
  const removeOffering = (idx) => setForm(f => ({ ...f, offerings: f.offerings.filter((_, i) => i !== idx) }))

  const enrolledStudents = useMemo(() => {
    if (!registrations || !form.title) return []
    return registrations.filter(r => {
      const payload = r.payload || r
      const progs = payload.programs || payload.enrolledPrograms || []
      return progs.some(pg => {
        const name = typeof pg === 'string' ? pg : (pg.name || pg.title || '')
        return name.toLowerCase().includes(form.title.toLowerCase())
      })
    }).map(r => {
      const payload = r.payload || r
      return payload.displayName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || payload.email || 'Unknown'
    })
  }, [registrations, form.title])

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
            <input type="checkbox" checked={!!form.active} onChange={e => set({ active: e.target.checked })} style={{ accentColor: '#5FA09E' }} /> Active
          </label>
        </div>
        <div className="kb-field"><label>Comments / Notes</label><textarea rows={2} value={form.description} onChange={e => set({ description: e.target.value })} /></div>

        {/* Offerings */}
        <div style={{ borderTop: '1px solid #E7EBE7', marginTop: 6, paddingTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#5FA09E' }}>Offerings</div>
          {(form.offerings || []).length === 0 && (
            <div style={{ fontSize: 12, color: '#9A948A', fontStyle: 'italic', marginBottom: 8 }}>No offerings yet — add a day/time below.</div>
          )}
          {(form.offerings || []).map((o, idx) => (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '30px 90px 100px 100px 70px 1fr 1fr 26px',
              gap: 6, alignItems: 'center', marginBottom: 6,
            }}>
              <input type="checkbox" checked={o.active !== false} onChange={e => setOffering(idx, { active: e.target.checked })}
                style={{ accentColor: '#5FA09E' }} />
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9A948A', fontSize: 16 }}>×</button>
            </div>
          ))}
          <datalist id="progTeacherList">
            {teacherOptions.map(t => <option key={t} value={t} />)}
          </datalist>
          <button
            onClick={addOffering}
            style={{
              marginTop: 4, background: 'transparent', border: '1px dashed #5FA09E',
              borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
              color: '#5FA09E', cursor: 'pointer', width: '100%',
            }}>
            + Add offering
          </button>
        </div>

        {/* Enrolled students */}
        {mode === 'edit' && enrolledStudents.length > 0 && (
          <div style={{ borderTop: '1px solid #E7EBE7', marginTop: 10, paddingTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#5FA09E' }}>
              Enrolled Students ({enrolledStudents.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {enrolledStudents.map((name, idx) => (
                <span key={idx} style={{
                  background: '#E4EFF3', borderRadius: 6, padding: '4px 10px',
                  fontSize: 12, color: '#2E2516', fontWeight: 500,
                }}>{name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="kb-actions">
          {onDelete && <button className="del" onClick={onDelete}>Delete</button>}
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
