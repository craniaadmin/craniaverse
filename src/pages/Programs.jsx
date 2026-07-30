import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../data/store'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'ngrok-skip-browser-warning': 'true' }

const DOW = [
  { n: 0, l: 'Sun' }, { n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' },
  { n: 4, l: 'Thu' }, { n: 5, l: 'Fri' }, { n: 6, l: 'Sat' },
]
const PLATFORMS = ['In-Person', 'Online', 'In-Person/Online']
const PERIODS = ['', '/week', '/month', '/term', '/year']
const COST_UNITS = ['', '/week', '/month', '/term', '/year', '/session', '/class']
const LOCATIONS = [
  { id: 'loc_boardwalk', name: 'Boardwalk', color: '#5FA09E' },
  { id: 'loc_waterloo', name: 'Waterloo East', color: '#A6E2F9' },
]

function locName(id) { return LOCATIONS.find(l => l.id === id)?.name || '' }
function locColor(id) { return LOCATIONS.find(l => l.id === id)?.color || '#ccc' }
function fmtTime(t) {
  if (!t) return ''
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return t
  let h = parseInt(m[1], 10)
  const min = m[2]
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12; else if (h > 12) h -= 12
  return `${h}:${min}${ampm}`
}
function fmtRange(slot) {
  if (!slot) return ''
  return `${fmtTime(slot.start)}–${fmtTime(slot.end)}`
}
function fmtDuration(d) {
  const n = Number(d)
  if (!isFinite(n) || n <= 0) return ''
  if (n >= 60) { const h = Math.floor(n / 60); const m = n % 60; return m ? `${h}h ${m}m` : `${h}h` }
  return `${n}m`
}
function money(v) { return '$' + Number(v).toFixed(2) }
function uid() { return 'p_' + Math.random().toString(36).slice(2, 10) }
function oidGen() { return 's' + Math.random().toString(36).slice(2, 10) }

const DEFCOLS = ['active', 'number', 'code', 'year', 'name', 'subject', 'category', 'age',
  'location', 'days', 'time', 'platform', 'duration', 'lessons', 'cost', 'rate', 'hours', 'spots', 'instructor']

const COL_LABELS = {
  active: 'Active', number: 'Program ID', code: 'Program Code', year: 'Year',
  name: 'Program', subject: 'Subject', category: 'Category', age: 'Grade',
  location: 'Location', days: 'Days', time: 'Time', platform: 'Platform',
  duration: 'Duration', lessons: '# Of Lessons', cost: 'Cost', rate: 'Rate/Hr',
  hours: 'Total Hrs', spots: 'Enrolment', instructor: 'Instructor',
}

function blankProgram() {
  return {
    id: uid(), number: '', code: '', name: '', subject: '', category: '',
    ageRange: '', duration: 55, sessions: '1', period: '/week', rate: null,
    totalHours: null, description: '', year: '', gradeFrom: '', gradeTo: '',
    platform: 'In-Person', cost: null, costUnit: '', active: true,
    offerings: [{ id: oidGen(), locationId: 'loc_boardwalk', days: [], times: [], capacity: null, enrolled: '', instructor: '' }],
  }
}

function flattenRows(programs) {
  const out = []
  for (const p of programs) {
    const prate = p.rate, phrs = p.totalHours
    const offs = (p.offerings && p.offerings.length) ? p.offerings : [null]
    for (const of_ of offs) {
      const dayList = (of_ && of_.days && of_.days.length) ? [...of_.days].sort((a, b) => a - b) : [null]
      const timeList = (of_ && of_.times && of_.times.length) ? of_.times : [null]
      for (const dayN of dayList) {
        for (let ti = 0; ti < timeList.length; ti++) {
          const tm = timeList[ti]
          out.push({
            progId: p.id, offId: of_ ? of_.id : null,
            day: dayN, slot: tm || null, slotIndex: tm ? ti : null,
            number: p.number || '', code: p.code || '', name: p.name || '',
            active: p.active !== false, subject: p.subject || '',
            category: p.category || '', year: p.year || '', platform: p.platform || '',
            age: p.ageRange || '', gradeFrom: p.gradeFrom || '', gradeTo: p.gradeTo || '',
            desc: p.description || '', rate: prate, hours: phrs,
            duration: p.duration != null ? p.duration : '',
            sessions: p.sessions || '', period: p.period || '',
            locId: of_ ? of_.locationId : '', locName: of_ ? locName(of_.locationId) : '',
            days: of_ ? (of_.days || []) : [],
            start: of_ ? ((of_.times?.[0] || {}).start || '') : '',
            end: of_ ? ((of_.times?.[0] || {}).end || '') : '',
            cost: p.cost != null && p.cost !== '' ? Number(p.cost) : null,
            costUnit: p.costUnit || '',
            capacity: of_ ? of_.capacity : null,
            enrolled: of_ ? of_.enrolled : null,
            instructor: of_ ? (of_.instructor || '') : '',
          })
        }
      }
    }
  }
  return out
}

function famKey(r) { return String(r.number || r.name || r.progId) }

const PG_CSS = `
.pg-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.pg-actions button{background:#fff;border:1px solid #e2ded2;color:#2E2516;padding:6px 12px;font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit}
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
.pg-card thead th{background:#5FA09E;color:#fff;text-align:center;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;border-radius:6px;user-select:none}
.pg-card thead th.th-blank{background:transparent}
.pg-card tbody td{padding:0 7px;background:#F1F3F4;border-radius:5px;font-size:12px;font-weight:400;vertical-align:middle;white-space:nowrap;line-height:1.35;height:22px;overflow:hidden;text-overflow:ellipsis}
.pg-card tbody tr:hover td{background:#E4EFF3}
.pg-card tbody tr.inactive td{color:#b0a99e}
.pg-card tbody td.rep{background:transparent}
.pg-card tbody tr.progsep td{background:transparent;height:1px;padding:0;border-radius:0;border-top:1px solid #CFD6D8}
.pg-card tbody tr.progsep td.nosep{border-top:none}
.pg-card tbody td.col-active{text-align:center}
.pg-card tbody td.actcell{background:transparent;white-space:nowrap;text-align:center;width:59px;min-width:59px;max-width:59px}
.pg-card thead th.th-act{width:59px;min-width:59px;max-width:59px}
.actbtn{border:none;background:none;padding:0;font-size:12px;font-weight:400;cursor:pointer;line-height:inherit}
.loc{display:inline-flex;align-items:center;gap:5px;font-weight:400;font-size:12px;white-space:nowrap}
.loc .dot{width:7px;height:7px;border-radius:50%;flex:none}
.cost{font-weight:700;white-space:nowrap}
.spots{font-size:12px;font-weight:400;white-space:nowrap}
.spots.ok{color:#1f7a3d}
.spots.full{color:#922B21}
.spots.none{color:#6B6455}
.enr{display:inline-flex;gap:5px;align-items:center}
.hint{color:#9A948A;font-size:12px}
.mono{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:#6B6455}
.prog-name{font-weight:400}
.rowbtn{background:none;border:none;color:#c9c3b5;padding:0;font-size:12px;line-height:1;width:15px;height:15px;border-radius:4px;cursor:pointer;transition:color .15s}
.rowbtn:hover{background:none}
.rowbtn.rb-pen:hover,.rowbtn.rb-dup:hover{color:#5FA09E}
.rowbtn.rb-del:hover{color:#c0392b}
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
`

export default function Programs() {
  const { staff, programs, setPrograms, records: registrations } = useStore()
  const teacherOptions = useMemo(
    () => staff.map(s => `${s.firstName} ${s.lastName}`.trim()).filter(Boolean).sort(),
    [staff],
  )

  const [search, setSearch] = useState('')
  const [availFilter, setAvailFilter] = useState('')
  const [hiddenCols, setHiddenCols] = useState({})
  const [colsOpen, setColsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState(null)
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
    () => DEFCOLS.filter(k => !hiddenCols[k]),
    [hiddenCols],
  )

  const allRows = useMemo(() => flattenRows(programs), [programs])

  const q = search.trim().toLowerCase()
  const visible = useMemo(() => {
    let list = allRows
    if (q) {
      list = list.filter(r => {
        const hay = [r.name, r.number, r.code, r.category, r.subject, r.locName, r.instructor, r.desc].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
    }
    if (availFilter === 'open') {
      list = list.filter(r => {
        const cap = Number(r.capacity), en = Number(r.enrolled)
        return isFinite(cap) && cap > 0 && (cap - (isFinite(en) ? en : 0)) > 0
      })
    } else if (availFilter === 'full') {
      list = list.filter(r => {
        const cap = Number(r.capacity), en = Number(r.enrolled)
        return isFinite(cap) && cap > 0 && (cap - (isFinite(en) ? en : 0)) <= 0
      })
    }
    return list
  }, [allRows, q, availFilter])

  const metrics = useMemo(() => {
    const fams = new Map()
    allRows.forEach(r => { const k = famKey(r); if (!fams.has(k)) fams.set(k, false); if (r.active) fams.set(k, true) })
    let act = 0; fams.forEach(v => { if (v) act++ })
    let open = 0, roomy = 0
    for (const p of programs) {
      for (const o of (p.offerings || [])) {
        const c = Number(o.capacity), e = Number(o.enrolled)
        if (isFinite(c) && c > 0) { const left = c - (isFinite(e) ? e : 0); if (left > 0) { open += left; roomy++ } }
      }
    }
    let mins = 0; allRows.forEach(r => { const d = Number(r.duration); if (isFinite(d)) mins += d })
    return { progCount: fams.size, activeCount: act, entries: allRows.length, spotsOpen: open, classesWithSpots: roomy, weeklyHours: Math.round(mins / 60 * 10) / 10 }
  }, [allRows, programs])

  const toggleActive = (progId) => {
    setPrograms(list => list.map(p => p.id === progId ? { ...p, active: p.active === false } : p))
  }

  const openEdit = (progId) => {
    const p = programs.find(x => x.id === progId)
    if (p) setEditing({ mode: 'edit', program: p })
  }

  const duplicateProgram = (progId) => {
    setPrograms(list => {
      const idx = list.findIndex(p => p.id === progId)
      if (idx < 0) return list
      const orig = list[idx]
      const dup = {
        ...orig, id: uid(),
        offerings: (orig.offerings || []).map(o => ({ ...o, id: oidGen(), times: (o.times || []).map(t => ({ ...t })), days: [...(o.days || [])] })),
      }
      return [...list.slice(0, idx + 1), dup, ...list.slice(idx + 1)]
    })
  }

  const deleteProgram = (progId) => {
    const p = programs.find(x => x.id === progId)
    if (!p) return
    if (!confirm(`Delete "${p.name || 'Untitled'}"?`)) return
    setPrograms(list => list.filter(x => x.id !== progId))
  }

  const addProgram = () => {
    setEditing({ mode: 'new', program: blankProgram() })
  }

  const saveProgram = (form) => {
    if (editing.mode === 'new') {
      setPrograms(list => [form, ...list])
    } else {
      setPrograms(list => list.map(p => p.id === form.id ? form : p))
    }
    setEditing(null)
  }

  const exportCsv = () => {
    const header = ['Number', 'Code', 'Name', 'Category', 'Subject', 'Year', 'Grade From', 'Grade To',
      'Duration (min)', 'Sessions', 'Period', 'Rate/Hr', 'Cost', 'Cost Per', 'Total Hrs', 'Platform', 'Active',
      'Location', 'Day', 'Start', 'End', 'Capacity', 'Enrolled', 'Instructor']
    const rows = []
    for (const r of allRows) {
      rows.push([r.number, r.code, r.name, r.category, r.subject, r.year, r.gradeFrom, r.gradeTo,
        r.duration, r.sessions, r.period, r.rate, r.cost, r.costUnit, r.hours, r.platform, r.active,
        r.locName, r.day != null ? (DOW.find(d => d.n === r.day)?.l || '') : '',
        r.slot?.start || '', r.slot?.end || '', r.capacity, r.enrolled, r.instructor])
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
  const anyHidden = DEFCOLS.some(k => hiddenCols[k])
  const toggleAllCols = () => {
    if (anyHidden) setHiddenCols({})
    else setHiddenCols(Object.fromEntries(DEFCOLS.map(k => [k, true])))
  }

  const cellContent = (r, col) => {
    switch (col) {
      case 'active': {
        const bg = r.active ? '#DEF2DE' : '#FADBD8'
        const fg = r.active ? '#2C6B2E' : '#922B21'
        return { html: r.active ? 'Active' : 'Inactive', style: { background: bg, color: fg, textAlign: 'center', cursor: 'pointer' }, cls: 'col-active' }
      }
      case 'number': return { text: r.number || '', cls: 'col-number' }
      case 'code': return { text: r.code ? r.code : '', mono: true, cls: 'col-code' }
      case 'year': return { text: r.year || '', cls: 'col-year' }
      case 'name': return { text: r.name || '', cls: 'col-name', bold: false }
      case 'subject': return { text: r.subject || '', cls: 'col-subject' }
      case 'category': return { text: r.category || '', cls: 'col-category' }
      case 'age': {
        const from = r.gradeFrom, to = r.gradeTo
        const txt = from && to ? `${from}–${to}` : (from || to || r.age || '')
        return { text: txt, cls: 'col-age' }
      }
      case 'location': {
        if (!r.locName) return { text: '', cls: 'col-location' }
        return { loc: { name: r.locName, color: locColor(r.locId) }, cls: 'col-location' }
      }
      case 'days': {
        if (r.day == null) return { text: '', cls: 'col-days' }
        const d = DOW.find(x => x.n === r.day)
        return { text: d ? d.l : '', cls: 'col-days' }
      }
      case 'time': {
        const txt = r.slot ? fmtRange(r.slot) : ''
        return { text: txt, cls: 'col-time' }
      }
      case 'platform': return { text: r.platform || '', cls: 'col-platform' }
      case 'duration': return { text: r.duration !== '' && r.duration != null ? fmtDuration(r.duration) : '', cls: 'col-duration' }
      case 'lessons': return { text: r.sessions ? r.sessions + (r.period || '') : '', cls: 'col-lessons' }
      case 'cost': {
        if (r.cost == null) return { text: '', cls: 'col-cost' }
        return { html: `<span class="cost">${money(r.cost)}${r.costUnit ? ' <span class="hint">' + r.costUnit + '</span>' : ''}</span>`, cls: 'col-cost' }
      }
      case 'rate': {
        if (r.rate == null) return { text: '', cls: 'col-rate' }
        return { html: `<span class="cost">${money(r.rate)}<span class="hint">/hr</span></span>`, cls: 'col-rate' }
      }
      case 'hours': {
        if (r.hours == null) return { text: '', cls: 'col-hours' }
        return { text: r.hours + ' h', cls: 'col-hours' }
      }
      case 'spots': {
        const cap = Number(r.capacity), en = Number(r.enrolled)
        if (isFinite(cap) && cap > 0) {
          const left = cap - (isFinite(en) ? en : 0)
          return { html: `<span class="enr"><span class="spots">${isFinite(en) ? en : 0} / ${cap}</span><span class="spots ${left <= 0 ? 'full' : 'ok'}">${left <= 0 ? 'full' : left + ' left'}</span></span>`, cls: 'col-spots' }
        }
        if (isFinite(en) && en > 0) return { html: `<span class="spots">${en} enrolled</span>`, cls: 'col-spots' }
        return { html: '<span class="spots none">—</span>', cls: 'col-spots' }
      }
      case 'instructor': return { text: r.instructor || '', cls: 'col-instructor' }
      default: return { text: '', cls: '' }
    }
  }

  const cellKey = (r, col) => {
    const c = cellContent(r, col)
    return c.html || c.text || ''
  }

  const REPEATABLE = { category: true }
  const REPEATABLE_IN_PROGRAM = { number: true, code: true, name: true }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <style>{PG_CSS}</style>
      <h2 className="page-title">Programs</h2>

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
          }}>
          <div className="h">Show Columns</div>
          {DEFCOLS.map(k => (
            <label key={k} className="ch">
              <input type="checkbox" checked={!hiddenCols[k]} onChange={() => toggleCol(k)} />
              <span>{COL_LABELS[k]}</span>
            </label>
          ))}
          <div className="allrow">
            <button type="button" onClick={toggleAllCols}>{anyHidden ? 'Show All' : 'Hide All'}</button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <ProgramsSettingsPopover ref={settingsRef} onClose={() => setSettingsOpen(false)} programs={programs} setPrograms={setPrograms} />
      )}

      <div className="pg-metrics">
        <div className="pg-metric">
          <div className="m-label">Programs</div>
          <div className="m-value">{metrics.progCount}</div>
          <div className="m-hint">{metrics.entries} scheduled entries</div>
        </div>
        <div className="pg-metric m-act">
          <div className="m-label">Active</div>
          <div className="m-value">{metrics.activeCount}</div>
          <div className="m-hint">{metrics.progCount - metrics.activeCount} inactive</div>
        </div>
        <div className="pg-metric m-spots">
          <div className="m-label">Spots Open</div>
          <div className="m-value">{metrics.spotsOpen}</div>
          <div className="m-hint">across {metrics.classesWithSpots} classes</div>
        </div>
        <div className="pg-metric m-hours">
          <div className="m-label">Weekly Hours</div>
          <div className="m-value">{metrics.weeklyHours}</div>
          <div className="m-hint">contact hours across the week</div>
        </div>
      </div>

      <div className="pg-filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search programs, instructors, codes..." />
        <select value={availFilter} onChange={e => setAvailFilter(e.target.value)}>
          <option value="">Any Availability</option>
          <option value="open">Spots Open</option>
          <option value="full">Full</option>
        </select>
        <button onClick={addProgram} style={{
          marginLeft: 'auto', background: '#A6E2F9', color: '#2E2516',
          border: 'none', borderRadius: 8, padding: '8px 14px',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>+ Add Program</button>
      </div>

      <div className="pg-card">
        <table>
          <thead>
            <tr>
              {visCols.map(k => <th key={k}>{COL_LABELS[k]}</th>)}
              <th className="th-blank th-act"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={visCols.length + 1} style={{ textAlign: 'center', color: '#9A948A', padding: 40, background: 'transparent' }}>
                {programs.length === 0 ? <><b>No programs yet.</b><br />Click "+ Add Program" to create your first one.</> : <><b>Nothing to show.</b><br />Your search or filter is too narrow.</>}
              </td></tr>
            )}
            {visible.map((r, ri) => {
              const prevRow = ri > 0 ? visible[ri - 1] : null
              const sameProg = prevRow && famKey(prevRow) === famKey(r)
              const showSep = prevRow && !sameProg

              const tds = visCols.map(col => {
                const c = cellContent(r, col)
                const prevVal = prevRow ? cellKey(prevRow, col) : null
                const curVal = cellKey(r, col)
                const same = prevRow && curVal === prevVal && curVal !== '' && (
                  REPEATABLE[col] || (REPEATABLE_IN_PROGRAM[col] && sameProg)
                )
                if (same) return <td key={col} className={`${c.cls} rep`}></td>

                if (col === 'active') {
                  return (
                    <td key={col} className={c.cls} style={c.style} onClick={() => toggleActive(r.progId)}>
                      <button className="actbtn">{c.html}</button>
                    </td>
                  )
                }
                if (c.loc) {
                  return (
                    <td key={col} className={c.cls}>
                      <span className="loc"><span className="dot" style={{ background: c.loc.color }}></span>{c.loc.name}</span>
                    </td>
                  )
                }
                if (c.html) return <td key={col} className={c.cls} dangerouslySetInnerHTML={{ __html: c.html }} />
                if (c.mono) return <td key={col} className={c.cls}><span className="mono">{c.text}</span></td>
                const txt = c.text || ''
                return <td key={col} className={c.cls}>{txt || <span className="hint">—</span>}</td>
              })

              return (
                <React.Fragment key={`${r.progId}-${r.offId}-${r.day}-${r.slotIndex}`}>
                  {showSep && (
                    <tr className="progsep">
                      <td className="nosep" colSpan={visCols.length + 1}></td>
                    </tr>
                  )}
                  <tr className={r.active ? '' : 'inactive'}>
                    {tds}
                    <td className="actcell">
                      <button className="rowbtn rb-pen" title="Edit" onClick={() => openEdit(r.progId)}>✎</button>
                      {' '}
                      <button className="rowbtn rb-dup" title="Duplicate" onClick={() => duplicateProgram(r.progId)}>⧉</button>
                      {' '}
                      <button className="rowbtn rb-del" title="Delete" onClick={() => deleteProgram(r.progId)}>✕</button>
                    </td>
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: '#9A948A', marginTop: 8, textAlign: 'right' }}>
        {visible.length} of {allRows.length} entries
      </div>

      {editing && (
        <ProgramModal
          mode={editing.mode}
          initial={editing.program}
          teacherOptions={teacherOptions}
          registrations={registrations}
          onClose={() => setEditing(null)}
          onSave={saveProgram}
          onDelete={editing.mode === 'edit' ? () => { deleteProgram(editing.program.id); setEditing(null) } : null}
        />
      )}
    </div>
  )
}

// need React for Fragment
import React from 'react'

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
      <div className="sp-btnrow"><button className="sp-btn" disabled={busy} onClick={backUp}>Back Up Now</button></div>
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

function ProgramModal({ mode, initial, teacherOptions, registrations, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(initial)
  const set = (patch) => setForm(f => ({ ...f, ...patch }))

  const offIdx = useRef(0)
  const [activeOff, setActiveOff] = useState(0)
  const off = (form.offerings || [])[activeOff] || null

  const setOff = (patch) => {
    setForm(f => ({
      ...f,
      offerings: f.offerings.map((o, i) => i === activeOff ? { ...o, ...patch } : o),
    }))
  }

  const addOffering = () => {
    const newOff = { id: oidGen(), locationId: 'loc_boardwalk', days: [], times: [{ start: '16:30', end: '17:25' }], capacity: null, enrolled: '', instructor: '' }
    setForm(f => ({ ...f, offerings: [...(f.offerings || []), newOff] }))
    setActiveOff((form.offerings || []).length)
  }

  const removeOffering = () => {
    if ((form.offerings || []).length <= 1) return
    setForm(f => ({ ...f, offerings: f.offerings.filter((_, i) => i !== activeOff) }))
    setActiveOff(a => Math.max(0, a - 1))
  }

  const toggleDay = (dayN) => {
    if (!off) return
    const days = off.days.includes(dayN) ? off.days.filter(d => d !== dayN) : [...off.days, dayN].sort((a, b) => a - b)
    setOff({ days })
  }

  const addTime = () => setOff({ times: [...(off.times || []), { start: '', end: '' }] })
  const removeTime = (idx) => setOff({ times: off.times.filter((_, i) => i !== idx) })
  const setTime = (idx, patch) => setOff({ times: off.times.map((t, i) => i === idx ? { ...t, ...patch } : t) })

  const enrolledStudents = useMemo(() => {
    if (!registrations || !form.name) return []
    return registrations.filter(r => {
      const payload = r.payload || r
      const progs = payload.programs || payload.enrolledPrograms || []
      return progs.some(pg => {
        const name = typeof pg === 'string' ? pg : (pg.program || pg.name || pg.title || '')
        return name.toLowerCase().includes(form.name.toLowerCase())
      })
    }).map(r => {
      const payload = r.payload || r
      return payload.displayName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || payload.email || 'Unknown'
    })
  }, [registrations, form.name])

  const handleSave = () => {
    if (!form.name.trim()) { alert('Please enter a program name.'); return }
    onSave({
      ...form,
      name: form.name.trim(),
      duration: form.duration === '' ? '' : Number(form.duration),
      rate: form.rate === '' || form.rate == null ? null : Number(form.rate),
      cost: form.cost === '' || form.cost == null ? null : Number(form.cost),
      totalHours: form.totalHours === '' || form.totalHours == null ? null : Number(form.totalHours),
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Program' : 'New Program'}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: 12 }}>
          <div className="kb-field"><label>Program #</label><input value={form.number} onChange={e => set({ number: e.target.value })} /></div>
          <div className="kb-field"><label>Program Name</label><input value={form.name} onChange={e => set({ name: e.target.value })} autoFocus /></div>
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
          <div className="kb-field"><label>Platform</label>
            <select value={form.platform || ''} onChange={e => set({ platform: e.target.value })}>
              <option value="">—</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Duration (min)</label><input type="number" min="0" value={form.duration} onChange={e => set({ duration: e.target.value })} /></div>
          <div className="kb-field"><label># of Lessons</label><input value={form.sessions} onChange={e => set({ sessions: e.target.value })} /></div>
          <div className="kb-field"><label>Per</label>
            <select value={form.period} onChange={e => set({ period: e.target.value })}>
              {PERIODS.map(p => <option key={p} value={p}>{p || '—'}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Cost ($)</label><input type="number" min="0" step="0.01" value={form.cost ?? ''} onChange={e => set({ cost: e.target.value })} /></div>
          <div className="kb-field"><label>Cost Per</label>
            <select value={form.costUnit} onChange={e => set({ costUnit: e.target.value })}>
              {COST_UNITS.map(c => <option key={c} value={c}>{c || 'one-time'}</option>)}
            </select>
          </div>
          <div className="kb-field"><label>Rate ($/hr)</label><input type="number" min="0" step="0.01" value={form.rate ?? ''} onChange={e => set({ rate: e.target.value })} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="kb-field"><label>Total Hrs</label><input type="number" min="0" step="0.01" value={form.totalHours ?? ''} onChange={e => set({ totalHours: e.target.value })} /></div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginTop: 22 }}>
            <input type="checkbox" checked={form.active !== false} onChange={e => set({ active: e.target.checked })} style={{ accentColor: '#5FA09E' }} /> Active
          </label>
        </div>
        <div className="kb-field"><label>Comments / Notes</label><textarea rows={2} value={form.description} onChange={e => set({ description: e.target.value })} /></div>

        {/* Offerings */}
        <div style={{ borderTop: '1px solid #E7EBE7', marginTop: 6, paddingTop: 14 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {(form.offerings || []).map((o, i) => (
              <button key={o.id} type="button" onClick={() => setActiveOff(i)} style={{
                background: i === activeOff ? '#A6E2F9' : '#eef3f6', border: '1px solid ' + (i === activeOff ? '#A6E2F9' : '#D5D0C4'),
                borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
                color: i === activeOff ? '#2E2516' : '#5a6b6f', cursor: 'pointer',
              }}>
                {locName(o.locationId) || 'Offering'} {i + 1}
              </button>
            ))}
            <button type="button" onClick={addOffering} style={{
              background: 'transparent', border: '1px dashed #5FA09E', borderRadius: 8,
              padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: '#5FA09E', cursor: 'pointer',
            }}>+ Add Offering</button>
          </div>

          {off && (
            <div style={{ border: '1px solid #BEE6F7', borderLeft: '4px solid #A6E2F9', borderRadius: 12, padding: 16, background: '#EDF8FD' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2E2516' }}>
                  {locName(off.locationId) || 'Offering'} — Offering {activeOff + 1}
                </div>
                {(form.offerings || []).length > 1 && (
                  <button type="button" onClick={removeOffering} style={{ background: 'transparent', border: 'none', color: '#c0392b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="kb-field"><label>Location</label>
                  <select value={off.locationId} onChange={e => setOff({ locationId: e.target.value })}>
                    {LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="kb-field"><label>Capacity</label><input type="number" min="0" value={off.capacity ?? ''} onChange={e => setOff({ capacity: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                <div className="kb-field"><label>Enrolled</label><input type="number" min="0" value={off.enrolled ?? ''} onChange={e => setOff({ enrolled: e.target.value })} /></div>
              </div>

              <div className="kb-field"><label>Instructor</label>
                <input list="progTeacherList" value={off.instructor || ''} onChange={e => setOff({ instructor: e.target.value })} />
              </div>
              <datalist id="progTeacherList">{teacherOptions.map(t => <option key={t} value={t} />)}</datalist>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#6b6455', marginBottom: 5 }}>Days</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DOW.map(d => {
                    const on = off.days.includes(d.n)
                    return (
                      <button key={d.n} type="button" onClick={() => toggleDay(d.n)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        border: '1px solid ' + (on ? '#5FA09E' : '#D5D0C4'), borderRadius: 8,
                        padding: '6px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                        background: on ? '#5FA09E' : '#fff', color: on ? '#fff' : '#2E2516',
                      }}>{d.l}</button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#6b6455', marginBottom: 5 }}>Times</label>
                {(off.times || []).map((t, ti) => (
                  <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <input type="time" value={t.start} onChange={e => setTime(ti, { start: e.target.value })} style={{ flex: 1, padding: '5px 4px', border: '1px solid #d5d0c4', borderRadius: 6, fontSize: 12 }} />
                    <span style={{ color: '#6b6455' }}>–</span>
                    <input type="time" value={t.end} onChange={e => setTime(ti, { end: e.target.value })} style={{ flex: 1, padding: '5px 4px', border: '1px solid #d5d0c4', borderRadius: 6, fontSize: 12 }} />
                    <button type="button" onClick={() => removeTime(ti)} style={{ background: 'transparent', border: 'none', color: '#C9C3B5', fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                ))}
                <button type="button" onClick={addTime} style={{
                  background: 'transparent', border: '1px dashed #5FA09E', color: '#5FA09E',
                  borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 2,
                }}>+ Add Time</button>
              </div>
            </div>
          )}
        </div>

        {mode === 'edit' && enrolledStudents.length > 0 && (
          <div style={{ borderTop: '1px solid #E7EBE7', marginTop: 10, paddingTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#5FA09E' }}>
              Enrolled Students ({enrolledStudents.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {enrolledStudents.map((name, idx) => (
                <span key={idx} style={{ background: '#E4EFF3', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#2E2516', fontWeight: 500 }}>{name}</span>
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
