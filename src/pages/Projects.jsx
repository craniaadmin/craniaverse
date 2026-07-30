// Kanban board — the "Projects" page under Home. Ported from the
// v20 mockup (crania-projects.json shape). Server persistence via
// GET/PUT /api/projects; the whole payload is written on any edit.
//
// v1 covers the essentials — six columns, drag/drop, add/edit/delete
// cards, comments, goals cards, filter, color picker. Not yet ported
// (round-trips as data, just no UI): archive mode, undo/redo, CSV
// export, timed daily/goals resets, folder-backup. Add later.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
.pj-settings{position:fixed;z-index:200;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:14px;width:300px;top:120px;right:16px;}
.pj-settings .sp-card-title{font-weight:700;font-size:14px;margin-bottom:6px;color:var(--brand-dark-brown);}
.pj-settings .sp-hint{font-size:12px;color:#6b6455;line-height:1.4;margin-bottom:4px;}
.pj-settings .sp-meta{font-size:12.5px;color:#6B6455;margin-bottom:2px;}
.pj-settings .sp-btnrow{display:flex;gap:8px;margin-top:4px;}
.pj-settings .sp-btn{background:var(--brand-dark-blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
.pj-settings .sp-btn:hover:not(:disabled){filter:brightness(1.08);}
.pj-settings .sp-btn:disabled{opacity:.5;cursor:default;}
.pj-settings .sp-restore-list{margin-top:8px;max-height:170px;overflow-y:auto;}
.pj-settings .sp-restore-row{display:flex;align-items:center;padding:5px 6px;border-radius:6px;font-size:12px;margin-bottom:2px;background:#fff;}
.pj-settings .sp-restore-row:hover{background:#f4f2ea;}
.pj-settings .sp-restore-row .sp-rlabel{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b6455;}
.pj-settings .sp-restore-row .sp-btn{padding:3px 8px;font-size:11px;}
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

const BLANK_STATE = {
  cards: [], colOrder: COLUMNS.map(c => c.id),
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

  const mutate = useCallback((mutFn) => {
    setState(prev => {
      const next = { ...prev, cards: [...prev.cards], colOrder: [...prev.colOrder] }
      mutFn(next)
      next.updatedAt = new Date().toISOString()
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

  return { state, loading, status, refresh, mutate }
}

// ---------- Projects page ----------
export default function Projects() {
  const { state, loading, status, mutate } = useProjects()
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState(null)   // {mode:'edit'|'new', card, col}
  const dragCardId = useRef(null)

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
    // Sort: notes newest-first; everything else by project → task.
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

  const onDragStart = (id) => { dragCardId.current = id }
  const onDropTo = (colId) => {
    const id = dragCardId.current
    dragCardId.current = null
    if (!id) return
    mutate(s => {
      const idx = s.cards.findIndex(c => c.id === id)
      if (idx === -1) return
      s.cards[idx] = { ...s.cards[idx], col: colId }
    })
  }

  const remove = (id) => {
    const c = state.cards.find(x => x.id === id)
    const label = c ? (c.task || c.project || 'this card') : 'this card'
    if (!confirm(`Delete "${label}"?`)) return
    mutate(s => { s.cards = s.cards.filter(x => x.id !== id) })
  }

  const duplicate = (id) => {
    mutate(s => {
      const idx = s.cards.findIndex(c => c.id === id)
      if (idx === -1) return
      s.cards.splice(idx + 1, 0, { ...s.cards[idx], id: uid(), created: new Date().toISOString() })
    })
  }

  const toggleGoal = (cardId, goalId) => {
    mutate(s => {
      const c = s.cards.find(x => x.id === cardId)
      if (!c) return
      c.goals = (c.goals || []).map(g => g.id === goalId ? { ...g, done: !g.done } : g)
    })
  }

  const openNew  = (colId) => setEditing({ mode: 'new', col: colId })
  const openEdit = (card)  => setEditing({ mode: 'edit', card })

  const saveCard = (form) => {
    mutate(s => {
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

  if (loading) {
    return (
      <div className="page">
        <h2 className="page-title">Projects</h2>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page">
      <h2 className="page-title">Projects</h2>
      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      <div className="kb-toolbar">
        <input
          className="kb-filter"
          type="search"
          placeholder="Filter cards…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {state.updatedAt && (
          <span className="kb-updated">
            Last updated {new Date(state.updatedAt).toLocaleString(undefined,
              { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="kanban">
        {orderedCols.map(col => (
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
          />
        ))}
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
function BoardColumn({ col, cards, onDragStart, onDrop, onAdd, onEdit, onDelete, onDuplicate, onToggleGoal }) {
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
          />
        ))}
      </div>
      <button className="kb-add" onClick={onAdd}>+ Add Card</button>
    </div>
  )
}

// ---------- Board card ----------
function BoardCard({ card, onDragStart, onEdit, onDelete, onDuplicate, onToggleGoal }) {
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
