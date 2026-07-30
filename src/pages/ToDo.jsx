import { useState, useEffect, useRef, useCallback } from 'react'

const API_BASE = import.meta.env?.VITE_API_URL || ''

const PRI_LABEL = { low: 'Low', med: 'Medium', high: 'High' }
const OLD_ITEM_BG = '#EEF3F6'
const DEFAULT_ITEM_BG = '#F1F3F4' // keep in step with --pill in the stylesheet
const PASTELS = [
  '#F1F3F4','#FFFFFF','#FBDDE4','#FCE6D2','#FBF3CE','#E8F3C2',
  '#DEF2DE','#BEEBE8','#D8ECF8','#CAD6F2','#E7DEF5','#E2CDA0',
  '#A6E2F9','#5FA09E','#E0DE85','#2E2516',
]
const LIST_PALETTE = PASTELS

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const normHex = (v) => {
  v = (v || '').trim()
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) return v[0] === '#' ? v : '#' + v
  if (/^#?[0-9a-fA-F]{3}$/.test(v)) { const h = v.replace('#', ''); return '#' + h[0]+h[0]+h[1]+h[1]+h[2]+h[2] }
  return null
}
const isDarkColor = (hex) => {
  if (!hex) return false
  let h = String(hex).replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) < 150
}

const isoLocal = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), da = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${da}`
}
const dayNum = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
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

// ---------- Per-entry checklist scheduling ----------
const monthlyTarget = (en, now) => {
  const y = now.getFullYear(), m = now.getMonth()
  const dim = new Date(y, m + 1, 0).getDate()
  if (en.monthMode === 'weekday') {
    const wd = Number(en.monthWeekday || 0)
    const nth = en.monthWeek || 1
    if (nth === 'last') { let d = dim; while (new Date(y, m, d).getDay() !== wd) d--; return d }
    let count = 0
    for (let d = 1; d <= dim; d++) {
      if (new Date(y, m, d).getDay() === wd) { count++; if (count === Number(nth)) return d }
    }
    return dim
  }
  return Math.min(Math.max(1, Number(en.monthDate) || 1), dim)
}

function checklistKey(en) {
  const d = new Date()
  if (en.freq === 'weekly') return isoWeekKey(d)
  if (en.freq === 'monthly') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  if (en.freq === 'custom') {
    if (en.customMode === 'on') return 'ON-' + (en.customStart || '')
    const n = Math.max(1, Number(en.customDays) || 1)
    const t = dayNum(d)
    const st = en.customStart ? dayNum(new Date(en.customStart + 'T00:00:00')) : t
    return 'C' + n + '-' + st + '-' + Math.floor((t - st) / n)
  }
  return isoLocal(d)
}

function checklistDue(en) {
  const now = new Date()
  if (en.lastKey === checklistKey(en)) return false
  if (en.freq === 'weekly') {
    const wd = Number(en.weekDay)
    const t = isNaN(wd) ? 1 : wd
    return ((now.getDay() + 6) % 7) >= ((t + 6) % 7)
  }
  if (en.freq === 'monthly') return now.getDate() >= monthlyTarget(en, now)
  if (en.freq === 'custom' && en.customStart) {
    if (dayNum(now) < dayNum(new Date(en.customStart + 'T00:00:00'))) return false
  }
  return true
}

function entryDue(en) {
  const now = new Date()
  if (en.freq === 'weekly') {
    const wd = Number(en.weekDay)
    const t = isNaN(wd) ? 1 : wd
    const todayOrd = (now.getDay() + 6) % 7, tOrd = (t + 6) % 7
    const d = new Date(now); d.setDate(now.getDate() + (tOrd - todayOrd))
    return isoLocal(d)
  }
  if (en.freq === 'monthly') {
    const day = monthlyTarget(en, now)
    return isoLocal(new Date(now.getFullYear(), now.getMonth(), day))
  }
  if (en.freq === 'custom' && en.customMode === 'on') return en.customStart || isoLocal(now)
  if (en.freq === 'custom' && en.customStart) {
    const n = Math.max(1, Number(en.customDays) || 1)
    const t = dayNum(now)
    const st = dayNum(new Date(en.customStart + 'T00:00:00'))
    const idx = Math.max(0, Math.floor((t - st) / n))
    const dd = new Date((st + idx * n) * 86400000)
    return isoLocal(new Date(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate()))
  }
  return isoLocal(now)
}

const blankEntry = (listId) => ({
  id: uid(), text: '', note: '', listId: listId || '', priority: 'high', active: true,
  freq: 'daily', customDays: 1, customMode: 'every', customStart: '', weekDay: 1,
  monthMode: 'date', monthDate: 1, monthWeek: 1, monthWeekday: 1, lastKey: '',
})

function normalizeChecklist(cl) {
  const entries = (cl.entries || []).map((e) => {
    if (typeof e === 'string') {
      return { ...blankEntry(cl.listId), text: e, freq: cl.freq || 'daily', customDays: cl.customDays || 1,
        monthMode: cl.monthMode || 'date', monthDate: cl.monthDate || 1, monthWeek: cl.monthWeek || 1,
        monthWeekday: cl.monthWeekday !== undefined ? cl.monthWeekday : 1 }
    }
    return {
      id: e.id || uid(), text: e.text || '', note: e.note || '',
      listId: e.listId || cl.listId || '',
      priority: e.priority || 'high',
      active: e.active !== false,
      freq: e.freq || cl.freq || 'daily',
      customDays: e.customDays || cl.customDays || 1,
      customMode: e.customMode || 'every',
      customStart: e.customStart || '',
      weekDay: e.weekDay !== undefined ? e.weekDay : 1,
      monthMode: e.monthMode || cl.monthMode || 'date',
      monthDate: e.monthDate || cl.monthDate || 1,
      monthWeek: e.monthWeek || cl.monthWeek || 1,
      monthWeekday: e.monthWeekday !== undefined ? e.monthWeekday : (cl.monthWeekday !== undefined ? cl.monthWeekday : 1),
      lastKey: e.lastKey || '',
    }
  })
  return { ...cl, active: cl.active !== false, entries }
}

// ---------- Sort items (priority ▸ due date ▸ original order; completed last) ----------
function sortItems(arr) {
  const rank = { high: 0, med: 1, low: 2 }
  return arr.map((it, i) => [it, i]).sort((a, b) => {
    const da = a[0].done ? 1 : 0, db = b[0].done ? 1 : 0; if (da !== db) return da - db
    const ra = (a[0].priority in rank) ? rank[a[0].priority] : 2
    const rb = (b[0].priority in rank) ? rank[b[0].priority] : 2
    if (ra !== rb) return ra - rb
    const ea = a[0].due || '', eb = b[0].due || ''
    if (ea && eb) { if (ea !== eb) return ea < eb ? -1 : 1 } else if (ea && !eb) return -1; else if (!ea && eb) return 1
    return a[1] - b[1]
  }).map(x => x[0])
}

// ---------- CSV export ----------
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

// ---------- CSS ----------
const CSS = `
.tdroot{--pill:#F1F3F4;--dark-blue:#5FA09E;--light-blue:#A6E2F9;--light-brown:#E0DE85;--dark-brown:#2E2516;--bg:#F4F7F8;--card:#FFFFFF;--tshadow:0 1px 3px rgba(46,37,22,.15);
  color:var(--dark-brown);}

