// Kanban board — the "Projects" page under Home. Follows the v23 mockup
// (crania-projects.json shape). Server persistence via GET/PUT
// /api/projects; the whole payload is written on any edit.
//
// The mockup's folder-backup is deliberately not carried over — backups
// go to PocketBase through /api/projects/backup instead.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageActions, { PanelDisclosure } from '../components/PageActions'

const PJ_CSS = `
.pj-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0 8px;}
.pj-toolbar+.pj-toolbar{padding-top:0;}
.pj-toolbar button{background:#fff;border:1px solid #e2ded2;color:var(--brand-dark-brown);padding:5px 11px;font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;}
.pj-toolbar button:hover{background:#f4f2ea;}
.pj-toolbar button:disabled{opacity:.4;cursor:default;}
.pj-colspop{position:fixed;z-index:200;background:#fff;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:6px;display:flex;flex-direction:column;min-width:200px;}
.pj-colspop .h{font-size:12px;font-weight:700;color:#6B6455;padding:6px 10px 4px;}
.pj-colspop label{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;font-size:13.5px;cursor:pointer;}
.pj-colspop label:hover{background:#f4f2ea;}
.pj-colspop input[type=checkbox]{accent-color:var(--brand-dark-blue);margin:0;}
.pj-colspop .allrow{border-top:1px solid #EDEAE2;margin-top:4px;padding-top:4px;}
.pj-colspop .allrow button{background:none;border:none;color:var(--brand-dark-blue);font-weight:700;font-size:12.5px;text-align:left;padding:6px 10px;border-radius:6px;width:100%;cursor:pointer;}
.pj-colspop .allrow button:hover{background:#f4f2ea;}
/* Board settings sit inside the gear panel now, so these style a block in
   the flow rather than a floating card of its own — no positioning, no
   surface, and sized to match the rest of the panel. */
.pj-boardset .sp-card-title{font-weight:700;font-size:12.5px;margin-bottom:4px;color:var(--brand-dark-brown);}
.pj-boardset .sp-hint{font-size:11.5px;color:#6b6455;line-height:1.4;margin-bottom:4px;}
.pj-boardset .sp-btnrow{display:flex;gap:8px;margin-top:4px;align-items:center;}
.pj-boardset .sp-btn{background:var(--brand-dark-blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;}
.pj-boardset .sp-btn:hover:not(:disabled){filter:brightness(1.08);}
.pj-boardset .sp-time{border:1px solid #d5d0c4;border-radius:8px;padding:5px 8px;font:inherit;font-size:12.5px;background:#fff;color:var(--brand-dark-brown);}
/* Hiding a column is a quiet action — the eye only shows on the header it belongs to. */
.kb-col-head .kb-colhide{background:none;border:none;color:inherit;opacity:0;font-size:11px;padding:0 2px;margin-left:4px;cursor:pointer;transition:opacity .12s;}
.kb-col-head:hover .kb-colhide{opacity:.75;}
.kb-col-head .kb-colhide:hover{opacity:1;}
.pj-footer{text-align:center;font-size:12px;color:#9a948a;padding:16px 0 4px;}
.pj-archlink{background:none;border:none;color:var(--brand-dark-blue);font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:0;}
.pj-archlink:hover{text-decoration:underline;}
.pj-archive{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(46,37,22,.15);padding:16px;border-top:3px solid var(--brand-dark-blue);}
.pj-archive h3{margin:0 0 4px;font-size:15px;color:var(--brand-dark-brown);}
.pj-arch-empty{color:#9a948a;font-size:13px;padding:18px 0;text-align:center;}
.pj-arch-row{display:flex;align-items:center;gap:9px;padding:7px 4px;border-bottom:1px solid #f2efe6;font-size:13px;}
.pj-arch-row:last-child{border-bottom:none;}
.pj-arch-dot{width:10px;height:10px;border-radius:3px;flex:none;}
.pj-arch-task{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pj-arch-proj{font-size:11px;color:#6b6455;background:#F1F3F4;border-radius:4px;padding:1px 7px;flex:none;}
.pj-arch-when{font-size:11px;color:#9a948a;flex:none;white-space:nowrap;}
.pj-arch-restore{background:none;border:none;color:var(--brand-dark-blue);font:inherit;font-size:12px;font-weight:700;cursor:pointer;flex:none;}
.pj-arch-restore:hover{text-decoration:underline;}
.pj-ctx{position:fixed;z-index:300;display:flex;flex-direction:column;background:#fff;border:1px solid #e2ded2;
  border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);overflow:hidden;min-width:140px;}
.pj-ctx button{background:none;border:none;text-align:left;padding:8px 14px;font-size:13px;font-family:inherit;
  cursor:pointer;color:var(--brand-dark-brown);}
.pj-ctx button:hover{background:#f0efe7;}
.pj-ctx button.danger:hover{background:#fdecea;color:#c0392b;}
`

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const COLUMNS = [
  { id: 'notes', name: 'Announcements/Notes', cls: 'col-notes' },
  { id: 'goals', name: 'Today’s Goals',   cls: 'col-goals' },
  { id: 'daily', name: 'Daily Tasks',          cls: 'col-daily' },
  { id: 'todo',  name: 'Project Tasks',        cls: 'col-todo'  },
  { id: 'doing', name: 'In Progress',          cls: 'col-doing' },
  { id: 'done',  name: 'Done',                 cls: 'col-done'  },
]
const COL_BY_ID = Object.fromEntries(COLUMNS.map(c => [c.id, c]))

