// Students — a list of students and a per-student detail view.
//
// Layout follows the Programs page, the same way Customers, Contests and
// Emergency Contacts now do: scoped CSS block, actions toolbar,
// accent-barred metric tiles, a filters row, and a pill-cell table with
// sortable, reorderable, hideable columns. The dialog host and popover
// styling are duplicated rather than shared with Programs — its
// `.pgov`/`.pgmodal` rules only exist while that page is mounted.
//
// Column layout lives in localStorage, matching Customers: there is no
// per-page state collection for this page, and it is a per-browser
// preference anyway.
//
// The Comments grid keeps its own shape. Its rows are multi-line by
// nature, and the same data is edited by the standalone Attendance and
// Comments pages through ../data/scheduleUtils — restyling the grid here
// alone would make the three surfaces diverge. Only its header and tabs
// are brought into line.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Trash2, Undo2, Redo2, Eye, UserPlus, ExternalLink, Pencil, Copy } from 'lucide-react'
import { useStore } from '../data/store'
import BackupPanel, { BACKUP_CSS } from '../components/BackupPanel'
import CategoryColors, { CATCOLORS_CSS } from '../components/CategoryColors'
import { buildCategoryLookup, usedCategories as categoriesInUse, inkOn } from '../data/programCategories'
import PageActions, { PAGEACTIONS_CSS } from '../components/PageActions'
import useActionHistory from '../data/useActionHistory'
import { awardsForRow, rowKeyOf, fieldCanTrigger } from '../data/autoCash'
import {
  ATTEND_STYLE, EMPTY_ROW, DEFAULT_ROWS, ACADEMIC_YEARS, currentAcademicYear,
  buildScheduledRows as buildScheduledRowsShared, dedupeProgramTabs, tabKeyOf,
} from '../data/scheduleUtils'
import { useAfterschoolWeeks } from '../data/useAfterschoolWeeks'
import { resolveLogin } from '../data/loginUtils'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }

const COLS = [
  { k: 'studentId', l: 'Student ID' },
  { k: 'name',    l: 'Name' },   // never hideable — it names the row
  { k: 'login',   l: 'Login' },
  { k: 'grade',   l: 'Grade' },
  { k: 'medical', l: 'Medical' },
  { k: 'cash',    l: 'Crania Cash' },
  { k: 'classes', l: 'Classes' },
]
const LOCKED_COL = 'name'

/* The student's number. Issued once, written to the record, and never
   recomputed or reused — including after a deletion, so a number always
   refers to the same child for as long as the school has records.
   Deriving it from position in a list would renumber everyone the moment
   somebody was removed, which is the one thing an identifier must not do. */
const studentRef = (n) => 'S' + String(n).padStart(4, '0')
const refNumber = (ref) => {
  const m = /^S(\d+)$/.exec(String(ref || '').trim())
  return m ? Number(m[1]) : 0
}

/* Stamp a number on any student that has none, always above the highest
   ever issued. A record that already has one is left completely alone —
   that is what makes it safe to print on a form or quote on the phone. */
function useStudentIds(records, assign) {
  const done = useRef(new Set())

  const ids = useMemo(() => {
    let highest = 0
    for (const r of (records || [])) highest = Math.max(highest, refNumber(r.customer?.meta?.studentId))
    const out = new Map()
    for (const r of (records || [])) {
      if (r.id === 'seed') continue
      const existing = r.customer?.meta?.studentId
      out.set(r.id, refNumber(existing) > 0 ? existing : studentRef(++highest))
    }
    return out
  }, [records])

  useEffect(() => {
    if (!assign) return
    for (const r of (records || [])) {
      if (r.id === 'seed') continue
      const ref = ids.get(r.id)
      if (!ref || r.customer?.meta?.studentId === ref) continue
      if (done.current.has(r.id)) continue
      done.current.add(r.id)
      assign(r.id, ref)
    }
  }, [records, ids, assign])

  return ids
}

/* Proportions rather than pixels, summing to 100 — a fixed layout gives
   the leftover space to any pixel column, starving the text ones on a
   wide screen. Sized so nothing is squeezed at the 860px min-width. */
const SEL_W = '3%'
const ACT_W = '9%'
const COL_W = {
  studentId: '8%', name: '18%', login: '12%', grade: '6%',
  medical: '15%', cash: '10%', classes: '19%',
}

const CPREF_KEY = 'students-cols'
function loadColPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(CPREF_KEY) || '{}')
    return {
      hiddenCols: v.hiddenCols && typeof v.hiddenCols === 'object' ? v.hiddenCols : {},
      colOrder: Array.isArray(v.colOrder) ? v.colOrder : [],
    }
  } catch { return { hiddenCols: {}, colOrder: [] } }
}
function saveColPrefs(v) { try { localStorage.setItem(CPREF_KEY, JSON.stringify(v)) } catch { /* ignore */ } }

const classesOf = (r) =>
  Array.from(new Set((r.programs || []).map(p => p.program).filter(Boolean)))

