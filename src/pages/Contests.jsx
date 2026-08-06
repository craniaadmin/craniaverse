// Contests — server-backed via GET/PUT /api/contests (singleton
// payload: extras + manual + hidden + hiddenCols + colOrder).
// Contest programs from useStore().programs auto-populate as rows;
// manual rows can be added on top. Program-derived rows can be
// "hidden" (not deleted). Debounced PUT on every mutation, same
// pattern as Projects / Calendar / IT Accounts / Crania Store.
//
// The layout deliberately mirrors the Programs page: scoped CSS block,
// an actions toolbar, accent-barred metric tiles, a filters row, and a
// pill-cell table with sortable, reorderable, hideable columns. The
// dialog host and popover styling are duplicated rather than shared
// with Programs — Programs' `.pgov`/`.pgmodal` rules only exist while
// that page is mounted, so this page has to carry its own.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Copy, Trash2, Eye } from 'lucide-react'
import { useStore } from '../data/store'
import PageActions, { PAGEACTIONS_CSS } from '../components/PageActions'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const STATUSES = ['Waiting', 'Submitted', 'Complete', 'Cancelled']

// Status pill palette matching the Invoices page for visual cohesion.
const STATUS_STYLE = {
  Waiting:   { bg: '#fff4d6', fg: '#8a6a00' },
  Submitted: { bg: '#e4f2fb', fg: '#1c6ea4' },
  Complete:  { bg: '#dff5e0', fg: '#2b7a2e' },
  Cancelled: { bg: '#eef1f4', fg: '#6B6455' },
}

const COLS = [
  { k: 'org',         l: 'Organisation' },
  { k: 'contest',     l: 'Contest' },      // never hideable — it names the row
  { k: 'regDeadline', l: 'Reg. Deadline' },
  { k: 'contestDate', l: 'Contest Date' },
  { k: 'numOrdered',  l: 'Ordered' },
  { k: 'status',      l: 'Status' },
]
const LOCKED_COL = 'contest'

/* Every column is a proportion, including the checkbox and the row buttons,
   and they sum to 100. Mixing in pixel widths looks tidier but isn't: a
   fixed layout hands all the leftover space to the pixel columns, so on a
   wide screen Status and Ordered ballooned while the text columns stayed
   put. Proportions keep the slack going where it is worth something.

   The floor is the 720px min-width. Status gets 16% because the pill is a
   <select>, so it is sized by its widest option — "Cancelled" — not by the
   value on show; that needs 108px, which is what 16% comes to at the floor.
   Because these are ratios, hiding a column widens the rest rather than
   leaving a gap. */
const SEL_W = '3%'
const ACT_W = '10%'
const COL_W = {
  org: '15%', contest: '22%', regDeadline: '14%',
  contestDate: '12%', numOrdered: '8%', status: '16%',
}

/* Computed per call rather than once at module load — a tab left open
   overnight would otherwise keep measuring deadlines against yesterday. */
function deadlineStyle(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = (new Date(dateStr) - today) / 86400000
  if (diff < 0)   return { bg: '#eee',     fg: '#6B6455', label: 'past' }
  if (diff <= 2)  return { bg: '#fde0e0',  fg: '#a12626', label: 'imminent' }
  if (diff <= 14) return { bg: '#fff4d6',  fg: '#8a6a00', label: 'soon' }
  return null
}

/* Programs carry `name`, not `title` — the field was renamed when the
   Programs page was rewritten, and reading the old one left every
   derived row with a blank organisation and an undefined contest. */
const isContest = (p) =>
  (p.name || '').toUpperCase().includes('CONTEST') ||
  (p.category || '').toUpperCase().includes('CONTEST')