const DEFAULT_COLOR = '#5FA09E'
const colName = (id) => (COLUMNS.find(c => c.id === id) || {}).name || ''
const LIGHT_BLUE    = '#A6E2F9'
const PALETTE       = ['#5FA09E', '#A6E2F9', '#E0DE85', '#2E2516', '#20BAB5']
const COMMENT_MAX   = 140
const WD_ABBR       = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const isoLocal = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}
const nowHM = () => {
  const d = new Date()
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
const dueClass = (due) => {
  if (!due) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(due + 'T00:00:00')
  const diff = (d - today) / 86400000
  if (diff < 0)  return 'overdue'
  if (diff <= 2) return 'soon'
  return ''
}
const fmtDue = (due) => {
  if (!due) return ''
  const d = new Date(due + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
const fmtDay = (iso) => {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
const fmtDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
const textOn = (hex) => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return '#2E2516'
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 >= 155 ? '#2E2516' : '#ffffff'
}
const daysLabel = (days) => {
  if (!days || !days.length) return ''
  if (days.length === 7) return 'Daily'
  return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => WD_ABBR[d]).join(', ')
}

/* The most recent time-of-day boundary that has already passed. */
function passedBoundary(now, hm) {
  const [hs, ms] = String(hm || '00:00').split(':')
  const b = new Date(now)
  b.setHours(Number(hs) || 0, Number(ms) || 0, 0, 0)
  if (now < b) b.setDate(b.getDate() - 1)
  return b
}

/* Recurring cards come back to Daily Tasks each day they are scheduled for.
   Walks every boundary missed since the last run — up to 62 days — so a board
   left closed over a break catches up rather than skipping straight to today.
   Mutates `d`; returns whether anything changed. */
function processResets(d) {
  const now = new Date()
  const boundary = passedBoundary(now, d.resetTime || '08:00')
  const bTime = boundary.getTime()
  if (d.lastResetAt && d.lastResetAt >= bTime) return false

  const [hs, ms] = String(d.resetTime || '08:00').split(':')
  const h = Number(hs) || 0, m = Number(ms) || 0
  const bDay = new Date(boundary); bDay.setHours(0, 0, 0, 0)

  const doDay = (dd) => {
    const wd = dd.getDay(), diso = isoLocal(dd)
    d.cards = d.cards.map(c => (c.days && c.days.includes(wd))
      ? { ...c, col: c.col === 'done' ? 'daily' : c.col, dayDate: diso }
      : c)
  }

  if (!d.lastResetAt) {
    doDay(bDay)
  } else {
    const dd = new Date(d.lastResetAt); dd.setHours(0, 0, 0, 0)
    for (let g = 0; g < 62; g++) {
      const bd = new Date(dd); bd.setHours(h, m, 0, 0)
      if (bd.getTime() > d.lastResetAt && bd.getTime() <= bTime) doDay(dd)
      if (dd.getTime() >= bDay.getTime()) break
      dd.setDate(dd.getDate() + 1)
    }
  }
  d.lastResetAt = bTime
  d.lastReset = isoLocal(bDay)
  return true
}

/* Today's Goals empties at its own boundary. The first run only stamps the
   time — otherwise opening the board for the first time would wipe goals that
   were never given a chance to carry over. */
function processGoalsClear(d) {
  const boundary = passedBoundary(new Date(), d.clearGoalsTime || '00:00')
  const bTime = boundary.getTime()
  if (d.lastGoalsClearAt && d.lastGoalsClearAt >= bTime) return false
  const first = !d.lastGoalsClearAt
  d.lastGoalsClearAt = bTime
  d.lastGoalsClear = isoLocal(boundary)
  if (first) return false
  const had = d.cards.some(c => c.col === 'goals')
  d.cards = d.cards.filter(c => c.col !== 'goals')
  return had
}

/* Only real column ids, so a stale id cannot hide a column that no longer
   matches anything. */
function normalizeHiddenCols(x) {
  const out = {}
  if (x && typeof x === 'object') COLUMNS.forEach(c => { if (x[c.id]) out[c.id] = true })
  return out
}

const BLANK_STATE = {
  cards: [], colOrder: COLUMNS.map(c => c.id), hiddenCols: {},
  updatedAt: null, resetTime: '08:00', clearGoalsTime: '00:00',
}

// ---------- store hook ----------
function useProjects() {
  const [state, setState] = useState(BLANK_STATE)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading') // loading | online | offline
  const saveTimer = useRef(null)
  const latest = useRef(state)
  latest.current = state

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/projects`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setState({
        cards:            Array.isArray(j.cards) ? j.cards : [],
        colOrder:         Array.isArray(j.colOrder) && j.colOrder.length ? j.colOrder : COLUMNS.map(c => c.id),
        hiddenCols:       normalizeHiddenCols(j.hiddenCols),
        updatedAt:        j.updatedAt || null,
        resetTime:        j.resetTime || '08:00',
        clearGoalsTime:   j.clearGoalsTime || '00:00',
        lastReset:        j.lastReset, lastResetAt: j.lastResetAt,
        lastBackup:       j.lastBackup, lastBackupAt: j.lastBackupAt,
        clearGoals:       !!j.clearGoals,
        lastGoalsClear:   j.lastGoalsClear, lastGoalsClearAt: j.lastGoalsClearAt,
      })
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  /* `onChange(prevSnap, nextSnap)` runs inside the updater with the states
     either side of the edit, so callers can record history against the
     snapshot actually being replaced. */
  const mutate = useCallback((mutFn, onChange) => {
    setState(prev => {
      const prevSnap = onChange ? JSON.stringify(prev) : null
      const next = { ...prev, cards: [...prev.cards], colOrder: [...prev.colOrder] }
      mutFn(next)
      next.updatedAt = new Date().toISOString()
      if (onChange) {
        /* updatedAt always moves, so compare without it. */
        const strip = (o) => { const { updatedAt, ...rest } = o; return JSON.stringify(rest) }
        if (strip(prev) !== strip(next)) onChange(prevSnap, JSON.stringify(next))
      }
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/projects`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify(latest.current),
        }).catch(() => {})
      }, 350)
      return next
    })
  }, [])

  return { state, setState, loading, status, refresh, mutate }
}