const CSS = BACKUP_CSS + CATCOLORS_CSS + PAGEACTIONS_CSS + `
.st{position:relative;--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;--dark-brown:#2E2516;
    --line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;--danger:#C0392B;
    --shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}
/* The list toolbar is gone — it is the shared bar now. This is the
   detail view own row: that student field history, and the two things
   you do to the student in front of you. */
.st .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.st .actions button{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:6px 12px;
    font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;
    display:inline-flex;align-items:center;gap:5px}
.st .actions button:hover:not(:disabled){background:#f4f2ea}
.st .actions button:disabled{opacity:.4;cursor:default}
.st .actions button.danger{color:var(--danger);border-color:#eecfca}
.st .actions button.danger:hover{background:#fdf3f1}

.st .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.st .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.st .metric.clickable{cursor:pointer}
.st .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.st .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.st .metric.menr{border-bottom-color:var(--yellow)}
.st .metric.mmed{border-bottom-color:#c0392b}
.st .metric.mcash{border-bottom-color:var(--light-blue)}
.st .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.st .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.st .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.st .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.st .filters input[type=search]{padding:7px 12px;border:1px solid var(--field);border-radius:8px;
    font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit;width:240px}
.st .filters input[type=search]:focus{outline:none;border-color:var(--teal)}
/* Scoped to this input. The old rule was a bare input::placeholder in a
   page-level <style>, which turned every placeholder on the page white. */
.st .filters input[type=search]::placeholder{color:var(--faint)}
/* Add Student moved into the shared bar and keeps its light-blue fill,
   so the one control on the bar that creates something still says so. */
.pgacts .st-add{background:var(--brand-light-blue,#A6E2F9);border:none;color:#2E2516}
.pgacts .st-add:hover:not(:disabled){filter:brightness(1.06);background:#A6E2F9}
.st .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.st .clearf:hover{background:#f1f5f4}

.st .bulkbar{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#eef7f6;
    border:1px solid var(--line);border-radius:10px;margin-bottom:12px}
.st .bulkbar .n{font-weight:700;font-size:13px;margin-right:14px}
.st .bulkbar button{border:none;border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:600;
    cursor:pointer;font-family:inherit}
.st .bulkbar .del{background:#c0392b;color:#fff}
.st .bulkbar .clr{background:transparent;border:1px solid var(--field);color:var(--muted)}
.st .bulkbar .acts{display:inline-flex;align-items:center;gap:8px}

.st .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.st table.slist{width:100%;min-width:860px;table-layout:fixed;border-collapse:separate;
    border-spacing:5px 5px;background:#fff}
.st table.slist thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
/* The sort arrow and eye sit absolutely at right:3px, so only the RIGHT
   padding reserves anything — the matching 30px on the left bought nothing
   and truncated short headers like "Grade". Right side unchanged; left cut. */
/* Centred across the whole cell. Reserving 30px for icons that are pinned
   absolutely pushed short headings — Student ID, Grade, Crania Cash — out
   of the space they had. The icons carry the header background so they read
   cleanly where they overlap; only a sorted column reserves room, for the
   arrow that is always showing. */
.st table.slist thead th.colh .lbl{display:block;text-align:center;padding:0 6px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st table.slist thead th.colh.sorted .lbl{padding-right:20px}
.st table.slist thead th.selcol,.st table.slist thead th:empty,.st table.slist thead th.blankhead,
.st table.slist tbody td.selcol,.st table.slist tbody td.actcell{background:transparent}
.st table.slist thead th.selcol input,.st table.slist tbody td.selcol input{width:12px;height:12px;margin:0;
    accent-color:var(--teal);vertical-align:middle;cursor:pointer}
.st table.slist tbody td.actcell{white-space:nowrap;text-align:center}
.st .selcol{text-align:center}
.st table.slist thead th .arw{opacity:.85;font-size:10px}
.st table.slist thead th.colh{cursor:grab}
.st table.slist thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1;
    background:var(--teal);padding-left:4px;border-radius:3px}
.st table.slist thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.st table.slist thead th.colh:hover .eye{opacity:1}
.st table.slist thead th .sortable{cursor:pointer}
.st table.slist tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:22px;overflow:hidden;text-overflow:ellipsis}
.st table.slist tbody tr{cursor:pointer}
.st table.slist tbody tr:hover td{background:#E4EFF3}
.st table.slist tbody tr.sel td{background:#DCEEEC}
.st td.col-grade,.st td.col-cash{text-align:center}
.st td.col-medical.hasmed{background:#FDE0E0 !important;color:#a12626;font-weight:600}
.st tbody tr:hover td.col-medical.hasmed{background:#F8D2D2 !important}
.st .sname{font-weight:700;color:#3d7f7d}
.st .login{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--muted)}
.st .dash{color:var(--faint)}
.st button.clink{background:none;border:none;padding:0;margin:0;font:inherit;font-size:12px;
    color:#3d7f7d;cursor:pointer;text-align:left}
.st button.clink:hover{text-decoration:underline}
.st .rowbtn{background:none;border:none;color:#c9c3b5;padding:0 2px;margin:0;line-height:1;
    cursor:pointer;transition:color .15s;display:inline-flex;vertical-align:middle}
.st .rowbtn.rb-del:hover{color:#c0392b}
.st .rowbtn.rb-edit:hover,.st .rowbtn.rb-dup:hover{color:#5FA09E}
/* Issued once and never reused, so it reads as an identifier rather than a
   position in the list. */
.st .sref{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--muted);font-weight:600}
.st .stupill{display:inline-block;max-width:100%;border:1px solid rgba(46,37,22,.16);border-radius:5px;
    padding:1px 7px;margin:1px 3px 1px 0;font:inherit;font-size:11.5px;font-weight:600;line-height:1.5;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;cursor:pointer;
    font-family:inherit}
.st table.slist tbody td.col-classes{white-space:normal;height:auto;padding-top:3px;padding-bottom:3px}
.st .empty{text-align:center;color:var(--muted);padding:60px 20px}
.st .empty b{color:var(--dark-brown)}
.st .tcount{color:var(--muted);font-size:12px;padding:10px 2px;text-align:right}

/* ---- detail view ---- */
.st .back{display:inline-flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;
    color:var(--teal);font-weight:700;font-size:13.5px;margin-bottom:10px;padding:0;font-family:inherit}
.st .back:hover{text-decoration:underline}
.st .panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}
.st .sec-h{font-size:13px;font-weight:700;color:var(--teal);margin:0 0 12px;padding-bottom:7px;
    border-bottom:1px solid var(--line);text-transform:uppercase;letter-spacing:.4px}
.st .frow{display:grid;grid-template-columns:92px 1fr;gap:10px;align-items:center;margin-bottom:8px}
.st .frow label{text-align:right;font-size:12px;font-weight:600;color:var(--muted);line-height:1.2}
.st .frow input,.st .frow .ro{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--field);
    border-radius:8px;font:inherit;font-size:13px;background:#fff;color:var(--dark-brown)}
.st .frow input:focus{outline:none;border-color:var(--teal)}
.st .frow .ro{background:var(--pill);color:var(--muted)}
.st .frow input.warn{background:#fffbf0;border-color:#f4d67a}
.st .frow input.bad{background:#fde0e0;border-color:#e8b4b4;color:#a12626;font-weight:600}
.st .frow .link{color:var(--danger);cursor:pointer;font-size:13px;padding:7px 0}
.st .frow .link:hover{text-decoration:underline}
.st .notes{width:100%;min-height:330px;padding:12px 14px;border-radius:10px;background:#fff;
    border:1px solid var(--field);font-family:inherit;font-size:13px;color:var(--dark-brown);
    resize:vertical;outline:none;box-sizing:border-box}
.st .notes:focus{border-color:var(--teal)}
.st .arow{display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;margin-bottom:6px;
    background:var(--pill);border-radius:7px;padding:6px 9px;font-size:12px}
.st .arow .an{font-weight:700}
.st .arow .ad{color:var(--muted)}
.st .arow .as{font-weight:700}
.st .cash{text-align:center;padding:8px 0}
.st .cash .v{font-size:42px;font-weight:800;color:var(--teal);cursor:pointer;line-height:1.1}
.st .cash .m{color:var(--danger);font-size:12.5px;font-weight:600;cursor:pointer;margin-top:4px}
.st .cash .m:hover{text-decoration:underline}
.st .genbtn{background:var(--pill);border:1px solid var(--field);border-radius:8px;padding:6px 11px;
    font-size:12.5px;font-weight:600;color:var(--danger);cursor:pointer;font-family:inherit}
.st .genbtn:hover{background:#e9edee}
.st .pw{display:flex;align-items:center;gap:6px}
.st .pw .v{flex:1;font-family:ui-monospace,Consolas,monospace;font-weight:700;letter-spacing:1px;
    background:var(--pill);border-radius:8px;padding:7px 10px;font-size:13px}
.st .pw button{background:none;border:1px solid var(--field);border-radius:7px;padding:4px 9px;
    font-size:11px;cursor:pointer;font-family:inherit;color:var(--muted)}

/* ---- comments (header + tabs only; the grid keeps its own shape) ---- */
.st .cmt-h{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:28px 0 10px;
    padding-bottom:7px;border-bottom:1px solid var(--line)}
.st .cmt-h .t{font-size:13px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.4px}
.st .cmt-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px}
.st .cmt-tab{background:#eef3f6;border:1px solid var(--field);border-radius:8px;padding:6px 13px;
    font-size:12.5px;font-weight:600;color:#5a6b6f;cursor:pointer;font-family:inherit;text-align:left}
.st .cmt-tab.on{background:var(--light-blue);color:var(--dark-brown);border-color:var(--light-blue)}
.st .cmt-tab .yr{display:block;font-size:10px;color:var(--muted);font-weight:600}
.st .cmt-tab.on .yr{color:#4a5f61}
.st .cmt-tab.add{background:transparent;border:1px dashed var(--teal);color:var(--teal);font-weight:700}
.st .cmt-new{display:flex;gap:6px;align-items:center;padding:5px 9px;background:#fff;
    border:1px dashed var(--teal);border-radius:8px}
.st .cmt-new select{font-size:12px;border:1px solid var(--field);border-radius:7px;padding:4px 7px;
    font-family:inherit;background:#fff;color:var(--dark-brown)}
.st .cmt-new .ok{background:var(--teal);color:#fff;border:none;border-radius:7px;padding:4px 11px;
    font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
.st .cmt-new .no{background:none;border:1px solid var(--field);border-radius:7px;padding:4px 9px;
    font-size:12px;cursor:pointer;font-family:inherit;color:var(--muted)}
.st .cmt-wrap{background:#fff;border-radius:10px;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-bottom:3px solid var(--teal);overflow-x:auto}
.st .addrow{width:28px;height:28px;border-radius:50%;border:1px dashed var(--teal);background:#fff;
    color:var(--teal);font-size:16px;font-weight:700;cursor:pointer;display:inline-flex;
    align-items:center;justify-content:center;margin:10px 0 0}
.st .savenote{font-size:11.5px;color:var(--muted);font-weight:600}

.stpop{position:fixed;z-index:220;background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:8px 12px 10px;min-width:190px;max-height:360px;
    overflow:auto;color:#2E2516;font-family:inherit}
.stpop .h{font-size:12px;color:#6B6455;font-weight:700;margin:2px 2px 7px}
.stpop .ch{display:flex;align-items:center;gap:9px;padding:5px 3px;font-size:13px;font-weight:600;cursor:pointer}
.stpop .ch:hover{background:#f4f2ea;border-radius:6px}
.stpop .ch input{margin:0;accent-color:#5FA09E}
.stpop .ch.locked{opacity:.5;cursor:default}
.stpop .allrow{border-top:1px solid #EDEAE2;margin-top:4px;padding-top:4px;display:flex;gap:4px;
    position:sticky;bottom:0;background:#fff}
.stpop .allrow button{background:none;border:none;color:#5FA09E;font-weight:700;font-size:12.5px;
    text-align:center;padding:6px 8px;border-radius:6px;flex:1;cursor:pointer;font-family:inherit}
.stpop .allrow button:hover{background:#f4f2ea}

.stmenu{position:fixed;z-index:301;background:#fff;border:1px solid #E7EBE7;border-radius:10px;
    box-shadow:0 8px 24px rgba(46,37,22,.2);overflow:hidden;min-width:190px;color:#2E2516;font-family:inherit}
.stmenu div{padding:9px 15px;font-size:13px;cursor:pointer;font-weight:600}
.stmenu div:hover{background:#f1f5f4}
.stmenu div.del{color:#C0392B}
.stmenu .sep{height:1px;background:#E7EBE7;padding:0;margin:2px 0;cursor:default}
.stmenu .sep:hover{background:#E7EBE7}

.stov{position:fixed;inset:0;background:rgba(46,37,22,.45);display:flex;align-items:center;
    justify-content:center;z-index:400;overflow:auto;padding:40px 16px}
.stmodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);width:100%;
    max-width:420px;margin:auto;padding:22px;color:#2E2516;font-family:inherit}
.stmodal h2{font-size:18px;margin:0 0 14px;color:#2E2516}
.stmodal .msg{font-size:13.5px;line-height:1.5;margin-bottom:18px}
.stmodal .macts{display:flex;gap:10px;justify-content:flex-end}
.stmodal .macts button{font:inherit;cursor:pointer;border:none;border-radius:8px;padding:8px 14px;
    background:#5FA09E;color:#fff;font-weight:600}
.stmodal .macts button.cancel{background:#eee;color:#2E2516}
`

