// Calendar page — v22 full-feature port.
// State persists at GET/PUT /api/calendar. Shape matches
// crania-calendar.json verbatim so exports round-trip.
//
// Features: month/week/day/year views, undo/redo, drag-drop,
// context menus, sidebar (upcoming + to-do), recurring event
// scope editing, CSV export, and more.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Edit2, Trash2, Copy, Calendar, List } from 'lucide-react'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'ngrok-skip-browser-warning': 'true' }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW_LONG = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DOW_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DOW_LETTER = ['M','T','W','T','F','S','S']
const PALETTE = ["#A6E2F9","#5FA09E","#E0DE85","#2E2516","#20BAB5","#8C9294",
  "#C00000","#FF0000","#FFC000","#FFFF00","#92D050","#00B050",
  "#00B0F0","#0070C0","#002060","#7030A0"]
const DEFAULT_CAL_COLOR = '#5FA09E'
const HOUR_H = 44

// ─── helpers ───
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const iso = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}
const parseISO = (s) => {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeekMon = (d) => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function isDarkColor(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return false
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 < 150
}
function textOn(hex) { return isDarkColor(hex) ? '#ffffff' : '#2E2516' }

function fmtTime12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, '0')}${ampm}`
}

function timeToMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function minToTime(m) {
  const h = Math.floor(m / 60) % 24
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// ─── CSV export ───
const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
function downloadCsv(filename, rows) {
  const BOM = '﻿'
  const text = BOM + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

// ─── Recurrence ───
function occursOn(ev, d) {
  if (!ev.date) return false
  const start = parseISO(ev.date)
  if (!start) return false
  const exceptions = new Set(Array.isArray(ev.exceptions) ? ev.exceptions : [])
  const dISO = iso(d)
  if (exceptions.has(dISO)) return false

  const recur = ev.recur
  if (!recur || !recur.freq) return dISO === ev.date

  const interval = Math.max(1, Number(recur.interval) || 1)
  const untilD = recur.until ? parseISO(recur.until) : null
  if (untilD && d.getTime() > untilD.getTime()) return false
  if (d.getTime() < start.getTime()) return false

  const diffDays = Math.round((d.getTime() - start.getTime()) / 86400000)

  if (recur.freq === 'daily') {
    return diffDays % interval === 0
  }
  if (recur.freq === 'weekly') {
    const days = Array.isArray(recur.days) && recur.days.length
      ? recur.days.map(Number)
      : [start.getDay()]
    if (!days.includes(d.getDay())) return false
    const weeksDiff = Math.floor(((startOfWeekMon(d).getTime() - startOfWeekMon(start).getTime()) / 86400000) / 7)
    return weeksDiff >= 0 && weeksDiff % interval === 0
  }
  if (recur.freq === 'monthly') {
    const monthsDiff = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth())
    if (monthsDiff < 0 || monthsDiff % interval !== 0) return false
    return d.getDate() === start.getDate()
  }
  if (recur.freq === 'yearly') {
    const yearsDiff = d.getFullYear() - start.getFullYear()
    if (yearsDiff < 0 || yearsDiff % interval !== 0) return false
    return d.getMonth() === start.getMonth() && d.getDate() === start.getDate()
  }
  return false
}

function occursOnCount(ev, d) {
  // Check if this occurrence would exceed count limit
  if (!ev.recur || !ev.recur.count) return occursOn(ev, d)
  if (!occursOn(ev, d)) return false
  const count = Number(ev.recur.count)
  if (!count) return true
  // Count occurrences from start to d
  const start = parseISO(ev.date)
  let n = 0
  let cur = new Date(start)
  const limit = 2000
  let iter = 0
  while (cur.getTime() <= d.getTime() && iter < limit) {
    const tempEv = { ...ev, recur: { ...ev.recur, count: 0 } }
    if (occursOn(tempEv, cur)) {
      n++
      if (n > count) return false
    }
    cur = addDays(cur, 1)
    iter++
  }
  return n <= count
}

function expandEvents(events, rangeStart, rangeEnd) {
  const out = new Map()
  const push = (dateISO, ev) => {
    if (!out.has(dateISO)) out.set(dateISO, [])
    out.get(dateISO).push(ev)
  }

  for (const ev of events) {
    if (!ev.date) continue
    const start = parseISO(ev.date)
    if (!start) continue

    const recur = ev.recur
    if (!recur || !recur.freq) {
      if (start.getTime() >= rangeStart.getTime() && start.getTime() <= rangeEnd.getTime()) {
        push(ev.date, ev)
      }
      continue
    }

    let d = new Date(rangeStart)
    let iter = 0
    while (d.getTime() <= rangeEnd.getTime() && iter < 500) {
      if (occursOnCount(ev, d)) push(iso(d), ev)
      d = addDays(d, 1)
      iter++
    }
  }
  return out
}

// ─── Overlap packing for time grid ───
function packEvents(eventsWithPos) {
  if (!eventsWithPos.length) return eventsWithPos
  const sorted = [...eventsWithPos].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const cols = []
  for (const ev of sorted) {
    let placed = false
    for (let c = 0; c < cols.length; c++) {
      if (cols[c].every(e => ev.startMin >= e.endMin || ev.endMin <= e.startMin)) {
        cols[c].push(ev)
        ev._col = c
        placed = true
        break
      }
    }
    if (!placed) {
      ev._col = cols.length
      cols.push([ev])
    }
  }
  const total = cols.length
  for (const ev of sorted) {
    ev._totalCols = total
  }
  return sorted
}

// ─── Store hook ───
function useCalendar(apiPath) {
  const [data, setData] = useState({ calendars: [], events: [], hidden: {} })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const latest = useRef(data)
  latest.current = data

  // Undo/redo
  const undoStack = useRef([])
  const redoStack = useRef([])
  const histBase = useRef(null)
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}${apiPath}`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      const d = {
        calendars: Array.isArray(j.calendars) ? j.calendars : [],
        events: Array.isArray(j.events) ? j.events : [],
        hidden: j.hidden && typeof j.hidden === 'object' ? j.hidden : {},
      }
      setData(d)
      histBase.current = JSON.stringify(d)
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [apiPath])

  useEffect(() => { refresh() }, [refresh])

  const persist = useCallback((d) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}${apiPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(latest.current),
      }).catch(() => {})
    }, 350)
  }, [apiPath])

  const recordHistory = useCallback((prev) => {
    const snap = JSON.stringify(prev)
    if (histBase.current === null) { histBase.current = snap; return }
    if (snap !== histBase.current) {
      undoStack.current.push(histBase.current)
      if (undoStack.current.length > 100) undoStack.current.shift()
      redoStack.current = []
      histBase.current = snap
      setUndoLen(undoStack.current.length)
      setRedoLen(0)
    }
  }, [])

  const mutate = useCallback((mut) => {
    setData(prev => {
      recordHistory(prev)
      const next = { calendars: [...prev.calendars], events: [...prev.events], hidden: { ...prev.hidden } }
      mut(next)
      const snap = JSON.stringify(next)
      histBase.current = snap
      setUndoLen(undoStack.current.length)
      persist(next)
      return next
    })
  }, [apiPath, recordHistory, persist])

  const undo = useCallback(() => {
    if (!undoStack.current.length) return
    const snap = undoStack.current.pop()
    redoStack.current.push(histBase.current)
    histBase.current = snap
    const d = JSON.parse(snap)
    setData(d)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
    latest.current = d
    persist(d)
  }, [persist])

  const redo = useCallback(() => {
    if (!redoStack.current.length) return
    const snap = redoStack.current.pop()
    undoStack.current.push(histBase.current)
    histBase.current = snap
    const d = JSON.parse(snap)
    setData(d)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
    latest.current = d
    persist(d)
  }, [persist])

  return { data, loading, status, mutate, undo, redo, undoLen, redoLen }
}