// "CONTEST - CEMC GAUSS" -> { org: 'CEMC', contest: 'GAUSS' }
function splitName(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  const ci = words.findIndex(w => w.toUpperCase() === 'CONTEST')
  if (ci < 0) return { org: '', contest: String(name || '') }
  const rest = words.slice(ci + 1).filter(w => w !== '-')
  return { org: rest[0] || '', contest: rest.slice(1).join(' ') || '' }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// ISO date -> "Nov 20, 2026". Parsed by hand: `new Date('2026-11-20')` is
// UTC midnight, which reads as the previous day west of Greenwich.
function fmtDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`
}

// Used only by the one-shot localStorage migration in useContests.
function tryLoad(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/* A row with nothing in it can neither be read nor acted on, so it is not
   shown — whichever end it came from. Two ends produce them:

   - the old "+ Add Row", which wrote an empty row to the server before
     asking for anything, so a mis-click left a blank line behind;
   - a program sitting in a contest category with no name, which is a
     broken record over on Programs rather than anything this page owns.

   Status alone is not content — every blank row starts as "Waiting". */
const isBlankRow = (r) =>
  !String(r.org || '').trim() && !String(r.contest || '').trim() &&
  !r.regDeadline && !r.contestDate && String(r.numOrdered ?? '').trim() === ''
const EMPTY = { extras: {}, manual: [], hidden: [], hiddenCols: {}, colOrder: [] }

const clone = (d) => ({
  extras: { ...d.extras },
  manual: d.manual.map(r => ({ ...r })),
  hidden: [...d.hidden],
  hiddenCols: { ...d.hiddenCols },
  colOrder: [...d.colOrder],
})

const CSS = PAGEACTIONS_CSS + `
.ct{--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;--dark-brown:#2E2516;
    --line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;--danger:#C0392B;
    --shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}
.ct .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.ct .actions button{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:6px 12px;
    font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;
    display:inline-flex;align-items:center;gap:5px}
.ct .actions button:hover:not(:disabled){background:#f4f2ea}
.ct .actions button:disabled{opacity:.4;cursor:default}

.ct .offline{background:#fffbf0;border:1px solid #f4d67a;color:#8a6a00;padding:8px 12px;
    border-radius:8px;margin-bottom:12px;font-size:13px}

.ct .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.ct .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.ct .metric.clickable{cursor:pointer}
.ct .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.ct .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.ct .metric.mwait{border-bottom-color:var(--yellow)}
.ct .metric.msub{border-bottom-color:var(--light-blue)}
.ct .metric.mdue{border-bottom-color:#c0392b}
.ct .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.ct .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.ct .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.ct .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.ct .filters input[type=search],.ct .filters select{padding:7px 12px;border:1px solid var(--field);
    border-radius:8px;font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit}
.ct .filters input[type=search]:focus,.ct .filters select:focus{outline:none;border-color:var(--teal)}
.ct .filters input[type=search]{width:220px}
.ct .filters input[type=search]::placeholder{color:var(--faint)}
.ct .filters .addbtn{border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;
    background:var(--light-blue);color:var(--dark-brown);cursor:pointer;font-family:inherit;margin-left:auto}
.ct .filters .addbtn:hover{filter:brightness(1.08)}

.ct .bulkbar{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#eef7f6;
    border:1px solid var(--line);border-radius:10px;margin-bottom:12px}
.ct .bulkbar .n{font-weight:700;font-size:13px;margin-right:14px}
.ct .bulkbar button{border:none;border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:600;
    cursor:pointer;font-family:inherit}
.ct .bulkbar .edit{background:var(--teal);color:#fff}
.ct .bulkbar .del{background:#c0392b;color:#fff}
.ct .bulkbar .clr{background:transparent;border:1px solid var(--field);color:var(--muted)}
.ct .bulkbar .acts{display:inline-flex;align-items:center;gap:8px}

.ct .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
/* Programs sizes its table to its contents and scrolls, because it carries
   twenty columns. Six columns fit, so this one fills the card instead and
   the widths come from the colgroup. min-width keeps it from being crushed
   on a narrow window — below that the card scrolls as before. */
.ct table{width:100%;min-width:720px;table-layout:fixed;border-collapse:separate;
    border-spacing:5px 5px;background:#fff}
.ct thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
/* The sort arrow and eye sit absolutely at right:3px, so only the RIGHT
   padding reserves anything — the matching 30px on the left bought nothing
   and truncated short headers like "Grade". Right side unchanged; left cut. */
.ct thead th.colh .lbl{display:block;text-align:center;padding:0 30px 0 4px;
    overflow:hidden;text-overflow:ellipsis}
.ct thead th.selcol,.ct thead th:empty,.ct thead th.blankhead,
.ct tbody td.selcol,.ct tbody td.actcell{background:transparent}
.ct thead th.selcol input,.ct tbody td.selcol input{width:12px;height:12px;margin:0;
    accent-color:var(--teal);vertical-align:middle;cursor:pointer}
.ct tbody td.actcell{white-space:nowrap;text-align:center}
.ct .selcol{text-align:center}
.ct thead th .arw{opacity:.85;font-size:10px}
.ct thead th.colh{cursor:grab}
.ct thead th.colh.dropt{outline:2px dashed var(--light-blue);outline-offset:-2px}
.ct thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1}
.ct thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.ct thead th.colh:hover .eye{opacity:1}
.ct thead th .sortable{cursor:pointer}

.ct tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:22px;overflow:hidden;text-overflow:ellipsis}
.ct tbody td.rep{background:transparent !important}
.ct tbody tr.grpsep td{background:transparent;height:1px;padding:0;border-radius:0;
    border-top:1px solid #CFD6D8}
.ct tbody tr.grpsep td.nosep{border-top:none}
.ct tbody tr:hover td{background:#E4EFF3}
.ct tbody tr.sel td{background:#DCEEEC}
.ct td[data-ek]{cursor:pointer}
.ct td[data-ek]:hover{box-shadow:inset 0 0 0 1px #cfd6d8}
.ct td.editing{padding:0 2px;box-shadow:none}
.ct .cellin{width:100%;min-width:40px;box-sizing:border-box;border:none;border-radius:4px;background:#fff;
    font:inherit;font-size:12px;line-height:1.35;height:21px;padding:0 4px;color:var(--dark-brown);
    box-shadow:inset 0 0 0 1px var(--teal);outline:none;display:block}
.ct td.tint{background:var(--tint) !important}
.ct tbody tr:hover td.tint{filter:brightness(.96)}
.ct td.col-numOrdered,.ct td.col-status{text-align:center}
.ct td.col-regDeadline,.ct td.col-contestDate{text-align:center;white-space:nowrap}
.ct .cname{font-weight:700;color:#3d7f7d}
.ct button.clink{background:none;border:none;padding:0;margin:0;font:inherit;font-weight:700;
    font-size:12px;color:#3d7f7d;cursor:pointer;text-align:left;max-width:100%;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.ct button.clink:hover{text-decoration:underline}
.ct .dash{color:var(--faint)}
.ct .rowbtn{background:none;border:none;color:#c9c3b5;padding:0 2px;margin:0;line-height:1;
    cursor:pointer;transition:color .15s;display:inline-flex;vertical-align:middle}
.ct .rowbtn.rb-pen:hover,.ct .rowbtn.rb-dup:hover{color:var(--teal)}
.ct .rowbtn.rb-del:hover{color:#c0392b}
.ct .empty{text-align:center;color:var(--muted);padding:60px 20px}
.ct .empty b{color:var(--dark-brown)}
.ct .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.ct .clearf:hover{background:#f1f5f4}
.ct .tcount{color:var(--muted);font-size:12px;padding:10px 2px;text-align:right}
.ct .tcount .tnote{float:left;color:#8a6a00;font-weight:600}

.ctpop{position:fixed;z-index:220;background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:8px 12px 10px;min-width:190px;max-height:360px;
    overflow:auto;color:#2E2516;font-family:inherit}
.ctpop .h{font-size:12px;color:#6B6455;font-weight:700;margin:2px 2px 7px}
.ctpop .ch{display:flex;align-items:center;gap:9px;padding:5px 3px;font-size:13px;font-weight:600;cursor:pointer}
.ctpop .ch:hover{background:#f4f2ea;border-radius:6px}
.ctpop .ch input{margin:0;accent-color:#5FA09E}
.ctpop .ch.locked{opacity:.5;cursor:default}
.ctpop .allrow{border-top:1px solid #EDEAE2;margin-top:4px;padding-top:4px;display:flex;gap:4px;
    position:sticky;bottom:0;background:#fff}
.ctpop .allrow button{background:none;border:none;color:#5FA09E;font-weight:700;font-size:12.5px;
    text-align:center;padding:6px 8px;border-radius:6px;flex:1;cursor:pointer;font-family:inherit}
.ctpop .allrow button:hover{background:#f4f2ea}

.ctmenu{position:fixed;z-index:301;background:#fff;border:1px solid #E7EBE7;border-radius:10px;
    box-shadow:0 8px 24px rgba(46,37,22,.2);overflow:hidden;min-width:190px;color:#2E2516;font-family:inherit}
.ctmenu div{padding:9px 15px;font-size:13px;cursor:pointer;font-weight:600}
.ctmenu div:hover{background:#f1f5f4}
.ctmenu div.del{color:#C0392B}
.ctmenu .sep{height:1px;background:#E7EBE7;padding:0;margin:2px 0;cursor:default}
.ctmenu .sep:hover{background:#E7EBE7}

.ctov{position:fixed;inset:0;background:rgba(46,37,22,.45);display:flex;align-items:flex-start;
    justify-content:center;z-index:200;overflow:auto;padding:40px 16px}
.ctmodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);width:100%;
    max-width:460px;margin:auto;padding:22px;color:#2E2516;font-family:inherit}
.ctmodal.sm{max-width:420px}
.ctmodal h2{font-size:18px;margin:0 0 16px;color:#2E2516}
.ctmodal .field{margin-bottom:14px;min-width:0}
.ctmodal .frow{display:flex;gap:12px}
.ctmodal .frow .field{flex:1}
.ctmodal .field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px;color:#6b6455}
.ctmodal .field input,.ctmodal .field select{width:100%;padding:9px 11px;border:1px solid #d5d0c4;
    border-radius:8px;font:inherit;font-size:14px;background:#fff;color:#2E2516}
.ctmodal .field input:focus,.ctmodal .field select:focus{outline:none;border-color:#5FA09E}
.ctmodal .mhint{font-size:12px;color:#6b6455;margin:-6px 0 14px;line-height:1.4}
.ctmodal .macts{display:flex;gap:10px;justify-content:flex-end;margin-top:6px}
.ctmodal .macts button{font:inherit;cursor:pointer;border:none;border-radius:8px;padding:8px 14px;
    background:#5FA09E;color:#fff;font-weight:600}
.ctmodal .macts button:hover{filter:brightness(1.06)}
.ctmodal .macts button.cancel{background:#eee;color:#2E2516}
.ctmodal .macts .btn-del{background:#fff;color:#c0392b;border:1px solid #eecfca;margin-right:auto}
`

/* ================= in-app dialogs =================
   Same contract as the Programs page: no browser confirm/prompt/alert. */
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
        title: opts.title || 'Delete',
        button: opts.button || 'Delete',
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
        <div className="ctov" style={{ zIndex: 400, alignItems: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) finish(dlg.type === 'confirm' ? false : null) }}>
          <div className="ctmodal sm" onClick={e => e.stopPropagation()}>
            <h2>{dlg.title || 'Notice'}</h2>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>{dlg.message}</div>
            <div className="macts">
              {dlg.type === 'confirm' && (
                <button className="cancel" onClick={() => finish(false)}>Cancel</button>
              )}
              <button
                style={dlg.danger ? { background: '#c0392b' } : undefined}
                onClick={() => finish(dlg.type === 'confirm' ? true : null)}
              >{dlg.type === 'confirm' ? dlg.button : 'OK'}</button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

// ---- store hook (server-backed, debounced PUT, undo/redo) ----
function useContests() {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading') // 'loading' | 'online' | 'offline'
  const saveTimer = useRef(null)
  const latest = useRef(data)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)

  const apply = useCallback((next) => { latest.current = next; setData(next) }, [])

  const persist = useCallback((value) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/api/contests`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(value),
      }).catch(() => {})
    }, 350)
  }, [])

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/contests`, { headers: HEADERS })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(j => {
        if (!alive) return
        let extras = j.extras && typeof j.extras === 'object' ? j.extras : {}
        let manual = Array.isArray(j.manual) ? j.manual : []
        let hidden = Array.isArray(j.hidden) ? j.hidden : []
        const hiddenCols = j.hiddenCols && typeof j.hiddenCols === 'object' ? j.hiddenCols : {}
        const colOrder = Array.isArray(j.colOrder) ? j.colOrder : []

        // One-shot migration from the pre-server localStorage store.
        // If the server has nothing yet but the browser has old rows,
        // upload them and clear localStorage so we don't run twice.
        const serverEmpty = Object.keys(extras).length === 0 && manual.length === 0 && hidden.length === 0
        if (serverEmpty) {
          const lsExtras = tryLoad('contests-extras', {})
          const lsManual = tryLoad('contests-manual', [])
          const lsHidden = tryLoad('contests-hidden', [])
          const lsAny =
            (lsExtras && Object.keys(lsExtras).length) ||
            (Array.isArray(lsManual) && lsManual.length) ||
            (Array.isArray(lsHidden) && lsHidden.length)
          if (lsAny) {
            extras = lsExtras || {}
            manual = Array.isArray(lsManual) ? lsManual : []
            hidden = Array.isArray(lsHidden) ? lsHidden : []
            fetch(`${API_BASE}/api/contests`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...HEADERS },
              body: JSON.stringify({ extras, manual, hidden, hiddenCols, colOrder }),
            }).then(() => {
              try {
                localStorage.removeItem('contests-extras')
                localStorage.removeItem('contests-manual')
                localStorage.removeItem('contests-hidden')
              } catch { /* ignore */ }
            }).catch(() => {})
          }
        }

        // Sweep out blank rows left behind by the old add-row behaviour,
        // and write the tidied list straight back so they stay gone.
        const kept = manual.filter(r => !isBlankRow(r))
        const next = { extras, manual: kept, hidden, hiddenCols, colOrder }
        apply(next)
        if (kept.length !== manual.length) {
          fetch(`${API_BASE}/api/contests`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...HEADERS },
            body: JSON.stringify(next),
          }).catch(() => {})
        }
        setStatus('online')
      })
      .catch(() => alive && setStatus('offline'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [apply])

  /* Snapshots are taken here rather than inside a setState updater —
     React re-runs updaters in development, which would push each undo
     step twice. */
  const mutate = useCallback((mut) => {
    const prev = latest.current
    const prevSnap = JSON.stringify(prev)
    const next = clone(prev)
    mut(next)
    const snap = JSON.stringify(next)
    if (snap === prevSnap) return
    undoStack.current.push(prevSnap)
    if (undoStack.current.length > 100) undoStack.current.shift()
    redoStack.current = []
    setUndoLen(undoStack.current.length)
    setRedoLen(0)
    apply(next)
    persist(next)
  }, [apply, persist])

  const doUndo = useCallback(() => {
    const snap = undoStack.current.pop()
    if (!snap) return
    redoStack.current.push(JSON.stringify(latest.current))
    const next = JSON.parse(snap)
    apply(next); persist(next)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
  }, [apply, persist])

  const doRedo = useCallback(() => {
    const snap = redoStack.current.pop()
    if (!snap) return
    undoStack.current.push(JSON.stringify(latest.current))
    const next = JSON.parse(snap)
    apply(next); persist(next)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
  }, [apply, persist])

  return { data, loading, status, mutate, doUndo, doRedo, undoLen, redoLen }
}

export default function Contests({ onNavigate }) {
  return (
    <DialogHost>
      <ContestsPage onNavigate={onNavigate} />
    </DialogHost>
  )
}

function ContestsPage({ onNavigate }) {
  const { programs } = useStore()
  const dialog = useDialog()
  const { data, loading, status: fetchStatus, mutate, doUndo, doRedo, undoLen, redoLen } = useContests()
  const { extras, manual, hidden, hiddenCols, colOrder } = data

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dueOnly, setDueOnly] = useState(false)
  const [sort, setSort] = useState({ key: '', dir: 1 })
  const [selected, setSelected] = useState(new Set())
  const [cellEdit, setCellEdit] = useState(null)   // { id, col }
  const [pop, setPop] = useState(null)             // { kind:'cols', rect }
  const [rowCtx, setRowCtx] = useState(null)       // { x, y, row }
  const [editing, setEditing] = useState(null)     // { row }
  const [bulkOpen, setBulkOpen] = useState(false)
  const dragCol = useRef(null)
  const popRef = useRef(null)

  // ---- mutations ----
  const update = useCallback((row, key, val) => {
    if (row.fromProgram) {
      mutate(d => { d.extras[row.id] = { ...(d.extras[row.id] || {}), [key]: val } })
    } else {
      mutate(d => { d.manual = d.manual.map(r => r.id === row.id ? { ...r, [key]: val } : r) })
    }
  }, [mutate])

  const updateMany = useCallback((row, patch) => {
    if (row.fromProgram) {
      mutate(d => { d.extras[row.id] = { ...(d.extras[row.id] || {}), ...patch } })
    } else {
      mutate(d => { d.manual = d.manual.map(r => r.id === row.id ? { ...r, ...patch } : r) })
    }
  }, [mutate])

  /* Nothing is written until Save — cancelling out of the box leaves no
     trace, which is what stops blank rows accumulating at the bottom. */
  const addRow = () => setEditing({
    row: {
      id: uid('manual-'), fromProgram: false, isNew: true,
      org: '', contest: '', regDeadline: '', contestDate: '', numOrdered: '', status: 'Waiting',
    },
  })

  /* A program-derived row has no life of its own to copy, so duplicating
     one lifts its current values into a standalone manual row. */
  const duplicateRow = (row) => {
    const id = uid('manual-')
    mutate(d => {
      d.manual.push({
        id, org: row.org, contest: row.contest, regDeadline: row.regDeadline,
        contestDate: row.contestDate, numOrdered: row.numOrdered, status: row.status,
      })
    })
  }

  const removeRow = async (row) => {
    const what = row.contest || row.org || 'this row'
    if (row.fromProgram) {
      const ok = await dialog.confirm(
        `Hide "${what}" from this list? The program stays in Programs — only this row goes away, and it comes back if you undo.`,
        { title: 'Hide Row', button: 'Hide' })
      if (!ok) return
      mutate(d => { if (!d.hidden.includes(row.id)) d.hidden.push(row.id) })
    } else {
      const ok = await dialog.confirm(`Delete "${what}"? This row is not backed by a program, so it is gone for good.`)
      if (!ok) return
      mutate(d => { d.manual = d.manual.filter(r => r.id !== row.id) })
    }
    setSelected(s => { const n = new Set(s); n.delete(row.id); return n })
  }

  // ---- columns ----
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
    mutate(d => { d.hiddenCols = { ...d.hiddenCols, [k]: true } })
  }

  const onDrop = (target) => {
    const from = dragCol.current
    dragCol.current = null
    if (!from || from === target) return
    mutate(d => {
      const base = d.colOrder.length ? d.colOrder.filter(k => COLS.some(c => c.k === k)) : COLS.map(c => c.k)
      const full = [...base, ...COLS.map(c => c.k).filter(k => !base.includes(k))]
      const next = full.filter(k => k !== from)
      next.splice(full.indexOf(target) > full.indexOf(from) ? next.indexOf(target) + 1 : next.indexOf(target), 0, from)
      d.colOrder = next
    })
  }

  const onSort = (k) => setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 })

  // ---- rows ----
  const programRows = useMemo(() => {
    return programs.filter(isContest).filter(p => {
      const key = String(p.id != null ? p.id : p.name ?? '')
      return !hidden.includes(key)
    }).map((p, i) => {
      const key = String(p.id != null ? p.id : p.name ?? i)
      const parsed = splitName(p.name)
      const e = extras[key] || {}
      return {
        id: key,
        fromProgram: true,
        programName: p.name || '',
        contest:     e.contest     ?? (parsed.contest || p.name || ''),
        org:         e.org         ?? parsed.org,
        regDeadline: e.regDeadline ?? '',
        contestDate: e.contestDate ?? '',
        numOrdered:  e.numOrdered  ?? '',
        status:      e.status      ?? 'Waiting',
      }
    })
  }, [programs, extras, hidden])

  /* Blank program-derived rows can't be pruned the way blank manual rows
     are — they are generated from the catalogue on every load, so the
     only place to drop them is here. Counted so the footer can say why
     they aren't listed. */
  const { allRows, blankProgramRows } = useMemo(() => {
    const keptProgram = programRows.filter(r => !isBlankRow(r))
    return {
      allRows: [...keptProgram, ...manual.filter(r => !isBlankRow(r))],
      blankProgramRows: programRows.length - keptProgram.length,
    }
  }, [programRows, manual])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = allRows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (dueOnly) {
        const ds = deadlineStyle(r.regDeadline)
        if (!ds || ds.label === 'past' || r.status === 'Complete') return false
      }
      if (!q) return true
      return (r.org || '').toLowerCase().includes(q) ||
             (r.contest || '').toLowerCase().includes(q)
    })
    if (!sort.key) return out
    const k = sort.key
    const val = (r) => {
      if (k === 'numOrdered') { const n = Number(r[k]); return isFinite(n) ? n : -1 }
      if (k === 'status') return STATUSES.indexOf(r[k])
      return String(r[k] || '').toLowerCase()
    }
    // Blank dates sort last either way — an unset deadline is not "earliest".
    const blankLast = k === 'regDeadline' || k === 'contestDate'
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (blankLast && !av !== !bv) return !av ? 1 : -1
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0
    })
  }, [allRows, search, statusFilter, dueOnly, sort])

  const metrics = useMemo(() => {
    const counts = { total: allRows.length, waiting: 0, submitted: 0, complete: 0, dueSoon: 0 }
    for (const r of allRows) {
      if (r.status === 'Waiting')   counts.waiting++
      if (r.status === 'Submitted') counts.submitted++
      if (r.status === 'Complete')  counts.complete++
      const ds = deadlineStyle(r.regDeadline)
      if (ds && (ds.label === 'imminent' || ds.label === 'soon') && r.status !== 'Complete') counts.dueSoon++
    }
    return counts
  }, [allRows])

  const anyFilterActive = !!search || statusFilter !== 'all' || dueOnly
  const clearAllFilters = () => { setSearch(''); setStatusFilter('all'); setDueOnly(false) }

  // ---- bulk ----
  const selectedRows = useMemo(() => visible.filter(r => selected.has(r.id)), [visible, selected])
  const allSel = visible.length > 0 && visible.every(r => selected.has(r.id))

  const bulkApply = (patch) => {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== '' && v != null))
    if (!Object.keys(clean).length) { setBulkOpen(false); return }
    mutate(d => {
      for (const r of selectedRows) {
        if (r.fromProgram) d.extras[r.id] = { ...(d.extras[r.id] || {}), ...clean }
        else d.manual = d.manual.map(m => m.id === r.id ? { ...m, ...clean } : m)
      }
    })
    setBulkOpen(false)
  }

  const bulkDelete = async () => {
    const fromProg = selectedRows.filter(r => r.fromProgram).length
    const manualN = selectedRows.length - fromProg
    const parts = []
    if (manualN) parts.push(`delete ${manualN} manual row${manualN === 1 ? '' : 's'}`)
    if (fromProg) parts.push(`hide ${fromProg} program row${fromProg === 1 ? '' : 's'}`)
    const ok = await dialog.confirm(`This will ${parts.join(' and ')}.`, { title: 'Delete Selected' })
    if (!ok) return
    mutate(d => {
      for (const r of selectedRows) {
        if (r.fromProgram) { if (!d.hidden.includes(r.id)) d.hidden.push(r.id) }
        else d.manual = d.manual.filter(m => m.id !== r.id)
      }
    })
    setSelected(new Set())
  }

  // ---- export ----
  const CSV_COLUMNS = [
    { key: 'org', label: 'Organisation' },
    { key: 'contest', label: 'Contest' },
    { key: 'regDeadline', label: 'Reg. Deadline' },
    { key: 'contestDate', label: 'Contest Date' },
    { key: 'numOrdered', label: 'Ordered' },
    { key: 'status', label: 'Status' },
    { label: 'Source', value: r => (r.fromProgram ? 'Program' : 'Manual') },
  ]

  // ---- keyboard + popover dismissal ----
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

  useEffect(() => {
    if (!pop) return
    const onDown = e => { if (popRef.current && !popRef.current.contains(e.target)) setPop(null) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [pop])

  if (loading) {
    return (
      <div className="page ct">
        <style>{CSS}</style>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  const arrow = k => sort.key === k ? <span className="arw">{sort.dir > 0 ? '▲' : '▼'}</span> : null

  // ---- body rows, with adjacent equal organisations collapsed ----
  const bodyRows = []
  let prevOrg = null
  visible.forEach((r) => {
    const orgKey = r.org || ''
    // Blank the repeated cell only within a real, named organisation…
    const sameOrg = prevOrg !== null && prevOrg === orgKey && !!orgKey
    // …but draw the divider whenever the organisation actually changes,
    // so a run of rows with no organisation isn't sliced up row by row.
    if (prevOrg !== null && prevOrg !== orgKey) {
      bodyRows.push(
        <tr className="grpsep" key={'sep-' + r.id}>
          <td className="nosep" /><td colSpan={orderedCols.length + 1} />
        </tr>
      )
    }
    prevOrg = orgKey

    const isSel = selected.has(r.id)
    const tds = orderedCols.map(c => {
      const k = c.k
      const editingThis = cellEdit && cellEdit.id === r.id && cellEdit.col === k

      if (k === 'status') {
        return (
          <td key={k} className="col-status">
            <StatusSelect value={r.status} onChange={val => update(r, 'status', val)} />
          </td>
        )
      }

      if (k === 'org' && sameOrg) return <td key={k} className="col-org rep" data-ek={k} />

      if (editingThis) {
        const type = (k === 'regDeadline' || k === 'contestDate') ? 'date'
          : k === 'numOrdered' ? 'number' : 'text'
        return (
          <td key={k} className={`col-${k} editing`}>
            <CellInput
              type={type}
              initial={r[k] ?? ''}
              onCommit={v => { update(r, k, v); setCellEdit(null) }}
              onCancel={() => setCellEdit(null)}
            />
          </td>
        )
      }

      let cls = `col-${k}`, style, content

      /* The contest name is the link to its program, so this is the one
         cell that doesn't edit in place — use ✎, double-click or the
         right-click menu to change it. Manual rows have no program to
         link to, so they stay inline-editable. */
      if (k === 'contest' && r.fromProgram) {
        return (
          <td key={k} className="col-contest">
            <button className="cname clink" title={`Open ${r.programName} in Programs`}
              onClick={e => { e.stopPropagation(); onNavigate && onNavigate('Programs', r.id) }}
            >{r.contest || r.programName || '—'}</button>
          </td>
        )
      }

      if (k === 'contest') {
        content = <span className="cname">{r.contest || <span className="dash">—</span>}</span>
      } else if (k === 'regDeadline' || k === 'contestDate') {
        const ds = k === 'regDeadline' ? deadlineStyle(r.regDeadline) : null
        if (ds) { cls += ' tint'; style = { '--tint': ds.bg, color: ds.fg, fontWeight: 700 } }
        content = fmtDate(r[k]) || <span className="dash">—</span>
      } else {
        content = r[k] === '' || r[k] == null ? <span className="dash">—</span> : r[k]
      }

      return (
        <td key={k} className={cls} style={style} data-ek={k}
          onClick={e => {
            if (e.target.closest('button,input,select')) return
            setCellEdit({ id: r.id, col: k })
          }}>{content}</td>
      )
    })

    bodyRows.push(
      <tr key={r.id} className={isSel ? 'sel' : ''}
        title="Click a cell to edit it; ✎ opens the full box"
        onDoubleClick={() => setEditing({ row: r })}
        onContextMenu={e => { e.preventDefault(); setRowCtx({ x: e.clientX, y: e.clientY, row: r }) }}>
        <td className="selcol">
          <input type="checkbox" checked={isSel} onChange={e => setSelected(s => {
            const n = new Set(s)
            if (e.target.checked) n.add(r.id); else n.delete(r.id)
            return n
          })} />
        </td>
        {tds}
        <td className="actcell">
          <button className="rowbtn rb-pen" title="Edit row" onClick={() => setEditing({ row: r })}><Pencil size={12} /></button>
          <button className="rowbtn rb-dup" title={r.fromProgram ? 'Copy into a manual row' : 'Duplicate row'}
            onClick={() => duplicateRow(r)}><Copy size={12} /></button>
          <button className="rowbtn rb-del" title={r.fromProgram ? 'Hide this program row' : 'Delete row'}
            onClick={() => removeRow(r)}><Trash2 size={12} /></button>
        </td>
      </tr>
    )
  })

  return (
    <div className="page ct" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      <div className="actions">
        <button title="Undo (Ctrl+Z)" disabled={!undoLen} onClick={doUndo}><Undo2 size={13} /> Undo</button>
        <button title="Redo (Ctrl+Shift+Z)" disabled={!redoLen} onClick={doRedo}><Redo2 size={13} /></button>
        <button title="Choose which columns are shown" style={{ marginLeft: 'auto' }}
          onClick={e => setPop({ kind: 'cols', rect: e.currentTarget.getBoundingClientRect() })}
        ><Eye size={13} /> Columns</button>
        <button title="Download all contests as a CSV file" onClick={exportCsv}><Download size={13} /> Export CSV</button>
      </div>

      {fetchStatus === 'offline' && (
        <div className="offline">Working offline — changes will retry when the server is reachable.</div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="label">Total</div><div className="value">{metrics.total}</div>
          <div className="hint">{metrics.complete} complete</div>
        </div>
        <div className={'metric mwait clickable' + (statusFilter === 'Waiting' ? ' on' : '')}
          title="Click to show only contests still waiting"
          onClick={() => setStatusFilter(s => s === 'Waiting' ? 'all' : 'Waiting')}>
          <div className="label">Waiting</div><div className="value">{metrics.waiting}</div>
          <div className="hint">not yet submitted</div>
        </div>
        <div className={'metric msub clickable' + (statusFilter === 'Submitted' ? ' on' : '')}
          title="Click to show only submitted contests"
          onClick={() => setStatusFilter(s => s === 'Submitted' ? 'all' : 'Submitted')}>
          <div className="label">Submitted</div><div className="value">{metrics.submitted}</div>
          <div className="hint">awaiting the contest date</div>
        </div>
        <div className={'metric mdue clickable' + (dueOnly ? ' on' : '')}
          title="Click to show only contests closing soon"
          onClick={() => setDueOnly(v => !v)}>
          <div className="label">Due Soon</div><div className="value">{metrics.dueSoon}</div>
          <div className="hint">≤ 14 days &amp; not complete</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search organisation or contest…" autoComplete="off" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
        <button className="addbtn" onClick={addRow}>+ Add Row</button>
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <span className="n">{selected.size} selected</span>
          <span className="acts">
            <button className="edit" onClick={() => setBulkOpen(true)}>Edit Selected</button>
            <button className="del" onClick={bulkDelete}>Delete Selected</button>
            <button className="clr" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </span>
        </div>
      )}

      <div className="card">
        {allRows.length === 0 ? (
          <div className="empty">
            <b>No contests yet.</b><br />
            Click “+ Add Row” to start, or add a contest-tagged program under Programs.
          </div>
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
          <table>
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
                  <th key={c.k} className="colh" draggable data-col={c.k}
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
            <tbody>{bodyRows}</tbody>
          </table>
        )}
      </div>
      <div className="tcount">
        {blankProgramRows > 0 && (
          <span className="tnote">
            {blankProgramRows} contest {blankProgramRows === 1 ? 'program has' : 'programs have'} no
            name and {blankProgramRows === 1 ? 'is' : 'are'} not listed — fix or remove
            {blankProgramRows === 1 ? ' it' : ' them'} under Programs.
          </span>
        )}
        Count={visible.length}{visible.length !== allRows.length ? ` of ${allRows.length}` : ''}
      </div>

      {pop && pop.kind === 'cols' && (
        <ColsPop ref={popRef} rect={pop.rect} hiddenCols={hiddenCols}
          onToggle={(k, on) => mutate(d => {
            const n = { ...d.hiddenCols }
            if (on) delete n[k]; else n[k] = true
            d.hiddenCols = n
          })}
          onAll={() => mutate(d => { d.hiddenCols = {} })}
          onNone={() => mutate(d => {
            d.hiddenCols = Object.fromEntries(COLS.filter(c => c.k !== LOCKED_COL).map(c => [c.k, true]))
          })} />
      )}

      {rowCtx && (
        <CtxMenu x={rowCtx.x} y={rowCtx.y} onClose={() => setRowCtx(null)} items={[
          { label: 'Edit Row', on: () => setEditing({ row: rowCtx.row }) },
          {
            label: rowCtx.row.fromProgram ? 'Copy into a Manual Row' : 'Duplicate Row',
            on: () => duplicateRow(rowCtx.row),
          },
          { sep: true },
          {
            label: rowCtx.row.fromProgram ? 'Hide Row' : 'Delete Row',
            danger: true, on: () => removeRow(rowCtx.row),
          },
        ]} />
      )}

      {editing && (
        <EditModal row={editing.row}
          onClose={() => setEditing(null)}
          onSave={patch => {
            if (editing.row.isNew) {
              if (!isBlankRow(patch)) mutate(d => d.manual.push({ id: editing.row.id, ...patch }))
            } else {
              updateMany(editing.row, patch)
            }
            setEditing(null)
          }}
          onDelete={() => {
            setEditing(null)
            if (!editing.row.isNew) removeRow(editing.row)
          }} />
      )}

      {bulkOpen && (
        <BulkModal count={selected.size} onClose={() => setBulkOpen(false)} onApply={bulkApply} />
      )}
    </div>
  )
}

// ---------- Small components ----------

/* Keeps its own draft so a mutation — and therefore an undo step — is
   recorded once per edit rather than once per keystroke. */
function CellInput({ type, initial, onCommit, onCancel }) {
  const [v, setV] = useState(initial)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); if (type === 'text') ref.current?.select() }, [type])
  return (
    <input ref={ref} className="cellin" type={type} value={v}
      min={type === 'number' ? 0 : undefined}
      onChange={e => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); onCommit(v) }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }} />
  )
}

const ColsPop = React.forwardRef(function ColsPop({ rect, hiddenCols, onToggle, onAll, onNone }, ref) {
  const style = {
    top: Math.min(rect.bottom + 6, window.innerHeight - 320),
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 230)),
  }
  return (
    <div className="ctpop" ref={ref} style={style}>
      <div className="h">Show Columns</div>
      {COLS.map(c => {
        const locked = c.k === LOCKED_COL
        return (
          <label key={c.k} className={'ch' + (locked ? ' locked' : '')}
            title={locked ? 'The contest name always stays visible' : undefined}>
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
    <div className="ctmenu" ref={ref} style={style}>
      {items.map((it, i) => it.sep
        ? <div key={i} className="sep" />
        : <div key={i} className={it.danger ? 'del' : ''}
            onClick={() => { onClose(); it.on() }}>{it.label}</div>)}
    </div>
  )
}

function EditModal({ row, onClose, onSave, onDelete }) {
  const [f, setF] = useState({
    org: row.org || '', contest: row.contest || '',
    regDeadline: row.regDeadline || '', contestDate: row.contestDate || '',
    numOrdered: row.numOrdered ?? '', status: row.status || 'Waiting',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <div className="ctov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ctmodal" onClick={e => e.stopPropagation()}>
        <h2>{row.isNew ? 'Add Contest' : row.fromProgram ? 'Edit Contest Row' : 'Edit Manual Row'}</h2>
        {row.fromProgram && (
          <div className="mhint">
            Backed by the program <b>{row.programName}</b>. Editing here overrides what
            is shown on this page; the program itself is untouched.
          </div>
        )}
        <div className="frow">
          <div className="field">
            <label>Organisation</label>
            <input value={f.org} onChange={e => set('org', e.target.value)} placeholder="e.g. CEMC" />
          </div>
          <div className="field">
            <label>Contest</label>
            <input value={f.contest} onChange={e => set('contest', e.target.value)} placeholder="e.g. GAUSS" />
          </div>
        </div>
        <div className="frow">
          <div className="field">
            <label>Reg. Deadline</label>
            <input type="date" value={f.regDeadline} onChange={e => set('regDeadline', e.target.value)} />
          </div>
          <div className="field">
            <label>Contest Date</label>
            <input type="date" value={f.contestDate} onChange={e => set('contestDate', e.target.value)} />
          </div>
        </div>
        <div className="frow">
          <div className="field">
            <label>Ordered</label>
            <input type="number" min="0" value={f.numOrdered}
              onChange={e => set('numOrdered', e.target.value)} placeholder="0" />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={f.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="macts">
          {!row.isNew && (
            <button className="btn-del" onClick={onDelete}>{row.fromProgram ? 'Hide Row' : 'Delete'}</button>
          )}
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button onClick={() => onSave(f)}>{row.isNew ? 'Add' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function BulkModal({ count, onClose, onApply }) {
  const [f, setF] = useState({ status: '', regDeadline: '', contestDate: '', numOrdered: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <div className="ctov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ctmodal" onClick={e => e.stopPropagation()}>
        <h2>Edit {count} Selected</h2>
        <div className="mhint">Anything left blank is left alone.</div>
        <div className="field">
          <label>Status</label>
          <select value={f.status} onChange={e => set('status', e.target.value)}>
            <option value="">— leave unchanged —</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="frow">
          <div className="field">
            <label>Reg. Deadline</label>
            <input type="date" value={f.regDeadline} onChange={e => set('regDeadline', e.target.value)} />
          </div>
          <div className="field">
            <label>Contest Date</label>
            <input type="date" value={f.contestDate} onChange={e => set('contestDate', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Ordered</label>
          <input type="number" min="0" value={f.numOrdered}
            onChange={e => set('numOrdered', e.target.value)} placeholder="leave blank to keep" />
        </div>
        <div className="macts">
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button onClick={() => onApply(f)}>Apply</button>
        </div>
      </div>
    </div>
  )
}

function StatusSelect({ value, onChange }) {
  const style = STATUS_STYLE[value] || STATUS_STYLE.Waiting
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      style={{
        border: 'none', outline: 'none', cursor: 'pointer',
        borderRadius: 999, padding: '3px 10px', fontSize: 10.5, fontWeight: 700,
        letterSpacing: '.4px', textTransform: 'uppercase', fontFamily: 'inherit',
        /* backgroundColor, not the `background` shorthand — mixing it with the
           longhands below makes React warn on every re-render. */
        backgroundColor: style.bg, color: style.fg,
        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        paddingRight: 20,
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 3l3 4 3-4' stroke='${encodeURIComponent(style.fg)}' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 5px center',
      }}
    >
      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}