/* ================= in-app dialogs ================= */
const DialogContext = React.createContext(null)
function useDialog() {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogHost>')
  return ctx
}

function DialogHost({ children }) {
  const [dlg, setDlg] = useState(null)
  const resolver = useRef(null)

  const finish = useCallback((value) => {
    setDlg(null)
    const r = resolver.current
    resolver.current = null
    if (r) r(value)
  }, [])

  const api = useMemo(() => ({
    confirm: (message, opts = {}) => new Promise(res => {
      resolver.current = res
      setDlg({
        type: 'confirm', message,
        title: opts.title || 'Delete', button: opts.button || 'Delete',
        danger: opts.danger !== false,
      })
    }),
    alert: (title, message) => new Promise(res => {
      resolver.current = res
      setDlg({ type: 'alert', title, message })
    }),
  }), [])

  useEffect(() => {
    if (!dlg) return
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        finish(dlg.type === 'confirm' ? false : null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dlg, finish])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dlg && (
        <div className="stov"
          onClick={e => { if (e.target === e.currentTarget) finish(dlg.type === 'confirm' ? false : null) }}>
          <div className="stmodal" onClick={e => e.stopPropagation()}>
            <h2>{dlg.title || 'Notice'}</h2>
            <div className="msg">{dlg.message}</div>
            <div className="macts">
              {dlg.type === 'confirm' && <button className="cancel" onClick={() => finish(false)}>Cancel</button>}
              <button style={dlg.danger ? { background: '#c0392b' } : undefined}
                onClick={() => finish(dlg.type === 'confirm' ? true : null)}
              >{dlg.type === 'confirm' ? dlg.button : 'OK'}</button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

// ── Shared bits ────────────────────────────────────────────────────────────

const ColsPop = React.forwardRef(function ColsPop({ rect, hiddenCols, onToggle, onAll, onNone }, ref) {
  const style = {
    top: Math.min(rect.bottom + 6, window.innerHeight - 320),
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 230)),
  }
  return (
    <div className="stpop" ref={ref} style={style}>
      <div className="h">Show Columns</div>
      {COLS.map(c => {
        const locked = c.k === LOCKED_COL
        return (
          <label key={c.k} className={'ch' + (locked ? ' locked' : '')}
            title={locked ? 'The student name always stays visible' : undefined}>
            <input type="checkbox" disabled={locked} checked={locked || !hiddenCols[c.k]}
              onChange={e => onToggle(c.k, e.target.checked)} />
            {c.l}
          </label>
        )
      })}
      <div className="allrow">
        <button onClick={onAll}>Show All</button>
        <button onClick={onNone}>Hide All</button>
      </div>
    </div>
  )
})

function CtxMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const style = {
    top: Math.min(y, window.innerHeight - 20 - items.length * 38),
    left: Math.min(x, window.innerWidth - 210),
  }
  return (
    <div className="stmenu" ref={ref} style={style}>
      {items.map((it, i) => it.sep
        ? <div key={i} className="sep" />
        : <div key={i} className={it.danger ? 'del' : ''} onClick={() => { onClose(); it.on() }}>{it.label}</div>)}
    </div>
  )
}

function SField({ label, value, variant, readOnly, onChange }) {
  let cls = ''
  if (variant === 'highlight') cls = 'warn'
  if (variant === 'danger') cls = 'bad'
  return (
    <div className="frow">
      <label>{label}:</label>
      {variant === 'link'
        ? <div className="link">{value || '—'}</div>
        : readOnly
          ? <div className="ro">{value || ' '}</div>
          : <input className={cls} value={value || ''} onChange={e => onChange && onChange(e.target.value)} />}
    </div>
  )
}

// ── Comments section ───────────────────────────────────────────────────────
// ATTEND_STYLE, EMPTY_ROW, DEFAULT_ROWS, ACADEMIC_YEARS and the whole
// schedule-autopopulation toolkit live in ../data/scheduleUtils so the
// standalone Attendance / Comments pages build identical rows for a given
// tab — all three surfaces read and write the same PocketBase `comments`
// row, so there is nothing to keep in sync here.

