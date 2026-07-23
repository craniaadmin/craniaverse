import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env?.VITE_API_URL || ''

const PRI_LABEL = { low: 'Low', med: 'Medium', high: 'High' }
const DEFAULT_ITEM_BG = '#EEF3F6'
const PASTELS = ['#EEF3F6', '#FFFFFF', '#FBDDE4', '#FCE6D2', '#FBF3CE', '#E8F3C2', '#DEF2DE', '#BEEBE8', '#D8ECF8', '#CAD6F2', '#E7DEF5', '#E2CDA0']
const LIST_PALETTE = PASTELS

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const normHex = (v) => {
  v = (v || '').trim()
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) return v[0] === '#' ? v : '#' + v
  if (/^#?[0-9a-fA-F]{3}$/.test(v)) { const h = v.replace('#', ''); return '#' + h[0]+h[0]+h[1]+h[1]+h[2]+h[2] }
  return null
}

const isoLocal = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), da = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${da}`
}
const dueClass = (due) => {
  if (!due) return ''
  const t = new Date(); t.setHours(0,0,0,0)
  const d = new Date(due + 'T00:00:00')
  const diff = (d - t) / 86400000
  if (diff < 0) return 'overdue'
  if (diff <= 2) return 'soon'
  return ''
}
const fmtDue = (due) => {
  if (!due) return ''
  const d = new Date(due + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
const isoWeekKey = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return t.getUTCFullYear() + '-W' + String(week).padStart(2, '0')
}
const checklistKey = (cl) => {
  const d = new Date()
  if (cl.freq === 'weekly') return isoWeekKey(d)
  if (cl.freq === 'monthly') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  if (cl.freq === 'custom') { const n = Math.max(1, Number(cl.customDays) || 1); return 'C' + n + '-' + Math.floor(Date.now() / 86400000 / n) }
  return isoLocal(d)
}
const monthlyTarget = (cl, now) => {
  const y = now.getFullYear(), m = now.getMonth()
  const dim = new Date(y, m + 1, 0).getDate()
  if (cl.monthMode === 'weekday') {
    const wd = Number(cl.monthWeekday || 0)
    const nth = cl.monthWeek || 1
    if (nth === 'last') { let d = dim; while (new Date(y, m, d).getDay() !== wd) d--; return d }
    let count = 0
    for (let d = 1; d <= dim; d++) {
      if (new Date(y, m, d).getDay() === wd) { count++; if (count === Number(nth)) return d }
    }
    return dim
  }
  return Math.min(Math.max(1, Number(cl.monthDate) || 1), dim)
}
const checklistDue = (cl) => {
  const now = new Date()
  if (cl.lastKey === checklistKey(cl)) return false
  if (cl.freq === 'monthly') return now.getDate() >= monthlyTarget(cl, now)
  return true
}

// ---------- CSV export ----------
const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
function downloadCsv(filename, rows) {
  const text = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

// ---------- CSS (scoped-ish via unique class prefixes) ----------
const CSS = `
.tdroot{--dark-blue:#5FA09E;--light-blue:#A6E2F9;--light-brown:#E0DE85;--dark-brown:#2E2516;--bg:#F4F7F8;--card:#FFFFFF;--tshadow:0 1px 3px rgba(46,37,22,.15);
  color:var(--dark-brown);}
.tdroot .toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;padding:12px 16px;background:var(--dark-brown);color:#fff;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.2);}
.tdroot .toolbar .spacer{flex:1}
.tdroot .navbtn{background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff;padding:6px 12px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;transition:filter .15s;}
.tdroot .navbtn:hover{filter:brightness(1.08)}
.tdroot .navbtn.navactive{background:var(--light-blue);color:var(--dark-brown);border-color:var(--light-blue)}
.tdroot .primbtn{background:var(--dark-blue);color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;transition:filter .15s;}
.tdroot .primbtn:hover{filter:brightness(1.08)}
.tdroot .lightbtn{background:var(--light-blue);color:var(--dark-brown);border:none;padding:6px 12px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;transition:filter .15s;}
.tdroot .lightbtn:hover{filter:brightness(1.08)}
.tdroot .hidedone{background:var(--light-brown);color:var(--dark-brown);border:none;padding:6px 12px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;}

