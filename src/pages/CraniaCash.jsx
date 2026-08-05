// Crania Cash — the balance every student carries, and the log of every
// change to it.
//
// Rebuilt in the same language as Customers and Students: a scoped CSS
// block, the teal header, the Columns / Export CSV / settings toolbar,
// metric tiles that double as filters, a filter row under every heading,
// a select column with a bulk action, and pill-style cells.
//
// Data flow is unchanged — useStore() for registrations and rules, and
// addCashEntry() remains the single write path, so the log and the balance
// can never disagree.
//
// The rules editor now lives behind the settings gear rather than a tab of
// its own: rules are configuration, which is what the gear holds everywhere
// else in the app.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Eye, Download, Plus, Trash2, Pencil, ExternalLink } from 'lucide-react'
import { useStore } from '../data/store'
import BackupPanel, { BACKUP_CSS } from '../components/BackupPanel'
import { ColsPop, CtxMenu, TABLECHROME_CSS } from '../components/TableChrome'

const COLS = [
  { k: 'studentId',  l: 'Student ID' },
  { k: 'name',       l: 'Name' },        // never hideable — it names the row
  { k: 'grade',      l: 'Grade',       cls: 'center' },
  { k: 'cash',       l: 'Crania Cash', cls: 'center' },
  { k: 'entries',    l: 'Entries',     cls: 'center' },
  { k: 'last',       l: 'Last Change' },
  { k: 'lastReason', l: 'Last Reason' },
]
const LOCKED_COL = 'name'

const SEL_W = '3%'
const ACT_W = '7%'
const COL_W = {
  studentId: '9%', name: '19%', grade: '7%', cash: '11%',
  entries: '8%', last: '15%', lastReason: '21%',
}

const CPREF_KEY = 'craniacash-cols'
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

/* A ladder of animals, so a balance means something at a glance and there
   is a next thing to reach for. Ordered low to high; a balance sits in the
   last band whose floor it has reached. Below zero is its own state rather
   than the bottom animal — being in debt is not the same as starting out. */
const LEVELS = [
  { min: 0,   name: 'Snail',    emoji: '🐌' },
  { min: 10,  name: 'Rabbit',   emoji: '🐇' },
  { min: 25,  name: 'Fox',      emoji: '🦊' },
  { min: 50,  name: 'Owl',      emoji: '🦉' },
  { min: 100, name: 'Dolphin',  emoji: '🐬' },
  { min: 200, name: 'Falcon',   emoji: '🦅' },
  { min: 350, name: 'Lion',     emoji: '🦁' },
  { min: 500, name: 'Dragon',   emoji: '🐉' },
]
const IN_THE_RED = { name: 'In the red', emoji: '🔻', min: -Infinity }

function levelFor(cash) {
  const n = Number(cash) || 0
  if (n < 0) return IN_THE_RED
  let found = LEVELS[0]
  for (const l of LEVELS) if (n >= l.min) found = l
  return found
}

// The next rung, and how far off it is. Null once they are a Dragon.
function nextLevel(cash) {
  const n = Number(cash) || 0
  const next = LEVELS.find(l => l.min > n)
  return next ? { ...next, away: l0(next.min - n) } : null
}
const l0 = (n) => Math.max(0, Math.ceil(n))