// ─── CSS ───
const CSS = `
.calroot{--light-blue:#A6E2F9;--dark-blue:#5FA09E;--light-brown:#E0DE85;--dark-brown:#2E2516;--bg:#F4F7F8;--shadow:0 1px 3px rgba(46,37,22,.15);
  color:var(--dark-brown);font-family:inherit;}

/* layout — matches v22 */
.calroot .layout{display:flex;gap:16px;padding:16px 0;align-items:flex-start;}
.calroot .main{flex:1;min-width:0;background:#fff;border-radius:12px;box-shadow:var(--shadow);padding:14px;border-top:3px solid var(--light-blue);}
.calroot .sidecol{width:290px;flex:none;display:flex;flex-direction:column;gap:16px;min-height:0;}

/* sidebar boxes — matches v22 sidebox */
.calroot .sidebox{background:#fff;border-radius:12px;box-shadow:var(--shadow);padding:14px;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;}
.calroot .sidebox.box-up{border-top:3px solid var(--light-brown);}
.calroot .sidebox.box-td{border-top:3px solid var(--dark-blue);}

/* toolbar — inside main, matches v22 */
.calroot .toolbar{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
.calroot .navstack{display:flex;flex-direction:column;gap:6px;}
.calroot .navrow{display:flex;align-items:stretch;gap:8px;}
.calroot .gorow{display:flex;align-items:center;gap:6px;}
.calroot .golbl{font-size:12px;color:#8a8474;font-weight:600;}
.calroot .godate{padding:5px 8px;border:1px solid #e2ded2;border-radius:7px;font-family:inherit;font-size:13px;}
.calroot .navbtn{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:5px 10px;font-size:14px;font-weight:700;border-radius:8px;cursor:pointer;}
.calroot .navbtn:hover{background:#f4f2ea;}
.calroot .navbtn.arrow{font-size:22px;padding:0 15px;line-height:1;display:inline-flex;align-items:center;justify-content:center;align-self:stretch;}
.calroot .today-btn{background:var(--light-brown);color:var(--dark-brown);border:none;padding:8px 22px;font-weight:700;font-size:15px;border-radius:8px;cursor:pointer;}
.calroot .today-btn:hover{filter:brightness(.96);}
.calroot .period-label{font-size:18px;font-weight:700;margin:0 6px;min-width:180px;}
.calroot .viewtabs{display:inline-flex;gap:4px;margin-left:auto;}
.calroot .viewtabs button{background:#f0efe7;border:none;color:var(--dark-brown);padding:5px 12px;font-size:12px;font-weight:700;border-radius:8px;cursor:pointer;}
.calroot .viewtabs button.on{background:var(--dark-blue);color:#fff;}
.calroot .viewtabs button:hover:not(.on){background:#e6e3d8;}
.calroot .addev{background:var(--light-blue);color:var(--dark-brown);border:none;padding:6px 14px;font-weight:700;font-size:13px;border-radius:8px;cursor:pointer;}
.calroot .addev:hover{filter:brightness(.96);}

/* actions row — matches v22 */
.calroot .actionsrow{display:flex;gap:6px;align-items:center;padding:8px 0 0;}
.calroot .actionsrow button{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:4px 10px;font-size:12px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;}
.calroot .actionsrow button:hover:not(:disabled){background:#f4f2ea;}
.calroot .actionsrow button:disabled{opacity:.4;cursor:default;}
.calroot .actionsrow .settings-btn{margin-left:auto;}

/* calendar chips bar — matches v22 calbar2 */
.calroot .calbar2{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:8px 0 0;flex-wrap:wrap;}
.calroot .calchips{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.calroot .calchip{background:#ece9e0;border:none;color:#6b6455;border-radius:6px;padding:4px 9px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;}
.calroot .calchip.on{background:var(--light-blue);color:var(--dark-brown);}
.calroot .calchip.dragging{opacity:.45;}
.calroot .calchip.drag-over{outline:2px dashed var(--dark-blue);outline-offset:2px;}
.calroot .toggleall{background:#f0efe7;color:var(--dark-brown);border:none;padding:5px 12px;font-size:12px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;}
.calroot .toggleall:hover{background:#e6e3d8;}
.calroot .addcal{background:var(--light-blue);color:var(--dark-brown);border:none;padding:5px 12px;font-size:12px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;}
.calroot .addcal:hover{filter:brightness(.96);}

/* month grid */
.calroot .month-grid{display:grid;grid-template-columns:repeat(7,1fr);}
.calroot .dow-hdr{background:var(--dark-blue);color:#fff;text-align:center;padding:6px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-right:1px solid rgba(255,255,255,.25);}
.calroot .dow-hdr:last-child{border-right:none;}
.calroot .day-cell{border-right:1px solid #eee;border-bottom:1px solid #eee;padding:4px;min-height:100px;cursor:pointer;overflow:hidden;}
.calroot .day-cell.out-month{background:#fafaf7;color:#b8b2a2;}
.calroot .day-cell.in-month{background:#fff;}
.calroot .day-cell.is-today{background:#eefaff;}
.calroot .day-num{font-size:12px;font-weight:700;margin-bottom:2px;}
.calroot .day-num.today-circle{background:var(--dark-blue);color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;}
.calroot .month-ev{font-size:11px;border-radius:4px;padding:1px 5px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}
.calroot .month-ev:hover{filter:brightness(.92);}
.calroot .month-more{font-size:10px;color:#8a8474;font-weight:600;}
.calroot .day-cell.drag-over-cell{outline:2px solid var(--dark-blue);outline-offset:-2px;}

/* time grid (week/day) */
.calroot .time-grid-wrap{position:relative;overflow:auto;max-height:calc(100vh - 220px);}
.calroot .time-header{display:flex;position:sticky;top:0;z-index:5;background:var(--dark-blue);color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.calroot .time-header .time-gutter{width:52px;flex:none;padding:6px 0;text-align:center;}
.calroot .time-header .time-col-hdr{flex:1;padding:6px 4px;text-align:center;border-left:1px solid rgba(255,255,255,.25);}
.calroot .time-header .time-col-hdr.is-today-col{background:rgba(166,226,249,.25);}
.calroot .allday-strip{display:flex;border-bottom:2px solid #e2ded2;background:#fafaf7;}
.calroot .allday-strip .time-gutter{width:52px;flex:none;padding:4px 0;text-align:center;font-size:10px;font-weight:600;color:#8a8474;}
.calroot .allday-strip .allday-col{flex:1;padding:3px 2px;min-height:26px;border-left:1px solid #eee;}
.calroot .allday-ev{font-size:10px;border-radius:3px;padding:1px 4px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}
.calroot .time-body{display:flex;position:relative;}
.calroot .time-body .time-gutter{width:52px;flex:none;}
.calroot .time-gutter-row{height:${HOUR_H}px;border-bottom:1px solid #f0eee6;display:flex;align-items:flex-start;justify-content:flex-end;padding:0 6px;font-size:10px;color:#8a8474;font-weight:600;}
.calroot .time-cols{display:flex;flex:1;position:relative;}
.calroot .time-col{flex:1;position:relative;border-left:1px solid #eee;}
.calroot .time-col.is-today-col{background:rgba(166,226,249,.08);}
.calroot .time-slot{height:${HOUR_H}px;border-bottom:1px solid #f0eee6;cursor:pointer;}
.calroot .time-slot:hover{background:rgba(95,160,158,.06);}
.calroot .time-ev{position:absolute;left:2px;right:4px;border-radius:5px;padding:3px 5px;font-size:11px;overflow:hidden;cursor:pointer;z-index:2;border-left:3px solid rgba(0,0,0,.15);}
.calroot .time-ev:hover{filter:brightness(.92);z-index:3;}
.calroot .time-ev .ev-time{font-size:9px;opacity:.85;display:block;}
.calroot .time-ev .ev-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;}
.calroot .time-now-line{position:absolute;left:52px;right:0;height:2px;background:#c0392b;z-index:4;pointer-events:none;}
.calroot .time-now-dot{position:absolute;left:46px;width:10px;height:10px;border-radius:50%;background:#c0392b;z-index:4;pointer-events:none;}

/* year grid */
.calroot .year-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;padding:14px;}
.calroot .year-mini{text-align:center;}
.calroot .year-mini-title{font-weight:700;font-size:13px;margin-bottom:6px;color:var(--dark-brown);}
.calroot .year-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;}
.calroot .year-mini-dow{font-size:9px;color:#8a8474;font-weight:600;padding:2px 0;}
.calroot .year-mini-day{font-size:10px;padding:3px 0;cursor:pointer;border-radius:3px;position:relative;}
.calroot .year-mini-day:hover{background:rgba(95,160,158,.15);}
.calroot .year-mini-day.today-mini{font-weight:700;background:var(--light-blue);}
.calroot .year-mini-day.out-month-mini{color:#ccc;}
.calroot .year-mini-dot{position:absolute;bottom:1px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--dark-blue);}

/* sidebar */
.calroot .side-title{margin:0 0 10px;font-size:14px;font-weight:700;color:var(--dark-blue);display:flex;align-items:center;gap:6px;flex:none;}
.calroot .agenda-list{padding:8px 12px;max-height:340px;overflow-y:auto;}
.calroot .agenda-day-label{font-size:11px;font-weight:700;color:#8a8474;text-transform:uppercase;margin:8px 0 4px;letter-spacing:.5px;}
.calroot .agenda-day-label:first-child{margin-top:0;}
.calroot .agenda-ev{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:2px;}
.calroot .agenda-ev:hover{background:#f4f2ea;}
.calroot .agenda-dot{width:8px;height:8px;border-radius:50%;flex:none;}
.calroot .agenda-info{flex:1;min-width:0;}
.calroot .agenda-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.calroot .agenda-time{font-size:10px;color:#8a8474;}
.calroot .agenda-empty{padding:16px;text-align:center;color:#9a948a;font-size:13px;}

/* todo sidebar */
.calroot .todo-list{padding:8px 12px;max-height:340px;overflow-y:auto;}
.calroot .todo-item{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:6px;font-size:12px;margin-bottom:2px;border-left:3px solid var(--dark-blue);}
.calroot .todo-item input[type=checkbox]{width:14px;height:14px;flex:none;cursor:pointer;accent-color:var(--dark-blue);}
.calroot .todo-item .todo-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.calroot .todo-item .todo-text.done-text{text-decoration:line-through;color:#9a948a;}
.calroot .todo-item .todo-due{font-size:10px;color:#8a8474;white-space:nowrap;}
.calroot .todo-item.p-high{border-left-color:#c0392b;}
.calroot .todo-item.p-med{border-left-color:var(--light-brown);}
.calroot .todo-item.p-low{border-left-color:var(--light-blue);}

/* overlay modal */
.calroot .overlay{position:fixed;inset:0;background:rgba(46,37,22,.45);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;}
.calroot .modal{background:#fff;border-radius:14px;padding:22px;width:100%;max-width:480px;box-shadow:0 12px 40px rgba(0,0,0,.3);max-height:92vh;overflow-y:auto;}
.calroot .modal::-webkit-scrollbar{width:10px}
.calroot .modal::-webkit-scrollbar-thumb{background:#cfcabb;border-radius:8px;border:3px solid #fff}
.calroot .modal::-webkit-scrollbar-track{background:transparent;margin:16px 0}
.calroot .modal h2{font-size:18px;margin:0 0 16px;color:var(--dark-brown);}
.calroot .field{margin-bottom:14px;}
.calroot .field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px;color:#6b6455;}
.calroot .field input,.calroot .field select,.calroot .field textarea{width:100%;padding:9px 11px;border:1px solid #d5d0c4;border-radius:8px;font:inherit;background:#fff;color:var(--dark-brown);box-sizing:border-box;}
.calroot .field textarea{resize:vertical;min-height:62px;}
.calroot .field input:focus,.calroot .field select:focus,.calroot .field textarea:focus{outline:none;border-color:var(--dark-blue);}
.calroot .modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:6px;}
.calroot .modal-actions button{border:none;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;font:inherit;}
.calroot .modal-actions .save-btn{background:var(--dark-blue);color:#fff;}
.calroot .modal-actions .save-btn:hover{filter:brightness(1.08);}
.calroot .modal-actions .cancel-btn{background:#eee;color:var(--dark-brown);}
.calroot .modal-actions .del-btn{background:#fff;color:#c0392b;border:1px solid #eecfca;margin-right:auto;}
.calroot .modal-actions .del-btn:hover{background:#fef5f4;}
.calroot .modal-actions .dup-btn{background:#fff;color:var(--dark-brown);border:1px solid #d5d0c4;}

/* swatches in modal */
.calroot .swatches{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.calroot .swatch{width:24px;height:24px;border-radius:50%;cursor:pointer;border:2px solid #fff;box-shadow:0 0 0 1px #d8d3c6;}
.calroot .swatch.sel{box-shadow:0 0 0 2px var(--dark-brown);}
.calroot .swatch-cal{width:24px;height:24px;border-radius:50%;cursor:pointer;border:2px solid #fff;box-shadow:0 0 0 1px #d8d3c6;background:repeating-linear-gradient(45deg,#ddd,#ddd 3px,#fff 3px,#fff 6px);}
.calroot .swatch-cal.sel{box-shadow:0 0 0 2px var(--dark-brown);}

/* day picker in recurrence */
.calroot .day-picks{display:flex;gap:4px;}
.calroot .day-pick{width:30px;height:30px;border-radius:6px;border:1px solid #ddd;background:#fff;color:#8a8474;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.calroot .day-pick.active{background:var(--dark-blue);color:#fff;border-color:var(--dark-blue);}

/* custom dropdown for calendar picker */
.calroot .cal-dropdown{position:relative;}
.calroot .cal-dropdown-btn{display:flex;align-items:center;gap:6px;width:100%;padding:9px 11px;border:1px solid #d5d0c4;border-radius:8px;background:#fff;cursor:pointer;font:inherit;color:var(--dark-brown);text-align:left;}
.calroot .cal-dropdown-btn:focus{outline:none;border-color:var(--dark-blue);}
.calroot .cal-dropdown-list{position:absolute;top:100%;left:0;right:0;z-index:10;background:#fff;border:1px solid #d5d0c4;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);margin-top:4px;max-height:200px;overflow-y:auto;}
.calroot .cal-dropdown-item{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:13px;}
.calroot .cal-dropdown-item:hover{background:#f4f2ea;}
.calroot .cal-dropdown-item.selected{background:rgba(95,160,158,.12);}
.calroot .cal-dropdown-dot{width:14px;height:14px;border-radius:4px;flex:none;}

/* context menu */
.calroot .ctx-menu{position:fixed;z-index:300;background:#fff;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:6px;display:flex;flex-direction:column;min-width:150px;}
.calroot .ctx-menu button{background:none;border:none;color:var(--dark-brown);text-align:left;padding:8px 12px;border-radius:6px;font-weight:500;cursor:pointer;font:inherit;display:flex;align-items:center;gap:8px;}
.calroot .ctx-menu button:hover{background:#f4f2ea;}
.calroot .ctx-menu button.ctx-danger{color:#c0392b;}
.calroot .ctx-menu button.ctx-danger:hover{background:#fef5f4;}

/* scope modal */
.calroot .scope-options{display:flex;flex-direction:column;gap:8px;margin:14px 0;}
.calroot .scope-opt{display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid #d5d0c4;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;}
.calroot .scope-opt:hover{background:#f4f2ea;border-color:var(--dark-blue);}

/* confirm dialog */
.calroot .confirm-msg{font-size:14px;margin-bottom:18px;line-height:1.5;}

/* footer */
.calroot .cal-footer{text-align:center;font-size:12px;color:#9a948a;padding:16px 0 4px;}

/* offline banner */
.calroot .offline-banner{background:#fffbf0;border:1px solid #f4d67a;color:#8a6a00;padding:8px 12px;border-radius:8px;margin-bottom:12px;font-size:13px;}

/* responsive */
@media(max-width:900px){
  .calroot .layout{flex-direction:column;}
  .calroot .sidecol{width:100%;}
}
@media(max-width:600px){
  .calroot .day-cell{min-height:70px;}
  .calroot .period-label{font-size:15px;}
}
`