function CommentsSection({ studentId, initialPrograms }) {
  const { rules, syncAutoCash, programs: allPrograms } = useStore()
  const dialog = useDialog()
  const { weekDates } = useAfterschoolWeeks()

  /* The catalogue, not the six demo rows in mockData. Reading that file
     offered programs the school does not run, and picking one wrote it
     onto the student's enrolments. */
  const programOptions = useMemo(() => {
    const names = (allPrograms || []).map(p => p.name).filter(Boolean)
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [allPrograms])

  // Dedupe here so a registration that ended up with the same
  // (year, program) tab listed twice — e.g. a double-submit when adding a
  // program — only ever shows ONE tab. Both entries read/write the
  // identical PocketBase comments row anyway (same tabKeyOf()).
  const [programs, setPrograms] = useState(() => dedupeProgramTabs(initialPrograms))

  const buildScheduledRows = useCallback((prog, count) =>
    buildScheduledRowsShared(prog, allPrograms, weekDates, count), [allPrograms, weekDates])
  const [activeTab, setActiveTab] = useState(0)
  const [rows, setRows] = useState({})
  const [saveStatus, setSaveStatus] = useState({})
  const [addingTab, setAddingTab] = useState(false)
  const [newTab, setNewTab] = useState({ year: currentAcademicYear(), program: '' })
  const saveTimer = useRef({})
  const programsRef = useRef(programs)
  const rowsRef = useRef(rows)
  const studentIdRef = useRef(studentId)

  useEffect(() => { programsRef.current = programs }, [programs])
  useEffect(() => { rowsRef.current = rows }, [rows])

  const flushPending = useCallback((sid) => {
    Object.keys(saveTimer.current).forEach((tabIdx) => {
      if (!saveTimer.current[tabIdx]) return
      clearTimeout(saveTimer.current[tabIdx])
      saveTimer.current[tabIdx] = null
      const prog = programsRef.current[tabIdx]
      const pendingRows = rowsRef.current[tabIdx]
      if (!prog || !pendingRows) return
      const key = `${prog.year}|${prog.program}`
      fetch(`${API_BASE}/api/comments/${sid}/${encodeURIComponent(key)}`, {
        method: 'PUT', headers: HEADERS, body: JSON.stringify(pendingRows),
      }).catch(() => {})
    })
  }, [])

  useEffect(() => {
    if (!studentId) return
    flushPending(studentIdRef.current)
    studentIdRef.current = studentId
    const dedupedPrograms = dedupeProgramTabs(initialPrograms)
    setPrograms(dedupedPrograms)
    programsRef.current = dedupedPrograms
    setActiveTab(0)
    setSaveStatus({})
    setRows({})
    rowsRef.current = {}
    fetch(`${API_BASE}/api/comments/${studentId}`, { headers: HEADERS })
      .then((r) => r.json())
      .then((data) => {
        const loaded = {}
        // Index against the SAME deduped array used for the rendered tabs,
        // not the raw initialPrograms prop — otherwise tab index i here
        // could point at a different program than tab index i on screen.
        dedupedPrograms.forEach((p, i) => {
          loaded[i] = data[tabKeyOf(p)] || buildScheduledRows(p)
        })
        setRows(loaded)
        rowsRef.current = loaded
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  const persistTab = useCallback((tabIdx, updatedRows) => {
    if (!studentId) return
    const prog = programsRef.current[tabIdx]
    if (!prog) return
    const key = `${prog.year}|${prog.program}`
    setSaveStatus((s) => ({ ...s, [tabIdx]: 'saving' }))
    fetch(`${API_BASE}/api/comments/${studentId}/${encodeURIComponent(key)}`, {
      method: 'PUT', headers: HEADERS, body: JSON.stringify(updatedRows),
    })
      .then((r) => r.ok ? setSaveStatus((s) => ({ ...s, [tabIdx]: 'saved' })) : Promise.reject())
      .catch(() => setSaveStatus((s) => ({ ...s, [tabIdx]: 'error' })))
  }, [studentId])

  const tabRows = rows[activeTab] || DEFAULT_ROWS()

  const addRow = () => {
    setRows((r) => {
      const cur = r[activeTab] || []
      const prog = programsRef.current[activeTab]
      // Regenerate enough rows to cover the new total, then take just the
      // new one so its day/date follows the existing schedule pattern.
      const generated = buildScheduledRows(prog, cur.length + 1)
      const newRow = generated[cur.length] || EMPTY_ROW(cur.length + 1)
      const next = [...cur, newRow]
      const updated = { ...r, [activeTab]: next }
      rowsRef.current = updated
      clearTimeout(saveTimer.current[activeTab])
      saveTimer.current[activeTab] = setTimeout(() => persistTab(activeTab, next), 800)
      return updated
    })
  }

  const update = (rowIdx, field, value) => {
    const currentRows = rowsRef.current[activeTab] || []
    const prevRow = currentRows[rowIdx] || {}
    const prevVal = prevRow[field] || ''
    if (prevVal === value) return // no-op: avoids spurious fires from re-selecting the same value
    const next = currentRows.map((row, i) => i === rowIdx ? { ...row, [field]: value } : row)
    const updated = { ...rowsRef.current, [activeTab]: next }
    rowsRef.current = updated
    setRows(updated)
    clearTimeout(saveTimer.current[activeTab])
    saveTimer.current[activeTab] = setTimeout(() => persistTab(activeTab, next), 800)

    /* Bring this lesson's automatic Crania Cash into line with what the row
       now says. Reconciled from the row rather than fired on the change, so
       correcting a mistake takes the award back and re-marking the same
       value does not award twice. */
    if (studentId && fieldCanTrigger(rules, field)) {
      const row = next[rowIdx] || {}
      syncAutoCash(studentId, rowKeyOf(activeTab, row, rowIdx), awardsForRow(rules, row))
    }
  }

  const addProgram = async () => {
    if (!newTab.program) return
    const newProg = { year: newTab.year, program: newTab.program }
    // Guard against a second tab that duplicates one already there — both
    // would read/write the identical PocketBase comments row.
    const dupIdx = programs.findIndex((p) => tabKeyOf(p) === tabKeyOf(newProg))
    if (dupIdx !== -1) {
      setActiveTab(dupIdx)
      setAddingTab(false)
      setNewTab({ year: currentAcademicYear(), program: '' })
      await dialog.alert('Tab already exists',
        `${newProg.program} (${newProg.year}) already has a tab for this student — switched to it instead of creating a duplicate.`)
      return
    }
    const next = [...programs, newProg]
    programsRef.current = next
    setPrograms(next)
    setRows((r) => ({ ...r, [next.length - 1]: buildScheduledRows(newProg) }))
    setActiveTab(next.length - 1)
    setAddingTab(false)
    setNewTab({ year: currentAcademicYear(), program: '' })
    fetch(`${API_BASE}/api/registrations/${studentId}/programs`, {
      method: 'PUT', headers: HEADERS, body: JSON.stringify(next),
    }).catch(() => {})
  }

  const GCOLS = [
    { key: 'lessonNo', label: 'LESSON #', width: 52, readOnly: true },
    { key: 'day', label: 'DAY', width: 52 },
    { key: 'date', label: 'DATE', width: 120, type: 'date' },
    { key: 'attendance', label: 'ATTENDANCE', width: 90, type: 'attendance' },
    { key: 'uniform', label: 'UNIFORM', width: 90, type: 'uniform' },
    { key: 'lessonPlan', label: 'LESSON PLAN', width: 180 },
    { key: 'homeworkCompleted', label: 'HOMEWORK COMPLETED', width: 130 },
    { key: 'performance', label: 'PERFORMANCE', width: 160 },
    { key: 'behaviour', label: 'BEHAVIOUR', width: 140 },
    { key: 'homeworkAssigned', label: 'HOMEWORK ASSIGNED', width: 120 },
    { key: 'parentComm', label: 'PARENT COMMUNICATION', width: 140 },
    { key: 'teacher', label: 'TEACHER', width: 90 },
  ]

  const status = saveStatus[activeTab]

  return (
    <div>
      <div className="cmt-h">
        <span className="t">Comments</span>
        {status && (
          <span className="savenote">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save failed'}
          </span>
        )}
      </div>

      <div className="cmt-tabs">
        {programs.map((p, i) => (
          <button key={i} className={'cmt-tab' + (activeTab === i ? ' on' : '')} onClick={() => setActiveTab(i)}>
            <span className="yr">{p.year}</span>
            {p.program}
          </button>
        ))}
        {addingTab ? (
          <div className="cmt-new">
            <select value={newTab.year} onChange={(e) => setNewTab((t) => ({ ...t, year: e.target.value }))}>
              {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={newTab.program} style={{ minWidth: 220 }}
              onChange={(e) => setNewTab((t) => ({ ...t, program: e.target.value }))}>
              <option value="">— select program —</option>
              {programOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="ok" onClick={addProgram}>Add</button>
            <button className="no" onClick={() => setAddingTab(false)}>Cancel</button>
          </div>
        ) : (
          <button className="cmt-tab add" title="Add program tab" onClick={() => setAddingTab(true)}>+</button>
        )}
      </div>

      <div className="cmt-wrap">
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr style={{ background: '#EAF3F2' }}>
              {GCOLS.map((c) => (
                <th key={c.key} style={{ padding: '7px 8px', border: '1px solid #dfe6e5', fontWeight: 700, fontSize: 10.5,
                  whiteSpace: 'nowrap', minWidth: c.width, textAlign: 'center', color: '#4a5f61', letterSpacing: '.3px' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabRows.map((row, ri) => (
              <tr key={ri}>
                {GCOLS.map((c) => {
                  const val = row[c.key] ?? ''
                  const attendStyle = c.type === 'attendance' ? (ATTEND_STYLE[val.toUpperCase()] || {}) : {}
                  return (
                    <td key={c.key} style={{ border: '1px solid #e6eaea', padding: 2, verticalAlign: 'middle', textAlign: 'center', ...attendStyle }}>
                      {c.readOnly ? (
                        <div style={{ padding: '4px 2px', fontWeight: 600 }}>{val}</div>
                      ) : c.type === 'date' ? (
                        <input type="date" value={val} onChange={(e) => update(ri, c.key, e.target.value)}
                          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 12, background: 'transparent', padding: '2px 4px', width: '100%', cursor: 'pointer' }} />
                      ) : c.type === 'uniform' ? (
                        <select value={val} onChange={(e) => update(ri, c.key, e.target.value)}
                          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 12, background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'center' }}>
                          <option value=""></option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                          <option value="Borrowed">Borrowed</option>
                        </select>
                      ) : c.type === 'attendance' ? (
                        <select value={val} onChange={(e) => update(ri, c.key, e.target.value)}
                          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'center', ...attendStyle }}>
                          <option value=""></option>
                          <option value="P">P</option>
                          <option value="L">L</option>
                          <option value="A">A</option>
                        </select>
                      ) : (
                        <textarea value={val} onChange={(e) => update(ri, c.key, e.target.value)}
                          style={{ width: '100%', minWidth: c.width - 4, border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 12, background: 'transparent', padding: '2px 4px', minHeight: 40, textAlign: 'left' }}
                          rows={Math.max(2, val.split('\n').length)} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="addrow" title="Add a lesson row" onClick={addRow}>+</button>
    </div>
  )
}

// ── Student list view ──────────────────────────────────────────────────────

/* The same two cards as Customers — snapshots of the registrations
   students are held on, and the programme-type colours both pages share —
   are now passed to PageActions as settingsExtra, which owns the panel and
   its click-away. */

function StudentList({ onSelect, onAdd, onDelete, onDuplicate, onBulkDelete, onNavigate, studentIds,
  onUndo, onRedo, undoLabel, redoLabel, histBusy, histNote }) {
  const { records, programs, programsState, setProgramsState, refresh } = useStore()
  const dialog = useDialog()
  const [search, setSearch] = useState('')
  const [medicalOnly, setMedicalOnly] = useState(false)
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const [selected, setSelected] = useState(() => new Set())
  const [{ hiddenCols, colOrder }, setColPrefs] = useState(loadColPrefs)
  const [pop, setPop] = useState(null)
  const [rowCtx, setRowCtx] = useState(null)
  const dragCol = useRef(null)
  const popRef = useRef(null)

  const setPrefs = useCallback((mut) => {
    setColPrefs(prev => {
      const next = { hiddenCols: { ...prev.hiddenCols }, colOrder: [...prev.colOrder] }
      mut(next)
      saveColPrefs(next)
      return next
    })
  }, [])

  const orderedCols = useMemo(() => {
    const byK = new Map(COLS.map(c => [c.k, c]))
    const seen = new Set()
    const out = []
    for (const k of colOrder) {
      const c = byK.get(k)
      if (c && !seen.has(k)) { seen.add(k); out.push(c) }
    }
    for (const c of COLS) if (!seen.has(c.k)) out.push(c)
    return out.filter(c => !hiddenCols[c.k])
  }, [colOrder, hiddenCols])

  const hideCol = (k) => {
    if (k === LOCKED_COL) return
    setPrefs(p => { p.hiddenCols = { ...p.hiddenCols, [k]: true } })
  }

  const onDrop = (target) => {
    const from = dragCol.current
    dragCol.current = null
    if (!from || from === target) return
    setPrefs(p => {
      const base = p.colOrder.length ? p.colOrder.filter(k => COLS.some(c => c.k === k)) : COLS.map(c => c.k)
      const full = [...base, ...COLS.map(c => c.k).filter(k => !base.includes(k))]
      const next = full.filter(k => k !== from)
      next.splice(full.indexOf(target) > full.indexOf(from) ? next.indexOf(target) + 1 : next.indexOf(target), 0, from)
      p.colOrder = next
    })
  }

  const onSort = (k) => setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 })

  /* Same lookup the Customers page uses, so a class is the same colour on
     both and a recolour in either settings panel shows up on both. */
  const { progFor, categoryOf, tintFor, catColors } =
    useMemo(() => buildCategoryLookup(programs, programsState), [programs, programsState])

  const usedCategories = useMemo(() => categoriesInUse(records, categoryOf), [records, categoryOf])

  const setCatColor = useCallback((cat, color) => {
    setProgramsState(prev => ({ ...(prev || {}), catColors: { ...((prev || {}).catColors || {}), [cat]: color } }))
  }, [setProgramsState])

  const allRows = useMemo(() => records.filter(r => r.id !== 'seed').map(r => ({
    id: r.id, record: r,
    studentId: studentIds.get(r.id) || '',
    progList: r.programs || [],
    name: `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim(),
    login: resolveLogin(r.student).username || '',
    grade: r.student?.grade || '',
    medical: r.student?.medical || '',
    cash: r.student?.craniaCash ?? '',
    classList: classesOf(r),
  })), [records, studentIds])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = allRows.filter(r => {
      if (medicalOnly && !r.medical) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.login.toLowerCase().includes(q) ||
             r.medical.toLowerCase().includes(q) ||
             r.classList.some(c => c.toLowerCase().includes(q))
    })
    const val = (r) => {
      if (r == null) return ''
      if (sort.key === 'grade' || sort.key === 'cash') {
        const n = parseFloat(String(r[sort.key]).replace(/[^0-9.-]/g, ''))
        return isFinite(n) ? n : (sort.key === 'grade' ? 999 : -Infinity)
      }
      if (sort.key === 'classes') return r.classList.join(', ').toLowerCase()
      return String(r[sort.key] || '').toLowerCase()
    }
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -sort.dir
      if (av > bv) return sort.dir
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [allRows, search, medicalOnly, sort])

  const metrics = useMemo(() => {
    let enrolled = 0, medical = 0, cash = 0
    for (const r of allRows) {
      if ((r.record.programs || []).some(p => p.active)) enrolled++
      if (r.medical) medical++
      const n = Number(r.cash)
      if (isFinite(n)) cash += n
    }
    return { total: allRows.length, enrolled, medical, cash }
  }, [allRows])

  const anyFilterActive = !!search || medicalOnly
  const clearAllFilters = () => { setSearch(''); setMedicalOnly(false) }
  const allSel = visible.length > 0 && visible.every(r => selected.has(r.id))
  const selectedRows = useMemo(() => visible.filter(r => selected.has(r.id)), [visible, selected])

  /* Handed up whole rather than deleted one at a time here, so the page can
     put the lot on the undo stack as one step: it was one action, and
     stepping back through thirty of them to reverse a mis-click is not
     undo. */
  const bulkDelete = async () => {
    const ok = await onBulkDelete(selectedRows.map(r => r.record))
    if (ok) setSelected(new Set())
  }

  /* Every student, not just the shown ones, and School as well — it is not
     a column here but it is one of the first things asked of an export. */
  const csvColumns = [
    { key: 'studentId', label: 'Student ID' },
    { key: 'name', label: 'Name' },
    { key: 'login', label: 'Login' },
    { key: 'grade', label: 'Grade' },
    { key: 'school', label: 'School' },
    { key: 'medical', label: 'Medical' },
    { key: 'cash', label: 'Crania Cash' },
    { key: 'classes', label: 'Classes' },
  ]
  const csvRows = () => allRows.map(r => ({
    studentId: r.studentId, name: r.name, login: r.login, grade: r.grade,
    school: r.record.student?.school || '', medical: r.medical, cash: r.cash,
    classes: r.classList.join('; '),
  }))

  useEffect(() => {
    if (!pop) return
    const onDown = e => { if (popRef.current && !popRef.current.contains(e.target)) setPop(null) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [pop])

  const arrow = k => sort.key === k ? <span className="arw">{sort.dir > 0 ? '▲' : '▼'}</span> : null

  return (
    <div className="page st" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      <PageActions
        onUndo={onUndo} onRedo={onRedo} undoLabel={undoLabel} redoLabel={redoLabel}
        histBusy={histBusy} histNote={histNote}
        csvName="crania-students-export"
        csvColumns={csvColumns}
        csvRows={csvRows}
        settingsExtra={close => (
          <>
            {/* Closes the panel on the way: the column chooser is a fixed
                popover underneath it, so it would open invisible. */}
            <button title="Choose which columns are shown"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                close()
                setPop({ kind: 'cols', rect })
              }}><Eye size={13} /> Columns</button>
            <BackupPanel base="customers" confirm={dialog.confirm}
              hint={'Students are held on the registrations, so these are the same snapshots the '
                + 'Customers page takes — restoring one replaces every registration (last 14 kept).'}
              onRestored={async () => { await refresh(); close() }} />
            <CategoryColors categories={usedCategories} tintFor={tintFor} onCatColor={setCatColor} />
          </>
        )}
      >
        <button className="st-add" title="Add a new student" onClick={onAdd}>
          <UserPlus size={13} /> Add Student
        </button>
      </PageActions>

      <div className="metrics">
        <div className="metric">
          <div className="label">Students</div><div className="value">{metrics.total}</div>
          <div className="hint">on the roll</div>
        </div>
        <div className="metric menr">
          <div className="label">Enrolled</div><div className="value">{metrics.enrolled}</div>
          <div className="hint">in at least one class</div>
        </div>
        <div className={'metric mmed clickable' + (medicalOnly ? ' on' : '')}
          title="Click to show only students with a medical note"
          onClick={() => setMedicalOnly(v => !v)}>
          <div className="label">Medical Flags</div><div className="value">{metrics.medical}</div>
          <div className="hint">have a condition on file</div>
        </div>
        <div className="metric mcash">
          <div className="label">Crania Cash</div><div className="value">{metrics.cash}</div>
          <div className="hint">total across students</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search students, logins or classes…" autoComplete="off" />
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <span className="n">{selected.size} selected</span>
          <span className="acts">
            <button className="del" onClick={bulkDelete}>Delete Selected</button>
            <button className="clr" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </span>
        </div>
      )}

      <div className="card">
        {allRows.length === 0 ? (
          <div className="empty"><b>No students yet.</b><br />Click “Add Student” to create the first one.</div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <b>Nothing to show.</b><br />Your search or filter is too narrow.
            {anyFilterActive && (
              <div style={{ marginTop: 14 }}>
                <button className="clearf" onClick={clearAllFilters}>Clear All Filters</button>
              </div>
            )}
          </div>
        ) : (
          <table className="slist">
            <colgroup>
              <col style={{ width: SEL_W }} />
              {orderedCols.map(c => <col key={c.k} style={{ width: COL_W[c.k] }} />)}
              <col style={{ width: ACT_W }} />
            </colgroup>
            <thead>
              <tr>
                <th className="selcol">
                  <input type="checkbox" checked={allSel} onChange={e =>
                    setSelected(e.target.checked ? new Set(visible.map(r => r.id)) : new Set())} />
                </th>
                {orderedCols.map(c => (
                  <th key={c.k} className={'colh' + (sort.key === c.k ? ' sorted' : '')} draggable data-col={c.k}
                    onDragStart={() => { dragCol.current = c.k }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDrop(c.k)}>
                    <span className="lbl sortable" onClick={() => onSort(c.k)}>{c.l}</span>
                    <span className="thicons">
                      {arrow(c.k)}
                      {c.k !== LOCKED_COL && (
                        <span className="eye" title="Hide Column"
                          onClick={e => { e.stopPropagation(); hideCol(c.k) }}>👁</span>
                      )}
                    </span>
                  </th>
                ))}
                <th className="blankhead" />
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const isSel = selected.has(r.id)
                return (
                  <tr key={r.id} className={isSel ? 'sel' : ''}
                    title="Click to open this student; right-click for more"
                    onClick={() => onSelect(r.id)}
                    onContextMenu={e => { e.preventDefault(); setRowCtx({ x: e.clientX, y: e.clientY, row: r }) }}>
                    <td className="selcol" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSel} onChange={e => setSelected(s => {
                        const n = new Set(s)
                        if (e.target.checked) n.add(r.id); else n.delete(r.id)
                        return n
                      })} />
                    </td>
                    {orderedCols.map(c => {
                      const k = c.k
                      let content, cls = `col-${k}`, title = String(r[k] || '')
                      if (k === 'name') {
                        content = <span className="sname">{r.name || <span className="dash">—</span>}</span>
                      } else if (k === 'login') {
                        content = r.login ? <span className="login">{r.login}</span> : <span className="dash">—</span>
                      } else if (k === 'medical') {
                        if (r.medical) cls += ' hasmed'
                        content = r.medical || <span className="dash">—</span>
                      } else if (k === 'studentId') {
                        content = r.studentId
                          ? <span className="sref">{r.studentId}</span>
                          : <span className="dash">—</span>
                      } else if (k === 'classes') {
                        title = r.classList.join(', ')
                        content = r.progList.length === 0 ? <span className="dash">—</span> : r.progList.map((p2, i) => {
                          const nm = p2.program || ''
                          const prog = progFor(nm)
                          const cat = categoryOf(nm)
                          const bg = tintFor(cat)
                          return (
                            <button key={nm + i} className="stupill"
                              style={{ background: bg, color: inkOn(bg) }}
                              title={`${nm}${cat ? ` — ${cat}` : ' — no programme type'} — ${p2.status || 'no status'}`
                                + (prog ? ' · click to open in Programs' : '')}
                              onClick={e => { e.stopPropagation(); if (prog) onNavigate && onNavigate('Programs', prog.id) }}
                            >{nm || '—'}</button>
                          )
                        })
                      } else {
                        content = r[k] === '' || r[k] == null ? <span className="dash">—</span> : r[k]
                      }
                      return <td key={k} className={cls} title={title}>{content}</td>
                    })}
                    <td className="actcell" onClick={e => e.stopPropagation()}>
                      <button className="rowbtn rb-edit" title="Open this student"
                        onClick={() => onSelect(r.id)}><Pencil size={12} /></button>
                      <button className="rowbtn rb-dup" title={`Duplicate ${r.name || 'this student'}`}
                        onClick={() => onDuplicate(r.record)}><Copy size={12} /></button>
                      <button className="rowbtn rb-del" title="Delete this student"
                        onClick={() => onDelete(r.record)}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="tcount">
        Count={visible.length}{visible.length !== allRows.length ? ` of ${allRows.length}` : ''}
      </div>

      {pop && pop.kind === 'cols' && (
        <ColsPop ref={popRef} rect={pop.rect} hiddenCols={hiddenCols}
          onToggle={(k, on) => setPrefs(p => {
            const n = { ...p.hiddenCols }
            if (on) delete n[k]; else n[k] = true
            p.hiddenCols = n
          })}
          onAll={() => setPrefs(p => { p.hiddenCols = {} })}
          onNone={() => setPrefs(p => {
            p.hiddenCols = Object.fromEntries(COLS.filter(c => c.k !== LOCKED_COL).map(c => [c.k, true]))
          })} />
      )}

      {rowCtx && (
        <CtxMenu x={rowCtx.x} y={rowCtx.y} onClose={() => setRowCtx(null)} items={[
          { label: 'Open Student', on: () => onSelect(rowCtx.row.id) },
          { label: 'Open Customer', on: () => onNavigate && onNavigate('Customers', rowCtx.row.id) },
          { sep: true },
          { label: 'Delete Student', danger: true, on: () => onDelete(rowCtx.row.record) },
        ]} />
      )}
    </div>
  )
}

// ── Student detail view ────────────────────────────────────────────────────

function StudentDetail({ recordId, onBack, onNavigate, onDelete }) {
  const { records, updateStudentField } = useStore()
  const record = records.find(r => r.id === recordId) || records[0]
  const s = record.student

  /* `notes` is an array on the record. A record saved before the field
     existed has none — reading it unguarded used to take the whole detail
     view down with "Cannot read properties of undefined". */
  const noteLines = (v) => Array.isArray(v) ? v : typeof v === 'string' && v ? v.split('\n') : []

  const [fields, setFields] = useState(s)
  const [notes, setNotes] = useState(() => noteLines(s.notes).join('\n'))
  const [generatedPw, setGeneratedPw] = useState(null)
  const [copied, setCopied] = useState(false)
  const saveTimer = useRef(null)
  const latest = useRef({ fields, notes })
  latest.current = { fields, notes }

  // Undo covers field edits only. Deleting a student is a server-side
  // delete that would come back with a different id.
  const undoStack = useRef([])
  const redoStack = useRef([])
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)
  const editingKey = useRef(null)

  useEffect(() => {
    setFields(s)
    setNotes(noteLines(s.notes).join('\n'))
    setGeneratedPw(null)
    setCopied(false)
    undoStack.current = []; redoStack.current = []
    setUndoLen(0); setRedoLen(0); editingKey.current = null
  }, [recordId]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((patch) => {
    fetch(`${API_BASE}/api/registrations/${record.id}/student`, {
      method: 'PUT', headers: HEADERS, body: JSON.stringify(patch),
    }).catch(() => {})
  }, [record.id])

  // One undo step per field rather than per keystroke — snapshot only when
  // the field being edited changes.
  const markEdit = (key) => {
    if (editingKey.current === key) return
    undoStack.current.push(JSON.stringify(latest.current))
    if (undoStack.current.length > 50) undoStack.current.shift()
    redoStack.current = []
    setRedoLen(0); setUndoLen(undoStack.current.length)
    editingKey.current = key
  }

  const updateField = (key, val) => {
    markEdit(key)
    setFields(prev => ({ ...prev, [key]: val }))
    updateStudentField(record.id, key, val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist({ [key]: val }), 600)
  }

  /* Notes used to be local state and nothing else — typing here and
     navigating away lost the lot. Stored as an array, matching the shape
     the rest of the app reads. */
  const updateNotes = (text) => {
    markEdit('notes')
    setNotes(text)
    const arr = text.split('\n')
    updateStudentField(record.id, 'notes', arr)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist({ notes: arr }), 600)
  }

  const applySnap = useCallback((snap) => {
    setFields(snap.fields)
    setNotes(snap.notes)
    latest.current = snap
    for (const [k, v] of Object.entries(snap.fields)) updateStudentField(record.id, k, v)
    const arr = snap.notes.split('\n')
    updateStudentField(record.id, 'notes', arr)
    persist({ ...snap.fields, notes: arr })
    editingKey.current = null
  }, [record.id, updateStudentField, persist])

  const doUndo = useCallback(() => {
    const snap = undoStack.current.pop()
    if (!snap) return
    redoStack.current.push(JSON.stringify(latest.current))
    applySnap(JSON.parse(snap))
    setUndoLen(undoStack.current.length); setRedoLen(redoStack.current.length)
  }, [applySnap])

  const doRedo = useCallback(() => {
    const snap = redoStack.current.pop()
    if (!snap) return
    undoStack.current.push(JSON.stringify(latest.current))
    applySnap(JSON.parse(snap))
    setUndoLen(undoStack.current.length); setRedoLen(redoStack.current.length)
  }, [applySnap])

  useEffect(() => {
    const onKey = e => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo(); else doUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doUndo, doRedo])

  /* The login actually in force, so this panel and the Logins page can
     never show a student different credentials. Changing one is done on
     the Logins page; this is a read-only view of the result. */
  const login = resolveLogin(fields)
  const handleGenerate = () => { setGeneratedPw(login.password); setCopied(false) }
  const handleCopy = () => {
    if (!generatedPw) return
    navigator.clipboard.writeText(generatedPw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const assessments = Array.isArray(fields.assessments) ? fields.assessments : []

  return (
    <div className="page st" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      <button className="back" onClick={onBack}>‹ All Students</button>
      <h2 className="page-title">{fields.firstName} {fields.lastName}</h2>

      <div className="actions">
        <button title="Undo (Ctrl+Z)" disabled={!undoLen} onClick={doUndo}><Undo2 size={13} /> Undo</button>
        <button title="Redo (Ctrl+Shift+Z)" disabled={!redoLen} onClick={doRedo}><Redo2 size={13} /></button>
        <button title="Open this student's family on the Customers page" style={{ marginLeft: 'auto' }}
          onClick={() => onNavigate && onNavigate('Customers', record.id)}>
          <ExternalLink size={13} /> View in Customers
        </button>
        <button className="danger" title="Delete this student" onClick={() => onDelete(record)}>
          <Trash2 size={13} /> Delete Student
        </button>
      </div>

      <div className="panels">
        <div>
          <div className="sec-h">Student</div>
          <SField label="First Name" value={fields.firstName} onChange={v => updateField('firstName', v)} />
          <SField label="Last Name" value={fields.lastName} onChange={v => updateField('lastName', v)} />
          <SField label="Gender" value={fields.gender} onChange={v => updateField('gender', v)} />
          <SField label="DOB" value={fields.dob} onChange={v => updateField('dob', v)} />
          <SField label="Current Age" value={fields.age} readOnly />
          <SField label="Email" value={fields.email} variant="highlight" onChange={v => updateField('email', v)} />
          <SField label="Current Grade" value={fields.grade} onChange={v => updateField('grade', v)} />
          <SField label="School" value={fields.school} onChange={v => updateField('school', v)} />
          <SField label="Report Card" value="Link to file" variant="link" />
          <SField label="Medical" value={fields.medical} variant={fields.medical ? 'danger' : undefined}
            onChange={v => updateField('medical', v)} />
        </div>

        <div>
          <div className="sec-h">Notes</div>
          <textarea className="notes" value={notes} onChange={e => updateNotes(e.target.value)}
            placeholder="Notes about this student…" />
        </div>

        <div>
          <div className="sec-h">Assessments</div>
          {assessments.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '4px 2px' }}>No assessments yet.</div>
          )}
          {assessments.map((a, i) => (
            <div key={i} className="arow">
              <span className="an">{a.name}</span>
              <span className="ad">{a.date}</span>
              <span className="as">{a.score}</span>
            </div>
          ))}
          <div className="frow" style={{ marginTop: 8 }}>
            <label>Files:</label>
            <div className="link">Link to files</div>
          </div>
        </div>

        <div>
          <div className="sec-h">Login</div>
          <div className="frow">
            <label>Username:</label>
            <div className="ro">{login.username || '—'}</div>
          </div>
          <div className="frow">
            <label>Password:</label>
            {generatedPw ? (
              <div className="pw">
                <span className="v">{generatedPw}</span>
                <button onClick={handleCopy}>{copied ? '✓' : 'copy'}</button>
              </div>
            ) : (
              <div><button className="genbtn" onClick={handleGenerate}>generate</button></div>
            )}
          </div>
        </div>

        <div>
          <div className="sec-h">Crania Cash</div>
          <div className="cash">
            <div className="v" onClick={() => onNavigate && onNavigate('Crania Cash')}>{fields.craniaCash ?? 0}</div>
            <div className="m" onClick={() => onNavigate && onNavigate('Crania Cash')}>Manage</div>
          </div>
        </div>
      </div>

      <CommentsSection studentId={record.id} initialPrograms={record.programs || []} />
    </div>
  )
}

// ── Root: switches between list and detail ─────────────────────────────────

export default function Students(props) {
  return <DialogHost><StudentsPage {...props} /></DialogHost>
}

function StudentsPage({ onNavigate, initialRecordId, onConsumeInitialRecord }) {
  const { records, select, addRegistration, deleteRegistration, restoreRegistration,
    updateCustomerField } = useStore()
  const dialog = useDialog()
  const [detailId, setDetailId] = useState(null)

  const handleSelect = (id) => { select(id); setDetailId(id) }

  /* Undo/redo for the list's own actions — adding, duplicating and deleting
     whole students. The list had none: the bar it carried was Columns,
     Export and a gear, and deleting a student said in as many words that it
     could not be undone. It can. A delete is reversed by restoring the
     record under its original id, so the student comes back as themselves
     with their enrolments and fee history, not as a fresh copy.

     Actions rather than a snapshot of the table: the records are large,
     more than one person is usually in here, and replacing the whole table
     to undo one delete would quietly discard everyone else's edits. Field
     edits are not on this stack — they belong to the detail view, which has
     its own. */
  const hist = useActionHistory({ enabled: !detailId })
  const pushHist = hist.push

  // Undoing an add reads the record as it stands now, not as it was
  // created — it may have been filled in since.
  const recordsRef = useRef(records)
  recordsRef.current = records

  const historyForCreate = (id, label) => {
    let snap = null
    return {
      label,
      undo: async () => {
        const live = recordsRef.current.find(r => r.id === id)
        if (live) snap = JSON.parse(JSON.stringify(live))
        await deleteRegistration(id)
        setDetailId(d => (d === id ? null : d))
      },
      redo: async () => { if (snap) await restoreRegistration(snap) },
    }
  }

  /* Write the student's number onto the record, once. Stored beside the
     family reference on customer.meta so both survive a reload; nothing
     ever rewrites one that is already there. */
  const assignStudentId = useCallback((recordId, ref) => {
    const rec = records.find(r => r.id === recordId)
    const meta = { ...(rec?.customer?.meta || {}), studentId: ref }
    updateCustomerField(recordId, 'meta', 'studentId', ref)
    fetch(`${API_BASE}/api/registrations/${recordId}/customer`, {
      method: 'PUT', headers: HEADERS, body: JSON.stringify({ meta }),
    }).catch(() => {})
  }, [records, updateCustomerField])

  const studentIds = useStudentIds(records, assignStudentId)

  // Opened via onNavigate('Students', recordId) from another page.
  useEffect(() => {
    if (initialRecordId) {
      handleSelect(initialRecordId)
      onConsumeInitialRecord && onConsumeInitialRecord()
    }
  }, [initialRecordId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    try {
      const id = await addRegistration({ studentFirstName: 'New', studentLastName: 'Student', forceNew: true })
      if (id) { setDetailId(id); pushHist(historyForCreate(id, 'Add student')) }
    } catch (err) {
      dialog.alert('Could not add student', String(err.message || err))
    }
  }

  const handleDelete = async (record, opts = {}) => {
    const name = `${record.student?.firstName || ''} ${record.student?.lastName || ''}`.trim() || 'this student'
    if (!opts.silent) {
      const ok = await dialog.confirm(
        `Delete ${name}? This also removes their linked customer and guardian information. You can undo this.`)
      if (!ok) return
    }
    try {
      // Kept whole so Undo can put it back exactly, enrolments included.
      const snapshot = JSON.parse(JSON.stringify(record))
      await deleteRegistration(record.id)
      if (!opts.noHistory) {
        pushHist({
          label: `Delete ${name}`,
          undo: () => restoreRegistration(snapshot),
          redo: () => deleteRegistration(snapshot.id),
        })
      }
      if (detailId === record.id) setDetailId(null)
    } catch (err) {
      dialog.alert('Could not delete', String(err.message || err))
    }
  }

  /* Copy a student under the same guardians, marked so the duplicate is
     obvious until it is edited. Programs are deliberately not copied:
     enrolments are per child and per session, and silently double-booking a
     class is worse than retyping one. The copy is a new student, so it gets
     its own number rather than inheriting one. */
  const handleDuplicate = async (record) => {
    const s = record.student || {}
    const g1 = record.customer?.guardian1 || {}
    const g2 = record.customer?.guardian2 || {}
    const em = record.customer?.emergency || {}
    try {
      const id = await addRegistration({
        studentFirstName: s.firstName || 'New',
        studentLastName: `${s.lastName || 'Student'} (copy)`,
        grade: s.grade, school: s.school, forceNew: true,
        g1FirstName: g1['First Name'], g1LastName: g1['Last Name'], g1Relationship: g1['Relationship'],
        g1PhoneHome: g1['Phone (Home)'], g1PhoneMobile: g1['Phone (Mobile)'], g1Email: g1['Email'],
        g1Address1: g1['Street Address'], g1Address2: g1['Unit'], g1City: g1['City'],
        g1Province: g1['Province'], g1Postal: g1['Postal Code'], g1Occupation: g1['Occupation'],
        g2FirstName: g2['First Name'], g2LastName: g2['Last Name'], g2Relationship: g2['Relationship'],
        g2PhoneHome: g2['Phone (Home)'], g2PhoneMobile: g2['Phone (Mobile)'], g2Email: g2['Email'],
        emFirstName: em['First Name'], emLastName: em['Last Name'], emRelationship: em['Relationship'],
        emPhone: em['Phone (Mobile)'], emEmail: em['Email'],
      })
      if (id) { setDetailId(id); pushHist(historyForCreate(id, 'Duplicate student')) }
    } catch (err) {
      dialog.alert('Could not duplicate', String(err.message || err))
    }
  }

  /* One undo step for the whole selection, so undoing a bulk delete brings
     everyone back together rather than one student per press. */
  const handleBulkDelete = async (list) => {
    if (!list.length) return false
    const n = list.length
    const ok = await dialog.confirm(
      `Delete ${n} student${n === 1 ? '' : 's'}? This also removes their linked customer `
      + 'and guardian information. You can undo this.',
      { title: 'Delete Selected' })
    if (!ok) return false
    const snapshots = list.map(r => JSON.parse(JSON.stringify(r)))
    for (const r of list) await handleDelete(r, { silent: true, noHistory: true })
    pushHist({
      label: `Delete ${n} student${n === 1 ? '' : 's'}`,
      undo: async () => { for (const s of snapshots) await restoreRegistration(s) },
      redo: async () => { for (const s of snapshots) await deleteRegistration(s.id) },
    })
    return true
  }

  if (detailId) {
    return <StudentDetail recordId={detailId} onBack={() => setDetailId(null)} onNavigate={onNavigate}
      onDelete={handleDelete} />
  }

  return <StudentList onSelect={handleSelect} onAdd={handleAdd} onDelete={handleDelete}
    onDuplicate={handleDuplicate} onBulkDelete={handleBulkDelete}
    onNavigate={onNavigate} studentIds={studentIds}
    onUndo={hist.onUndo} onRedo={hist.onRedo} undoLabel={hist.undoLabel} redoLabel={hist.redoLabel}
    histBusy={hist.histBusy} histNote={hist.histNote} />
}