.tdroot .undorow{max-width:860px;margin:0 auto 8px;padding:0 4px;display:flex;gap:6px;align-items:center;}
.tdroot .undobtn{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:4px 10px;font-size:12px;font-weight:700;border-radius:8px;cursor:pointer;}
.tdroot .undobtn:hover:not(:disabled){background:#f4f2ea}
.tdroot .undobtn:disabled{opacity:.4;cursor:default}

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
.tdroot .list-head .lsort{background:none;border:none;color:#9a948a;padding:0 4px;font-size:14px;line-height:1;font-weight:700;cursor:pointer;}
.tdroot .list-head .lsort:hover{color:var(--dark-blue);}
.tdroot .list-head .lmove{background:none;border:none;color:#9a948a;padding:0 2px;font-size:13px;line-height:1;font-weight:700;cursor:pointer;}
.tdroot .list-head .lmove:hover{color:var(--dark-blue);}
.tdroot .list-head .lx{background:none;border:none;color:#9a948a;padding:0 4px;font-size:15px;font-weight:700;line-height:1;cursor:pointer;}
.tdroot .list-head .lx:hover{color:#c0392b;}
.tdroot .list-head .dhandle{cursor:grab;color:#9a948a;font-size:14px;}
.tdroot .list-head.darkbg .name,.tdroot .list-head.darkbg .dhandle,.tdroot .list-head.darkbg .lmove,.tdroot .list-head.darkbg .lsort,.tdroot .list-head.darkbg .lx{color:#fff;}
.tdroot .items{display:flex;flex-direction:column;gap:8px;min-height:8px;padding-left:18px;}
.tdroot .add-item{background:transparent;color:var(--light-blue);border:none;margin-top:8px;padding:1px 0 1px 18px;font-size:20px;line-height:1.2;font-weight:800;cursor:pointer;text-align:left;align-self:flex-start;}
.tdroot .empty-hint{text-align:center;color:#9aa;font-size:13px;padding:10px 4px;}
.tdroot .todo.dragging,.tdroot .list.dragging{opacity:.45}
.tdroot .list.list-over{outline:2px dashed var(--dark-blue);outline-offset:3px}
.tdroot .items.items-over{outline:2px dashed var(--dark-blue);outline-offset:2px;border-radius:8px}

.tdroot .todo{background:var(--pill);border-radius:8px;padding:5px 8px 5px 10px;display:flex;align-items:center;gap:9px;border-left:4px solid var(--dark-blue);position:relative;}
.tdroot .todo .dhandle{cursor:grab;color:#9a948a;font-size:14px;flex:none;line-height:1;}
.tdroot .todo .notemark{flex:none;font-size:12px;cursor:default;}
.tdroot .todo .notepop{position:absolute;left:12px;top:100%;margin-top:4px;z-index:15;background:var(--dark-brown);color:#fff;font-size:12.5px;line-height:1.45;padding:8px 11px;border-radius:8px;max-width:340px;white-space:pre-wrap;word-break:break-word;box-shadow:0 8px 24px rgba(0,0,0,.28);display:none;}
.tdroot .todo:hover .notepop{display:block;}
.tdroot .todo.p-high{border-left-color:#c0392b;}
.tdroot .todo.p-med{border-left-color:var(--light-brown);}
.tdroot .todo.p-low{border-left-color:var(--light-blue);}
.tdroot .todo.done{border-left-color:#e2ded2;}
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
.tdroot .todo .dueslot{flex:none;width:108px;display:flex;align-items:center;justify-content:flex-end;}
.tdroot .todo .prislot{flex:none;width:74px;display:flex;justify-content:center;align-items:center;}
.tdroot .todo .x{flex:none;background:none;border:none;color:#c9c3b5;padding:0;font-size:15px;line-height:1;width:18px;height:18px;border-radius:4px;font-weight:700;cursor:pointer;}
.tdroot .todo .dup{flex:none;background:none;border:none;color:#c9c3b5;padding:0;font-size:13px;line-height:1;width:18px;height:18px;border-radius:4px;font-weight:700;cursor:pointer;}
.tdroot .todo .dup:hover{color:var(--dark-blue);}
.tdroot .todo .x:hover{background:#fadbd8;color:#922b21;}
.tdroot .todo.darkbg .txt,.tdroot .todo.darkbg .dhandle,.tdroot .todo.darkbg .x,.tdroot .todo.darkbg .dup{color:#fff;}

/* modal */
.tdroot .overlay{position:fixed;inset:0;background:rgba(46,37,22,.45);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;}
.tdroot .modal{background:#fff;border-radius:14px;padding:22px;width:100%;max-width:420px;box-shadow:0 12px 40px rgba(0,0,0,.3);max-height:92vh;overflow:auto;}
.tdroot .modal::-webkit-scrollbar{width:10px}
.tdroot .modal::-webkit-scrollbar-thumb{background:#cfcabb;border-radius:8px;border:3px solid #fff}
.tdroot .modal::-webkit-scrollbar-thumb:hover{background:#b8b2a2}
.tdroot .modal::-webkit-scrollbar-track{background:transparent;margin:16px 0}
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
.tdroot .modal-actions .btn-del{background:#fff;color:#c0392b;border:1px solid #eecfca;margin-right:auto;}
.tdroot .swatches{display:flex;gap:9px;flex-wrap:wrap;align-items:center;}
.tdroot .swatch{width:28px;height:28px;border-radius:50%;cursor:pointer;border:2px solid #fff;box-shadow:0 0 0 1px #d8d3c6;}
.tdroot .swatch.sel{box-shadow:0 0 0 2px var(--dark-brown);}
.tdroot input[type=color]{width:38px;height:26px;border:1px solid #d5d0c4;border-radius:6px;padding:0;cursor:pointer;background:none;}
.tdroot .nomatch{text-align:center;color:#9a948a;font-size:14px;padding:30px;}

/* context menu */
.tdroot .ctxmenu{position:fixed;z-index:300;background:#fff;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:6px;display:flex;flex-direction:column;min-width:150px;}
.tdroot .ctxmenu button{background:none;border:none;color:var(--dark-brown);text-align:left;padding:8px 12px;border-radius:6px;font-weight:500;cursor:pointer;font:inherit;}
.tdroot .ctxmenu button:hover{background:#f4f2ea;}
.tdroot .ctxmenu button.ctx-danger{color:#c0392b;}

/* settings popover */
.tdroot .settings-popover{position:fixed;top:118px;right:max(16px,calc(50% - 430px));z-index:290;background:#fff;border:1px solid #e2ded2;border-radius:12px;box-shadow:0 8px 30px rgba(46,37,22,.18);padding:14px;width:300px;text-align:left;box-sizing:border-box;}
.tdroot .settings-popover *{margin:0;padding:0;}
.tdroot .settings-popover .sp-card{margin:0 0 8px;padding:12px;border-radius:8px;background:#E7EAEC;}
.tdroot .settings-popover .sp-card:last-child{margin-bottom:0;}
.tdroot .settings-popover .sp-card-title{display:block;font-weight:700;font-size:13px;margin-bottom:6px;color:var(--dark-brown);}
.tdroot .settings-popover .sp-hint{font-size:11px;color:#9a948a;margin:6px 0 8px;line-height:1.4;}
.tdroot .settings-popover .sp-meta{font-size:12.5px;color:#6B6455;margin-bottom:2px;}
.tdroot .settings-popover .sp-btnrow{display:flex;gap:8px;margin-top:4px;}
.tdroot .settings-popover .sp-btn{background:var(--dark-blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
.tdroot .settings-popover .sp-btn:hover:not(:disabled){filter:brightness(1.08);}
.tdroot .settings-popover .sp-btn:disabled{opacity:.5;cursor:default;}
.tdroot .settings-popover .sp-restore-list{margin-top:8px;max-height:170px;overflow-y:auto;}
.tdroot .settings-popover .sp-restore-row{display:flex;align-items:center;padding:5px 6px;border-radius:6px;font-size:12px;margin-bottom:2px;background:#fff;}
.tdroot .settings-popover .sp-restore-row:hover{background:#f4f2ea;}
.tdroot .settings-popover .sp-restore-row .sp-rlabel{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b6455;}
.tdroot .settings-popover .sp-restore-row .sp-btn{padding:3px 8px;font-size:11px;}

/* footer */
.tdroot .td-footer{text-align:center;font-size:12px;color:#9a948a;padding:16px 0 4px;}

/* checklists view */
.tdroot .cl-wrap{margin:0 auto;}
.tdroot .clhint{font-size:13px;color:#6b6455;margin-bottom:0;line-height:1.5;flex:1;}
.tdroot .cltoprow{display:flex;gap:12px;align-items:center;margin-bottom:16px;}
.tdroot .clcard{background:#fff;border-radius:10px;padding:0 0 10px;box-shadow:var(--tshadow);margin-bottom:16px;border-left:4px solid var(--light-brown);overflow:hidden;}
.tdroot .clcard.inactive{opacity:.55;}
.tdroot .clhead{display:flex;gap:8px;align-items:center;padding:8px 14px;border-bottom:1px solid #e8e4d8;cursor:pointer;background:#faf8f2;}
.tdroot .clhead .count{background:#fff;border:1px solid #d5d0c4;border-radius:20px;font-size:11px;padding:1px 8px;font-weight:700;color:var(--dark-brown);flex:none;}
.tdroot .clhead.darkhead{color:#fff;}
.tdroot .clhead.darkhead .clname,.tdroot .clhead.darkhead .clactive,.tdroot .clhead.darkhead .clmove,.tdroot .clhead.darkhead .cldel{color:#fff;}
.tdroot .clname{flex:1;padding:4px 8px;border:none;border-radius:6px;font:inherit;font-weight:700;font-size:15px;background:transparent;color:inherit;cursor:pointer;}
.tdroot .clcustwrap,.tdroot .clmonthwrap,.tdroot .clweekwrap{font-size:12px;color:#6b6455;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex-wrap:wrap;}
.tdroot .clmonthwrap select,.tdroot .clmonthwrap input,.tdroot .clcustwrap select,.tdroot .clcustwrap input,.tdroot .clweekwrap select{padding:6px;border:1px solid #d5d0c4;border-radius:6px;font:inherit;font-size:12px;}
.tdroot .clcustom{width:52px;padding:6px;border:1px solid #d5d0c4;border-radius:6px;font:inherit;}
.tdroot .clactive{font-size:12px;color:#6b6455;display:flex;align-items:center;gap:4px;white-space:nowrap;}
.tdroot .clactive input{width:15px;height:15px;}
.tdroot .clhandle{cursor:grab;color:#b8b2a2;font-size:14px;}
.tdroot .cldel{background:none;border:none;color:inherit;opacity:.55;font-size:18px;padding:0 6px;font-weight:700;cursor:pointer;}
.tdroot .cldel:hover{color:#c0392b;opacity:1;}
.tdroot .clmove{background:none;border:none;color:inherit;opacity:.55;padding:0 2px;font-size:13px;line-height:1;font-weight:700;cursor:pointer;}
.tdroot .clmove:hover{opacity:1;}
.tdroot .clactions{padding:0 14px;}
.tdroot .clentries{padding:6px 14px;}
.tdroot .clentry{display:flex;align-items:center;gap:5px;padding:4px 0;border-bottom:1px solid #f0ece2;}
.tdroot .clentry:last-child{border-bottom:none;}
.tdroot .clentry.inactive{opacity:.55;}
.tdroot .clenttext{flex:1 1 130px;min-width:90px;padding:4px 7px;border:1px solid #d5d0c4;border-radius:5px;font:inherit;font-size:12.5px;background:#fff;}
.tdroot .clentnote{flex:1 1 90px;min-width:60px;padding:4px 7px;border:1px solid #d5d0c4;border-radius:5px;font:inherit;font-size:12.5px;color:#6b6455;background:#fff;}
.tdroot .clentfreq{padding:4px 6px;border:1px solid #d5d0c4;border-radius:5px;font:inherit;font-size:12px;background:#fff;}
.tdroot .clentsep{color:#b8b2a2;font-size:13px;margin:0 2px;}
.tdroot .clentlistwrap{color:#6b6455;display:inline-flex;align-items:center;gap:3px;font-size:12px;}
.tdroot .clentlist{padding:3px 6px;border:1px solid #d5d0c4;border-radius:5px;font:inherit;font-size:11.5px;background:#fff;}
.tdroot .clentpri{padding:3px 7px;border:none;border-radius:5px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;}
.tdroot .clentactive{display:flex;align-items:center;gap:3px;color:#6b6455;white-space:nowrap;font-size:12px;}
.tdroot .clentactive input{width:13px;height:13px;}
.tdroot .clactions{display:flex;gap:8px;align-items:center;padding:4px 14px 0;}
.tdroot .clactions .cladd{background:transparent;color:var(--light-blue);border:none;font-size:20px;font-weight:800;padding:0 8px;line-height:1;cursor:pointer;}
.tdroot .clrun{margin-left:auto;background:var(--light-brown);color:var(--dark-brown);border:none;padding:5px 12px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;}
`

// ============ Component ============
export default function ToDo({ initialView = 'todo', onNavigate }) {
  const [state, setState] = useState({ lists: [], items: [], checklists: [], _migPri: false, _migBg: false })
  const [loading, setLoading] = useState(true)
  const [hideDone, setHideDone] = useState(true) // completed items hidden by default
  const [view, setView] = useState(initialView)
  useEffect(() => { setView(initialView) }, [initialView])
  const [filterText, setFilterText] = useState('')
  const [filterPri, setFilterPri] = useState('all')
  const [filterDue, setFilterDue] = useState('all')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Undo/redo
  const undoStack = useRef([])
  const redoStack = useRef([])
  const histBase = useRef(null)
  const [undoLen, setUndoLen] = useState(0) // just to trigger re-render of button state
  const [redoLen, setRedoLen] = useState(0)

  const recordHistory = useCallback((s) => {
    const cur = JSON.stringify(s)
    if (histBase.current === null) { histBase.current = cur; return }
    if (cur !== histBase.current) {
      undoStack.current.push(histBase.current)
      if (undoStack.current.length > 100) undoStack.current.shift()
      redoStack.current = []
      histBase.current = cur
      setUndoLen(undoStack.current.length)
      setRedoLen(0)
    }
  }, [])

  const undo = useCallback(() => {
    if (!undoStack.current.length) return
    redoStack.current.push(JSON.stringify(stateRef.current))
    const prev = undoStack.current.pop()
    histBase.current = prev
    const parsed = JSON.parse(prev)
    skipNextSave.current = true
    setState(parsed)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
    // Manually save after undo
    fetch(`${API_BASE}/api/todo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: prev,
    }).catch(err => console.error('Failed to save todos:', err))
  }, [])

  const redo = useCallback(() => {
    if (!redoStack.current.length) return
    undoStack.current.push(JSON.stringify(stateRef.current))
    const next = redoStack.current.pop()
    histBase.current = next
    const parsed = JSON.parse(next)
    skipNextSave.current = true
    setState(parsed)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
    fetch(`${API_BASE}/api/todo`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: next,
    }).catch(err => console.error('Failed to save todos:', err))
  }, [])

  // Modals
  const [itemModal, setItemModal] = useState(null)
  const [itemDraft, setItemDraft] = useState({ text: '', listId: '', priority: 'low', due: '', notes: '', color: DEFAULT_ITEM_BG })
  const [nameModal, setNameModal] = useState(null)
  const [nameDraft, setNameDraft] = useState({ name: '', color: '#FFFFFF' })
  const [confirmModal, setConfirmModal] = useState(null)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, itemId }

  // Drag state
  const dragItemId = useRef(null)
  const dragListId = useRef(null)

  // Keep a ref to current state for undo/redo
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // Fetch on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/todo`)
      .then(r => r.json())
      .then((s) => {
        let lists = Array.isArray(s?.lists) ? s.lists : []
        let items = Array.isArray(s?.items) ? s.items : []
        let checklists = (Array.isArray(s?.checklists) ? s.checklists : []).map(normalizeChecklist)
        if (lists.length === 0) {
          lists = [{ id: uid(), name: 'To Do' }, { id: uid(), name: 'This Week' }]
        }
        items = items.filter(i => !(i.checklistId && !i.entryId))
        let migPri = !!s?._migPri
        if (!migPri) {
          checklists = checklists.map(cl => ({
            ...cl,
            entries: cl.entries.map(en => (!en.priority || en.priority === 'low') ? { ...en, priority: 'high' } : en),
          }))
          migPri = true
        }
        // Migrate old card background colour
        let migBg = !!s?._migBg
        if (!migBg) {
          items = items.map(i => (i.color || '').toUpperCase() === OLD_ITEM_BG.toUpperCase() ? { ...i, color: DEFAULT_ITEM_BG } : i)
          lists = lists.map(l => (l.color || '').toUpperCase() === OLD_ITEM_BG.toUpperCase() ? { ...l, color: DEFAULT_ITEM_BG } : l)
          migBg = true
        }
        const loaded = { lists, items, checklists, _migPri: migPri, _migBg: migBg }
        setState(loaded)
        histBase.current = JSON.stringify(loaded)
      })
      .catch(err => console.error('Failed to load todos:', err))
      .finally(() => setLoading(false))
  }, [])

  // Debounced save on any state change.
  const saveTimer = useRef(null)
  const skipNextSave = useRef(true)
  useEffect(() => {
    if (loading) return
    if (skipNextSave.current) { skipNextSave.current = false; return }
    recordHistory(state)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/api/todo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }).catch(err => console.error('Failed to save todos:', err))
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [state, loading, recordHistory])

  // ---------- Checklist auto-run ----------
  const runChecklists = () => {
    setState((s) => {
      let changed = false
      let nextItems = [...s.items]
      const nextLists = [...s.lists]
      const nextChecklists = (s.checklists || []).map(cl => {
        if (cl.active === false) return cl
        let list = nextLists.find(l => l.id === cl.listId)
        if (!list) { list = nextLists[0] || { id: uid(), name: 'To Do' }; if (!nextLists.includes(list)) nextLists.push(list) }
        const nextEntries = cl.entries.map(en => {
          if (en.active === false) return en
          if (!checklistDue(en)) return en
          const curKey = checklistKey(en)
          const existing = nextItems.find(i => i.entryId === en.id && i.periodKey === curKey)
          if (existing) { changed = true; return { ...en, lastKey: curKey } }
          const txt = (en.text || '').trim()
          if (!txt) return en
          const tl = nextLists.find(l => l.id === en.listId) || list
          nextItems = [{
            id: uid(), listId: tl.id, text: txt, priority: en.priority || 'high',
            due: entryDue(en), done: false, color: DEFAULT_ITEM_BG, notes: en.note || '',
            checklistId: cl.id, entryId: en.id, periodKey: curKey,
          }, ...nextItems]
          changed = true
          return { ...en, lastKey: curKey }
        })
        return { ...cl, entries: nextEntries }
      })
      if (!changed) return s
      return { ...s, lists: nextLists, items: nextItems, checklists: nextChecklists }
    })
  }
  useEffect(() => { if (!loading && view === 'todo') runChecklists() }, [view, loading])

  // "Add to To-Do Now"
  const forcePull = (checklistId) => {
    setState((s) => {
      const cl = (s.checklists || []).find(c => c.id === checklistId)
      if (!cl) return s
      let nextItems = [...s.items]
      const list = s.lists.find(l => l.id === cl.listId) || s.lists[0]
      const nextEntries = cl.entries.map(en => {
        if (en.active === false) return en
        const curKey = checklistKey(en)
        const existing = nextItems.find(i => i.entryId === en.id && i.periodKey === curKey)
        if (existing) return { ...en, lastKey: curKey }
        const txt = (en.text || '').trim()
        if (!txt) return en
        const tl = s.lists.find(l => l.id === en.listId) || list
        nextItems = [{
          id: uid(), listId: tl.id, text: txt, priority: en.priority || 'high',
          due: entryDue(en), done: false, color: DEFAULT_ITEM_BG, notes: en.note || '',
          checklistId: cl.id, entryId: en.id, periodKey: curKey,
        }, ...nextItems]
        return { ...en, lastKey: curKey }
      })
      return {
        ...s, items: nextItems,
        checklists: s.checklists.map(c => c.id === checklistId ? { ...c, entries: nextEntries } : c),
      }
    })
    setTimeout(() => (onNavigate ? onNavigate('To-Do') : setView('todo')), 30)
  }

  // ---------- Export CSV ----------
  const exportCsv = () => {
    const stamp = isoLocal(new Date())
    if (view === 'checklists') {
      const rows = [['Checklist', 'List', 'Entry', 'Frequency', 'Active', 'Priority']]
      for (const cl of state.checklists) {
        for (const en of cl.entries) {
          const list = state.lists.find(l => l.id === en.listId)
          rows.push([
            cl.name || '', list?.name || '', en.text || '',
            en.freq || 'daily', en.active === false ? 'No' : 'Yes',
            PRI_LABEL[en.priority || 'high'] || en.priority || '',
          ])
        }
      }
      downloadCsv(`crania-checklists-${stamp}.csv`, rows)
    } else {
      const rows = [['List', 'Task', 'Priority', 'Due Date', 'Done', 'Notes']]
      for (const list of state.lists) {
        for (const it of state.items.filter(i => i.listId === list.id)) {
          rows.push([
            list.name || '', it.text || '',
            PRI_LABEL[it.priority || 'low'] || it.priority || '',
            it.due || '', it.done ? 'Yes' : 'No', it.notes || '',
          ])
        }
      }
      downloadCsv(`crania-todo-${stamp}.csv`, rows)
    }
  }

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
  const duplicateItem = (id) => setState(s => {
    const idx = s.items.findIndex(i => i.id === id)
    if (idx < 0) return s
    const copy = { ...s.items[idx], id: uid(), done: false }
    delete copy.checklistId; delete copy.entryId; delete copy.periodKey
    const items = [...s.items]
    items.splice(idx + 1, 0, copy)
    return { ...s, items }
  })
  const sortListNow = (listId) => setState(s => {
    const mine = s.items.filter(i => i.listId === listId)
    const sorted = sortItems(mine)
    return { ...s, items: [...s.items.filter(i => i.listId !== listId), ...sorted] }
  })
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

  // ---------- Name modal ----------
  const openName = (id) => {
    const list = id ? state.lists.find(l => l.id === id) : null
    setNameModal({ mode: 'list', renameId: id || null })
    setNameDraft({ name: list?.name || '', color: list?.color || '#FFFFFF' })
  }
  const openChecklistEdit = (id) => {
    const cl = state.checklists.find(c => c.id === id)
    if (!cl) return
    setNameModal({ mode: 'checklist', renameId: id })
    setNameDraft({ name: cl.name || '', color: cl.color || '#FFFFFF' })
  }
  const closeName = () => setNameModal(null)
  const saveName = () => {
    const name = nameDraft.name.trim()
    if (!name) return
    setState(s => {
      if (nameModal.mode === 'checklist') {
        return { ...s, checklists: s.checklists.map(c => c.id === nameModal.renameId ? { ...c, name, color: nameDraft.color } : c) }
      }
      if (nameModal.renameId) {
        return { ...s, lists: s.lists.map(l => l.id === nameModal.renameId ? { ...l, name, color: nameDraft.color } : l) }
      }
      return { ...s, lists: [...s.lists, { id: uid(), name, color: nameDraft.color }] }
    })
    closeName()
  }

  // ---------- Checklist mutations ----------
  const addChecklist = () => setState(s => {
    const listId = s.lists[0]?.id || ''
    return {
      ...s,
      checklists: [...(s.checklists || []), {
        id: uid(), name: 'New Checklist', listId, active: true, color: '',
        entries: [blankEntry(listId)],
      }],
    }
  })
  const updateChecklistActive = (id, active) => setState(s => ({
    ...s,
    checklists: s.checklists.map(cl => cl.id === id
      ? { ...cl, active, entries: active ? cl.entries.map(en => ({ ...en, lastKey: '' })) : cl.entries }
      : cl),
    items: active ? s.items : s.items.filter(i => i.checklistId !== id),
  }))
  const moveChecklist = (id, dir) => setState(s => {
    const i = s.checklists.findIndex(c => c.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= s.checklists.length) return s
    const next = [...s.checklists]; [next[i], next[j]] = [next[j], next[i]]
    return { ...s, checklists: next }
  })
  const deleteChecklist = async (cl) => {
    if (!(await askConfirm(`Delete checklist "${cl.name || ''}"?`))) return
    setState(s => ({
      ...s,
      checklists: s.checklists.filter(c => c.id !== cl.id),
      items: s.items.filter(i => i.checklistId !== cl.id),
    }))
  }

  // ---------- Entry mutations ----------
  const addEntry = (checklistId) => setState(s => ({
    ...s,
    checklists: s.checklists.map(cl => cl.id === checklistId
      ? { ...cl, entries: [...cl.entries, blankEntry(cl.listId)] }
      : cl),
  }))
  const duplicateEntry = (checklistId, entryId) => setState(s => ({
    ...s,
    checklists: s.checklists.map(cl => {
      if (cl.id !== checklistId) return cl
      const idx = cl.entries.findIndex(en => en.id === entryId)
      if (idx < 0) return cl
      const copy = { ...cl.entries[idx], id: uid(), lastKey: '' }
      const entries = [...cl.entries]
      entries.splice(idx + 1, 0, copy)
      return { ...cl, entries }
    }),
  }))
  const moveEntry = (checklistId, entryId, dir) => setState(s => ({
    ...s,
    checklists: s.checklists.map(cl => {
      if (cl.id !== checklistId) return cl
      const i = cl.entries.findIndex(en => en.id === entryId); const j = i + dir
      if (i < 0 || j < 0 || j >= cl.entries.length) return cl
      const entries = [...cl.entries]; [entries[i], entries[j]] = [entries[j], entries[i]]
      return { ...cl, entries }
    }),
  }))
  const removeEntry = (checklistId, entryId) => setState(s => ({
    ...s,
    checklists: s.checklists.map(cl => cl.id === checklistId
      ? { ...cl, entries: cl.entries.filter(en => en.id !== entryId) }
      : cl),
    items: s.items.filter(i => i.entryId !== entryId),
  }))

  const updateEntrySimple = (checklistId, entryId, patch) => setState(s => {
    const cl = s.checklists.find(c => c.id === checklistId)
    const en = cl?.entries.find(e => e.id === entryId)
    if (!en) return s
    const nextEn = { ...en, ...patch }
    let items = s.items
    const pulled = items.find(i => i.entryId === entryId && i.periodKey === checklistKey(en))
    if (pulled) {
      const itemPatch = {}
      if ('text' in patch) { const t = patch.text.trim(); if (t) itemPatch.text = t }
      if ('note' in patch) itemPatch.notes = patch.note
      if ('priority' in patch) itemPatch.priority = patch.priority
      if ('listId' in patch && s.lists.some(l => l.id === patch.listId)) itemPatch.listId = patch.listId
      if (Object.keys(itemPatch).length) {
        items = items.map(i => i.id === pulled.id ? { ...i, ...itemPatch } : i)
      }
    }
    const checklists = s.checklists.map(c => c.id === checklistId
      ? { ...c, entries: c.entries.map(e => e.id === entryId ? nextEn : e) }
      : c)
    return { ...s, checklists, items }
  })
  const setEntryText = (checklistId, entryId, text) => {
    updateEntrySimple(checklistId, entryId, { text })
    setTimeout(runChecklists, 0)
  }
  const setEntryActive = (checklistId, entryId, active) => setState(s => {
    const checklists = s.checklists.map(cl => cl.id === checklistId
      ? { ...cl, entries: cl.entries.map(en => en.id === entryId ? { ...en, active, lastKey: active ? '' : en.lastKey } : en) }
      : cl)
    const items = active ? s.items : s.items.filter(i => i.entryId !== entryId)
    return { ...s, checklists, items }
  })

  const updateEntrySchedule = (checklistId, entryId, patch) => setState(s => {
    const cl = s.checklists.find(c => c.id === checklistId)
    const en = cl?.entries.find(e => e.id === entryId)
    if (!en) return s
    const prevKey = (en.lastKey && en.lastKey === checklistKey(en)) ? en.lastKey : null
    const nextEn = { ...en, ...patch, lastKey: '' }

    let items = s.items
    const pulled = prevKey ? items.find(i => i.entryId === entryId && i.periodKey === prevKey) : null
    let finalEn = nextEn
    if (pulled && !pulled.done) {
      if (checklistDue(nextEn)) {
        const nk = checklistKey(nextEn)
        const dup = items.find(i => i.entryId === entryId && i.periodKey === nk && i.id !== pulled.id)
        if (dup) {
          items = items.filter(i => i.id !== pulled.id)
        } else {
          items = items.map(i => i.id === pulled.id ? { ...i, periodKey: nk, due: entryDue(nextEn) } : i)
        }
        finalEn = { ...nextEn, lastKey: nk }
      } else {
        items = items.filter(i => i.id !== pulled.id)
      }
    } else if (pulled) {
      if (checklistDue(nextEn)) finalEn = { ...nextEn, lastKey: checklistKey(nextEn) }
    }
    const checklists = s.checklists.map(c => c.id === checklistId
      ? { ...c, entries: c.entries.map(e => e.id === entryId ? finalEn : e) }
      : c)
    return { ...s, checklists, items }
  })

  // ---------- Confirm modal ----------
  const askConfirm = (msg) => new Promise(res => setConfirmModal({ msg, resolve: res }))
  const closeConfirm = (result) => { confirmModal?.resolve?.(result); setConfirmModal(null) }

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeItem(); closeName(); setCtxMenu(null)
        if (confirmModal) closeConfirm(false)
      }
      if (e.key === 'Enter') {
        if (itemModal) saveItem()
        else if (nameModal) saveName()
      }
      // Undo/redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
      if ((e.ctrlKey || e.metaKey) && !e.target?.closest('input,textarea,select')) {
        const k = e.key.toLowerCase()
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
        else if (k === 'y') { e.preventDefault(); redo() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // Close context menu on any click
  useEffect(() => {
    const close = () => setCtxMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // ---------- Render ----------
  const pageTitle = view === 'checklists' ? 'Checklists' : 'To Do'

  // Compute counts for footer
  const totalItems = (state.items || []).length
  let shownItems = 0

  if (loading) {
    return (
      <div className="page">
        <div className="page-head"><h2 className="page-title">{pageTitle}</h2></div>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page tdroot">
      <style>{CSS}</style>

      <div className="page-head">
        <h2 className="page-title">{pageTitle}</h2>
      </div>

      {/* Undo row: undo / redo, then settings + export pushed right */}
      <div className="undorow">
        <button className="undobtn" title="Undo (Ctrl+Z)" disabled={undoLen === 0} onClick={undo}>↶ Undo</button>
        <button className="undobtn" title="Redo (Ctrl+Shift+Z)" disabled={redoLen === 0} onClick={redo}>↷</button>
        <button className="undobtn" style={{ marginLeft: 'auto' }} title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        <button
          className="undobtn"
          onClick={exportCsv}
          title={view === 'checklists' ? 'Download all checklists as a CSV file' : 'Download all to-do items as a CSV file'}
        >⤓ Export CSV</button>
      </div>

      {view === 'todo' && <TodoView
        state={state}
        hideDone={hideDone} setHideDone={setHideDone}
        filterText={filterText} setFilterText={setFilterText}
        filterPri={filterPri} setFilterPri={setFilterPri}
        filterDue={filterDue} setFilterDue={setFilterDue}
        filtersActive={filtersActive} matchFilters={matchFilters}
        toggleDone={toggleDone} deleteItem={deleteItem} duplicateItem={duplicateItem}
        sortListNow={sortListNow}
        openItem={openItem} openName={openName}
        moveList={moveList}
        askConfirm={askConfirm} deleteList={deleteList}
        onItemDragStart={onItemDragStart} onItemDragEnd={onItemDragEnd}
        onItemsDragOver={onItemsDragOver} onItemsDragLeave={onItemsDragLeave} onItemsDrop={onItemsDrop}
        onListDragStart={onListDragStart} onListDragEnd={onListDragEnd}
        onListDragOver={onListDragOver} onListDragLeave={onListDragLeave} onListDrop={onListDrop}
        ctxMenu={ctxMenu} setCtxMenu={setCtxMenu}
        onShownCount={(n) => { shownItems = n }}
      />}

      {view === 'checklists' && <ChecklistsView
        state={state}
        addChecklist={addChecklist}
        askConfirm={askConfirm}
        openChecklistEdit={openChecklistEdit}
        updateChecklistActive={updateChecklistActive}
        moveChecklist={moveChecklist}
        deleteChecklist={deleteChecklist}
        addEntry={addEntry}
        duplicateEntry={duplicateEntry}
        moveEntry={moveEntry}
        removeEntry={removeEntry}
        setEntryText={setEntryText}
        updateEntrySimple={updateEntrySimple}
        setEntryActive={setEntryActive}
        updateEntrySchedule={updateEntrySchedule}
        forcePull={forcePull}
      />}

      {itemModal && <ItemModal
        editing={!!itemModal.editId}
        lists={state.lists}
        draft={itemDraft} setDraft={setItemDraft}
        onCancel={closeItem} onSave={saveItem}
        onDelete={itemModal.editId ? async () => {
          const it = state.items.find(i => i.id === itemModal.editId)
          if (await askConfirm(`Delete "${it?.text || 'this to-do'}"?`)) {
            deleteItem(itemModal.editId); closeItem()
          }
        } : null}
      />}

      {nameModal && <NameModal
        mode={nameModal.mode}
        renaming={!!nameModal.renameId}
        draft={nameDraft} setDraft={setNameDraft}
        onCancel={closeName} onSave={saveName}
        onDelete={nameModal.renameId ? async () => {
          if (nameModal.mode === 'checklist') {
            const cl = state.checklists.find(c => c.id === nameModal.renameId)
            if (cl && await askConfirm(`Delete checklist "${cl.name || ''}"?`)) {
              setState(s => ({
                ...s,
                checklists: s.checklists.filter(c => c.id !== nameModal.renameId),
                items: s.items.filter(i => i.checklistId !== nameModal.renameId),
              }))
              closeName()
            }
          } else {
            const list = state.lists.find(l => l.id === nameModal.renameId)
            const n = state.items.filter(i => i.listId === nameModal.renameId).length
            if (await askConfirm(`Delete the list "${list?.name || ''}"${n ? ` and its ${n} to-do${n > 1 ? 's' : ''}` : ''}?`)) {
              deleteList(nameModal.renameId); closeName()
            }
          }
        } : null}
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

      {settingsOpen && view === 'checklists' && <ChecklistSettingsPopover
        onClose={() => setSettingsOpen(false)}
        state={state}
        setState={setState}
        runChecklists={runChecklists}
      />}
      {settingsOpen && view !== 'checklists' && <SettingsPopover
        onClose={() => setSettingsOpen(false)}
        state={state}
        setState={setState}
        runChecklists={runChecklists}
      />}
    </div>
  )
}

// ---------------------- TodoView subcomponent ----------------------
function TodoView({
  state, hideDone, setHideDone, filterText, setFilterText, filterPri, setFilterPri,
  filterDue, setFilterDue, filtersActive, matchFilters,
  toggleDone, deleteItem, duplicateItem, sortListNow,
  openItem, openName, moveList,
  askConfirm, deleteList,
  onItemDragStart, onItemDragEnd, onItemsDragOver, onItemsDragLeave, onItemsDrop,
  onListDragStart, onListDragEnd, onListDragOver, onListDragLeave, onListDrop,
  ctxMenu, setCtxMenu,
}) {
  const clearFilters = () => { setFilterText(''); setFilterPri('all'); setFilterDue('all') }
  const renderedLists = []
  let totalShown = 0
  for (const list of state.lists) {
    let items = sortItems(state.items.filter(i => i.listId === list.id))
    if (hideDone) items = items.filter(i => !i.done)
    items = items.filter(matchFilters)
    if (filtersActive() && items.length === 0) continue
    totalShown += items.length
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

  const footerText = (() => {
    const total = (state.items || []).length
    const shown = totalShown
    return `CraniaVerse · To-Do · Count=${shown}` + (shown !== total ? ` of ${total}` : '')
  })()

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
        <button
          onClick={() => setHideDone(v => !v)}
          title="Show/hide completed"
          style={{
            background: '#E0DE85', border: 'none', color: 'var(--dark-brown)',
            padding: '6px 12px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
          }}
        >{hideDone ? 'Show Done' : 'Hide Done'}</button>
        <button
          onClick={() => openName(null)}
          style={{
            background: 'var(--light-blue)', color: 'var(--dark-brown)',
            border: 'none', padding: '6px 12px', fontSize: 13, fontWeight: 700,
            borderRadius: 8, cursor: 'pointer', marginLeft: 'auto',
          }}
        >+ Add List</button>
      </div>

      <div className="board">
        {renderedLists.length === 0 && filtersActive() && (
          <div className="nomatch">No to-dos match your filters.</div>
        )}
        {renderedLists.map(({ list, items }) => {
          const headDark = list.color && list.color.toLowerCase() !== '#ffffff' && isDarkColor(list.color)
          return (
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
              className={'list-head' + (headDark ? ' darkbg' : '')}
              style={list.color && list.color.toLowerCase() !== '#ffffff' ? { background: list.color } : undefined}
            >
              <span className="dhandle" title="Drag to reorder">⠿</span>
              <span className="name" title="Click to rename" onClick={() => openName(list.id)}>{list.name}</span>
              <span className="count">{items.length}</span>
              <button className="lsort" title="Sort by priority then due date" onClick={() => sortListNow(list.id)}>⇅</button>
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
                const dc = it.done ? '' : dueClass(it.due)
                const itemDark = isDarkColor(it.color || DEFAULT_ITEM_BG)
                return (
                  <div
                    key={it.id}
                    className={
                      'todo p-' + (it.priority || 'low') +
                      (it.done ? ' done' : '') +
                      (itemDark ? ' darkbg' : '')
                    }
                    draggable
                    data-id={it.id}
                    onDragStart={(e) => onItemDragStart(e, it.id)}
                    onDragEnd={onItemDragEnd}
                    onDoubleClick={(e) => { if (!e.target.closest('input,button')) openItem(it.id) }}
                    onContextMenu={(e) => {
                      e.preventDefault(); e.stopPropagation()
                      setCtxMenu({ x: e.pageX, y: e.pageY, itemId: it.id })
                    }}
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
                      {!it.done && <span className={'chip pri-' + (it.priority || 'low')}>{PRI_LABEL[it.priority || 'low']}</span>}
                    </span>
                    <span className="dueslot">
                      {it.due && !it.done && (
                        <span
                          className={'chip due ' + dc}
                          title={dc === 'overdue' ? 'Overdue since ' + fmtDue(it.due) : ''}
                        >
                          {dc === 'overdue' ? 'Overdue · ' + fmtDue(it.due) : fmtDue(it.due)}
                        </span>
                      )}
                    </span>
                    <button className="dup" title="Duplicate" onClick={() => duplicateItem(it.id)}>⧉</button>
                    <button className="x" title="Delete" onClick={() => handleDeleteItem(it)}>×</button>
                    {it.notes && <div className="notepop">{it.notes}</div>}
                  </div>
                )
              })}
            </div>

            <button className="add-item" title="Add to-do" onClick={() => openItem(null, list.id)}>+</button>
          </div>
        )})}
      </div>

      <div className="td-footer">{footerText}</div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="ctxmenu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { openItem(ctxMenu.itemId); setCtxMenu(null) }}>Edit</button>
          <button onClick={() => { duplicateItem(ctxMenu.itemId); setCtxMenu(null) }}>Duplicate</button>
          <button className="ctx-danger" onClick={async () => {
            const it = state.items.find(i => i.id === ctxMenu.itemId)
            if (it && await askConfirm(`Delete "${it.text}"?`)) deleteItem(ctxMenu.itemId)
            setCtxMenu(null)
          }}>Delete</button>
        </div>
      )}
    </>
  )
}

// ---------------------- ChecklistsView subcomponent ----------------------
function ChecklistsView({
  state, addChecklist, askConfirm, openChecklistEdit, updateChecklistActive, moveChecklist, deleteChecklist,
  addEntry, duplicateEntry, moveEntry, removeEntry,
  setEntryText, updateEntrySimple, setEntryActive, updateEntrySchedule, forcePull,
}) {
  const checklists = state.checklists || []

  const footerText = (() => {
    const n = checklists.reduce((s, cl) => s + (cl.entries || []).filter(e => e.text).length, 0)
    return `CraniaVerse · Checklists · Count=${n}`
  })()

  return (
    <div className="cl-wrap">
      <div className="cltoprow">
        <p className="clhint">
          Each checklist adds its items to the top of a chosen To-Do list, each on its own schedule (daily / weekly / monthly / custom).
        </p>
        <button
          onClick={addChecklist}
          style={{
            background: 'var(--light-blue)', color: 'var(--dark-brown)',
            border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: 700,
            borderRadius: 8, cursor: 'pointer', flexShrink: 0,
          }}
        >+ Add Checklist</button>
      </div>
      {checklists.map(cl => {
        const headStyle = cl.color && cl.color.toLowerCase() !== '#ffffff' ? { background: cl.color } : undefined
        const darkHead = cl.color ? isDarkColor(cl.color) : false
        return (
          <div key={cl.id} className={'clcard' + (cl.active === false ? ' inactive' : '')}>
            <div className={'clhead' + (darkHead ? ' darkhead' : '')} style={headStyle}>
              <span className="clname" title="Click to rename or recolour" onClick={() => openChecklistEdit(cl.id)}>{cl.name}</span>
              <span className="count">{(cl.entries || []).filter(e => e.text).length}</span>
              <label className="clactive">
                <input type="checkbox" checked={cl.active !== false} onChange={e => updateChecklistActive(cl.id, e.target.checked)} /> Active
              </label>
              <button className="clmove" title="Move up" onClick={() => moveChecklist(cl.id, -1)}>▲</button>
              <button className="clmove" title="Move down" onClick={() => moveChecklist(cl.id, 1)}>▼</button>
              <button className="cldel" title="Delete checklist" onClick={() => deleteChecklist(cl)}>×</button>
            </div>

            <div className="clentries">
              {cl.entries.map((en, idx) => (
                <ChecklistEntryRow
                  key={en.id}
                  entry={en}
                  index={idx}
                  lists={state.lists}
                  onText={(v) => setEntryText(cl.id, en.id, v)}
                  onNote={(v) => updateEntrySimple(cl.id, en.id, { note: v })}
                  onPriority={(v) => updateEntrySimple(cl.id, en.id, { priority: v })}
                  onListId={(v) => updateEntrySimple(cl.id, en.id, { listId: v })}
                  onActive={(v) => setEntryActive(cl.id, en.id, v)}
                  onSchedule={(patch) => updateEntrySchedule(cl.id, en.id, patch)}
                />
              ))}
            </div>

            <div className="clactions">
              <button className="cladd" title="Add item" onClick={() => addEntry(cl.id)}>+</button>
              <button className="clrun" onClick={() => forcePull(cl.id)}>Add to To-Do Now</button>
            </div>
          </div>
        )
      })}
      {checklists.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9a948a', fontSize: 13, padding: '20px 0' }}>
          No checklists yet — click "+ Add checklist" above to create one.
        </div>
      )}
      <div className="td-footer">{footerText}</div>
    </div>
  )
}

const WEEKDAY_OPTIONS = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun'],
]

function ChecklistEntryRow({
  entry: en, index, lists,
  onText, onNote, onPriority, onListId, onActive, onSchedule,
}) {
  return (
    <div className={'clentry' + (en.active === false ? ' inactive' : '')}>
      <input className="clenttext" value={en.text} placeholder={`Item ${index + 1}`} onChange={e => onText(e.target.value)} />
      <input className="clentnote" value={en.note} placeholder="comment (optional)" onChange={e => onNote(e.target.value)} />
      <select className="clentfreq" value={en.freq} onChange={e => onSchedule({ freq: e.target.value })}>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="custom">Custom</option>
      </select>

      {en.freq === 'weekly' && (
        <span className="clweekwrap">on
          <select value={String(en.weekDay ?? 1)} onChange={e => onSchedule({ weekDay: Number(e.target.value) })}>
            {WEEKDAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </span>
      )}

      {en.freq === 'monthly' && (
        <span className="clmonthwrap">on
          <select value={en.monthMode === 'weekday' ? 'weekday' : 'date'} onChange={e => onSchedule({ monthMode: e.target.value })}>
            <option value="date">the date</option>
            <option value="weekday">the</option>
          </select>
          {en.monthMode !== 'weekday' && (
            <input type="number" min="1" max="31" style={{ width: 50 }}
              value={Number(en.monthDate) || 1}
              onChange={e => onSchedule({ monthDate: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
          )}
          {en.monthMode === 'weekday' && (
            <>
              <select value={String(en.monthWeek || '1')} onChange={e => onSchedule({ monthWeek: e.target.value })}>
                <option value="1">1st</option><option value="2">2nd</option>
                <option value="3">3rd</option><option value="4">4th</option>
                <option value="last">last</option>
              </select>
              <select value={String(en.monthWeekday ?? 1)} onChange={e => onSchedule({ monthWeekday: Number(e.target.value) })}>
                {WEEKDAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </>
          )}
        </span>
      )}

      {en.freq === 'custom' && (
        <span className="clcustwrap">
          <select value={en.customMode === 'on' ? 'on' : 'every'} onChange={e => onSchedule({ customMode: e.target.value })}>
            <option value="every">every</option>
            <option value="on">once on</option>
          </select>
          {en.customMode !== 'on' && (
            <>
              <input type="number" className="clcustom" min="1" value={Number(en.customDays) || 1}
                onChange={e => onSchedule({ customDays: Math.max(1, Number(e.target.value) || 1) })} />
              days from
            </>
          )}
          <input type="date" value={en.customStart || ''} onChange={e => onSchedule({ customStart: e.target.value })} />
        </span>
      )}

      <span className="clentsep">→</span>
      <select className="clentlist" value={en.listId} onChange={e => onListId(e.target.value)}>
        {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <select
        className={'clentpri pri-' + (en.priority || 'high')}
        value={en.priority || 'high'}
        onChange={e => onPriority(e.target.value)}
        style={
          (en.priority || 'high') === 'high' ? { background: '#fadbd8', color: '#922b21' } :
          en.priority === 'med' ? { background: '#E0DE85', color: '#2E2516' } :
          { background: '#A6E2F9', color: '#2E2516' }
        }
      >
        <option value="high">High</option>
        <option value="med">Med</option>
        <option value="low">Low</option>
      </select>
      <label className="clentactive">
        <input type="checkbox" checked={en.active !== false} onChange={e => onActive(e.target.checked)} /> Active
      </label>
    </div>
  )
}

// ---------------------- Item modal ----------------------
function ItemModal({ editing, lists, draft, setDraft, onCancel, onSave, onDelete }) {
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal">
        <h2>{editing ? 'Edit To-Do' : 'New To-Do'}</h2>
        <div className="field">
          <label>To-Do</label>
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
            <option value="high" style={{ background: '#fadbd8', color: '#922b21' }}>High</option>
            <option value="med" style={{ background: '#E0DE85', color: '#2E2516' }}>Medium</option>
            <option value="low" style={{ background: '#A6E2F9', color: '#2E2516' }}>Low</option>
          </select>
        </div>
        <div className="field">
          <label>Due Date</label>
          <input type="date" value={draft.due} onChange={e => setDraft(d => ({ ...d, due: e.target.value }))} />
        </div>
        <div className="field">
          <label>Comments / Notes</label>
          <textarea
            rows={3} placeholder="Any details… (shown when you hover the to-do)"
            value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Card Colour</label>
          <ColorSwatches
            value={draft.color}
            palette={PASTELS}
            onChange={c => setDraft(d => ({ ...d, color: c }))}
          />
        </div>
        <div className="modal-actions">
          {onDelete && <button className="btn-del" onClick={onDelete}>Delete</button>}
          <button className="cancel" onClick={onCancel}>Cancel</button>
          <button onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------- Name modal (list OR checklist) ----------------------
function NameModal({ mode, renaming, draft, setDraft, onCancel, onSave, onDelete }) {
  const isChecklist = mode === 'checklist'
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" style={{ maxWidth: 360 }}>
        <h2>{isChecklist ? 'Edit Checklist' : (renaming ? 'Rename List' : 'New List')}</h2>
        <div className="field">
          <label>{isChecklist ? 'Checklist Name' : 'List Name'}</label>
          <input
            type="text" placeholder="e.g. Work" autoFocus
            value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>{isChecklist ? 'Checklist Colour' : 'List Colour'}</label>
          <ColorSwatches
            value={draft.color}
            palette={LIST_PALETTE}
            onChange={c => setDraft(d => ({ ...d, color: c }))}
          />
        </div>
        <div className="modal-actions">
          {onDelete && <button className="btn-del" onClick={onDelete}>Delete</button>}
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

// ---------------------- Settings popover ----------------------
function SettingsPopover({ onClose, state, setState, runChecklists }) {
  const ref = useRef(null)
  const [backups, setBackups] = useState(null)
  const [busy, setBusy] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  useEffect(() => {
    fetch(`${API_BASE}/api/todo/backups`)
      .then(r => r.json())
      .then(setBackups)
      .catch(() => setBackups([]))
  }, [])

  const backupNow = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/todo/backup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: new Date().toLocaleString() }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const list = await fetch(`${API_BASE}/api/todo/backups`).then(r => r.json())
      setBackups(list)
    } catch (err) {
      console.error('Backup failed:', err)
      alert('Backup failed — make sure the todo_backups collection exists (run pb-setup.js).')
    }
    setBusy(false)
  }

  const doRestore = async (id) => {
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/todo/restore/${id}`, { method: 'POST' })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data.lists)) {
        setState({
          lists: data.lists || [],
          items: data.items || [],
          checklists: (data.checklists || []).map(normalizeChecklist),
          _migPri: !!data._migPri,
          _migBg: !!data._migBg,
        })
      }
      setRestoreOpen(false)
      onClose()
    } catch (err) {
      console.error('Restore failed:', err)
      alert('Restore failed — see console for details.')
    }
    setBusy(false)
  }

  const lastBackup = backups?.[0]
  const lastLine = lastBackup
    ? `Last backup: ${lastBackup.label || new Date(lastBackup.created).toLocaleString()}`
    : backups === null ? 'Loading…' : 'No backups yet'

  return (
    <div className="settings-popover" ref={ref} onMouseDown={(e) => e.stopPropagation()}>
      <div className="sp-card">
        <div className="sp-card-title">Backups</div>
        <div className="sp-hint">
          Snapshots are saved to the database (last 14 kept).
          Back up before big changes, or restore to roll back.
        </div>
        <div className="sp-meta">{lastLine}</div>
        <div className="sp-btnrow">
          <button type="button" className="sp-btn" disabled={busy} onClick={backupNow}>
            {busy ? 'Saving…' : 'Back Up Now'}
          </button>
          <button type="button" className="sp-btn" disabled={busy} onClick={() => setRestoreOpen(v => !v)}>
            Restore{restoreOpen ? ' ▾' : '…'}
          </button>
        </div>
        {restoreOpen && backups && (
          <div className="sp-restore-list">
            {backups.length === 0 && (
              <div style={{ color: '#9a948a', padding: '10px 12px', textAlign: 'center', fontSize: 12 }}>
                No backups yet — click Back Up Now to create one.
              </div>
            )}
            {backups.map(b => (
              <div key={b.id} className="sp-restore-row">
                <span className="sp-rlabel">
                  {b.label || new Date(b.created).toLocaleString()}
                </span>
                <button type="button" className="sp-btn" disabled={busy} onClick={() => doRestore(b.id)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------- Checklist Settings popover ----------------------
function ChecklistSettingsPopover({ onClose, state, setState, runChecklists }) {
  const ref = useRef(null)
  const [backups, setBackups] = useState(null)
  const [busy, setBusy] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  useEffect(() => {
    fetch(`${API_BASE}/api/checklist/backups`)
      .then(r => r.json())
      .then(setBackups)
      .catch(() => setBackups([]))
  }, [])

  const backupNow = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/checklist/backup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: new Date().toLocaleString() }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const list = await fetch(`${API_BASE}/api/checklist/backups`).then(r => r.json())
      setBackups(list)
    } catch (err) {
      console.error('Checklist backup failed:', err)
      alert('Backup failed — make sure the checklist_backups collection exists (run pb-setup.js).')
    }
    setBusy(false)
  }

  const doRestore = async (id) => {
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/checklist/restore/${id}`, { method: 'POST' })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data.lists)) {
        setState({
          lists: data.lists || [],
          items: data.items || [],
          checklists: (data.checklists || []).map(normalizeChecklist),
          _migPri: !!data._migPri,
          _migBg: !!data._migBg,
        })
      }
      setRestoreOpen(false)
      onClose()
    } catch (err) {
      console.error('Checklist restore failed:', err)
      alert('Restore failed — see console for details.')
    }
    setBusy(false)
  }

  const lastBackup = backups?.[0]
  const lastLine = lastBackup
    ? `Last backup: ${lastBackup.label || new Date(lastBackup.created).toLocaleString()}`
    : backups === null ? 'Loading…' : 'No backups yet'

  return (
    <div className="settings-popover" ref={ref} onMouseDown={(e) => e.stopPropagation()}>
      <div className="sp-card">
        <div className="sp-card-title">Checklist Backups</div>
        <div className="sp-hint">
          Snapshots of your checklists are saved separately (last 14 kept).
          Back up before big changes, or restore to roll back.
        </div>
        <div className="sp-meta">{lastLine}</div>
        <div className="sp-btnrow">
          <button type="button" className="sp-btn" disabled={busy} onClick={backupNow}>
            {busy ? 'Saving…' : 'Back Up Now'}
          </button>
          <button type="button" className="sp-btn" disabled={busy} onClick={() => setRestoreOpen(v => !v)}>
            Restore{restoreOpen ? ' ▾' : '…'}
          </button>
        </div>
        {restoreOpen && backups && (
          <div className="sp-restore-list">
            {backups.length === 0 && (
              <div style={{ color: '#9a948a', padding: '10px 12px', textAlign: 'center', fontSize: 12 }}>
                No backups yet — click Back Up Now to create one.
              </div>
            )}
            {backups.map(b => (
              <div key={b.id} className="sp-restore-row">
                <span className="sp-rlabel">
                  {b.label || new Date(b.created).toLocaleString()}
                </span>
                <button type="button" className="sp-btn" disabled={busy} onClick={() => doRestore(b.id)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