// ─── Main Component ───
export default function CalendarView({ apiPath = '/api/calendar', title = 'Calendar' }) {
  const { data, loading, status, mutate, undo, redo, undoLen, redoLen } = useCalendar(apiPath)
  const [view, setView] = useState('month') // month, week, day, year
  const [cur, setCur] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [editingEvent, setEditingEvent] = useState(null)
  const [editingCalendar, setEditingCalendar] = useState(null)
  const [scopeModal, setScopeModal] = useState(null) // { action, event, date }
  const [confirmDialog, setConfirmDialog] = useState(null) // { msg, onYes }
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, items }
  const [gotoDate, setGotoDate] = useState('')
  const [dragEv, setDragEv] = useState(null)
  const timeGridRef = useRef(null)

  // close context menu on any click
  useEffect(() => {
    const fn = () => setCtxMenu(null)
    document.addEventListener('click', fn)
    return () => document.removeEventListener('click', fn)
  }, [])

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z redo
  useEffect(() => {
    const fn = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (e.ctrlKey && e.key === 'Z' && e.shiftKey) { e.preventDefault(); redo() }
      if (e.ctrlKey && e.shiftKey && e.key === 'z') { e.preventDefault(); redo() }
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [undo, redo])

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])

  const calById = useMemo(
    () => Object.fromEntries(data.calendars.map(c => [c.id, c])),
    [data.calendars],
  )
  const calColor = useCallback((id) => calById[id]?.color || DEFAULT_CAL_COLOR, [calById])
  const eventColor = useCallback((e) => e.color || calColor(e.calId), [calColor])

  // ─── Range for current view ───
  const viewRange = useMemo(() => {
    if (view === 'month') {
      const firstOfMonth = new Date(cur.getFullYear(), cur.getMonth(), 1)
      const gridStart = startOfWeekMon(firstOfMonth)
      const gridEnd = addDays(gridStart, 41)
      return { gridStart, gridEnd }
    }
    if (view === 'week') {
      const ws = startOfWeekMon(cur)
      return { gridStart: ws, gridEnd: addDays(ws, 6) }
    }
    if (view === 'day') {
      return { gridStart: new Date(cur), gridEnd: new Date(cur) }
    }
    // year
    const ys = new Date(cur.getFullYear(), 0, 1)
    const ye = new Date(cur.getFullYear(), 11, 31)
    return { gridStart: ys, gridEnd: ye }
  }, [view, cur])

  const eventsByDay = useMemo(() => {
    const visible = data.events.filter(e => !data.hidden[e.calId])
    // For year view, expand the whole year; otherwise use viewRange with some margin
    const start = view === 'year' ? new Date(cur.getFullYear(), 0, 1) : addDays(viewRange.gridStart, -7)
    const end = view === 'year' ? new Date(cur.getFullYear(), 11, 31) : addDays(viewRange.gridEnd, 7)
    return expandEvents(visible, start, end)
  }, [data.events, data.hidden, view, viewRange, cur])

  // ─── Month grid data ───
  const monthDays = useMemo(() => {
    if (view !== 'month') return []
    const firstOfMonth = new Date(cur.getFullYear(), cur.getMonth(), 1)
    const gridStart = startOfWeekMon(firstOfMonth)
    const days = []
    for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i))
    return days
  }, [view, cur])

  // ─── Week data ───
  const weekDays = useMemo(() => {
    if (view !== 'week') return []
    const ws = startOfWeekMon(cur)
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  }, [view, cur])

  // ─── Navigation ───
  const goPrev = () => {
    if (view === 'month') setCur(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    else if (view === 'week') setCur(d => addDays(d, -7))
    else if (view === 'day') setCur(d => addDays(d, -1))
    else setCur(d => new Date(d.getFullYear() - 1, 0, 1))
  }
  const goNext = () => {
    if (view === 'month') setCur(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    else if (view === 'week') setCur(d => addDays(d, 7))
    else if (view === 'day') setCur(d => addDays(d, 1))
    else setCur(d => new Date(d.getFullYear() + 1, 0, 1))
  }
  const goToday = () => { const d = new Date(); d.setHours(0,0,0,0); setCur(d) }
  const goTo = (dateStr) => { const d = parseISO(dateStr); if (d) { d.setHours(0,0,0,0); setCur(d) } }

  // ─── Period label ───
  const periodLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`
    if (view === 'year') return `${cur.getFullYear()}`
    if (view === 'day') {
      return `${DOW_LONG[(cur.getDay() + 6) % 7]}, ${MONTHS[cur.getMonth()]} ${cur.getDate()}, ${cur.getFullYear()}`
    }
    // week
    const ws = startOfWeekMon(cur)
    const we = addDays(ws, 6)
    if (ws.getMonth() === we.getMonth()) {
      return `${MON_SHORT[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${ws.getFullYear()}`
    }
    if (ws.getFullYear() === we.getFullYear()) {
      return `${MON_SHORT[ws.getMonth()]} ${ws.getDate()} – ${MON_SHORT[we.getMonth()]} ${we.getDate()}, ${ws.getFullYear()}`
    }
    return `${MON_SHORT[ws.getMonth()]} ${ws.getDate()}, ${ws.getFullYear()} – ${MON_SHORT[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
  }, [view, cur])

  // ─── Calendar actions ───
  const toggleCalVisibility = (calId) => {
    mutate(d => {
      d.hidden = { ...d.hidden }
      if (d.hidden[calId]) delete d.hidden[calId]
      else d.hidden[calId] = true
    })
  }
  const toggleAllCals = () => {
    const allHidden = data.calendars.length > 0 && data.calendars.every(c => data.hidden[c.id])
    mutate(d => {
      d.hidden = {}
      if (!allHidden) {
        data.calendars.forEach(c => { d.hidden[c.id] = true })
      }
    })
  }
  const saveCalendarForm = (form, mode, origCal) => {
    mutate(d => {
      if (mode === 'new') {
        d.calendars.push({ id: uid(), name: form.name.trim(), color: form.color })
      } else {
        const i = d.calendars.findIndex(c => c.id === origCal.id)
        if (i !== -1) d.calendars[i] = { ...d.calendars[i], name: form.name.trim(), color: form.color }
      }
    })
    setEditingCalendar(null)
  }
  const duplicateCalendar = (id) => {
    mutate(d => {
      const c = d.calendars.find(x => x.id === id)
      if (!c) return
      const newId = uid()
      d.calendars.push({ id: newId, name: c.name + ' (copy)', color: c.color })
      // duplicate events too
      const evs = d.events.filter(e => e.calId === id)
      for (const ev of evs) {
        d.events.push({ ...ev, id: uid(), calId: newId })
      }
    })
  }
  const deleteCalendar = (id, skipConfirm) => {
    const cal = calById[id]
    const count = data.events.filter(e => e.calId === id).length
    if (!skipConfirm) {
      setConfirmDialog({
        msg: `Delete "${cal?.name}" and its ${count} event${count === 1 ? '' : 's'}?`,
        onYes: () => { deleteCalendarDo(id); setConfirmDialog(null) },
      })
      return
    }
    deleteCalendarDo(id)
  }
  const deleteCalendarDo = (id) => {
    mutate(d => {
      d.calendars = d.calendars.filter(c => c.id !== id)
      d.events = d.events.filter(e => e.calId !== id)
      d.hidden = { ...d.hidden }; delete d.hidden[id]
    })
  }

  // ─── Chip drag reorder ───
  const [chipDrag, setChipDrag] = useState(null)
  const [chipOver, setChipOver] = useState(null)
  const handleChipDragStart = (e, calId) => { setChipDrag(calId); e.dataTransfer.effectAllowed = 'move' }
  const handleChipDragOver = (e, calId) => { e.preventDefault(); setChipOver(calId) }
  const handleChipDrop = (e, targetId) => {
    e.preventDefault()
    if (chipDrag && chipDrag !== targetId) {
      mutate(d => {
        const fromIdx = d.calendars.findIndex(c => c.id === chipDrag)
        const toIdx = d.calendars.findIndex(c => c.id === targetId)
        if (fromIdx !== -1 && toIdx !== -1) {
          const [item] = d.calendars.splice(fromIdx, 1)
          d.calendars.splice(toIdx, 0, item)
        }
      })
    }
    setChipDrag(null); setChipOver(null)
  }
  const handleChipDragEnd = () => { setChipDrag(null); setChipOver(null) }

  // ─── Event actions ───
  const saveEventForm = (form) => {
    mutate(d => {
      if (editingEvent.mode === 'new') {
        d.events.push({ id: uid(), exceptions: [], ...form })
      } else {
        const i = d.events.findIndex(e => e.id === editingEvent.event.id)
        if (i !== -1) d.events[i] = { ...d.events[i], ...form }
      }
    })
    setEditingEvent(null)
  }
  const deleteEvent = (ev) => {
    if (ev.recur && ev.recur.freq) {
      setScopeModal({ action: 'delete', event: ev })
    } else {
      setConfirmDialog({
        msg: `Delete "${ev.title || 'this event'}"?`,
        onYes: () => { deleteEventDo(ev.id); setConfirmDialog(null); setEditingEvent(null) },
      })
    }
  }
  const deleteEventDo = (id) => {
    mutate(d => { d.events = d.events.filter(e => e.id !== id) })
  }
  const duplicateEvent = (ev) => {
    mutate(d => {
      d.events.push({ ...ev, id: uid(), title: ev.title + ' (copy)', exceptions: [] })
    })
  }

  // ─── Scope handling for recurring events ───
  const handleScope = (scope, action, ev, occDate) => {
    setScopeModal(null)
    if (action === 'delete') {
      if (scope === 'all') {
        deleteEventDo(ev.id)
        setEditingEvent(null)
      } else if (scope === 'this') {
        // Add exception
        mutate(d => {
          const i = d.events.findIndex(e => e.id === ev.id)
          if (i !== -1) {
            const exc = [...(d.events[i].exceptions || [])]
            if (occDate && !exc.includes(occDate)) exc.push(occDate)
            d.events[i] = { ...d.events[i], exceptions: exc }
          }
        })
        setEditingEvent(null)
      } else if (scope === 'following') {
        // Set until to day before occDate
        if (occDate) {
          const before = addDays(parseISO(occDate), -1)
          mutate(d => {
            const i = d.events.findIndex(e => e.id === ev.id)
            if (i !== -1) {
              d.events[i] = { ...d.events[i], recur: { ...d.events[i].recur, until: iso(before) } }
            }
          })
        }
        setEditingEvent(null)
      }
    } else if (action === 'edit') {
      if (scope === 'all') {
        // Just open the modal normally
        setEditingEvent({ mode: 'edit', event: ev })
      } else if (scope === 'this') {
        // Create exception + new single event
        mutate(d => {
          const i = d.events.findIndex(e => e.id === ev.id)
          if (i !== -1) {
            const exc = [...(d.events[i].exceptions || [])]
            if (occDate && !exc.includes(occDate)) exc.push(occDate)
            d.events[i] = { ...d.events[i], exceptions: exc }
          }
          // Add new single event at occDate
          d.events.push({ ...ev, id: uid(), date: occDate, recur: null, exceptions: [] })
        })
        // Now open the new event for editing
        setEditingEvent({ mode: 'edit', event: { ...ev, id: data.events.length > 0 ? uid() : uid(), date: occDate, recur: null, exceptions: [] } })
      } else if (scope === 'following') {
        // Set until on original, create new recurring from occDate
        if (occDate) {
          const before = addDays(parseISO(occDate), -1)
          const newId = uid()
          mutate(d => {
            const i = d.events.findIndex(e => e.id === ev.id)
            if (i !== -1) {
              d.events[i] = { ...d.events[i], recur: { ...d.events[i].recur, until: iso(before) } }
            }
            d.events.push({ ...ev, id: newId, date: occDate, exceptions: [] })
          })
          setEditingEvent({ mode: 'edit', event: { ...ev, id: newId, date: occDate, exceptions: [] } })
        }
      }
    }
  }

  const openEditEvent = (ev, occDate) => {
    if (ev.recur && ev.recur.freq) {
      setScopeModal({ action: 'edit', event: ev, date: occDate })
    } else {
      setEditingEvent({ mode: 'edit', event: ev })
    }
  }

  // ─── Drag drop (month) ───
  const [dragOverCell, setDragOverCell] = useState(null)
  const handleEvDragStart = (e, ev, fromDate) => {
    setDragEv({ ev, fromDate })
    e.dataTransfer.effectAllowed = 'move'
    // ghost
    e.dataTransfer.setData('text/plain', ev.id)
  }
  const handleCellDragOver = (e, dISO) => { e.preventDefault(); setDragOverCell(dISO) }
  const handleCellDrop = (e, dISO) => {
    e.preventDefault()
    setDragOverCell(null)
    if (dragEv && dISO !== dragEv.fromDate) {
      const ev = dragEv.ev
      if (ev.recur && ev.recur.freq) {
        // For recurring, add exception + create single event
        mutate(d => {
          const i = d.events.findIndex(x => x.id === ev.id)
          if (i !== -1) {
            const exc = [...(d.events[i].exceptions || [])]
            if (!exc.includes(dragEv.fromDate)) exc.push(dragEv.fromDate)
            d.events[i] = { ...d.events[i], exceptions: exc }
          }
          d.events.push({ ...ev, id: uid(), date: dISO, recur: null, exceptions: [] })
        })
      } else {
        mutate(d => {
          const i = d.events.findIndex(x => x.id === ev.id)
          if (i !== -1) d.events[i] = { ...d.events[i], date: dISO }
        })
      }
    }
    setDragEv(null)
  }
  const handleCellDragLeave = () => setDragOverCell(null)

  // ─── Time grid drag (week/day) ───
  const handleTimeEvDrop = (e, dISO, hourSlot) => {
    e.preventDefault()
    setDragOverCell(null)
    if (!dragEv) return
    const ev = dragEv.ev
    const newStart = minToTime(hourSlot * 60)
    const duration = ev.start && ev.end ? timeToMin(ev.end) - timeToMin(ev.start) : 60
    const newEnd = minToTime(hourSlot * 60 + Math.max(15, duration))
    if (ev.recur && ev.recur.freq) {
      mutate(d => {
        const i = d.events.findIndex(x => x.id === ev.id)
        if (i !== -1) {
          const exc = [...(d.events[i].exceptions || [])]
          if (!exc.includes(dragEv.fromDate)) exc.push(dragEv.fromDate)
          d.events[i] = { ...d.events[i], exceptions: exc }
        }
        d.events.push({ ...ev, id: uid(), date: dISO, start: newStart, end: newEnd, allDay: false, recur: null, exceptions: [] })
      })
    } else {
      mutate(d => {
        const i = d.events.findIndex(x => x.id === ev.id)
        if (i !== -1) d.events[i] = { ...d.events[i], date: dISO, start: newStart, end: newEnd, allDay: false }
      })
    }
    setDragEv(null)
  }

  // ─── Context menu on events ───
  const showEventCtx = (e, ev, occDate) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Edit', icon: <Edit2 size={14} />, action: () => openEditEvent(ev, occDate) },
        { label: 'Duplicate', icon: <Copy size={14} />, action: () => duplicateEvent(ev) },
        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, action: () => deleteEvent(ev) },
      ],
    })
  }
  const showCalCtx = (e, calId) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Duplicate', icon: <Copy size={14} />, action: () => duplicateCalendar(calId) },
        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, action: () => deleteCalendar(calId) },
      ],
    })
  }

  // ─── CSV export ───
  const exportCSV = () => {
    const header = ['Calendar', 'Title', 'Date', 'All Day', 'Start', 'End', 'Repeats', 'Notes']
    const rows = [header]
    for (const ev of data.events) {
      const cal = calById[ev.calId]
      const freq = ev.recur?.freq || ''
      rows.push([
        cal?.name || '', ev.title || '', ev.date || '',
        ev.allDay ? 'Yes' : 'No', ev.start || '', ev.end || '',
        freq, ev.notes || '',
      ])
    }
    downloadCsv('calendar-export.csv', rows)
  }

  // ─── Scroll time grid to 7am on mount ───
  useEffect(() => {
    if ((view === 'week' || view === 'day') && timeGridRef.current) {
      timeGridRef.current.scrollTop = 7 * HOUR_H
    }
  }, [view])

  if (loading) {
    return (
      <div className="page">
        <style>{CSS}</style>
        <h2 className="page-title">{title}</h2>
        <div style={{ padding: 40, textAlign: 'center', color: '#9a948a' }}>Loading...</div>
      </div>
    )
  }

  const allHidden = data.calendars.length > 0 && data.calendars.every(c => data.hidden[c.id])

  return (
    <div className="page">
      <style>{CSS}</style>
      <div className="calroot">
        <h2 className="page-title">{title}</h2>

        {status === 'offline' && (
          <div className="offline-banner">
            Working offline -- changes will retry when the server is reachable.
          </div>
        )}

        {/* Actions row — matches v22: Undo Redo | Settings(pushed right) YearImage ExportCSV */}
        <div className="actionsrow">
          <button disabled={!undoLen} onClick={undo} title="Undo (Ctrl+Z)">{'↶'} Undo</button>
          <button disabled={!redoLen} onClick={redo} title="Redo (Ctrl+Shift+Z)">{'↷'}</button>
          <button className="settings-btn" title="Settings">{'⚙'}</button>
          <button title="Save the whole year as a PNG image">{'🖼'} Year Image</button>
          <button onClick={exportCSV} title="Download all events as a CSV file">{'⤓'} Export CSV</button>
        </div>

        {/* Calendar chips bar — matches v22 calbar2 */}
        <div className="calbar2">
          <div className="calchips">
            {data.calendars.map(c => {
              const visible = !data.hidden[c.id]
              return (
                <button
                  key={c.id}
                  className={`calchip${visible ? ' on' : ''}${chipDrag === c.id ? ' dragging' : ''}${chipOver === c.id ? ' drag-over' : ''}`}
                  draggable
                  onDragStart={e => handleChipDragStart(e, c.id)}
                  onDragOver={e => handleChipDragOver(e, c.id)}
                  onDrop={e => handleChipDrop(e, c.id)}
                  onDragEnd={handleChipDragEnd}
                  onClick={() => toggleCalVisibility(c.id)}
                  onDoubleClick={() => setEditingCalendar({ mode: 'edit', cal: c })}
                  onContextMenu={e => showCalCtx(e, c.id)}
                  title="Click to show/hide &middot; double-click to edit"
                >
                  {c.name}
                </button>
              )
            })}
          </div>
          {data.calendars.length > 0 && (
            <button className="toggleall" onClick={toggleAllCals}>
              {allHidden ? 'Show All' : 'Hide/Show All'}
            </button>
          )}
          <button className="addcal" onClick={() => setEditingCalendar({ mode: 'new', cal: null })}>
            + Add Calendar
          </button>
        </div>

        {/* Main layout */}
        <div className="layout">
          <div className="main">
            {/* Toolbar — inside main, matches v22 */}
            <div className="toolbar">
              <div className="navstack">
                <div className="navrow">
                  <button className="navbtn arrow" onClick={goPrev} title="Previous">{'‹'}</button>
                  <button className="today-btn" onClick={goToday}>Today</button>
                  <button className="navbtn arrow" onClick={goNext} title="Next">{'›'}</button>
                  <span className="period-label">{periodLabel}</span>
                </div>
                <div className="gorow">
                  <span className="golbl">Go To:</span>
                  <input type="date" className="godate" value={gotoDate} onChange={e => setGotoDate(e.target.value)} title="Go to date" />
                </div>
              </div>
              <div className="viewtabs">
                {[['day','Day'],['week','Week'],['month','Month'],['year','Year']].map(([v,l]) => (
                  <button key={v} className={view === v ? 'on' : ''} data-view={v} onClick={() => setView(v)}>
                    {l}
                  </button>
                ))}
              </div>
              <button className="addev" onClick={() => setEditingEvent({ mode: 'new', event: null, date: iso(cur) })}>
                + New Event
              </button>
            </div>

            {view === 'month' && (
              <MonthGrid
                  days={monthDays}
                  cur={cur}
                  today={today}
                  eventsByDay={eventsByDay}
                  eventColor={eventColor}
                  calById={calById}
                  onNewEvent={(dISO) => setEditingEvent({ mode: 'new', event: null, date: dISO })}
                  onEditEvent={(ev, dISO) => openEditEvent(ev, dISO)}
                  onCtxEvent={showEventCtx}
                  onDragStart={handleEvDragStart}
                  dragOverCell={dragOverCell}
                  onCellDragOver={handleCellDragOver}
                  onCellDrop={handleCellDrop}
                  onCellDragLeave={handleCellDragLeave}
                />
            )}
            {view === 'week' && (
              <TimeGrid
                days={weekDays}
                today={today}
                eventsByDay={eventsByDay}
                eventColor={eventColor}
                calById={calById}
                onNewEvent={(dISO, time) => setEditingEvent({ mode: 'new', event: null, date: dISO, time })}
                onEditEvent={(ev, dISO) => openEditEvent(ev, dISO)}
                onCtxEvent={showEventCtx}
                onDragStart={handleEvDragStart}
                onTimeDrop={handleTimeEvDrop}
                gridRef={timeGridRef}
              />
            )}
            {view === 'day' && (
              <TimeGrid
                days={[cur]}
                today={today}
                eventsByDay={eventsByDay}
                eventColor={eventColor}
                calById={calById}
                onNewEvent={(dISO, time) => setEditingEvent({ mode: 'new', event: null, date: dISO, time })}
                onEditEvent={(ev, dISO) => openEditEvent(ev, dISO)}
                onCtxEvent={showEventCtx}
                onDragStart={handleEvDragStart}
                onTimeDrop={handleTimeEvDrop}
                gridRef={timeGridRef}
              />
            )}
            {view === 'year' && (
              <YearGrid
                year={cur.getFullYear()}
                today={today}
                eventsByDay={eventsByDay}
                onDayClick={(d) => { setCur(d); setView('day') }}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="sidecol">
            <div className="sidebox box-up">
              <AgendaSidebar
                events={data.events}
                hidden={data.hidden}
                calById={calById}
                eventColor={eventColor}
                today={today}
                onEditEvent={(ev) => openEditEvent(ev, ev.date)}
              />
            </div>
            <div className="sidebox box-td">
              <TodoSidebar />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cal-footer">CraniaVerse &middot; Calendar</div>

        {/* Modals */}
        {editingEvent && (
          <EventModal
            mode={editingEvent.mode}
            initial={editingEvent.event}
            initialDate={editingEvent.date}
            initialTime={editingEvent.time}
            calendars={data.calendars}
            onClose={() => setEditingEvent(null)}
            onSave={saveEventForm}
            onDelete={editingEvent.mode === 'edit' ? () => deleteEvent(editingEvent.event) : null}
            onDuplicate={editingEvent.mode === 'edit' ? () => { duplicateEvent(editingEvent.event); setEditingEvent(null) } : null}
          />
        )}
        {editingCalendar && (
          <CalendarModal
            mode={editingCalendar.mode}
            initial={editingCalendar.cal}
            onClose={() => setEditingCalendar(null)}
            onSave={(form) => saveCalendarForm(form, editingCalendar.mode, editingCalendar.cal)}
            onDelete={editingCalendar.mode === 'edit' ? () => { deleteCalendar(editingCalendar.cal.id, true); setEditingCalendar(null) } : null}
          />
        )}
        {scopeModal && (
          <ScopeModal
            action={scopeModal.action}
            event={scopeModal.event}
            date={scopeModal.date}
            onClose={() => setScopeModal(null)}
            onSelect={(scope) => handleScope(scope, scopeModal.action, scopeModal.event, scopeModal.date)}
          />
        )}
        {confirmDialog && (
          <ConfirmDialog
            msg={confirmDialog.msg}
            onYes={confirmDialog.onYes}
            onNo={() => setConfirmDialog(null)}
          />
        )}
        {ctxMenu && (
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ─── Month Grid ───
// ═══════════════════════════════════════
function MonthGrid({ days, cur, today, eventsByDay, eventColor, calById, onNewEvent, onEditEvent, onCtxEvent, onDragStart, dragOverCell, onCellDragOver, onCellDrop, onCellDragLeave }) {
  return (
    <div className="month-grid">
      {DOW_SHORT.map(d => <div key={d} className="dow-hdr">{d}</div>)}
      {days.map((d, i) => {
        const inMonth = d.getMonth() === cur.getMonth()
        const isToday = sameDay(d, today)
        const dISO = iso(d)
        const evs = eventsByDay.get(dISO) || []
        const shown = evs.slice(0, 4)
        const overflow = evs.length - shown.length
        return (
          <div
            key={i}
            className={`day-cell${inMonth ? ' in-month' : ' out-month'}${isToday ? ' is-today' : ''}${dragOverCell === dISO ? ' drag-over-cell' : ''}`}
            onClick={() => onNewEvent(dISO)}
            onDragOver={e => onCellDragOver(e, dISO)}
            onDrop={e => onCellDrop(e, dISO)}
            onDragLeave={onCellDragLeave}
          >
            <div className={`day-num${isToday ? ' today-circle' : ''}`}>{d.getDate()}</div>
            {shown.map((ev, j) => {
              const color = eventColor(ev)
              return (
                <div
                  key={`${ev.id}-${dISO}-${j}`}
                  className="month-ev"
                  style={{ background: color, color: textOn(color) }}
                  onClick={e => { e.stopPropagation(); onEditEvent(ev, dISO) }}
                  onContextMenu={e => onCtxEvent(e, ev, dISO)}
                  draggable
                  onDragStart={e => { e.stopPropagation(); onDragStart(e, ev, dISO) }}
                  title={ev.title + (ev.allDay ? '' : ` (${fmtTime12(ev.start)}–${fmtTime12(ev.end)})`)}
                >
                  {!ev.allDay && ev.start && <span style={{ opacity: .8, marginRight: 4, fontSize: 10 }}>{fmtTime12(ev.start)}</span>}
                  {ev.title}
                </div>
              )
            })}
            {overflow > 0 && <div className="month-more">+{overflow} more</div>}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════
// ─── Time Grid (Week / Day) ───
// ═══════════════════════════════════════
function TimeGrid({ days, today, eventsByDay, eventColor, calById, onNewEvent, onEditEvent, onCtxEvent, onDragStart, onTimeDrop, gridRef }) {
  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Now line position
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowTop = (nowMin / 60) * HOUR_H

  return (
    <div className="time-grid-wrap" ref={gridRef}>
      {/* Column headers */}
      <div className="time-header">
        <div className="time-gutter" />
        {days.map((d, i) => {
          const isToday = sameDay(d, today)
          return (
            <div key={i} className={`time-col-hdr${isToday ? ' is-today-col' : ''}`}>
              {DOW_SHORT[(d.getDay() + 6) % 7]} {d.getDate()}
            </div>
          )
        })}
      </div>

      {/* All-day strip */}
      <div className="allday-strip">
        <div className="time-gutter" style={{ fontSize: 10, padding: '4px 6px', color: '#8a8474' }}>all-day</div>
        {days.map((d, i) => {
          const dISO = iso(d)
          const evs = (eventsByDay.get(dISO) || []).filter(e => e.allDay)
          return (
            <div key={i} className="allday-col">
              {evs.map((ev, j) => {
                const color = eventColor(ev)
                return (
                  <div
                    key={`${ev.id}-${j}`}
                    className="allday-ev"
                    style={{ background: color, color: textOn(color) }}
                    onClick={() => onEditEvent(ev, dISO)}
                    onContextMenu={e => onCtxEvent(e, ev, dISO)}
                    title={ev.title}
                  >
                    {ev.title}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Time body */}
      <div className="time-body">
        <div className="time-gutter">
          {hours.map(h => (
            <div key={h} className="time-gutter-row">
              {h === 0 ? '' : fmtTime12(`${String(h).padStart(2, '0')}:00`)}
            </div>
          ))}
        </div>
        <div className="time-cols">
          {days.map((d, colIdx) => {
            const dISO = iso(d)
            const isToday = sameDay(d, today)
            const evs = (eventsByDay.get(dISO) || []).filter(e => !e.allDay && e.start)
            const withPos = evs.map(ev => {
              const startMin = timeToMin(ev.start)
              const endMin = ev.end ? timeToMin(ev.end) : startMin + 60
              return { ...ev, startMin, endMin: Math.max(endMin, startMin + 15) }
            })
            const packed = packEvents(withPos)

            return (
              <div key={colIdx} className={`time-col${isToday ? ' is-today-col' : ''}`}>
                {hours.map(h => (
                  <div
                    key={h}
                    className="time-slot"
                    onClick={() => onNewEvent(dISO, `${String(h).padStart(2, '0')}:00`)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => onTimeDrop(e, dISO, h)}
                  />
                ))}
                {packed.map((ev, j) => {
                  const top = (ev.startMin / 60) * HOUR_H
                  const height = Math.max(((ev.endMin - ev.startMin) / 60) * HOUR_H, 18)
                  const color = eventColor(ev)
                  const left = ev._col ? `${(ev._col / ev._totalCols) * 100}%` : '2px'
                  const width = ev._totalCols > 1 ? `${(1 / ev._totalCols) * 100 - 2}%` : undefined
                  return (
                    <div
                      key={`${ev.id}-${dISO}-${j}`}
                      className="time-ev"
                      style={{
                        top, height, background: color, color: textOn(color),
                        ...(ev._totalCols > 1 ? { left, width, right: 'auto' } : {}),
                      }}
                      onClick={e => { e.stopPropagation(); onEditEvent(ev, dISO) }}
                      onContextMenu={e => onCtxEvent(e, ev, dISO)}
                      draggable
                      onDragStart={e => { e.stopPropagation(); onDragStart(e, ev, dISO) }}
                      title={`${ev.title} (${fmtTime12(ev.start)}–${fmtTime12(ev.end)})`}
                    >
                      <span className="ev-time">{fmtTime12(ev.start)} - {fmtTime12(ev.end)}</span>
                      <span className="ev-title">{ev.title}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {/* Now line */}
          {days.some(d => sameDay(d, today)) && (
            <>
              <div className="time-now-line" style={{ top: nowTop }} />
              <div className="time-now-dot" style={{ top: nowTop - 4 }} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ─── Year Grid ───
// ═══════════════════════════════════════
function YearGrid({ year, today, eventsByDay, onDayClick }) {
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, m) => {
        const firstDay = new Date(year, m, 1)
        const daysInMonth = new Date(year, m + 1, 0).getDate()
        // Monday-based: 0=Mon...6=Sun
        const startDow = (firstDay.getDay() + 6) % 7
        const cells = []
        // Blank cells before first day
        for (let i = 0; i < startDow; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(d)
        // Pad to fill row
        while (cells.length % 7 !== 0) cells.push(null)

        return (
          <div key={m} className="year-mini">
            <div className="year-mini-title">{MONTHS[m]}</div>
            <div className="year-mini-grid">
              {DOW_LETTER.map((l, i) => <div key={i} className="year-mini-dow">{l}</div>)}
              {cells.map((d, i) => {
                if (d === null) return <div key={i} className="year-mini-day out-month-mini" />
                const date = new Date(year, m, d)
                const dISO = iso(date)
                const hasEvents = eventsByDay.has(dISO)
                const isToday = sameDay(date, today)
                return (
                  <div
                    key={i}
                    className={`year-mini-day${isToday ? ' today-mini' : ''}`}
                    onClick={() => onDayClick(date)}
                    title={dISO}
                  >
                    {d}
                    {hasEvents && <span className="year-mini-dot" />}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════
// ─── Agenda Sidebar ───
// ═══════════════════════════════════════
function AgendaSidebar({ events, hidden, calById, eventColor, today, onEditEvent }) {
  const agenda = useMemo(() => {
    const visible = events.filter(e => !hidden[e.calId])
    const items = []
    const limit = 60
    let d = new Date(today)
    for (let i = 0; i < 200 && items.length < limit; i++) {
      const dISO = iso(d)
      for (const ev of visible) {
        if (items.length >= limit) break
        if (occursOnCount(ev, d)) {
          items.push({ ev, date: dISO, dateObj: new Date(d) })
        }
      }
      d = addDays(d, 1)
    }
    return items
  }, [events, hidden, today])

  const grouped = useMemo(() => {
    const groups = []
    let lastDate = ''
    for (const item of agenda) {
      if (item.date !== lastDate) {
        const dateObj = item.dateObj
        let label
        if (sameDay(dateObj, today)) label = 'Today'
        else if (sameDay(dateObj, addDays(today, 1))) label = 'Tomorrow'
        else label = `${DOW_SHORT[(dateObj.getDay() + 6) % 7]}, ${MON_SHORT[dateObj.getMonth()]} ${dateObj.getDate()}`
        groups.push({ label, items: [] })
        lastDate = item.date
      }
      groups[groups.length - 1].items.push(item)
    }
    return groups
  }, [agenda, today])

  return (
    <>
      <div className="side-title"><Calendar size={14} /> Upcoming</div>
      <div className="agenda-list">
        {grouped.length === 0 && <div className="agenda-empty">No upcoming events</div>}
        {grouped.map((g, gi) => (
          <div key={gi}>
            <div className="agenda-day-label">{g.label}</div>
            {g.items.map((item, ii) => {
              const color = eventColor(item.ev)
              return (
                <div key={ii} className="agenda-ev" onClick={() => onEditEvent(item.ev)}>
                  <span className="agenda-dot" style={{ background: color }} />
                  <div className="agenda-info">
                    <div className="agenda-title">{item.ev.title}</div>
                    <div className="agenda-time">
                      {item.ev.allDay ? 'All day' : `${fmtTime12(item.ev.start)} - ${fmtTime12(item.ev.end)}`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

// ═══════════════════════════════════════
// ─── Todo Sidebar ───
// ═══════════════════════════════════════
function TodoSidebar() {
  const [todos, setTodos] = useState(null)
  const todosRef = useRef(null)

  const fetchTodos = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/todo`, { headers: HEADERS })
      if (!r.ok) return
      const j = await r.json()
      todosRef.current = j
      setTodos(j)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchTodos()
    const interval = setInterval(fetchTodos, 10000)
    return () => clearInterval(interval)
  }, [fetchTodos])

  const toggleDone = useCallback(async (itemId) => {
    if (!todosRef.current) return
    const d = { ...todosRef.current }
    const items = [...(d.items || [])]
    const idx = items.findIndex(it => it.id === itemId)
    if (idx === -1) return
    items[idx] = { ...items[idx], done: !items[idx].done }
    d.items = items
    todosRef.current = d
    setTodos(d)
    try {
      await fetch(`${API_BASE}/api/todo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(d),
      })
    } catch { /* silent */ }
  }, [])

  // Show high-priority undone items
  const items = useMemo(() => {
    if (!todos || !todos.items) return []
    return todos.items
      .filter(it => it.priority === 'high' && !it.done)
      .slice(0, 10)
  }, [todos])

  const fmtDue = (due) => {
    if (!due) return ''
    const d = new Date(due + 'T00:00:00')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <>
      <div className="side-title"><List size={14} /> To-Do</div>
      <div className="todo-list">
        {items.length === 0 && (
          <div className="agenda-empty">{todos === null ? 'Loading...' : 'No high-priority tasks'}</div>
        )}
        {items.map(it => (
          <div key={it.id} className={`todo-item p-${it.priority || 'high'}`}>
            <input
              type="checkbox"
              checked={!!it.done}
              onChange={() => toggleDone(it.id)}
            />
            <span className={`todo-text${it.done ? ' done-text' : ''}`}>{it.text}</span>
            {it.due && <span className="todo-due">{fmtDue(it.due)}</span>}
          </div>
        ))}
      </div>
    </>
  )
}

// ═══════════════════════════════════════
// ─── Event Modal ───
// ═══════════════════════════════════════
function EventModal({ mode, initial, initialDate, initialTime, calendars, onClose, onSave, onDelete, onDuplicate }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [calId, setCalId] = useState(initial?.calId || (calendars[0]?.id || ''))
  const [date, setDate] = useState(initial?.date || initialDate || iso(new Date()))
  const [allDay, setAllDay] = useState(initial?.allDay ?? true)
  const [start, setStart] = useState(initial?.start || initialTime || '09:00')
  const [end, setEnd] = useState(initial?.end || (initialTime ? minToTime(timeToMin(initialTime) + 60) : '10:00'))
  const [notes, setNotes] = useState(initial?.notes || '')
  const [color, setColor] = useState(initial?.color || '')

  const [freq, setFreq] = useState(initial?.recur?.freq || 'none')
  const [interval, setInterval_] = useState(initial?.recur?.interval || 1)
  const [endsMode, setEndsMode] = useState(
    initial?.recur?.until ? 'on' : initial?.recur?.count ? 'after' : 'never'
  )
  const [until, setUntil] = useState(initial?.recur?.until || '')
  const [rcount, setRcount] = useState(initial?.recur?.count || 10)
  const [rdays, setRdays] = useState(new Set(initial?.recur?.days || []))
  const [calDropOpen, setCalDropOpen] = useState(false)

  const toggleDay = (n) => {
    setRdays(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })
  }

  const handleSave = () => {
    if (!title.trim()) return
    if (!calId) return
    if (!date) return
    const recur = freq === 'none' ? null : {
      freq,
      interval: Math.max(1, Number(interval) || 1),
      until: endsMode === 'on' ? (until || '') : '',
      count: endsMode === 'after' ? Math.max(1, Number(rcount) || 1) : 0,
      ...(freq === 'weekly' ? { days: [...rdays].sort() } : {}),
    }
    onSave({
      calId, title: title.trim(), date,
      allDay: !!allDay,
      start: allDay ? '' : start,
      end: allDay ? '' : end,
      notes: notes.trim(),
      color: color || '',
      recur,
    })
  }

  const selectedCal = calendars.find(c => c.id === calId)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Event' : 'New Event'}</h2>

        <div className="field">
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" autoFocus />
        </div>

        <div className="field">
          <label>Calendar</label>
          <div className="cal-dropdown">
            <button type="button" className="cal-dropdown-btn" onClick={() => setCalDropOpen(!calDropOpen)}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: selectedCal?.color || DEFAULT_CAL_COLOR, display: 'inline-block', flexShrink: 0 }} />
              {selectedCal?.name || 'Select calendar'}
            </button>
            {calDropOpen && (
              <div className="cal-dropdown-list">
                {calendars.map(c => (
                  <div
                    key={c.id}
                    className={`cal-dropdown-item${c.id === calId ? ' selected' : ''}`}
                    onClick={() => { setCalId(c.id); setCalDropOpen(false) }}
                  >
                    <span className="cal-dropdown-dot" style={{ background: c.color || DEFAULT_CAL_COLOR }} />
                    {c.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} style={{ accentColor: '#5FA09E' }} /> All Day
        </label>

        {!allDay && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Start</label>
              <input type="time" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>End</label>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
        )}

        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="field">
          <label>Repeat</label>
          <select value={freq} onChange={e => setFreq(e.target.value)}>
            <option value="none">Does Not Repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        {freq !== 'none' && (
          <>
            <div className="field">
              <label>Every</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" min="1" value={interval} onChange={e => setInterval_(e.target.value)}
                  style={{ width: 70 }} />
                <span style={{ fontSize: 13 }}>
                  {freq === 'daily' ? 'day(s)' : freq === 'weekly' ? 'week(s)' : freq === 'monthly' ? 'month(s)' : 'year(s)'}
                </span>
              </div>
            </div>

            {freq === 'weekly' && (
              <div className="field">
                <label>On Days</label>
                <div className="day-picks">
                  {[
                    [1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S'],
                  ].map(([n, l]) => (
                    <button
                      key={n}
                      type="button"
                      className={`day-pick${rdays.has(n) ? ' active' : ''}`}
                      onClick={() => toggleDay(n)}
                    >{l}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <label>Ends</label>
              <select value={endsMode} onChange={e => setEndsMode(e.target.value)} style={{ marginBottom: 8 }}>
                <option value="never">Never</option>
                <option value="on">On date</option>
                <option value="after">After N occurrences</option>
              </select>
              {endsMode === 'on' && (
                <input type="date" value={until} onChange={e => setUntil(e.target.value)} />
              )}
              {endsMode === 'after' && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="number" min="1" value={rcount} onChange={e => setRcount(e.target.value)} style={{ width: 70 }} />
                  <span style={{ fontSize: 13 }}>occurrences</span>
                </div>
              )}
            </div>
          </>
        )}

        <div className="field">
          <label>Event Colour</label>
          <div className="swatches">
            <span
              className={`swatch-cal${!color ? ' sel' : ''}`}
              onClick={() => setColor('')}
              title="Use calendar colour"
            />
            {PALETTE.map(c => (
              <span
                key={c}
                className={`swatch${color === c ? ' sel' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          {onDelete && <button className="del-btn" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
          {onDuplicate && <button className="dup-btn" onClick={onDuplicate}><Copy size={14} /> Duplicate</button>}
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ─── Calendar Modal ───
// ═══════════════════════════════════════
function CalendarModal({ mode, initial, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || DEFAULT_CAL_COLOR)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h2>{mode === 'edit' ? 'Edit Calendar' : 'Add Calendar'}</h2>

        <div className="field">
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Calendar name" autoFocus />
        </div>

        <div className="field">
          <label>Colour</label>
          <div className="swatches">
            {PALETTE.map(c => (
              <span
                key={c}
                className={`swatch${color === c ? ' sel' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          {onDelete && <button className="del-btn" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" onClick={() => name.trim() && onSave({ name, color })}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ─── Scope Modal (recurring) ───
// ═══════════════════════════════════════
function ScopeModal({ action, event, date, onClose, onSelect }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h2>{action === 'delete' ? 'Delete Recurring Event' : 'Edit Recurring Event'}</h2>
        <p style={{ fontSize: 13, color: '#6b6455', marginBottom: 4 }}>
          &quot;{event.title}&quot; repeats. {action === 'delete' ? 'What would you like to delete?' : 'What would you like to edit?'}
        </p>
        <div className="scope-options">
          <div className="scope-opt" onClick={() => onSelect('this')}>
            This event only
          </div>
          <div className="scope-opt" onClick={() => onSelect('following')}>
            This and following events
          </div>
          <div className="scope-opt" onClick={() => onSelect('all')}>
            All events
          </div>
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ─── Confirm Dialog ───
// ═══════════════════════════════════════
function ConfirmDialog({ msg, onYes, onNo }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onNo()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="confirm-msg">{msg}</div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onNo}>Cancel</button>
          <button className="del-btn" onClick={onYes} style={{ marginRight: 0, marginLeft: 'auto' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// ─── Context Menu ───
// ═══════════════════════════════════════
function ContextMenu({ x, y, items }) {
  // Adjust position so it doesn't overflow viewport
  const style = { left: Math.min(x, window.innerWidth - 180), top: Math.min(y, window.innerHeight - 160) }
  return (
    <div className="ctx-menu" style={style} onClick={e => e.stopPropagation()}>
      {items.map((item, i) => (
        <button key={i} className={item.danger ? 'ctx-danger' : ''} onClick={item.action}>
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  )
}