// ---------- Projects page ----------
export default function Projects() {
  const { state, setState, loading, status, mutate } = useProjects()
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const hiddenCols = state.hiddenCols || {}
  const [colsOpen, setColsOpen] = useState(false)
  const [archiveMode, setArchiveMode] = useState(false)
  const [cardCtx, setCardCtx] = useState(null)   // { x, y, id }
  const dragCardId = useRef(null)
  const colsBtnRef = useRef(null)
  const colsPopRef = useRef(null)

  /* Daily tasks come back and goals clear on their own schedule — checked once
     the board has loaded, then every five minutes so a tab left open overnight
     still turns over. Not put through history: it is the clock's doing, not an
     edit anyone would want to undo. */
  useEffect(() => {
    if (loading) return
    const run = () => mutate(d => { processResets(d); processGoalsClear(d) })
    run()
    const t = setInterval(run, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [loading, mutate])

  // Undo / redo
  const undoStack = useRef([])
  const redoStack = useRef([])
  const histBase = useRef(null)
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)

  useEffect(() => {
    if (!loading && histBase.current === null) histBase.current = JSON.stringify(state)
  }, [loading, state])

  /* Push the state we are leaving, inside the updater, so the snapshot is the
     one actually being replaced. The old code compared the pre-edit state
     against histBase — which already held exactly that — so the first edit
     recorded nothing and every later one pushed a snapshot a full edit stale.
     Undoing then jumped back two steps and threw an edit away. */
  const mutateWithHistory = useCallback((mutFn) => {
    mutate(mutFn, (prevSnap, nextSnap) => {
      if (prevSnap === nextSnap) return
      undoStack.current.push(prevSnap)
      if (undoStack.current.length > 100) undoStack.current.shift()
      redoStack.current = []
      histBase.current = nextSnap
      setUndoLen(undoStack.current.length)
      setRedoLen(0)
    })
  }, [mutate])

  const undo = useCallback(() => {
    if (!undoStack.current.length) return
    redoStack.current.push(JSON.stringify(state))
    const prev = JSON.parse(undoStack.current.pop())
    histBase.current = JSON.stringify(prev)
    setState(prev)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
    fetch(`${API_BASE}/api/projects`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...HEADERS },
      body: JSON.stringify(prev),
    }).catch(() => {})
  }, [state, setState])

  const redo = useCallback(() => {
    if (!redoStack.current.length) return
    undoStack.current.push(JSON.stringify(state))
    const next = JSON.parse(redoStack.current.pop())
    histBase.current = JSON.stringify(next)
    setState(next)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
    fetch(`${API_BASE}/api/projects`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...HEADERS },
      body: JSON.stringify(next),
    }).catch(() => {})
  }, [state, setState])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest('input,textarea,select')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); if (e.shiftKey) redo(); else undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e) => {
      if (colsOpen && colsPopRef.current && !colsPopRef.current.contains(e.target)
          && colsBtnRef.current && !colsBtnRef.current.contains(e.target)) setColsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colsOpen])

  /* Archived cards, newest first, and honouring the same search box. */
  const archivedCards = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return state.cards
      .filter(c => c.archived)
      .filter(c => !q || ((c.project || '') + ' ' + (c.task || '') + ' ' + (c.tags || []).join(' '))
        .toLowerCase().includes(q))
      .sort((a, b) => String(b.archivedAt || '').localeCompare(String(a.archivedAt || '')))
  }, [state.cards, filter])

  const cardsByCol = useMemo(() => {
    const out = {}
    for (const col of state.colOrder) out[col] = []
    const q = filter.trim().toLowerCase()
    for (const c of state.cards) {
      if (c.archived) continue
      if (q) {
        const hay = ((c.project || '') + ' ' + (c.task || '') + ' ' + (c.who || '')
          + ' ' + (c.tags || []).join(' ')
          + ' ' + (c.comments || []).map(x => (x.author || '') + ' ' + (x.text || '')).join(' ')
        ).toLowerCase()
        if (!hay.includes(q)) continue
      }
      const bucket = out[c.col] || (out[c.col] = [])
      bucket.push(c)
    }
    for (const key of Object.keys(out)) {
      if (key === 'notes') {
        out[key].sort((a, b) => (b.created || '').localeCompare(a.created || ''))
      } else {
        out[key].sort((a, b) => {
          const p = (a.project || '').toLowerCase().localeCompare((b.project || '').toLowerCase())
          if (p !== 0) return p
          return (a.task || '').toLowerCase().localeCompare((b.task || '').toLowerCase())
        })
      }
    }
    return out
  }, [state.cards, state.colOrder, filter])

  const orderedCols = useMemo(
    () => state.colOrder.map(id => COL_BY_ID[id]).filter(Boolean),
    [state.colOrder],
  )

  const visibleCols = useMemo(
    () => orderedCols.filter(c => !hiddenCols[c.id]),
    [orderedCols, hiddenCols],
  )

  const onDragStart = (id) => { dragCardId.current = id }
  const onDropTo = (colId) => {
    const id = dragCardId.current
    dragCardId.current = null
    if (!id) return
    mutateWithHistory(s => {
      const idx = s.cards.findIndex(c => c.id === id)
      if (idx === -1) return
      s.cards[idx] = { ...s.cards[idx], col: colId }
    })
  }

  const remove = (id) => {
    const c = state.cards.find(x => x.id === id)
    const label = c ? (c.task || c.project || 'this card') : 'this card'
    if (!confirm(`Delete "${label}"?`)) return
    mutateWithHistory(s => { s.cards = s.cards.filter(x => x.id !== id) })
  }

  const duplicate = (id) => {
    mutateWithHistory(s => {
      const idx = s.cards.findIndex(c => c.id === id)
      if (idx === -1) return
      s.cards.splice(idx + 1, 0, { ...s.cards[idx], id: uid(), created: new Date().toISOString() })
    })
  }

  const toggleGoal = (cardId, goalId) => {
    mutateWithHistory(s => {
      const c = s.cards.find(x => x.id === cardId)
      if (!c) return
      c.goals = (c.goals || []).map(g => g.id === goalId ? { ...g, done: !g.done } : g)
    })
  }

  const openNew  = (colId) => setEditing({ mode: 'new', col: colId })
  const openEdit = (card)  => setEditing({ mode: 'edit', card })

  const saveCard = (form) => {
    mutateWithHistory(s => {
      if (editing.mode === 'new') {
        s.cards.push({
          id: uid(), col: editing.col, created: new Date().toISOString(),
          archived: false, archivedFrom: '', archivedAt: '',
          ...form,
        })
      } else {
        const idx = s.cards.findIndex(c => c.id === editing.card.id)
        if (idx !== -1) s.cards[idx] = { ...s.cards[idx], ...form }
      }
    })
    setEditing(null)
  }

  const CSV_COLUMNS = [
    { label: 'Column', value: c => colName(c.col) || c.col },
    { key: 'project', label: 'Project' },
    { key: 'task', label: 'Task / Note' },
    { key: 'who', label: 'Assigned To' },
    { label: 'Tags', value: c => (c.tags || []).join(', ') },
    { key: 'due', label: 'Due Date' },
    { label: 'Repeat Days', value: c => daysLabel(c.days) },
    { label: 'Goals', value: c => (c.goals || []).map(g => `${g.done ? '[x]' : '[ ]'} ${g.text || ''}`).join(' | ') },
    { label: 'Comments', value: c => (c.comments || []).map(x => `${x.date || ''} ${x.author || ''}: ${x.text || ''}`).join(' | ') },
    { label: 'Archived', value: c => (c.archived ? 'Yes' : 'No') },
    { label: 'Archived At', value: c => (c.archivedAt ? fmtDateTime(c.archivedAt) : '') },
  ]

  /* Archived cards are included and sorted last, so the export is the whole
     board rather than only what is on screen — deliberately, because the
     board's own filter is a find-as-you-type box, not a saved view. */
  const csvRows = () => {
    const pos = id => {
      const i = state.colOrder.indexOf(id)
      return i < 0 ? 99 : i
    }
    return [...state.cards].sort((a, b) =>
      (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || pos(a.col) - pos(b.col))
  }

  /* Pull every repeating card back to Daily Tasks now, without waiting for the
     boundary. Undoable, since this one is a deliberate action. */
  const resetDailyNow = () => mutateWithHistory(d => {
    const today = isoLocal(new Date())
    d.cards = d.cards.map(c => (c.days && c.days.length && c.col === 'done')
      ? { ...c, col: 'daily', dayDate: today } : c)
  })
  const clearGoalsNow = () => mutateWithHistory(d => {
    d.cards = d.cards.filter(c => c.col !== 'goals')
  })

  /* Archiving keeps the card and remembers where it came from, so restoring
     puts it back in its own column rather than a default one. */
  const archiveCard = (id) => mutateWithHistory(d => {
    d.cards = d.cards.map(c => c.id === id
      ? { ...c, archived: true, archivedFrom: c.col, archivedAt: new Date().toISOString() }
      : c)
  })
  const restoreCard = (id) => mutateWithHistory(d => {
    d.cards = d.cards.map(c => c.id === id
      ? { ...c, archived: false, col: c.archivedFrom || c.col, archivedFrom: '', archivedAt: '' }
      : c)
  })

  /* Which columns are hidden is part of the board, not of this browser tab —
     it saves with everything else so it survives a reload. */
  const toggleCol = (colId) => mutate(d => {
    const next = { ...(d.hiddenCols || {}) }
    if (next[colId]) delete next[colId]; else next[colId] = true
    d.hiddenCols = next
  })
  const anyHidden = COLUMNS.some(c => hiddenCols[c.id])
  const toggleAllCols = () => mutate(d => {
    d.hiddenCols = anyHidden ? {} : Object.fromEntries(COLUMNS.map(c => [c.id, true]))
  })

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page">
      <style>{PJ_CSS}</style>
      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      <PageActions
        onUndo={undo} onRedo={redo}
        undoLabel={undoLen ? 'last board change' : ''}
        redoLabel={redoLen ? 'last undone change' : ''}
        csvName="crania-projects-export"
        csvColumns={CSV_COLUMNS}
        csvRows={csvRows}
        backupCollection="projects"
        backupHint="Snapshots of every card on the board, archived ones included (last 14 kept)."
        /* Board settings sit in the panel itself rather than behind a
           button that opened a second floating layer over it. */
        settingsExtra={
          <BoardSettings
            state={state}
            mutate={mutate}
            onResetNow={resetDailyNow}
            onClearGoalsNow={clearGoalsNow}
          />
        }
      />

      <div className="pj-toolbar">
        <input
          className="kb-filter"
          type="search"
          placeholder="Filter cards…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d5d0c4', background: '#fff', font: 'inherit', fontSize: 13, width: 220 }}
        />
        <button ref={colsBtnRef} title="Choose which columns are shown" onClick={() => setColsOpen(v => !v)}>
          👁 Columns
        </button>
        {state.updatedAt && (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9a948a' }}>
            Last updated {new Date(state.updatedAt).toLocaleString(undefined,
              { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>

      {colsOpen && (
        <div className="pj-colspop" ref={colsPopRef}
          style={{ position: 'absolute', zIndex: 200,
            top: colsBtnRef.current ? colsBtnRef.current.getBoundingClientRect().bottom + 6 : 200,
            left: colsBtnRef.current ? Math.min(colsBtnRef.current.getBoundingClientRect().left, window.innerWidth - 220) : 100,
          }}
        >
          <div className="h">Show Columns</div>
          {orderedCols.map(col => (
            <label key={col.id}>
              <input type="checkbox" checked={!hiddenCols[col.id]} onChange={() => toggleCol(col.id)} />
              <span>{col.name}</span>
            </label>
          ))}
          <div className="allrow">
            <button type="button" onClick={toggleAllCols}>
              {anyHidden ? 'Show All Columns' : 'Hide All Columns'}
            </button>
          </div>
        </div>
      )}


      {archiveMode ? (
        <div className="pj-archive">
          <h3>Archived Cards</h3>
          <div className="sp-hint" style={{ marginBottom: 10 }}>
            Restoring a card sends it back to the column it was archived from.
          </div>
          {archivedCards.length === 0 && (
            <div className="pj-arch-empty">Nothing archived yet.</div>
          )}
          {archivedCards.map(c => (
            <div key={c.id} className="pj-arch-row">
              <span className="pj-arch-dot" style={{ background: c.color || DEFAULT_COLOR }} />
              <span className="pj-arch-task">{c.task || '(untitled)'}</span>
              {c.project && <span className="pj-arch-proj">{c.project}</span>}
              <span className="pj-arch-when">
                {colName(c.archivedFrom)}{c.archivedAt ? ` · ${fmtDateTime(c.archivedAt)}` : ''}
              </span>
              <button className="pj-arch-restore" onClick={() => restoreCard(c.id)}>↩ Restore</button>
              <button className="kb-x" title="Delete for good" onClick={() => remove(c.id)}>×</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${visibleCols.length || 1}, 1fr)` }}>
          {visibleCols.map(col => (
            <BoardColumn
              key={col.id}
              col={col}
              cards={cardsByCol[col.id] || []}
              onDragStart={onDragStart}
              onDrop={() => onDropTo(col.id)}
              onAdd={() => openNew(col.id)}
              onEdit={openEdit}
              onDelete={remove}
              onDuplicate={duplicate}
              onToggleGoal={toggleGoal}
              onHide={() => toggleCol(col.id)}
              onCardCtx={(e, id) => {
                e.preventDefault(); e.stopPropagation()
                setCardCtx({ x: e.clientX, y: e.clientY, id })
              }}
            />
          ))}
        </div>
      )}

      {cardCtx && (() => {
        const card = state.cards.find(c => c.id === cardCtx.id)
        if (!card) return null
        const close = () => setCardCtx(null)
        const items = [
          { label: 'Edit', on: () => openEdit(card) },
          { label: 'Duplicate', on: () => duplicate(card.id) },
          { label: 'Archive', on: () => archiveCard(card.id) },
          { label: 'Delete', danger: true, on: () => remove(card.id) },
        ]
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 299 }}
              onClick={close} onContextMenu={e => { e.preventDefault(); close() }} />
            <div className="pj-ctx" style={{
              left: Math.min(cardCtx.x, window.innerWidth - 160),
              top: Math.min(cardCtx.y, window.innerHeight - 170),
            }}>
              {items.map(it => (
                <button key={it.label} type="button" className={it.danger ? 'danger' : undefined}
                  onClick={() => { close(); it.on() }}>{it.label}</button>
              ))}
            </div>
          </>
        )
      })()}

      <div className="pj-footer">
        <span>CraniaVerse · Projects</span>
        {' · '}
        <button className="pj-archlink" onClick={() => setArchiveMode(v => !v)}>
          {archiveMode ? 'Back to board' : `Archived${archivedCards.length ? ` (${archivedCards.length})` : ''}`}
        </button>
      </div>

      {editing && (
        <CardModal
          mode={editing.mode}
          initial={editing.card}
          col={editing.card?.col || editing.col}
          onClose={() => setEditing(null)}
          onSave={saveCard}
          onDelete={editing.mode === 'edit' ? () => { remove(editing.card.id); setEditing(null) } : null}
        />
      )}
    </div>
  )
}

// ---------- Board column ----------
function BoardColumn({ col, cards, onDragStart, onDrop, onAdd, onEdit, onDelete, onDuplicate, onToggleGoal, onHide, onCardCtx }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={`kb-col ${col.cls}${over ? ' dragover' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop() }}
    >
      <div className="kb-col-head">
        {col.name}
        <span className="count">{cards.length}</span>
        <button className="kb-colhide" title="Hide this column" onClick={onHide}>👁</button>
      </div>
      <div className="kb-cards">
        {cards.length === 0 && <div className="kb-empty">No cards</div>}
        {cards.map(c => (
          <BoardCard
            key={c.id}
            card={c}
            onDragStart={onDragStart}
            onEdit={onEdit}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onToggleGoal={onToggleGoal}
            onCardCtx={onCardCtx}
          />
        ))}
      </div>
      <button className="kb-add" onClick={onAdd}>+ Add Card</button>
    </div>
  )
}

// ---------- Board card ----------
function BoardCard({ card, onDragStart, onEdit, onDelete, onDuplicate, onToggleGoal, onCardCtx }) {
  const isGoals = card.col === 'goals'
  const isDaily = (card.days && card.days.length > 0) || card.col === 'daily'
  const isNote  = card.col === 'notes'

  if (isGoals) {
    return (
      <div
        className="kb-card"
        style={{ background: '#E7EAEC', color: '#2E2516' }}
        draggable
        onDragStart={() => onDragStart(card.id)}
        onDoubleClick={() => onEdit(card)}
        onContextMenu={(e) => onCardCtx(e, card.id)}
      >
        <button className="kb-dup" title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicate(card.id) }}>⧉</button>
        <button className="kb-x"   title="Delete"    onClick={(e) => { e.stopPropagation(); onDelete(card.id)    }}>×</button>
        {card.who && <div style={{ fontWeight: 700, fontSize: 14 }}>{card.who}</div>}
        {card.created && <div style={{ fontSize: 10.5, color: '#8a8474', marginBottom: 5 }}>Added {fmtDateTime(card.created)}</div>}
        <div className="kb-goals">
          {(card.goals || []).length === 0 && <div className="kb-empty" style={{ padding: '6px 2px' }}>No goals yet — open to add</div>}
          {(card.goals || []).map(g => (
            <label key={g.id} className="row">
              <input type="checkbox" checked={!!g.done}
                onChange={(e) => { e.stopPropagation(); onToggleGoal(card.id, g.id) }}
                onClick={(e) => e.stopPropagation()} />
              <span className={'text' + (g.done ? ' done' : '')}>{g.text}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  const bg = isNote ? '#FFFFFF' : (isDaily ? '#D2D6DA' : (card.color || DEFAULT_COLOR))
  const fg = textOn(bg)
  const whoStyle = isDaily
    ? { background: '#8A9096', color: '#fff' }
    : (bg.toLowerCase() === LIGHT_BLUE.toLowerCase() ? { background: '#5FA09E', color: '#fff' } : undefined)

  const dc = card.col === 'done' ? '' : dueClass(card.due)
  const lastComment = (card.comments || []).length
    ? [...card.comments].sort((a, b) => (a.date || '').localeCompare(b.date || '')).pop()
    : null
  const unreadCount = (card.comments || []).filter(x => !x.read).length

  return (
    <div
      className={'kb-card' + (isDaily ? ' slim' : '')}
      style={{ background: bg, color: fg }}
      draggable
      onDragStart={() => onDragStart(card.id)}
      onDoubleClick={() => onEdit(card)}
      onContextMenu={(e) => onCardCtx(e, card.id)}
    >
      <button className="kb-dup" title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicate(card.id) }}>⧉</button>
      <button className="kb-x"   title="Delete"    onClick={(e) => { e.stopPropagation(); onDelete(card.id)    }}>×</button>
      {card.project && !isDaily && <div className="project">{card.project}</div>}
      <div className="task">{card.task}</div>
      {isNote && card.created && <div style={{ fontSize: 10.5, color: '#8a8474', marginBottom: 5 }}>Posted {fmtDateTime(card.created)}</div>}
      <div className="meta">
        {card.who && <span className="chip who" style={whoStyle}>{card.who}</span>}
        {card.due && !isDaily && (
          <span className={`chip due ${dc}`}>{fmtDue(card.due)}{dc === 'overdue' ? ' · overdue' : ''}</span>
        )}
        {card.days && card.days.length > 0 && (
          <span className="chip recur">↻ {daysLabel(card.days)}</span>
        )}
        {(card.tags || []).map(t => {
          const b = bg.toLowerCase()
          const style = b === '#2e2516'
            ? { background: '#A6E2F9', color: '#2E2516' }
            : b === LIGHT_BLUE.toLowerCase()
              ? { background: '#5FA09E', color: '#fff' }
              : undefined
          return <span key={t} className="chip tag" style={style}>@{t}</span>
        })}
      </div>
      {lastComment && (
        <div className="cfoot">
          {unreadCount > 0 && <span className="unread">● {unreadCount} New</span>}
          <span>
            <span className="cdate">
              {fmtDay(lastComment.date)}{lastComment.time ? ' ' + lastComment.time : ''}
              {lastComment.author ? ' · ' + lastComment.author : ''}
              {':'}
            </span>{' '}
            {lastComment.text}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------- Card modal ----------
function CardModal({ mode, initial, col, onClose, onSave, onDelete }) {
  const isGoals = col === 'goals'
  const isNotes = col === 'notes'
  const isDaily = col === 'daily' || (initial?.days && initial.days.length > 0)

  const [project, setProject]  = useState(initial?.project || '')
  const [task, setTask]        = useState(initial?.task || '')
  const [who, setWho]          = useState(initial?.who || '')
  const [tags, setTags]        = useState((initial?.tags || []).join(', '))
  const [due, setDue]          = useState(initial?.due || '')
  const [days, setDays]        = useState(new Set(initial?.days || (isDaily ? [0, 1, 2, 3, 4, 5, 6] : [])))
  const [color, setColor]      = useState(initial?.color || DEFAULT_COLOR)
  const [comments, setComments]= useState((initial?.comments || []).map(c => ({ ...c })))
  const [goals, setGoals]      = useState(() => {
    const g = initial?.goals || []
    return Array.from({ length: 5 }, (_, i) => g[i] || { id: uid(), text: '', done: false })
  })

  // New-comment scratch fields
  const [nDate, setNDate]     = useState(isoLocal(new Date()))
  const [nAuthor, setNAuthor] = useState('')
  const [nText, setNText]     = useState('')

  const toggleDay = (n) => {
    setDays(prev => {
      const next = new Set(prev)
      next.has(n) ? next.delete(n) : next.add(n)
      return next
    })
  }
  const toggleAllDays = () => {
    setDays(prev => prev.size === 7 ? new Set() : new Set([0, 1, 2, 3, 4, 5, 6]))
  }

  const addComment = () => {
    if (!nDate || !nText.trim() || !nAuthor.trim()) {
      alert('Comment, date, and name are all required.'); return
    }
    setComments(prev => [...prev, {
      id: uid(), date: nDate, time: nowHM(),
      author: nAuthor.trim().slice(0, 40),
      text: nText.trim().replace(/\s+/g, ' ').slice(0, COMMENT_MAX),
      read: false,
    }])
    setNText(''); setNAuthor('')
  }

  const removeComment = (id) => setComments(prev => prev.filter(c => c.id !== id))

  const handleSave = () => {
    if (isGoals) {
      const g = goals.filter(x => x.text.trim()).map(x => ({
        id: x.id || uid(), text: x.text.trim().slice(0, 80), done: !!x.done,
      }))
      if (!g.length) { alert('Please add at least one goal.'); return }
      onSave({
        col, project: '', task: '', who: who.trim(), due: '',
        tags: [], days: [], dayDate: '', color: DEFAULT_COLOR,
        comments, goals: g,
      })
      return
    }
    if (!isNotes && !project.trim()) { alert('Please enter a project.'); return }
    if (!task.trim()) { alert('Please enter a task or note.'); return }
    const tagsArr = tags.split(',').map(t => t.trim()).filter(Boolean)
    const dayArr = [...days].sort()
    onSave({
      col,
      project: project.trim(),
      task: task.trim(),
      who: who.trim(),
      due,
      tags: tagsArr,
      days: dayArr,
      dayDate: dayArr.length ? (initial?.dayDate || isoLocal(new Date())) : '',
      color: isDaily ? DEFAULT_COLOR : color,
      comments,
      goals: [],
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <h2>
          {mode === 'edit'
            ? 'Edit Card'
            : isNotes ? 'New Announcement'
              : isGoals ? 'New Goals Card'
              : isDaily ? 'New Daily Task'
              : 'New Card'}
        </h2>

        {!isGoals && !isNotes && (
          <div className="kb-field">
            <label>Project</label>
            <input value={project} onChange={e => setProject(e.target.value)}
                   placeholder="e.g. Autumn enrolment" autoFocus />
          </div>
        )}

        {!isGoals && (
          <div className="kb-field">
            <label>{isNotes ? 'Announcement / Note' : 'Task'}</label>
            <input value={task} onChange={e => setTask(e.target.value)}
                   placeholder={isNotes ? 'e.g. Staff meeting Friday at 4' : 'e.g. Draft the flyer'}
                   autoFocus={isNotes} />
          </div>
        )}

        {isGoals && (
          <>
            <div className="kb-field">
              <label>Your Name</label>
              <input value={who} onChange={e => setWho(e.target.value)} placeholder="e.g. Hana" autoFocus />
            </div>
            <div className="kb-field">
              <label>Goals (Up to 5) — Tick When Done</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {goals.map((g, i) => (
                  <div key={g.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'center' }}>
                    <input type="checkbox" checked={!!g.done}
                      onChange={e => setGoals(prev => prev.map((x, j) => j === i ? { ...x, done: e.target.checked } : x))}
                      style={{ width: 16, height: 16 }} />
                    <input value={g.text} placeholder={`Goal ${i + 1}`}
                      onChange={e => setGoals(prev => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!isGoals && (
          <div className="kb-field">
            <label>Tags</label>
            <input value={tags} onChange={e => setTags(e.target.value)}
                   placeholder="e.g. Sam, urgent — separate with commas" />
          </div>
        )}

        {!isGoals && !isNotes && !isDaily && (
          <div className="kb-field">
            <label>Due Date</label>
            <input type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
        )}

        {isDaily && (
          <div className="kb-field">
            <label>Repeat On</label>
            <div className="kb-daychecks">
              {[
                [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'],
                [5, 'Fri'], [6, 'Sat'], [0, 'Sun'],
              ].map(([n, l]) => (
                <label key={n}>
                  <input type="checkbox" checked={days.has(n)} onChange={() => toggleDay(n)} /> {l}
                </label>
              ))}
              <span className="dayall" onClick={toggleAllDays}>All / None</span>
            </div>
          </div>
        )}

        {!isGoals && (
          <div className="kb-field">
            <label>Comments — Keep Them Positive :)</label>
            <div className="kb-clist">
              {comments.length === 0 && (
                <div style={{ color: '#9a948a', fontSize: 12.5, padding: 10 }}>No comments yet.</div>
              )}
              {comments
                .slice()
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                .map(c => (
                  <div key={c.id} className={'kb-crow' + (c.read ? '' : ' unread')}>
                    <span className="cdate">
                      {fmtDay(c.date)}{c.time ? ' ' + c.time : ''}
                    </span>
                    {c.author && <span className="cauthor">{c.author}</span>}
                    <span className="ctext" title={c.text}>{c.text}</span>
                    <span className="cdel" onClick={() => removeComment(c.id)}>✕</span>
                  </div>
                ))}
            </div>
            <div className="kb-caddrow">
              <input type="date" className="date" value={nDate} onChange={e => setNDate(e.target.value)} />
              <input className="comment" placeholder="Comment (one line)…" maxLength={COMMENT_MAX}
                     value={nText} onChange={e => setNText(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment() } }} />
              <input className="author" placeholder="Name"
                     value={nAuthor} onChange={e => setNAuthor(e.target.value)} />
              <button type="button" onClick={addComment}>Add</button>
            </div>
          </div>
        )}

        {!isGoals && !isDaily && !isNotes && (
          <div className="kb-field">
            <label>Card Colour</label>
            <div className="kb-swatches">
              {PALETTE.map(c => (
                <span
                  key={c}
                  className={'kb-swatch' + (color.toLowerCase() === c.toLowerCase() ? ' sel' : '')}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                     style={{ width: 38, height: 28, border: '1px solid #d5d0c4', borderRadius: 6 }} />
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

// ---------- Board settings, rendered inside the gear panel ----------
/* This was a floating popover opened by a button inside the settings
   panel — a second layer stacked on the panel, which already carried a
   Backups section of its own, so the board offered two sets of backups.
   The ones here are gone; the shared panel below covers them. What is
   left, the two daily times, now renders in the panel itself rather than
   sending you somewhere else to reach it. */
function BoardSettings({ state, mutate, onResetNow, onClearGoalsNow }) {
  return (
    <div className="pj-boardset">
      <div className="sp-card-title">Daily Tasks</div>
      <div className="sp-hint">
        Cards with repeat days return to Daily Tasks at this time each day.
      </div>
      <div className="sp-btnrow">
        <input type="time" className="sp-time" value={state.resetTime || '08:00'}
          onChange={e => mutate(d => { d.resetTime = e.target.value || '08:00' })} />
        <button className="sp-btn" onClick={onResetNow}>Reset Now</button>
      </div>
      {state.lastResetAt && (
        <div className="sp-hint" style={{ marginTop: 4 }}>
          Last reset {fmtDateTime(new Date(state.lastResetAt).toISOString())}
        </div>
      )}

      <div className="sp-card-title" style={{ marginTop: 12 }}>Today’s Goals</div>
      <div className="sp-hint">Goals cards are cleared out at this time each day.</div>
      <div className="sp-btnrow">
        <input type="time" className="sp-time" value={state.clearGoalsTime || '00:00'}
          onChange={e => mutate(d => { d.clearGoalsTime = e.target.value || '00:00' })} />
        <button className="sp-btn" onClick={onClearGoalsNow}>Clear Now</button>
      </div>
    </div>
  )
}