.tdroot .filters{max-width:860px;margin:0 auto 12px;padding:0 4px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
.tdroot .filters input,.tdroot .filters select{padding:8px 11px;border:1px solid #d5d0c4;border-radius:8px;font:inherit;background:#fff;color:var(--dark-brown);}
.tdroot .filters input:focus,.tdroot .filters select:focus{outline:none;border-color:var(--dark-blue)}
.tdroot .filters .fsearch{flex:1;min-width:170px}
.tdroot .filters .clearf{background:none;border:none;color:var(--dark-blue);text-decoration:underline;font-size:13px;padding:6px 4px;cursor:pointer;}

.tdroot .board{display:flex;flex-direction:column;gap:20px;max-width:860px;margin:0 auto;}
.tdroot .list{background:#fff;border-radius:12px 12px 0 0;padding:14px 16px;box-shadow:var(--tshadow);display:flex;flex-direction:column;border-bottom:3px solid var(--dark-blue);border-left:3px solid var(--light-blue);border-right:3px solid var(--light-brown);}
.tdroot .list-head{display:flex;align-items:center;gap:8px;margin:-14px -19px 12px;padding:10px 16px;font-weight:700;font-size:16px;border-radius:12px 12px 0 0;border-bottom:2px solid #cfcabb;}
.tdroot .list-head .name{flex:1;word-break:break-word;cursor:text;}
.tdroot .list-head .count{background:#fff;border-radius:20px;font-size:12px;padding:1px 9px;font-weight:700;color:var(--dark-brown);}
.tdroot .list-head .lmove{background:none;border:none;color:#9a948a;padding:0 2px;font-size:13px;line-height:1;font-weight:700;cursor:pointer;}
.tdroot .list-head .lmove:hover{color:var(--dark-blue);}
.tdroot .list-head .lx{background:none;border:none;color:#9a948a;padding:0 4px;font-size:15px;font-weight:700;line-height:1;cursor:pointer;}
.tdroot .list-head .lx:hover{color:#c0392b;}
.tdroot .list-head .dhandle{cursor:grab;color:#9a948a;font-size:14px;}
.tdroot .items{display:flex;flex-direction:column;gap:8px;min-height:8px;padding-left:18px;}
.tdroot .add-item{background:transparent;color:var(--light-blue);border:none;margin-top:8px;padding:1px 0;font-size:20px;line-height:1.2;font-weight:800;cursor:pointer;text-align:left;}
.tdroot .empty-hint{text-align:center;color:#9aa;font-size:13px;padding:10px 4px;}
.tdroot .todo.dragging,.tdroot .list.dragging{opacity:.45}
.tdroot .list.list-over{outline:2px dashed var(--dark-blue);outline-offset:3px}
.tdroot .items.items-over{outline:2px dashed var(--dark-blue);outline-offset:2px;border-radius:8px}

.tdroot .todo{background:#EEF3F6;border-radius:8px;padding:5px 8px 5px 10px;display:flex;align-items:center;gap:9px;border-left:4px solid var(--dark-blue);position:relative;}
.tdroot .todo .dhandle{cursor:grab;color:#9a948a;font-size:14px;flex:none;line-height:1;}
.tdroot .todo .notemark{flex:none;font-size:12px;cursor:default;}
.tdroot .todo .notepop{position:absolute;left:12px;top:100%;margin-top:4px;z-index:15;background:var(--dark-brown);color:#fff;font-size:12.5px;line-height:1.45;padding:8px 11px;border-radius:8px;max-width:340px;white-space:pre-wrap;word-break:break-word;box-shadow:0 8px 24px rgba(0,0,0,.28);display:none;}
.tdroot .todo:hover .notepop{display:block;}
.tdroot .todo.p-high{border-left-color:#c0392b;}
.tdroot .todo.p-med{border-left-color:var(--light-brown);}
.tdroot .todo.p-low{border-left-color:var(--light-blue);}
.tdroot .todo input[type=checkbox]{width:16px;height:16px;flex:none;cursor:pointer;accent-color:var(--dark-blue);}
.tdroot .todo .txt{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}
.tdroot .todo.done .txt{text-decoration:line-through;color:#9a948a;}
.tdroot .chip{font-size:11px;border-radius:6px;padding:1px 7px;font-weight:600;display:inline-flex;align-items:center;gap:4px;flex:none;white-space:nowrap;}
.tdroot .chip.pri-high{background:#fadbd8;color:#922b21;}
.tdroot .chip.pri-med{background:var(--light-brown);color:var(--dark-brown);}
.tdroot .chip.pri-low{background:var(--light-blue);color:var(--dark-brown);}
.tdroot .chip.due{background:#eee;color:var(--dark-brown);}
.tdroot .chip.due.overdue{background:#fadbd8;color:#922b21;}
.tdroot .chip.due.soon{background:var(--light-brown);color:var(--dark-brown);}
.tdroot .todo .dueslot{flex:none;width:74px;display:flex;align-items:center;}
.tdroot .todo .prislot{flex:none;width:74px;display:flex;justify-content:center;align-items:center;}
.tdroot .todo .x{flex:none;background:none;border:none;color:#c9c3b5;padding:0;font-size:15px;line-height:1;width:18px;height:18px;border-radius:4px;font-weight:700;cursor:pointer;}
.tdroot .todo .x:hover{background:#fadbd8;color:#922b21;}

/* modal */
.tdroot .overlay{position:fixed;inset:0;background:rgba(46,37,22,.45);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;}
.tdroot .modal{background:#fff;border-radius:14px;padding:22px;width:100%;max-width:420px;box-shadow:0 12px 40px rgba(0,0,0,.3);}
.tdroot .modal h2{font-size:18px;margin:0 0 16px;color:var(--dark-brown);}
.tdroot .field{margin-bottom:14px;}
.tdroot .field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px;color:#6b6455;}
.tdroot .field input,.tdroot .field select,.tdroot .field textarea{width:100%;padding:9px 11px;border:1px solid #d5d0c4;border-radius:8px;font:inherit;background:#fff;color:var(--dark-brown);}
.tdroot .field textarea{resize:vertical;min-height:62px;}
.tdroot .field input:focus,.tdroot .field select:focus,.tdroot .field textarea:focus{outline:none;border-color:var(--dark-blue);}
.tdroot .modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:6px;}
.tdroot .modal-actions button{border:none;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;font:inherit;background:var(--dark-blue);color:#fff;}
.tdroot .modal-actions button.cancel{background:#eee;color:var(--dark-brown);}
.tdroot .modal-actions button.danger{background:#c0392b;color:#fff;}
.tdroot .swatches{display:flex;gap:9px;flex-wrap:wrap;align-items:center;}
.tdroot .swatch{width:28px;height:28px;border-radius:50%;cursor:pointer;border:2px solid #fff;box-shadow:0 0 0 1px #d8d3c6;}
.tdroot .swatch.sel{box-shadow:0 0 0 2px var(--dark-brown);}
.tdroot input[type=color]{width:38px;height:26px;border:1px solid #d5d0c4;border-radius:6px;padding:0;cursor:pointer;background:none;}
.tdroot .nomatch{text-align:center;color:#9a948a;font-size:14px;padding:30px;}

/* checklists view */
.tdroot .cl-wrap{max-width:720px;margin:0 auto;}
.tdroot .clhint{font-size:13px;color:#6b6455;margin-bottom:16px;line-height:1.5;}
.tdroot .clcard{background:#fff;border-radius:12px 12px 0 0;padding:14px 16px;box-shadow:var(--tshadow);margin-bottom:16px;border-left:3px solid var(--light-blue);border-right:3px solid var(--light-brown);border-bottom:3px solid var(--dark-blue);}
.tdroot .clcard.inactive{opacity:.55;}
.tdroot .clhead{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;}
.tdroot .clname{flex:1;padding:8px 10px;border:1px solid #d5d0c4;border-radius:8px;font:inherit;font-weight:600;}
.tdroot .clfreq{padding:8px 10px;border:1px solid #d5d0c4;border-radius:8px;font:inherit;background:#fff;}
.tdroot .clcustwrap,.tdroot .clmonthwrap{font-size:12px;color:#6b6455;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex-wrap:wrap;}
.tdroot .clmonthwrap select,.tdroot .clmonthwrap input{padding:6px;border:1px solid #d5d0c4;border-radius:6px;font:inherit;font-size:12px;}
.tdroot .clcustom{width:52px;padding:6px;border:1px solid #d5d0c4;border-radius:6px;font:inherit;}
.tdroot .clactive{font-size:12px;color:#6b6455;display:flex;align-items:center;gap:4px;white-space:nowrap;}
.tdroot .clactive input{width:15px;height:15px;}
.tdroot .cldel{background:none;border:none;color:#c9c3b5;font-size:18px;padding:0 6px;font-weight:700;cursor:pointer;}
.tdroot .cldel:hover{color:#c0392b;}
.tdroot .clentries{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;padding-left:8px;}
.tdroot .clentry{display:flex;gap:6px;align-items:center;}
.tdroot .clentry input{flex:1;padding:7px 9px;border:1px solid #d5d0c4;border-radius:8px;font:inherit;}
.tdroot .clentdel{background:none;border:none;color:#c9c3b5;font-size:15px;padding:0 6px;font-weight:700;cursor:pointer;}
.tdroot .clentdel:hover{color:#c0392b;}
.tdroot .clactions{display:flex;gap:8px;align-items:center;}
.tdroot .clactions .cladd{background:transparent;color:var(--light-blue);border:none;font-size:22px;font-weight:800;padding:0 10px;line-height:1;cursor:pointer;}
.tdroot .clrun{margin-left:auto;background:var(--light-brown);color:var(--dark-brown);border:none;padding:6px 12px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;}
.tdroot .clentbox{color:#b8b2a2;font-size:16px;flex:none;line-height:1;}
`

const uiConfirm = (message) => new Promise((res) => {
  // Simple browser confirm — matches the modal behavior enough for now.
  // Custom modal below handles the "Delete" cases via state.
  res(window.confirm(message))
})

// ============ Component ============
// `initialView` + `onNavigate` come from App.jsx so the outer sidebar
// top-bar controls which view we start in (Home → To-Do vs Home →
// Checklists), and the ChecklistsView "Add to To-Do now" button can
// jump back to the To-Do view through the same outer nav rather than
// via a duplicate in-page tab bar.
export default function ToDo({ initialView = 'todo', onNavigate }) {
  const [state, setState] = useState({ lists: [], items: [], checklists: [] })
  const [loading, setLoading] = useState(true)
  const [hideDone, setHideDone] = useState(false)
  const [view, setView] = useState(initialView) // 'todo' | 'checklists'
  useEffect(() => { setView(initialView) }, [initialView])
  const [filterText, setFilterText] = useState('')
  const [filterPri, setFilterPri] = useState('all')
  const [filterDue, setFilterDue] = useState('all')

  // Modals
  const [itemModal, setItemModal] = useState(null) // { editId, listId }
  const [itemDraft, setItemDraft] = useState({ text: '', listId: '', priority: 'low', due: '', notes: '', color: DEFAULT_ITEM_BG })
  const [nameModal, setNameModal] = useState(null) // { renameId }
  const [nameDraft, setNameDraft] = useState({ name: '', color: '#FFFFFF' })
  const [confirmModal, setConfirmModal] = useState(null) // { msg, onOk }

  // Drag state
  const dragItemId = useRef(null)
  const dragListId = useRef(null)

  // Fetch on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/todo`)
      .then(r => r.json())
      .then((s) => {
        const next = {
          lists:      Array.isArray(s?.lists) ? s.lists : [],
          items:      Array.isArray(s?.items) ? s.items : [],
          checklists: Array.isArray(s?.checklists) ? s.checklists : [],
        }
        if (next.lists.length === 0) {
          next.lists = [{ id: uid(), name: 'To Do' }, { id: uid(), name: 'This Week' }]
        }
        setState(next)
      })
      .catch(err => console.error('Failed to load todos:', err))
      .finally(() => setLoading(false))
  }, [])

  // Debounced save on any state change.
  const saveTimer = useRef(null)
  const skipNextSave = useRef(true) // skip the initial mount load
  useEffect(() => {
    if (loading) return
    if (skipNextSave.current) { skipNextSave.current = false; return }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/api/todo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }).catch(err => console.error('Failed to save todos:', err))
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [state, loading])

  // ---------- Checklist auto-run when the todo view opens ----------
  const runChecklists = () => {
    setState((s) => {
      let changed = false
      const nextChecklists = (s.checklists || []).map(cl => ({ ...cl }))
      let nextItems = [...s.items]
      let nextLists = [...s.lists]
      for (const cl of nextChecklists) {
        if (cl.active === false) continue
        if (!checklistDue(cl)) continue
        let list = nextLists.find(l => l.id === cl.listId)
        if (!list) { list = { id: uid(), name: cl.name || 'Checklist' }; nextLists.push(list); cl.listId = list.id }
        else if (cl.name) { list.name = cl.name }
        nextItems = nextItems.filter(i => i.checklistId !== cl.id)
        for (const txt of (cl.entries || [])) {
          if (txt && txt.trim()) {
            nextItems.push({
              id: uid(), listId: list.id, text: txt.trim(),
              priority: 'low', due: '', done: false,
              color: DEFAULT_ITEM_BG, notes: '', checklistId: cl.id,
            })
          }
        }
        cl.lastKey = checklistKey(cl)
        changed = true
      }
      if (!changed) return s
      return { ...s, lists: nextLists, items: nextItems, checklists: nextChecklists }
    })
  }
  useEffect(() => { if (!loading && view === 'todo') runChecklists() }, [view, loading])

  // ---------- Filters ----------
  const filtersActive = () => !!(filterText || filterPri !== 'all' || filterDue !== 'all')
  const matchFilters = (it) => {
    if (filterText && !(it.text || '').toLowerCase().includes(filterText.toLowerCase())) return false
    if (filterPri !== 'all' && (it.priority || 'low') !== filterPri) return false
    if (filterDue !== 'all') {
      const dc = dueClass(it.due)
      if (filterDue === 'overdue' && dc !== 'overdue') return false
      if (filterDue === 'soon'    && dc !== 'soon')    return false
      if (filterDue === 'hasdue'  && !it.due) return false
      if (filterDue === 'nodue'   && it.due)  return false
    }
    return true
  }

  // ---------- Mutations ----------
  const toggleDone = (id) => setState(s => ({ ...s, items: s.items.map(i => i.id === id ? { ...i, done: !i.done } : i) }))
  const deleteItem = (id) => setState(s => ({ ...s, items: s.items.filter(i => i.id !== id) }))
  const moveList = (id, dir) => setState(s => {
    const i = s.lists.findIndex(l => l.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= s.lists.length) return s
    const next = [...s.lists]; [next[i], next[j]] = [next[j], next[i]]
    return { ...s, lists: next }
  })
  const deleteList = (id) => setState(s => ({
    ...s,
    lists: s.lists.filter(l => l.id !== id),
    items: s.items.filter(i => i.listId !== id),
  }))

  // Drag & drop
  const getDropTarget = (zone, y) => {
    const els = [...zone.querySelectorAll('.todo:not(.dragging)')]
    for (const el of els) { const r = el.getBoundingClientRect(); if (y < r.top + r.height/2) return el.dataset.id }
    return null
  }
  const onItemDragStart = (e, id) => { e.stopPropagation(); dragItemId.current = id; dragListId.current = null; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move' }
  const onItemDragEnd = (e) => { e.currentTarget.classList.remove('dragging'); dragItemId.current = null; document.querySelectorAll('.items-over').forEach(z => z.classList.remove('items-over')) }
  const onItemsDragOver = (e) => { if (dragItemId.current) { e.preventDefault(); e.currentTarget.classList.add('items-over') } }
  const onItemsDragLeave = (e) => e.currentTarget.classList.remove('items-over')
  const onItemsDrop = (e, listId) => {
    if (!dragItemId.current) return
    e.preventDefault(); e.stopPropagation()
    const zone = e.currentTarget
    zone.classList.remove('items-over')
    const y = e.clientY
    const beforeId = getDropTarget(zone, y)
    setState(s => {
      const it = s.items.find(i => i.id === dragItemId.current); if (!it) return s
      const rest = s.items.filter(i => i.id !== dragItemId.current)
      const moved = { ...it, listId }
      if (beforeId == null) {
        let last = -1; rest.forEach((x, i) => { if (x.listId === listId) last = i })
        rest.splice(last + 1, 0, moved)
      } else {
        const idx = rest.findIndex(i => i.id === beforeId)
        rest.splice(idx < 0 ? rest.length : idx, 0, moved)
      }
      return { ...s, items: rest }
    })
  }
  const onListDragStart = (e, id) => { if (dragItemId.current) return; dragListId.current = id; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move' }
  const onListDragEnd = (e) => { e.currentTarget.classList.remove('dragging'); dragListId.current = null; document.querySelectorAll('.list-over').forEach(z => z.classList.remove('list-over')) }
  const onListDragOver = (e) => { if (dragListId.current) { e.preventDefault(); e.currentTarget.classList.add('list-over') } }
  const onListDragLeave = (e) => e.currentTarget.classList.remove('list-over')
  const onListDrop = (e, targetId) => {
    if (!dragListId.current || dragListId.current === targetId) return
    e.preventDefault()
    e.currentTarget.classList.remove('list-over')
    const r = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    const draggedId = dragListId.current
    setState(s => {
      const drag = s.lists.find(l => l.id === draggedId); if (!drag) return s
      const rest = s.lists.filter(l => l.id !== draggedId)
      let ti = rest.findIndex(l => l.id === targetId); if (ti < 0) ti = rest.length
      rest.splice(after ? ti + 1 : ti, 0, drag)
      return { ...s, lists: rest }
    })
  }

  // ---------- Item modal ----------
  const openItem = (id, listId) => {
    const it = id ? state.items.find(i => i.id === id) : null
    setItemModal({ editId: id || null })
    setItemDraft({
      text:     it?.text || '',
      listId:   it?.listId || listId || state.lists[0]?.id || '',
      priority: it?.priority || 'low',
      due:      it?.due || '',
      notes:    it?.notes || '',
      color:    it?.color || DEFAULT_ITEM_BG,
    })
  }
  const closeItem = () => setItemModal(null)
  const saveItem = () => {
    const text = itemDraft.text.trim()
    if (!text) return
    setState(s => {
      if (itemModal.editId) {
        return {
          ...s,
          items: s.items.map(i => i.id === itemModal.editId ? {
            ...i, text, listId: itemDraft.listId, priority: itemDraft.priority,
            due: itemDraft.due, color: itemDraft.color, notes: itemDraft.notes.trim(),
          } : i),
        }
      }
      return {
        ...s,
        items: [...s.items, {
          id: uid(), listId: itemDraft.listId, text,
          priority: itemDraft.priority, due: itemDraft.due, done: false,
          color: itemDraft.color, notes: itemDraft.notes.trim(),
        }],
      }
    })
    closeItem()
  }

  // ---------- Name (add/rename list) modal ----------
  const openName = (id) => {
    const list = id ? state.lists.find(l => l.id === id) : null
    setNameModal({ renameId: id || null })
    setNameDraft({ name: list?.name || '', color: list?.color || '#FFFFFF' })
  }
  const closeName = () => setNameModal(null)
  const saveName = () => {
    const name = nameDraft.name.trim()
    if (!name) return
    setState(s => {
      if (nameModal.renameId) {
        return { ...s, lists: s.lists.map(l => l.id === nameModal.renameId ? { ...l, name, color: nameDraft.color } : l) }
      }
      return { ...s, lists: [...s.lists, { id: uid(), name, color: nameDraft.color }] }
    })
    closeName()
  }

  // ---------- Confirm modal ----------
  const askConfirm = (msg) => new Promise(res => setConfirmModal({ msg, resolve: res }))
  const closeConfirm = (result) => { confirmModal?.resolve?.(result); setConfirmModal(null) }

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { closeItem(); closeName(); if (confirmModal) closeConfirm(false) }
      if (e.key === 'Enter') {
        if (itemModal) saveItem()
        else if (nameModal) saveName()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // ---------- Render ----------
  // Title tracks the current view so the loading placeholder and the
  // real page-head agree with the outer sidebar/top-bar labels.
  const pageTitle = view === 'checklists' ? 'Checklists' : 'To Do'

  if (loading) {
    return (
      <div className="page">
        <div className="page-head"><h2 className="page-title">{pageTitle}</h2></div>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  // Action buttons on the right of the page-head — matches the pattern
  // used in Inventory / Crania Store / Calendar. The View toggle that
  // used to live here was a duplicate of the outer top-bar submenu
  // (Home → To-Do / Checklists) and has been removed.
  return (
    <div className="page tdroot">
      <style>{CSS}</style>

      <div className="page-head">
        <h2 className="page-title">{pageTitle}</h2>
        {view === 'todo' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => openName(null)}
              style={{
                background: 'var(--brand-light-blue)', color: 'var(--brand-dark-brown)',
                border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 700,
                borderRadius: 8, cursor: 'pointer',
              }}
            >+ Add list</button>
            <button
              onClick={() => setHideDone(v => !v)}
              title="Show/hide completed"
              style={{
                background: '#fff', border: '1px solid #e2ded2', color: 'var(--brand-dark-brown)',
                padding: '6px 12px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
              }}
            >
              {hideDone ? 'Show done' : 'Hide done'}
            </button>
          </div>
        )}
      </div>

      {view === 'todo' && <TodoView
        state={state}
        hideDone={hideDone}
        filterText={filterText} setFilterText={setFilterText}
        filterPri={filterPri} setFilterPri={setFilterPri}
        filterDue={filterDue} setFilterDue={setFilterDue}
        filtersActive={filtersActive} matchFilters={matchFilters}
        toggleDone={toggleDone} deleteItem={deleteItem}
        openItem={openItem} openName={openName}
        moveList={moveList}
        askConfirm={askConfirm} deleteList={deleteList}
        onItemDragStart={onItemDragStart} onItemDragEnd={onItemDragEnd}
        onItemsDragOver={onItemsDragOver} onItemsDragLeave={onItemsDragLeave} onItemsDrop={onItemsDrop}
        onListDragStart={onListDragStart} onListDragEnd={onListDragEnd}
        onListDragOver={onListDragOver} onListDragLeave={onListDragLeave} onListDrop={onListDrop}
      />}

      {view === 'checklists' && <ChecklistsView
        state={state} setState={setState}
        askConfirm={askConfirm}
        onGoToTodo={() => onNavigate ? onNavigate('To-Do') : setView('todo')}
      />}

      {itemModal && <ItemModal
        editing={!!itemModal.editId}
        lists={state.lists}
        draft={itemDraft} setDraft={setItemDraft}
        onCancel={closeItem} onSave={saveItem}
      />}

      {nameModal && <NameModal
        renaming={!!nameModal.renameId}
        draft={nameDraft} setDraft={setNameDraft}
        onCancel={closeName} onSave={saveName}
      />}

      {confirmModal && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeConfirm(false) }}>
          <div className="modal" style={{ maxWidth: 340 }}>
            <div style={{ fontSize: 15, marginBottom: 18 }}>{confirmModal.msg}</div>
            <div className="modal-actions">
              <button className="cancel" onClick={() => closeConfirm(false)}>Cancel</button>
              <button className="danger" onClick={() => closeConfirm(true)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------- TodoView subcomponent ----------------------
function TodoView({
  state, hideDone, filterText, setFilterText, filterPri, setFilterPri,
  filterDue, setFilterDue, filtersActive, matchFilters,
  toggleDone, deleteItem, openItem, openName, moveList,
  askConfirm, deleteList,
  onItemDragStart, onItemDragEnd, onItemsDragOver, onItemsDragLeave, onItemsDrop,
  onListDragStart, onListDragEnd, onListDragOver, onListDragLeave, onListDrop,
}) {
  const clearFilters = () => { setFilterText(''); setFilterPri('all'); setFilterDue('all') }
  const renderedLists = []
  for (const list of state.lists) {
    let items = state.items.filter(i => i.listId === list.id)
    if (hideDone) items = items.filter(i => !i.done)
    items = items.filter(matchFilters)
    if (filtersActive() && items.length === 0) continue
    renderedLists.push({ list, items })
  }

  const handleDeleteList = async (list) => {
    const n = state.items.filter(i => i.listId === list.id).length
    const msg = `Delete the list "${list.name}"${n ? ` and its ${n} to-do${n > 1 ? 's' : ''}` : ''}?`
    if (await askConfirm(msg)) deleteList(list.id)
  }
  const handleDeleteItem = async (it) => {
    if (await askConfirm(`Delete "${it.text}"?`)) deleteItem(it.id)
  }

  return (
    <>
      <div className="filters">
        <input
          className="fsearch"
          type="search"
          placeholder="Search to-dos…"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        <select value={filterPri} onChange={e => setFilterPri(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="med">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={filterDue} onChange={e => setFilterDue(e.target.value)}>
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="soon">Due soon</option>
          <option value="hasdue">Has a due date</option>
          <option value="nodue">No due date</option>
        </select>
        <button className="clearf" onClick={clearFilters}>Clear</button>
      </div>

      <div className="board">
        {renderedLists.length === 0 && filtersActive() && (
          <div className="nomatch">No to-dos match your filters.</div>
        )}
        {renderedLists.map(({ list, items }) => (
          <div
            key={list.id}
            className="list"
            draggable
            onDragStart={(e) => onListDragStart(e, list.id)}
            onDragEnd={onListDragEnd}
            onDragOver={onListDragOver}
            onDragLeave={onListDragLeave}
            onDrop={(e) => onListDrop(e, list.id)}
          >
            <div
              className="list-head"
              style={list.color && list.color.toLowerCase() !== '#ffffff' ? { background: list.color } : undefined}
            >
              <span className="dhandle" title="Drag to reorder">⠿</span>
              <span className="name" title="Click to rename" onClick={() => openName(list.id)}>{list.name}</span>
              <span className="count">{items.length}</span>
              <button className="lmove" title="Move list up" onClick={() => moveList(list.id, -1)}>▲</button>
              <button className="lmove" title="Move list down" onClick={() => moveList(list.id, 1)}>▼</button>
              <button className="lx" title="Delete list" onClick={() => handleDeleteList(list)}>×</button>
            </div>

            <div
              className="items"
              onDragOver={onItemsDragOver}
              onDragLeave={onItemsDragLeave}
              onDrop={(e) => onItemsDrop(e, list.id)}
            >
              {items.map(it => {
                const dc = dueClass(it.due)
                return (
                  <div
                    key={it.id}
                    className={
                      'todo p-' + (it.priority || 'low') +
                      (it.done ? ' done' : '')
                    }
                    draggable
                    data-id={it.id}
                    onDragStart={(e) => onItemDragStart(e, it.id)}
                    onDragEnd={onItemDragEnd}
                    style={{ background: it.color || DEFAULT_ITEM_BG }}
                  >
                    <span className="dhandle" title="Drag to reorder">⠿</span>
                    <input
                      type="checkbox"
                      checked={!!it.done}
                      onChange={() => toggleDone(it.id)}
                    />
                    <span className="txt" onClick={() => openItem(it.id)}>{it.text}</span>
                    {it.notes && <span className="notemark" title="Has notes — hover to read">💬</span>}
                    <span className="prislot">
                      <span className={'chip pri-' + (it.priority || 'low')}>{PRI_LABEL[it.priority || 'low']}</span>
                    </span>
                    <span className="dueslot">
                      {it.due && <span className={'chip due ' + dc}>{fmtDue(it.due)}</span>}
                    </span>
                    <button className="x" title="Delete" onClick={() => handleDeleteItem(it)}>×</button>
                    {it.notes && <div className="notepop">{it.notes}</div>}
                  </div>
                )
              })}
            </div>

            <button className="add-item" title="Add to-do" onClick={() => openItem(null, list.id)}>+</button>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------------------- ChecklistsView subcomponent ----------------------
function ChecklistsView({ state, setState, askConfirm, onGoToTodo }) {
  const updateCl = (id, patch) => setState(s => ({
    ...s,
    checklists: (s.checklists || []).map(cl => cl.id === id ? { ...cl, ...patch } : cl),
  }))
  const deleteCl = async (cl) => {
    if (await askConfirm(`Delete checklist "${cl.name || ''}"?`)) {
      setState(s => ({
        ...s,
        checklists: s.checklists.filter(x => x.id !== cl.id),
        items: s.items.filter(i => i.checklistId !== cl.id),
      }))
    }
  }
  const updateEntry = (id, idx, val) => setState(s => ({
    ...s,
    checklists: s.checklists.map(cl => cl.id === id
      ? { ...cl, entries: (cl.entries || []).map((t, i) => i === idx ? val : t) }
      : cl),
  }))
  const removeEntry = (id, idx) => setState(s => ({
    ...s,
    checklists: s.checklists.map(cl => cl.id === id
      ? { ...cl, entries: (cl.entries || []).filter((_, i) => i !== idx) }
      : cl),
  }))
  const addEntry = (id) => setState(s => ({
    ...s,
    checklists: s.checklists.map(cl => cl.id === id
      ? { ...cl, entries: [...(cl.entries || []), ''] }
      : cl),
  }))
  const runNow = (id) => {
    updateCl(id, { lastKey: '' })
    setTimeout(onGoToTodo, 30) // switch view; the todo view's effect re-runs checklists
  }
  const addChecklist = () => setState(s => ({
    ...s,
    checklists: [...(s.checklists || []), {
      id: uid(), name: 'New checklist', freq: 'daily', entries: [''],
      lastKey: '', active: true, customDays: 1,
      monthMode: 'date', monthDate: 1, monthWeek: 1, monthWeekday: 1,
    }],
  }))

  const checklists = state.checklists || []

  return (
    <div className="cl-wrap">
      <p className="clhint">
        Checklists auto-add their items to your To-Do each day, week, or month.
        Edits apply next period — or press "Add to To-Do now."
      </p>
      {checklists.map(cl => (
        <div key={cl.id} className={'clcard' + (cl.active === false ? ' inactive' : '')}>
          <div className="clhead">
            <input
              className="clname"
              value={cl.name || ''}
              placeholder="Checklist name"
              onChange={e => updateCl(cl.id, { name: e.target.value })}
            />
            <select
              className="clfreq"
              value={cl.freq || 'daily'}
              onChange={e => updateCl(cl.id, { freq: e.target.value, lastKey: '' })}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>

            {cl.freq === 'custom' && (
              <span className="clcustwrap">every
                <input
                  type="number" className="clcustom" min="1"
                  value={Number(cl.customDays) || 1}
                  onChange={e => updateCl(cl.id, { customDays: Math.max(1, Number(e.target.value) || 1), lastKey: '' })}
                /> days
              </span>
            )}

            {cl.freq === 'monthly' && (
              <span className="clmonthwrap">on
                <select
                  value={cl.monthMode === 'weekday' ? 'weekday' : 'date'}
                  onChange={e => updateCl(cl.id, { monthMode: e.target.value, lastKey: '' })}
                >
                  <option value="date">the date</option>
                  <option value="weekday">the</option>
                </select>
                {cl.monthMode !== 'weekday' && (
                  <input
                    type="number" min="1" max="31"
                    value={Number(cl.monthDate) || 1}
                    style={{ width: 54 }}
                    onChange={e => updateCl(cl.id, { monthDate: Math.min(31, Math.max(1, Number(e.target.value) || 1)), lastKey: '' })}
                  />
                )}
                {cl.monthMode === 'weekday' && (
                  <>
                    <select
                      value={String(cl.monthWeek || '1')}
                      onChange={e => updateCl(cl.id, { monthWeek: e.target.value, lastKey: '' })}
                    >
                      <option value="1">1st</option><option value="2">2nd</option>
                      <option value="3">3rd</option><option value="4">4th</option>
                      <option value="last">last</option>
                    </select>
                    <select
                      value={String(cl.monthWeekday ?? 1)}
                      onChange={e => updateCl(cl.id, { monthWeekday: Number(e.target.value), lastKey: '' })}
                    >
                      <option value="1">Mon</option><option value="2">Tue</option>
                      <option value="3">Wed</option><option value="4">Thu</option>
                      <option value="5">Fri</option><option value="6">Sat</option>
                      <option value="0">Sun</option>
                    </select>
                  </>
                )}
              </span>
            )}

            <label className="clactive">
              <input
                type="checkbox"
                checked={cl.active !== false}
                onChange={e => updateCl(cl.id, { active: e.target.checked, lastKey: e.target.checked ? '' : cl.lastKey })}
              /> Active
            </label>
            <button className="cldel" title="Delete checklist" onClick={() => deleteCl(cl)}>×</button>
          </div>

          <div className="clentries">
            {(cl.entries || []).map((txt, idx) => (
              <div key={idx} className="clentry">
                <span className="clentbox">☐</span>
                <input
                  value={txt}
                  placeholder={`Item ${idx + 1}`}
                  onChange={e => updateEntry(cl.id, idx, e.target.value)}
                />
                <button className="clentdel" title="Remove" onClick={() => removeEntry(cl.id, idx)}>×</button>
              </div>
            ))}
          </div>

          <div className="clactions">
            <button className="cladd" title="Add item" onClick={() => addEntry(cl.id)}>+</button>
            <button className="clrun" onClick={() => runNow(cl.id)}>Add to To-Do now</button>
          </div>
        </div>
      ))}
      <button className="lightbtn" onClick={addChecklist} style={{ marginTop: 4 }}>+ Add checklist</button>
    </div>
  )
}

// ---------------------- Item modal ----------------------
function ItemModal({ editing, lists, draft, setDraft, onCancel, onSave }) {
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal">
        <h2>{editing ? 'Edit to-do' : 'New to-do'}</h2>
        <div className="field">
          <label>To-do</label>
          <input
            type="text" placeholder="e.g. Email the parents" autoFocus
            value={draft.text} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>List</label>
          <select value={draft.listId} onChange={e => setDraft(d => ({ ...d, listId: e.target.value }))}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Priority</label>
          <select value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))}>
            <option value="low">Low</option><option value="med">Medium</option><option value="high">High</option>
          </select>
        </div>
        <div className="field">
          <label>Due date</label>
          <input type="date" value={draft.due} onChange={e => setDraft(d => ({ ...d, due: e.target.value }))} />
        </div>
        <div className="field">
          <label>Comments / notes</label>
          <textarea
            rows={3} placeholder="Any details… (shown when you hover the to-do)"
            value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Card colour</label>
          <ColorSwatches
            value={draft.color}
            palette={PASTELS}
            onChange={c => setDraft(d => ({ ...d, color: c }))}
          />
        </div>
        <div className="modal-actions">
          <button className="cancel" onClick={onCancel}>Cancel</button>
          <button onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------- Name modal ----------------------
function NameModal({ renaming, draft, setDraft, onCancel, onSave }) {
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" style={{ maxWidth: 360 }}>
        <h2>{renaming ? 'Rename list' : 'New list'}</h2>
        <div className="field">
          <label>List name</label>
          <input
            type="text" placeholder="e.g. Work" autoFocus
            value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>List colour</label>
          <ColorSwatches
            value={draft.color}
            palette={LIST_PALETTE}
            onChange={c => setDraft(d => ({ ...d, color: c }))}
          />
        </div>
        <div className="modal-actions">
          <button className="cancel" onClick={onCancel}>Cancel</button>
          <button onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------- Reusable swatch picker ----------------------
function ColorSwatches({ value, palette, onChange }) {
  const [hexText, setHexText] = useState(value)
  useEffect(() => setHexText(value), [value])
  return (
    <>
      <div className="swatches">
        {palette.map(c => (
          <div
            key={c}
            className={'swatch' + ((value || '').toLowerCase() === c.toLowerCase() ? ' sel' : '')}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#9a948a' }}>Custom:</span>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} />
        <input
          type="text" placeholder="#hex" maxLength={7}
          style={{ width: 84, padding: '6px 8px', border: '1px solid #d5d0c4', borderRadius: 6, font: 'inherit', fontSize: 12 }}
          value={hexText}
          onChange={e => {
            setHexText(e.target.value)
            const h = normHex(e.target.value); if (h) onChange(h)
          }}
        />
      </div>
    </>
  )
}