function fmtTs(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString(undefined,
      { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}
const studentName = (r) => `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim()

const CSS = BACKUP_CSS + TABLECHROME_CSS + `
.cc{position:relative;--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;
    --dark-brown:#2E2516;--line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;
    --danger:#C0392B;--good:#2b7a2e;--shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}

.cc .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.cc .actions button{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:6px 12px;
    font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;
    display:inline-flex;align-items:center;gap:5px}
.cc .actions button:hover{background:#f4f2ea}
.cc .actions .gearbtn{font-size:14px;line-height:1;padding:6px 10px}
.ccsettings{position:absolute;right:34px;z-index:240;width:360px;display:flex;flex-direction:column;
    gap:10px;margin-top:4px}

.cc .offline{background:#fffbf0;border:1px solid #f4d67a;color:#8a6a00;padding:8px 12px;
    border-radius:8px;margin-bottom:12px;font-size:13px}

.cc .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.cc .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.cc .metric.clickable{cursor:pointer}
.cc .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.cc .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.cc .metric.mbal{border-bottom-color:var(--light-blue)}
.cc .metric.mneg{border-bottom-color:var(--danger)}
.cc .metric.mlog{border-bottom-color:var(--yellow)}
.cc .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.cc .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.cc .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.cc .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.cc .filters input[type=search]{padding:7px 12px;border:1px solid var(--field);border-radius:8px;
    font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit;width:260px}
.cc .filters input[type=search]:focus{outline:none;border-color:var(--teal)}
.cc .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.cc .clearf:hover{background:#f1f5f4}
.cc .toggle{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);
    font-weight:600;cursor:pointer;user-select:none}
.cc .toggle input{width:14px;height:14px;accent-color:var(--teal);cursor:pointer;margin:0}

.cc .bulkbar{background:#E4EFF3;border:1px solid var(--light-blue);border-radius:10px;
    padding:10px 12px;margin-bottom:10px;font-size:12.5px;color:var(--dark-brown)}
.cc .bulkbar .top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cc .bulkbar .n{font-weight:700}
.cc .bulkbar .clr{background:transparent;border:1px solid var(--field);color:var(--muted);
    border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
.cc .bulkbar .award{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:9px;
    border-top:1px solid #cfe0e6;padding-top:9px}
.cc .bulkbar input{padding:6px 9px;border:1px solid var(--field);border-radius:7px;font:inherit;
    font-size:12.5px;background:#fff;color:var(--dark-brown)}
.cc .bulkbar input.amt{width:92px;text-align:right}
.cc .bulkbar input.why{flex:1;min-width:150px}
.cc .bulkbar .go{background:var(--teal);color:#fff;border:none;border-radius:8px;padding:7px 14px;
    font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
.cc .bulkbar .go:disabled{opacity:.45;cursor:default}

.cc .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.cc table{width:100%;min-width:820px;table-layout:fixed;border-collapse:separate;
    border-spacing:5px 5px;background:#fff}
.cc thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
/* Centred across the cell; the icons are pinned right and carry the header
   background, so only a sorted column reserves room for its arrow. */
.cc thead th.colh .lbl{display:block;text-align:center;padding:0 6px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc thead th.colh.sorted .lbl{padding-right:20px}
.cc thead th.colh{cursor:grab}
.cc thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1;
    background:var(--teal);padding-left:4px;border-radius:3px}
.cc thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.cc thead th.colh:hover .eye{opacity:1}
.cc thead th .arw{opacity:.85;font-size:10px}
.cc thead th .sortable{cursor:pointer}
.cc thead tr.colfrow th{background:#eaf3f2;padding:5px 6px;border-radius:0}
.cc thead tr.colfrow th:empty{background:transparent}
.cc .colf{width:100%;background:#fff;border:1px solid var(--field);border-radius:7px;padding:4px 6px;
    font-size:11.5px;color:var(--dark-brown);font-weight:600;cursor:pointer;font-family:inherit}
.cc .colf.on{background:var(--light-blue);border-color:var(--light-blue)}
.cc thead th.selcol,.cc thead th.blankhead,.cc tbody td.selcol,.cc tbody td.actcell{background:transparent}
.cc thead th.selcol input,.cc tbody td.selcol input{width:12px;height:12px;margin:0;
    accent-color:var(--teal);vertical-align:middle;cursor:pointer}
.cc .selcol{text-align:center}

.cc tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:24px;overflow:hidden;text-overflow:ellipsis}
.cc tbody td.center{text-align:center}
.cc tbody tr{cursor:pointer}
.cc tbody tr:hover td{background:#E4EFF3}
.cc tbody tr.sel td{background:#DCEEEC}
.cc tbody td.actcell{white-space:nowrap;text-align:center}
.cc .rowbtn{background:none;border:none;color:#c9c3b5;padding:0 2px;margin:0;line-height:1;
    cursor:pointer;transition:color .15s;display:inline-flex;vertical-align:middle}
.cc .rowbtn:hover{color:var(--teal)}
.cc .sref{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--muted);font-weight:600}
.cc .sname{font-weight:700;color:#3d7f7d}
.cc .dash{color:var(--faint)}
.cc .bal{display:inline-block;min-width:44px;border-radius:5px;padding:1px 8px;font-size:12px;
    font-weight:700;font-variant-numeric:tabular-nums}
.cc .bal.pos{background:#dff5e0;color:var(--good)}
.cc .bal.zero{background:var(--pill);color:var(--muted)}
.cc .bal.neg{background:#fadbd8;color:#922b21}
.cc .empty{text-align:center;color:var(--muted);padding:60px 20px}
.cc .empty b{color:var(--dark-brown)}
.cc .tcount{text-align:right;font-size:11.5px;color:var(--muted);padding:7px 2px 0}

/* ── detail ── */
.cc .back{background:none;border:none;color:var(--teal);font-weight:700;font-size:13px;
    cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px;margin-bottom:14px}
.cc .panel{background:#fff;border:1px solid var(--line);border-left:3px solid var(--teal);
    border-radius:10px;padding:14px 16px;margin-bottom:14px}
.cc .panel .t{font-size:12.5px;font-weight:700;color:var(--teal);text-transform:uppercase;
    letter-spacing:.4px;margin-bottom:10px}
.cc .balcard{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
.cc .balcard .who{font-size:19px;font-weight:700}
.cc .balcard .who .sub{font-size:12px;font-weight:600;color:var(--muted);margin-top:2px}
.cc .balcard .amt{font-size:32px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.cc .quick{display:flex;flex-wrap:wrap;gap:8px}
.cc .quick button{border:none;border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:600;
    cursor:pointer;font-family:inherit}
.cc .quick button.up{background:#dff5e0;color:var(--good)}
.cc .quick button.down{background:#fadbd8;color:#922b21}
.cc .custom{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px;
    border-top:1px solid var(--line);padding-top:14px}
.cc .custom input{padding:7px 10px;border:1px solid var(--field);border-radius:8px;font:inherit;
    font-size:12.5px;background:#fff;color:var(--dark-brown)}
.cc .custom input.amt{width:104px;text-align:right}
.cc .custom input.why{flex:1;min-width:150px}
.cc .custom button{background:var(--teal);color:#fff;border:none;border-radius:8px;padding:8px 16px;
    font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
/* Fixed layout with the widths declared on the colgroup. Left to size
   itself, the border-spacing pushed the Change column past the right edge
   of the panel — the header ran out at Reason and the amount was cut off. */
.cc .logtable{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:5px 5px}
.cc .logtable th{background:var(--teal);color:#fff;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 8px;border-radius:6px}
.cc .logtable td{background:var(--pill);border-radius:5px;padding:6px 9px;font-size:12px}
.cc .logtable td.delta{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.cc .logtable td.delta.up{color:var(--good)}
.cc .logtable td.delta.down{color:#922b21}

/* ── rules editor, inside the settings panel ── */
.cc-rules .rrow{display:flex;align-items:center;gap:7px;padding:4px 0}
.cc-rules .rrow input{padding:6px 9px;border:1px solid var(--field);border-radius:7px;font:inherit;
    font-size:12px;background:#fff;color:#2E2516}
.cc-rules .rrow input.why{flex:1;min-width:0}
.cc-rules .rrow input.amt{width:66px;text-align:right}
.cc-rules .rrow .x{background:none;border:none;color:#c9c3b5;cursor:pointer;padding:2px;line-height:1}
.cc-rules .rrow .x:hover{color:#C0392B}
.cc-rules .foot{display:flex;gap:8px;margin-top:9px;border-top:1px solid #E7EBE7;padding-top:9px}
.cc-rules .foot button{flex:1;border-radius:8px;padding:6px 10px;font:inherit;font-size:12px;
    font-weight:600;cursor:pointer}
.cc-rules .foot .add{background:#F1F3F4;border:1px solid #D5D0C4;color:#2E2516}
.cc-rules .foot .save{background:#5FA09E;color:#fff;border:none}
.cc-rules .foot .save:disabled{background:#cbd1d6;cursor:default}
`

// ─── Rules editor (now a card in the settings panel) ───────────────────────
function RulesEditor() {
  const { rules, updateRules } = useStore()
  const [draft, setDraft] = useState(rules)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { if (!dirty) setDraft(rules) }, [rules, dirty])

  const setRow = (i, patch) => {
    setDirty(true)
    setDraft(d => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const remove = (i) => { setDirty(true); setDraft(d => d.filter((_, idx) => idx !== i)) }
  const add = () => { setDirty(true); setDraft(d => [...d, { id: 'r' + Date.now(), reason: '', delta: 0 }]) }
  const save = () => { updateRules(draft.filter(r => r.reason.trim())); setDirty(false) }

  return (
    <div className="bkp-card cc-rules">
      <div className="bkp-title">Crania Cash Rules</div>
      <div className="bkp-hint">
        Each rule becomes a quick-apply button on a student's page and in the
        bulk bar. Only rules named “Present” and “No Shirt” are also applied
        automatically when attendance is marked.
      </div>
      {draft.length === 0 && <div className="bkp-meta">No rules yet.</div>}
      {draft.map((r, i) => (
        <div key={r.id || i} className="rrow">
          <input className="why" value={r.reason} placeholder="e.g. Completed homework"
            onChange={e => setRow(i, { reason: e.target.value })} />
          <input className="amt" type="number" value={r.delta}
            onChange={e => setRow(i, { delta: Number(e.target.value) || 0 })} />
          <button type="button" className="x" title="Remove rule" onClick={() => remove(i)}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="foot">
        <button type="button" className="add" onClick={add}><Plus size={12} /> Add Rule</button>
        <button type="button" className="save" disabled={!dirty} onClick={save}>Save Changes</button>
      </div>
    </div>
  )
}

function CashSettings({ onClose }) {
  const ref = useRef(null)
  const { refresh } = useStore()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  return (
    <div className="ccsettings" ref={ref} onMouseDown={e => e.stopPropagation()}>
      <BackupPanel base="customers"
        hint={'Balances and their history are held on the registrations, so these are the same '
          + 'snapshots the Customers page takes — restoring one replaces every registration '
          + '(last 14 kept).'}
        onRestored={async () => { await refresh(); onClose() }} />
      <RulesEditor />
    </div>
  )
}

// ─── Detail: one student's balance, quick actions and log ──────────────────
function StudentCashDetail({ record, onBack, onNavigate }) {
  const { rules, addCashEntry } = useStore()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const balance = record.student?.craniaCash || 0
  const log = [...(record.cashLog || [])].reverse() // newest first
  const tone = balance > 0 ? 'var(--good)' : balance < 0 ? '#922b21' : 'var(--muted)'

  const submit = () => {
    const d = Number(amount)
    if (!Number.isFinite(d) || d === 0) return
    addCashEntry(record.id, { delta: d, reason: reason || (d > 0 ? 'Added' : 'Removed') })
    setAmount(''); setReason('')
  }

  return (
    <div>
      <button className="back" onClick={onBack}><ChevronLeft size={16} /> All Students</button>

      <div className="panel">
        <div className="balcard">
          <div className="who">
            {studentName(record) || 'Unnamed student'}
            <div className="sub">{record.customer?.meta?.studentId || 'no student ID'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="amt" style={{ color: tone }}>{balance}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 2 }}>Crania Cash</div>
          </div>
        </div>
        <div className="levelrow">
          <span className="lvl" title={`Level: ${lvl.name}`}>
            <span className="e">{lvl.emoji}</span>{lvl.name}
          </span>
          {next
            ? <span className="toGo">{next.away} more to {next.emoji} {next.name}</span>
            : <span className="toGo">Top level reached</span>}
        </div>
      </div>

      {/* Two ways to add, kept apart. The custom row used to sit inside this
          panel, under the Quick Apply heading, so it read as part of the
          buttons rather than as the other way of doing it. */}
      <div className="panel">
        <div className="t">Quick Apply — One Click</div>
        <div className="sub">Applies the rule straight away, no confirmation.</div>
        <div className="quick">
          {rules.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>
              No rules yet — add some under the settings gear.
            </div>
          ) : rules.map(rule => (
            <button key={rule.id} className={rule.delta >= 0 ? 'up' : 'down'}
              onClick={() => addCashEntry(record.id, { delta: rule.delta, reason: rule.reason })}>
              {rule.reason} <b>({rule.delta >= 0 ? '+' : ''}{rule.delta})</b>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="t">Add Your Own Entry</div>
        <div className="sub">For anything the rules above do not cover. Use a minus for a deduction.</div>
        <div className="custom">
          <label>
            Amount
            <input className="amt" type="number" value={amount} placeholder="e.g. 5 or -5"
              onChange={e => setAmount(e.target.value)} />
          </label>
          <label className="grow">
            Reason
            <input className="why" value={reason} placeholder="What is it for?"
              onChange={e => setReason(e.target.value)} />
          </label>
          <button disabled={!Number(amount)} onClick={submit}>Add Entry</button>
        </div>
      </div>

      <div className="panel">
        <div className="t">History</div>
        {log.length === 0 ? (
          <div style={{ padding: '22px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
            No activity yet — apply a rule or add an entry above.
          </div>
        ) : (
          <table className="logtable">
            <colgroup>
              <col style={{ width: '30%' }} />
              <col />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr><th>When</th><th>Reason</th><th>Change</th></tr>
            </thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--muted)' }}>{fmtTs(e.ts)}</td>
                  <td title={e.reason}>{e.reason}</td>
                  <td className={'delta ' + (e.delta >= 0 ? 'up' : 'down')}>
                    {e.delta >= 0 ? '+' : ''}{e.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── List ──────────────────────────────────────────────────────────────────
function CashList({ onSelect, onNavigate }) {
  const { records, rules, addCashEntry } = useStore()
  const [search, setSearch] = useState('')
  const [negativeOnly, setNegativeOnly] = useState(false)
  const [withLogOnly, setWithLogOnly] = useState(false)
  const [colFilters, setColFilters] = useState({})
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const [selected, setSelected] = useState(() => new Set())
  const [{ hiddenCols, colOrder }, setColPrefs] = useState(loadColPrefs)
  const [pop, setPop] = useState(null)
  const [rowCtx, setRowCtx] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkReason, setBulkReason] = useState('')
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

  const onSort = (k) => setSort(s => (s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 }))

  const allRows = useMemo(() => records.filter(r => r.id !== 'seed').map(r => {
    const log = r.cashLog || []
    const latest = log.length ? log[log.length - 1] : null
    return {
      id: r.id, record: r,
      studentId: r.customer?.meta?.studentId || '',
      name: studentName(r),
      grade: r.student?.grade || '',
      cash: r.student?.craniaCash || 0,
      entries: log.length,
      last: latest ? fmtTs(latest.ts) : '',
      lastTs: latest ? latest.ts : '',
      lastReason: latest ? latest.reason : '',
    }
  }), [records])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = allRows.filter(r => {
      if (negativeOnly && r.cash >= 0) return false
      if (withLogOnly && r.entries === 0) return false
      for (const [k, want] of Object.entries(colFilters)) {
        if (!want) continue
        if (String(r[k] ?? '') !== want) return false
      }
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.studentId.toLowerCase().includes(q) ||
             String(r.lastReason || '').toLowerCase().includes(q)
    })
    const NUMERIC = ['cash', 'entries']
    const val = (r) => {
      if (NUMERIC.includes(sort.key)) return Number(r[sort.key]) || 0
      if (sort.key === 'last') return r.lastTs || ''
      if (sort.key === 'grade') {
        const n = parseFloat(String(r.grade).replace(/[^0-9.]/g, ''))
        return Number.isFinite(n) ? n : 999
      }
      return String(r[sort.key] || '').toLowerCase()
    }
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -sort.dir
      if (av > bv) return sort.dir
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [allRows, search, negativeOnly, withLogOnly, colFilters, sort])

  const metrics = useMemo(() => {
    let sum = 0, negative = 0, entries = 0
    for (const r of allRows) {
      sum += r.cash
      if (r.cash < 0) negative += 1
      entries += r.entries
    }
    return { students: allRows.length, sum, negative, entries }
  }, [allRows])

  /* Only values actually present, so a filter never offers a dead end. */
  const filterOptions = useMemo(() => {
    const out = {}
    for (const c of COLS) {
      const vals = new Set()
      for (const r of allRows) {
        const v = r[c.k]
        if (v !== '' && v != null) vals.add(String(v))
      }
      out[c.k] = [...vals].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    }
    return out
  }, [allRows])

  const anyFilterActive = !!search || negativeOnly || withLogOnly || Object.values(colFilters).some(Boolean)
  const clearAllFilters = () => {
    setSearch(''); setNegativeOnly(false); setWithLogOnly(false); setColFilters({})
  }

  const allSel = visible.length > 0 && visible.every(r => selected.has(r.id))
  const selectedRows = useMemo(() => visible.filter(r => selected.has(r.id)), [visible, selected])

  /* Award to everyone ticked, in one go — the reason a class of students
     gets selected at all. Each student still gets their own log entry
     through the same addCashEntry path, so nothing bypasses the history. */
  const awardSelected = (delta, why) => {
    if (!Number.isFinite(delta) || delta === 0 || selectedRows.length === 0) return
    for (const r of selectedRows) {
      addCashEntry(r.id, { delta, reason: why || (delta > 0 ? 'Added' : 'Removed') })
    }
    setBulkAmount(''); setBulkReason('')
  }

  const exportCsv = (rows) => {
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [COLS.map(c => c.l).join(',')]
    for (const r of (rows && rows.length ? rows : allRows)) {
      lines.push(COLS.map(c => r[c.k]).map(esc).join(','))
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `crania-cash-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  useEffect(() => {
    if (!pop) return
    const onDown = e => { if (popRef.current && !popRef.current.contains(e.target)) setPop(null) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [pop])

  const arrow = k => (sort.key === k ? <span className="arw">{sort.dir > 0 ? '▲' : '▼'}</span> : null)

  return (
    <>
      <div className="actions">
        <button title="Choose which columns are shown" style={{ marginLeft: 'auto' }}
          onClick={e => setPop({ kind: 'cols', rect: e.currentTarget.getBoundingClientRect() })}
        ><Eye size={13} /> Columns</button>
        <button title="Download the balances as a CSV file" onClick={() => exportCsv()}>
          <Download size={13} /> Export CSV
        </button>
        <button className="gearbtn" title="Backups and Crania Cash rules"
          onClick={() => setSettingsOpen(true)}>⚙</button>
      </div>

      {settingsOpen && <CashSettings onClose={() => setSettingsOpen(false)} />}

      <div className="metrics">
        <div className="metric">
          <div className="label">Students</div><div className="value">{metrics.students}</div>
          <div className="hint">registered students</div>
        </div>
        <div className="metric mbal">
          <div className="label">Total Balance</div>
          <div className="value" style={{ color: metrics.sum < 0 ? 'var(--danger)' : undefined }}>{metrics.sum}</div>
          <div className="hint">Crania Cash across all students</div>
        </div>
        <div className={'metric mneg clickable' + (negativeOnly ? ' on' : '')}
          title="Click to show only students below zero"
          onClick={() => setNegativeOnly(v => !v)}>
          <div className="label">Negative Balances</div>
          <div className="value" style={{ color: metrics.negative > 0 ? 'var(--danger)' : undefined }}>
            {metrics.negative}
          </div>
          <div className="hint">students below zero</div>
        </div>
        <div className={'metric mlog clickable' + (withLogOnly ? ' on' : '')}
          title="Click to show only students with activity"
          onClick={() => setWithLogOnly(v => !v)}>
          <div className="label">Entries Logged</div><div className="value">{metrics.entries}</div>
          <div className="hint">changes on record</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, student ID or reason…" autoComplete="off" />
        <label className="toggle" title="Students who have at least one logged change">
          <input type="checkbox" checked={withLogOnly} onChange={e => setWithLogOnly(e.target.checked)} />
          With activity only
        </label>
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <div className="top">
            <span className="n">{selected.size} selected</span>
            <span>
              <button className="clr" onClick={() => exportCsv(selectedRows)}>Export Selected</button>
              {' '}
              <button className="clr" onClick={() => setSelected(new Set())}>Clear Selection</button>
            </span>
          </div>
          <div className="award">
            {rules.map(rule => (
              <button key={rule.id} className="go"
                style={{ background: rule.delta >= 0 ? 'var(--good)' : '#922b21' }}
                title={`Apply to all ${selected.size} selected`}
                onClick={() => awardSelected(rule.delta, rule.reason)}>
                {rule.reason} ({rule.delta >= 0 ? '+' : ''}{rule.delta})
              </button>
            ))}
            <input className="amt" type="number" value={bulkAmount} placeholder="±amount"
              onChange={e => setBulkAmount(e.target.value)} />
            <input className="why" value={bulkReason} placeholder="Reason"
              onChange={e => setBulkReason(e.target.value)} />
            <button className="go" disabled={!Number(bulkAmount)}
              onClick={() => awardSelected(Number(bulkAmount), bulkReason)}>
              Apply to {selected.size}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {allRows.length === 0 ? (
          <div className="empty"><b>No students yet.</b><br />
            Balances appear here once students are registered.</div>
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
              {/* Not `frow` — that class belongs to the detail field rows on
                  other pages and sets display:grid, which pulls the row out
                  of table layout and breaks every column width. */}
              <tr className="colfrow">
                <th />
                {orderedCols.map(c => (
                  <th key={c.k}>
                    <select className={'colf' + (colFilters[c.k] ? ' on' : '')}
                      value={colFilters[c.k] || ''}
                      onChange={e => setColFilters(f => ({ ...f, [c.k]: e.target.value }))}>
                      <option value="">All</option>
                      {(filterOptions[c.k] || []).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </th>
                ))}
                <th />
              </tr>
              <tr>
                <th className="selcol">
                  <input type="checkbox" checked={allSel} title="Select all shown"
                    onChange={e => setSelected(e.target.checked ? new Set(visible.map(r => r.id)) : new Set())} />
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
                    title="Click to open this student's Crania Cash; right-click for more"
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
                      let content
                      if (k === 'studentId') {
                        content = r.studentId ? <span className="sref">{r.studentId}</span> : <span className="dash">—</span>
                      } else if (k === 'name') {
                        content = <span className="sname">{r.name || <span className="dash">—</span>}</span>
                      } else if (k === 'cash') {
                        const tone = r.cash > 0 ? 'pos' : r.cash < 0 ? 'neg' : 'zero'
                        content = <span className={'bal ' + tone}>{r.cash}</span>
                      } else {
                        content = r[k] === '' || r[k] == null ? <span className="dash">—</span> : r[k]
                      }
                      return (
                        <td key={k} className={`col-${k}${c.cls ? ' ' + c.cls : ''}`}
                          title={String(r[k] ?? '')}>{content}</td>
                      )
                    })}
                    <td className="actcell" onClick={e => e.stopPropagation()}>
                      <button className="rowbtn" title="Open this student's Crania Cash"
                        onClick={() => onSelect(r.id)}><Pencil size={12} /></button>
                      <button className="rowbtn" title="Open this student in Students"
                        onClick={() => onNavigate && onNavigate('Students', r.id)}>
                        <ExternalLink size={12} />
                      </button>
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
        <ColsPop ref={popRef} rect={pop.rect} cols={COLS} hiddenCols={hiddenCols} lockedKey={LOCKED_COL}
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
          { label: 'Open Crania Cash', on: () => onSelect(rowCtx.row.id) },
          { label: 'Open in Students', on: () => onNavigate && onNavigate('Students', rowCtx.row.id) },
          { label: 'Export This Student', on: () => exportCsv([rowCtx.row]) },
        ]} />
      )}
    </>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────
export default function CraniaCash({ onNavigate }) {
  const { records, status } = useStore()
  const [detailId, setDetailId] = useState(null)
  const detailRecord = detailId ? records.find(r => r.id === detailId) : null

  return (
    <div className="page cc" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>
      <h2 className="page-title">Crania Cash</h2>

      {status === 'offline' && (
        <div className="offline">Working offline — showing cached data.</div>
      )}

      {detailRecord
        ? <StudentCashDetail record={detailRecord} onBack={() => setDetailId(null)} onNavigate={onNavigate} />
        : <CashList onSelect={setDetailId} onNavigate={onNavigate} />}
    </div>
  )
}
