// Staff Information — the list is the same table the Customers, Students,
// Programs and Logins pages use: scoped CSS, the teal header, the
// Undo / Redo / Columns / Export CSV / settings toolbar, metric tiles that
// filter, a filter row under every heading, a select column with bulk
// actions, row buttons and a right-click menu.
//
// The detail form follows the Students and Customers detail views:
// columns that fit themselves to the width, ruled caption headings, and
// white bordered inputs.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Eye, UserPlus, Pencil, Copy, Trash2,
} from 'lucide-react'
import { useStore } from '../data/store'
import { ColsPop, CtxMenu, TABLECHROME_CSS } from '../components/TableChrome'
import PageActions, { PAGEACTIONS_CSS } from '../components/PageActions'

const COLS = [
  { k: 'staffId',   l: 'Staff ID' },
  { k: 'name',      l: 'Name' },              // never hideable — it names the row
  { k: 'role',      l: 'Role' },
  { k: 'phone',     l: 'Phone' },
  { k: 'email',     l: 'Email' },
  { k: 'startDate', l: 'Start Date',      cls: 'center' },
  { k: 'tenure',    l: 'Time at Crania',  cls: 'center' },
  { k: 'status',    l: 'Status',          cls: 'center' },
]
const LOCKED_COL = 'name'

const SEL_W = '5%'
const ACT_W = '7%'
const COL_W = {
  staffId: '9%', name: '15%', role: '10%', phone: '10%',
  email: '14%', startDate: '10%', tenure: '12%', status: '8%',
}

const CPREF_KEY = 'staff-cols'
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

/* Ctrl+Z inside a text box has to undo the typing, not the last staff
   change — the same guard the Customers list needed. */
function inEditableField(el) {
  if (!el) return false
  const tag = (el.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

const fullName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim()

function ageFromDob(dob) {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return ''
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return years > 0 ? years.toFixed(2) : ''
}

function timeWithCompany(startDate) {
  if (!startDate) return ''
  const d = new Date(startDate)
  if (isNaN(d.getTime())) return ''
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  if (years < 0) return ''
  if (years < 1) return `${Math.floor(years * 12)} mo`
  return `${years.toFixed(1)} yr`
}

const startsInFuture = (startDate) => {
  if (!startDate) return false
  const d = new Date(startDate)
  return !isNaN(d.getTime()) && d.getTime() > Date.now()
}

// ── Staff IDs ─────────────────────────────────────────────────────────────
// An identifier, not a position: assigned once, written to the record, and
// never recomputed. Deleting E0003 does not renumber anyone — everyone keeps
// the number they were given. The next number comes from the highest one in
// use, so deleting the highest does free it for the next hire; that matches
// how family references behave on the Customers page.
const staffRef = (n) => 'E' + String(n).padStart(4, '0')
const refNumber = (ref) => {
  const m = /^E(\d+)$/.exec(String(ref || '').trim())
  return m ? parseInt(m[1], 10) : 0
}

function useStaffIds(staff, assignStaffId) {
  const claimed = useRef(new Set())
  useEffect(() => {
    let highest = 0
    for (const s of staff) highest = Math.max(highest, refNumber(s.staffId))
    for (const s of staff) {
      if (s.staffId || claimed.current.has(s.id)) continue
      claimed.current.add(s.id)
      highest += 1
      assignStaffId(s.id, staffRef(highest))
    }
  }, [staff, assignStaffId])
}

// ── Confirm dialog ────────────────────────────────────────────────────────
/* window.confirm() blocks the whole tab and looks nothing like the rest of
   the app, so deletes use this instead — the same shape as the Customers
   one. */
function useConfirm() {
  const [dlg, setDlg] = useState(null)
  const resolver = useRef(null)
  const finish = (v) => { setDlg(null); const r = resolver.current; resolver.current = null; if (r) r(v) }
  const confirm = useCallback((message, opts = {}) => new Promise(res => {
    resolver.current = res
    setDlg({ message, title: opts.title || 'Delete', button: opts.button || 'Delete' })
  }), [])
  const node = dlg ? (
    <div className="sfov" onClick={e => { if (e.target === e.currentTarget) finish(false) }}>
      <div className="sfmodal">
        <h2>{dlg.title}</h2>
        <div className="msg">{dlg.message}</div>
        <div className="macts">
          <button className="cancel" onClick={() => finish(false)}>Cancel</button>
          <button className="go" onClick={() => finish(true)}>{dlg.button}</button>
        </div>
      </div>
    </div>
  ) : null
  return { confirm, node }
}

const CSS = TABLECHROME_CSS + PAGEACTIONS_CSS + `
.sf{position:relative;--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;
    --dark-brown:#2E2516;--line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;
    --danger:#C0392B;--good:#2b7a2e;--shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}

.sf .offline{background:#fffbf0;border:1px solid #f4d67a;color:#8a6a00;padding:8px 12px;
    border-radius:8px;margin-bottom:12px;font-size:13px}

.sf .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.sf .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.sf .metric.clickable{cursor:pointer}
.sf .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.sf .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.sf .metric.mact{border-bottom-color:var(--light-blue)}
.sf .metric.msoon{border-bottom-color:#8a6a00}
.sf .metric.mdoc{border-bottom-color:var(--danger)}
.sf .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.sf .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.sf .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.sf .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.sf .filters input[type=search]{padding:7px 12px;border:1px solid var(--field);border-radius:8px;
    font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit;width:280px}
.sf .filters input[type=search]:focus{outline:none;border-color:var(--teal)}
.sf .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.sf .clearf:hover{background:#f1f5f4}
.sf .toggle{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);
    font-weight:600;cursor:pointer;user-select:none}
.sf .toggle input{width:14px;height:14px;accent-color:var(--teal);cursor:pointer;margin:0}
/* Add Staff moved into the shared bar, where it keeps its teal fill so it
   still reads as the one thing on the bar that creates something. */
.pgacts .sf-add{background:var(--card-teal,#5FA09E);color:#fff;border:none}
.pgacts .sf-add:hover:not(:disabled){background:#4f8b89}

.sf .bulkbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
    background:#E4EFF3;border:1px solid var(--light-blue);border-radius:10px;
    padding:8px 12px;margin-bottom:10px;font-size:12.5px;color:var(--dark-brown)}
.sf .bulkbar .n{font-weight:700}
.sf .bulkbar button{border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:600;
    cursor:pointer;font-family:inherit;border:none}
.sf .bulkbar .exp{background:var(--teal);color:#fff}
.sf .bulkbar .del{background:var(--danger);color:#fff}
.sf .bulkbar .clr{background:transparent;border:1px solid var(--field);color:var(--muted)}

.sf .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.sf .card > table{width:100%;min-width:990px;table-layout:fixed;border-collapse:separate;
    border-spacing:5px 5px;background:#fff}
.sf thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
.sf thead th.colh .lbl{display:block;text-align:center;padding:0 6px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sf thead th.colh.sorted .lbl{padding-right:20px}
.sf thead th.colh{cursor:grab}
.sf thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1;
    background:var(--teal);padding-left:4px;border-radius:3px}
.sf thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.sf thead th.colh:hover .eye{opacity:1}
.sf thead th .arw{opacity:.85;font-size:10px}
.sf thead th .sortable{cursor:pointer}
.sf thead tr.colfrow th{background:#eaf3f2;padding:5px 6px;border-radius:0}
.sf thead tr.colfrow th:empty{background:transparent}
.sf .colf{width:100%;background:#fff;border:1px solid var(--field);border-radius:7px;padding:4px 6px;
    font-size:11.5px;color:var(--dark-brown);font-weight:600;cursor:pointer;font-family:inherit}
.sf .colf.on{background:var(--light-blue);border-color:var(--light-blue)}
.sf thead th.selcol,.sf thead th.blankhead,.sf tbody td.selcol,.sf tbody td.actcell{background:transparent}
.sf thead th.selcol input,.sf tbody td.selcol input{width:12px;height:12px;margin:0;
    accent-color:var(--teal);vertical-align:middle;cursor:pointer}
.sf .selcol{text-align:center}

.sf tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:26px;overflow:hidden;text-overflow:ellipsis}
.sf tbody td.center{text-align:center}
.sf tbody tr{cursor:pointer}
.sf tbody tr:hover td{background:#E4EFF3}
.sf tbody tr.sel td{background:#DCEEEC}
.sf tbody tr.rinactive td{background:#F6F5F1;color:var(--muted)}
.sf tbody td.actcell{white-space:nowrap;text-align:center}
.sf .rowbtn{background:none;border:none;color:#c9c3b5;padding:0 2px;margin:0;line-height:1;
    cursor:pointer;transition:color .15s;display:inline-flex;vertical-align:middle}
.sf .rowbtn:hover{color:var(--teal)}
.sf .rowbtn.rb-del:hover{color:var(--danger)}
.sf .sref{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--muted);font-weight:600}
.sf .sname{font-weight:700;color:#3d7f7d}
.sf .dash{color:var(--faint)}
.sf .tag{display:inline-block;border-radius:5px;padding:1px 8px;font-size:11px;font-weight:700}
.sf .tag.ok{background:#DEF2DE;color:var(--good)}
.sf .tag.off{background:#EAE7DF;color:var(--muted)}
.sf .empty{text-align:center;color:var(--muted);padding:60px 20px}
.sf .empty b{color:var(--dark-brown)}
.sf .tcount{text-align:right;font-size:11.5px;color:var(--muted);padding:7px 2px 0}

.sfov{position:fixed;inset:0;background:rgba(46,37,22,.35);z-index:400;
    display:flex;align-items:center;justify-content:center;padding:20px}
.sfmodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(46,37,22,.3);
    padding:18px 20px;width:100%;max-width:420px}
.sfmodal h2{margin:0 0 8px;font-size:16px;color:#2E2516}
.sfmodal .msg{font-size:13px;color:#6B6455;line-height:1.5;margin-bottom:16px}
.sfmodal .macts{display:flex;gap:8px;justify-content:flex-end}
.sfmodal button{border-radius:8px;padding:8px 15px;font:inherit;font-size:12.5px;
    font-weight:700;cursor:pointer;border:none}
.sfmodal .go{background:#c0392b;color:#fff}
.sfmodal .cancel{background:#F1F3F4;border:1px solid #D5D0C4;color:#2E2516}

/* ── detail view ── */
.sf .backbtn{display:inline-flex;align-items:center;gap:6px;background:none;border:none;
    cursor:pointer;color:var(--teal);font-weight:700;font-size:14px;margin-bottom:12px;padding:0}
.sf .detailhead{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.sf .idchip{font-family:ui-monospace,Consolas,monospace;font-size:12px;font-weight:700;
    background:var(--pill);color:var(--muted);border-radius:6px;padding:3px 9px}
.sf .delbtn{background:#f3eded;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;
    color:var(--danger);font-weight:600;font-size:12px;font-family:inherit}
/* Nineteen sections of equal weight is the thing that made this form
   hard to read, whatever the headings looked like. They are in four
   groups now, so the eye lands on four things and then narrows. The
   group band carries the colour the old teal bars did — but once per
   group instead of nineteen times — and the sections inside keep the
   quiet caption and white inputs the rest of the app uses. */
.sf .formgroups{display:flex;flex-direction:column;gap:22px;margin-top:6px}
.sf .fgroup{background:#fff;border:1px solid var(--line);border-radius:12px;
    box-shadow:var(--shadow);overflow:hidden}
.sf .fghead{background:#F4F7F8;border-bottom:1px solid var(--line);
    padding:11px 18px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.sf .fghead h3{margin:0;font-size:14px;font-weight:700;color:var(--dark-brown);
    letter-spacing:.2px;position:relative;padding-left:11px}
.sf .fghead h3::before{content:'';position:absolute;left:0;top:1px;bottom:1px;
    width:3px;border-radius:2px;background:var(--teal)}
.sf .fghead span{font-size:11.5px;color:var(--muted)}

.sf .panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
    gap:20px 26px;align-items:start;padding:16px 18px 18px}
.sf .panels .wide{grid-column:span 2}
@media (max-width:900px){.sf .panels .wide{grid-column:span 1}}

.sf .sec-h{font-size:13px;font-weight:700;color:var(--teal);margin:0 0 12px;
    padding-bottom:7px;border-bottom:1px solid var(--line);text-transform:uppercase;
    letter-spacing:.4px;display:flex;align-items:center;gap:8px}
.sf .sec-h .cnt{margin-left:auto;background:var(--pill);color:var(--muted);
    border-radius:20px;padding:1px 8px;font-size:11px;letter-spacing:0}
.sf .sec-h .cnt.short{background:#FBF3CE;color:#7a6417}
.sf .sechint{font-size:11.5px;color:var(--muted);font-style:italic;margin:-4px 0 9px}
.sf .emptynote{font-size:12.5px;color:var(--muted);padding:2px 0}
.sf .progpill{background:var(--pill);border-radius:7px;padding:7px 10px;margin-bottom:6px}
.sf .progpill .t{font-weight:700;font-size:12.5px}
.sf .progpill .s{color:var(--muted);font-size:11.5px;margin-top:1px}

.sf .frow{display:grid;grid-template-columns:92px 1fr;gap:10px;align-items:center;margin-bottom:8px}
.sf .frow label{text-align:right;font-size:12px;font-weight:600;color:var(--muted);line-height:1.2}
.sf .frow input,.sf .frow .ro{width:100%;box-sizing:border-box;padding:7px 10px;
    border:1px solid var(--field);border-radius:8px;font:inherit;font-size:13px;
    background:#fff;color:var(--dark-brown)}
.sf .frow input:focus{outline:none;border-color:var(--teal)}
.sf .frow .ro{background:var(--pill);color:var(--muted)}
.sf .frow input.highlight{background:var(--yellow);border-color:#d4d27a;font-weight:700}

/* The repeating-row editors — education, keys, references — share the
   field styling so a cell inside a table and a field beside a label do
   not look like two different kinds of input. */
.sf .cellinput{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--field);
    border-radius:7px;font:inherit;font-size:12.5px;background:#fff;color:var(--dark-brown)}
.sf .cellinput:focus{outline:none;border-color:var(--teal)}
.sf .addrow{background:none;border:1px dashed var(--field);border-radius:7px;padding:5px 11px;
    font:inherit;font-size:11.5px;font-weight:600;color:var(--muted);cursor:pointer;margin-top:6px}
.sf .addrow:hover{border-color:var(--teal);color:var(--teal);background:#fff}
`

// ── Small editable building blocks ────────────────────────────────────────
function TextField({ label, value, onChange, type = 'text', variant }) {
  return (
    <div className="frow">
      <label>{label}:</label>
      <input
        type={type}
        className={variant === 'highlight' ? 'highlight' : undefined}
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
      />
    </div>
  )
}

/* Derived values — age, time at Crania. Given the same grey treatment
   the other detail pages use for a read-only field, so it is obvious at
   a glance which boxes you can type in. */
function ReadOnlyField({ label, value }) {
  return (
    <div className="frow">
      <label>{label}:</label>
      <div className="ro">{value || '—'}</div>
    </div>
  )
}

// ── Generic repeating-rows table ──────────────────────────────────────────
function RowsEditor({ columns, rows, onChange, addLabel = '+ Add row' }) {
  const setCell = (i, key, val) => onChange(rows.map((r, ri) => ri === i ? { ...r, [key]: val } : r))
  const remove = (i) => onChange(rows.filter((_, ri) => ri !== i))
  const add = () => onChange([...rows, columns.reduce((acc, c) => ({ ...acc, [c.key]: c.type === 'check' ? false : '' }), {})])
  /* minmax(0,…) rather than 1fr: a plain 1fr refuses to shrink below its
     content, so the fixed date columns shoved the delete button out past
     the edge of the section. */
  const grid = columns.map(c => c.width || 'minmax(0,1fr)').join(' ') + ' 24px'
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: grid, gap: 4, fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.3px',
        textTransform: 'uppercase', marginBottom: 5,
      }}>
        {columns.map(c => <div key={c.key}>{c.label}</div>)}
        <div></div>
      </div>
      {rows.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4 }}>No rows yet.</div>
      )}
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, gap: 4, marginBottom: 4, alignItems: 'center' }}>
          {columns.map(c => (
            <div key={c.key}>
              {c.type === 'check' ? (
                <input type="checkbox" checked={!!row[c.key]} onChange={e => setCell(i, c.key, e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--logo-teal)' }} />
              ) : (
                <input type={c.type === 'date' ? 'date' : 'text'} value={row[c.key] || ''}
                  onChange={e => setCell(i, c.key, e.target.value)} placeholder={c.placeholder || ''}
                  className="cellinput" />
              )}
            </div>
          ))}
          <button onClick={() => remove(i)} title="Remove"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0 }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={add}
        className="addrow">
        {addLabel}
      </button>
    </div>
  )
}

// ── Availability table ────────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
function AvailabilityEditor({ value, onChange }) {
  const v = value || {}
  const set = (day, key, val) => onChange({ ...v, [day]: { ...(v[day] || {}), [key]: val } })
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 4,
        fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.3px',
        textTransform: 'uppercase', marginBottom: 5,
      }}>
        <div></div><div>From</div><div>To</div>
      </div>
      {DAYS.map(day => (
        <div key={day} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--ink)' }}>{day}</div>
          <input type="time" value={(v[day] && v[day].from) || ''} onChange={e => set(day, 'from', e.target.value)}
            className="cellinput" />
          <input type="time" value={(v[day] && v[day].to) || ''} onChange={e => set(day, 'to', e.target.value)}
            className="cellinput" />
        </div>
      ))}
    </div>
  )
}

// ── Documents list ────────────────────────────────────────────────────────
const DOCUMENTS = [
  'Current Resume',
  'Vulnerable Sector Check',
  'First Aid Certificate (if certified/requested)',
  'Transcript (if in school within the past year)',
  'Sample of Work (if requested)',
  'Tax Forms (Federal & Provincial)',
  'Direct Deposit Form',
  'Signed Contract',
]
const missingDocs = (s) => {
  const v = s.documents || {}
  return DOCUMENTS.filter(d => !v[d]).length
}

function DocumentsEditor({ value, onChange }) {
  const v = value || {}
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 90px', gap: 4,
        fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.3px',
        textTransform: 'uppercase', marginBottom: 6,
      }}>
        <div></div><div style={{ textAlign: 'center' }}>In Dropbox</div>
      </div>
      {DOCUMENTS.map(doc => (
        <div key={doc} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 12 }}>{doc}</div>
          <div style={{ textAlign: 'center' }}>
            <input type="checkbox" checked={!!v[doc]} onChange={e => onChange({ ...v, [doc]: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--logo-teal)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Address fields ────────────────────────────────────────────────────────
// No heading of its own — the Section around it supplies that, so an
// address looks like every other group instead of a panel inside a panel.
function AddressFields({ value, onChange }) {
  const v = value || {}
  const set = (k, val) => onChange({ ...v, [k]: val })
  return (
    <>
      <TextField label="Street" value={v.street} onChange={x => set('street', x)} />
      <TextField label="Unit" value={v.unit} onChange={x => set('unit', x)} />
      <TextField label="City" value={v.city} onChange={x => set('city', x)} />
      <TextField label="Province" value={v.province} onChange={x => set('province', x)} />
      <TextField label="Postal Code" value={v.postalCode} onChange={x => set('postalCode', x)} />
      <TextField label="Country" value={v.country} onChange={x => set('country', x)} />
    </>
  )
}

/* One section of the form. The heading is a ruled caption of fixed
   height, so headings sitting in the same grid row still line up — but
   it reads as a label on the fields below rather than a coloured slab
   competing with them. `span` widens a section that needs the room (the
   availability table, the six-column references list). */
function Section({ title, hint, count, countShort, span, children }) {
  return (
    <section className={span === 2 ? 'wide' : undefined}>
      <div className="sec-h">
        <span>{title}</span>
        {count && <span className={'cnt' + (countShort ? ' short' : '')}>{count}</span>}
      </div>
      {hint && <div className="sechint">{hint}</div>}
      {children}
    </section>
  )
}

// ── Staff list ────────────────────────────────────────────────────────────
function StaffList({
  onSelect, onAdd, onDuplicate, onDelete, onBulkDelete,
  onUndo, onRedo, histBusy, histNote, undoLabel, redoLabel,
}) {
  const { staff, status: fetchStatus, refreshStaff } = useStore()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [soonOnly, setSoonOnly] = useState(false)
  const [docsOnly, setDocsOnly] = useState(false)
  const [colFilters, setColFilters] = useState({})
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

  const onSort = (k) => setSort(s => (s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 }))

  const allRows = useMemo(() => staff.map(s => ({
    id: s.id, record: s,
    staffId: s.staffId || '',
    name: fullName(s),
    role: s.role || '',
    phone: s.phoneMobile || s.phone || s.phoneHome || '',
    email: s.email || '',
    startDate: s.startDate || '',
    tenure: timeWithCompany(s.startDate),
    status: s.active === false ? 'Inactive' : 'Active',
    inactive: s.active === false,
    soon: startsInFuture(s.startDate),
    missing: missingDocs(s),
  })), [staff])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = allRows.filter(r => {
      if (!showInactive && r.inactive) return false
      if (soonOnly && !r.soon) return false
      if (docsOnly && r.missing === 0) return false
      for (const [k, want] of Object.entries(colFilters)) {
        if (!want) continue
        if (String(r[k] ?? '') !== want) return false
      }
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q)
        || r.email.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q)
        || r.staffId.toLowerCase().includes(q)
    })
    const val = (r) => String(r[sort.key] || '').toLowerCase()
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -sort.dir
      if (av > bv) return sort.dir
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [allRows, search, showInactive, soonOnly, docsOnly, colFilters, sort])

  const metrics = useMemo(() => ({
    total: allRows.length,
    active: allRows.filter(r => !r.inactive).length,
    soon: allRows.filter(r => r.soon).length,
    docs: allRows.filter(r => r.missing > 0).length,
  }), [allRows])

  const filterOptions = useMemo(() => {
    const out = {}
    for (const c of COLS) {
      const vals = new Set()
      for (const r of allRows) if (r[c.k]) vals.add(String(r[c.k]))
      out[c.k] = [...vals].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    }
    return out
  }, [allRows])

  const anyFilterActive = !!search || showInactive || soonOnly || docsOnly
    || Object.values(colFilters).some(Boolean)
  const clearAllFilters = () => {
    setSearch(''); setShowInactive(false); setSoonOnly(false); setDocsOnly(false); setColFilters({})
  }

  const allSel = visible.length > 0 && visible.every(r => selected.has(r.id))
  const selectedRows = useMemo(() => visible.filter(r => selected.has(r.id)), [visible, selected])

  useEffect(() => {
    if (!pop) return
    const onDown = e => { if (popRef.current && !popRef.current.contains(e.target)) setPop(null) }
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDown) }
  }, [pop])

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
    a.download = `crania-staff-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const arrow = (k) => (sort.key === k ? <span className="arw">{sort.dir === 1 ? '▲' : '▼'}</span> : null)

  return (
    <div className="page sf" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      <PageActions
        onUndo={onUndo} onRedo={onRedo} undoLabel={undoLabel} redoLabel={redoLabel}
        histBusy={histBusy} histNote={histNote}
        csvName="crania-staff"
        csvColumns={COLS.map(c => ({ key: c.k, label: c.l }))}
        csvRows={() => allRows}
        backupBase="staff"
        backupHint="Snapshots of every staff record, saved to the database (last 14 kept)."
        onRestored={refreshStaff}
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
          </>
        )}
      >
        <button className="sf-add" title="Add a new staff member" onClick={onAdd}>
          <UserPlus size={13} /> Add Staff
        </button>
      </PageActions>

      {fetchStatus === 'offline' && (
        <div className="offline">Working offline — showing cached data.</div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="label">Staff</div><div className="value">{metrics.total}</div>
          <div className="hint">on the books</div>
        </div>
        <div className="metric mact">
          <div className="label">Active</div><div className="value">{metrics.active}</div>
          <div className="hint">currently employed</div>
        </div>
        <div className={'metric msoon clickable' + (soonOnly ? ' on' : '')}
          title="Click to show only staff who have not started yet"
          onClick={() => setSoonOnly(v => !v)}>
          <div className="label">Starting Soon</div><div className="value">{metrics.soon}</div>
          <div className="hint">start date still ahead</div>
        </div>
        <div className={'metric mdoc clickable' + (docsOnly ? ' on' : '')}
          title="Click to show only staff with paperwork missing"
          onClick={() => setDocsOnly(v => !v)}>
          <div className="label">Documents Outstanding</div><div className="value">{metrics.docs}</div>
          <div className="hint">paperwork not all in</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, role, email, phone or ID…" autoComplete="off" />
        <label className="toggle" title="Staff marked as no longer employed">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <span className="n">{selected.size} selected</span>
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <button className="exp" onClick={() => exportCsv(selectedRows)}>Export Selected</button>
            <button className="del" onClick={async () => {
              const ok = await onBulkDelete(selectedRows.map(r => r.record))
              if (ok) setSelected(new Set())
            }}>Delete Selected</button>
            <button className="clr" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </span>
        </div>
      )}

      <div className="card">
        {allRows.length === 0 ? (
          <div className="empty"><b>No staff yet.</b><br />Click “Add Staff” to create the first record.</div>
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
              {/* Not `frow` — that name belongs to the detail field rows and
                  sets display:grid, which takes the row out of table layout
                  and breaks every column width. */}
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
                  <tr key={r.id}
                    className={(isSel ? 'sel ' : '') + (r.inactive ? 'rinactive' : '')}
                    title="Click to open this staff member; right-click for more"
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
                      if (k === 'staffId') {
                        content = r.staffId ? <span className="sref">{r.staffId}</span> : <span className="dash">—</span>
                      } else if (k === 'name') {
                        content = <span className="sname">{r.name || <span className="dash">Unnamed</span>}</span>
                      } else if (k === 'status') {
                        content = <span className={'tag ' + (r.inactive ? 'off' : 'ok')}>{r.status}</span>
                      } else {
                        content = r[k] === '' || r[k] == null ? <span className="dash">—</span> : r[k]
                      }
                      return (
                        <td key={k} className={`col-${k}${c.cls ? ' ' + c.cls : ''}`}
                          title={String(r[k] ?? '')}>{content}</td>
                      )
                    })}
                    <td className="actcell" onClick={e => e.stopPropagation()}>
                      <button className="rowbtn" title="Open and edit"
                        onClick={() => onSelect(r.id)}><Pencil size={12} /></button>
                      <button className="rowbtn" title="Duplicate this staff member"
                        onClick={() => onDuplicate(r.record)}><Copy size={12} /></button>
                      <button className="rowbtn rb-del" title="Delete this staff member"
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
          { label: 'Open Staff Member', on: () => onSelect(rowCtx.row.id) },
          { label: 'Duplicate', on: () => onDuplicate(rowCtx.row.record) },
          { label: 'Export This Staff Member', on: () => exportCsv([rowCtx.row]) },
          { sep: true },
          { label: 'Delete Staff Member', danger: true, on: () => onDelete(rowCtx.row.record) },
        ]} />
      )}
    </div>
  )
}

// ── Staff detail (the full form) ──────────────────────────────────────────
function StaffDetail({ staffId, onBack, onDelete }) {
  const { staff, updateStaffField, programs } = useStore()
  const record = staff.find(s => s.id === staffId)
  const [local, setLocal] = useState(record || {})
  const saveTimers = useRef({})

  useEffect(() => { if (record) setLocal(record) }, [staffId])   // eslint-disable-line react-hooks/exhaustive-deps

  // Any pending debounced write has to land even if the form unmounts first.
  useEffect(() => () => {
    for (const t of Object.values(saveTimers.current)) clearTimeout(t)
  }, [])

  if (!record) {
    return (
      <div className="page sf">
        <style>{CSS}</style>
        <button className="backbtn" onClick={onBack}>← All Staff</button>
        <div style={{ padding: 24, color: 'var(--muted)' }}>Staff member not found.</div>
      </div>
    )
  }

  // Debounced field setter — instant local update, throttled API push.
  const setField = (key, val) => {
    setLocal(prev => ({ ...prev, [key]: val }))
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => updateStaffField(staffId, key, val), 400)
  }

  // Programs taught — offerings on the live programs list whose teacher
  // matches this staff member's full name.
  const name = fullName(local)
  const taughtPrograms = (() => {
    if (!name) return []
    const out = []
    ;(programs || []).forEach(p => {
      const matching = (p.offerings || []).filter(o => o.teacher === name && o.active)
      if (matching.length) {
        out.push({
          title: p.title,
          location: p.location,
          slots: matching.map(o => `${o.day} ${String(o.start || '').slice(0, 5)}`).join(', '),
        })
      }
    })
    return out
  })()

  return (
    <div className="page sf" style={{ paddingBottom: 24 }}>
      <style>{CSS}</style>
      <button className="backbtn" onClick={onBack}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        All Staff
      </button>

      <div className="detailhead">
        <h2 className="page-title" style={{ marginTop: 0, marginBottom: 0 }}>
          {name || 'New staff member'}
        </h2>
        {local.staffId && <span className="idchip">{local.staffId}</span>}
        <label className="toggle" style={{ marginLeft: 'auto' }} title="Uncheck when someone leaves">
          <input type="checkbox" checked={local.active !== false}
            onChange={e => setField('active', e.target.checked)} />
          Active
        </label>
        <button className="delbtn" onClick={() => onDelete(record)}>Delete</button>
      </div>

      {/* One grid rather than three stacked columns. Each section is a
          grid item, so every heading in a row starts at the same height
          — which is what the three independent columns could never do,
          because each one drifted by however tall its own contents
          happened to be. Sections are ordered across the row, so the
          things you read together sit together. */}
      <div className="formgroups">
        <div className="fgroup">
          <div className="fghead">
            <h3>Personal</h3>
            <span>Who they are and how to reach them.</span>
          </div>
          <div className="panels">
          <Section title="Staff Name">
            <TextField label="First Name" value={local.firstName} onChange={v => setField('firstName', v)} />
            <TextField label="Middle Name" value={local.middleName} onChange={v => setField('middleName', v)} />
            <TextField label="Last Name" value={local.lastName} onChange={v => setField('lastName', v)} />
          </Section>
          <Section title="Date of Birth">
            <TextField label="DOB" value={local.dob} type="date" onChange={v => setField('dob', v)} />
            <ReadOnlyField label="Current Age" value={ageFromDob(local.dob) ? `${ageFromDob(local.dob)} years` : ''} />
          </Section>
          <Section title="Gender">
            <TextField label="Gender" value={local.gender} onChange={v => setField('gender', v)} />
          </Section>
          <Section title="Contact">
            <TextField label="Home" value={local.phoneHome} onChange={v => setField('phoneHome', v)} />
            <TextField label="Mobile" value={local.phoneMobile} onChange={v => setField('phoneMobile', v)} />
            <TextField label="Email" value={local.email} type="email" onChange={v => setField('email', v)} />
          </Section>
          <Section title="Current Address">
            <AddressFields value={local.currentAddress} onChange={v => setField('currentAddress', v)} />
          </Section>
          <Section title="Permanent Address">
            <AddressFields value={local.permanentAddress} onChange={v => setField('permanentAddress', v)} />
          </Section>
          </div>
        </div>
        <div className="fgroup">
          <div className="fghead">
            <h3>Employment</h3>
            <span>Terms, pay and payroll details.</span>
          </div>
          <div className="panels">
          <Section title="Start Date">
            <TextField label="Start Date" value={local.startDate} type="date" onChange={v => setField('startDate', v)} />
            <ReadOnlyField label="Time at Crania" value={timeWithCompany(local.startDate)} />
          </Section>
          <Section title="Compensation">
            <TextField label="Rate / Hour" value={local.ratePerHour} variant="highlight"
              onChange={v => setField('ratePerHour', v)} />
            <TextField label="Role" value={local.role} onChange={v => setField('role', v)} />
          </Section>
          <Section title="SIN Number" hint="Kept for payroll. Visible to admins only.">
            <TextField label="SIN" value={local.sin} onChange={v => setField('sin', v)} />
          </Section>
          </div>
        </div>
        <div className="fgroup">
          <div className="fghead">
            <h3>Qualifications</h3>
            <span>What they can teach, and when they can teach it.</span>
          </div>
          <div className="panels">
          <Section title="Availability" span={2}>
            <AvailabilityEditor value={local.availability} onChange={v => setField('availability', v)} />
          </Section>
          <Section title="Education" span={2}>
            <RowsEditor
              columns={[
                { key: 'degree', label: 'Degree' },
                { key: 'institution', label: 'Institution' },
                { key: 'from', label: 'From', width: '104px', type: 'date' },
                { key: 'to', label: 'To', width: '104px', type: 'date' },
              ]}
              rows={local.education || []}
              onChange={v => setField('education', v)}
              addLabel="+ Add qualification"
            />
          </Section>
          <Section title="Work Experience" span={2}>
            <RowsEditor
              columns={[
                { key: 'title', label: 'Title' },
                { key: 'organization', label: 'Organization' },
                { key: 'from', label: 'From', width: '104px', type: 'date' },
                { key: 'to', label: 'To', width: '104px', type: 'date' },
              ]}
              rows={local.workExperience || []}
              onChange={v => setField('workExperience', v)}
              addLabel="+ Add role"
            />
          </Section>
          <Section title="Teachables" span={2}>
            <RowsEditor
              columns={[
                { key: 'subject', label: 'Subject' },
                { key: 'comfort', label: 'Comfort 1-5', width: '78px' },
                { key: 'gradeRange', label: 'Grades', width: '78px' },
                { key: 'years', label: 'Years', width: '62px' },
              ]}
              rows={local.teachables || []}
              onChange={v => setField('teachables', v)}
              addLabel="+ Add subject"
            />
          </Section>
          <Section title="Programs" hint="Set on the Programs page.">
            {taughtPrograms.length === 0 ? (
              <div className="emptynote">No programs assigned yet.</div>
            ) : (
              taughtPrograms.map((p, i) => (
                <div key={i} className="progpill">
                  <div className="t">{p.title}</div>
                  <div className="s">{p.location} · {p.slots}</div>
                </div>
              ))
            )}
          </Section>
          </div>
        </div>
        <div className="fgroup">
          <div className="fghead">
            <h3>Records</h3>
            <span>Paperwork, keys and people to call.</span>
          </div>
          <div className="panels">
          <Section title="Emergency Contact">
            <TextField label="First Name" value={local.emergencyFirstName} onChange={v => setField('emergencyFirstName', v)} />
            <TextField label="Last Name" value={local.emergencyLastName} onChange={v => setField('emergencyLastName', v)} />
            <TextField label="Phone" value={local.emergencyPhone} onChange={v => setField('emergencyPhone', v)} />
            <TextField label="Email" value={local.emergencyEmail} type="email" onChange={v => setField('emergencyEmail', v)} />
          </Section>
          <Section title="Concerns" hint="Optional.">
            <TextField label="Health" value={local.healthConcerns} onChange={v => setField('healthConcerns', v)} />
            <TextField label="Other" value={local.otherConcerns} onChange={v => setField('otherConcerns', v)} />
          </Section>
          <Section title="Documents Required" count={`${DOCUMENTS.length - missingDocs(local)}/${DOCUMENTS.length}`} countShort={missingDocs(local) > 0}>
            <DocumentsEditor value={local.documents} onChange={v => setField('documents', v)} />
          </Section>
          <Section title="Keys" span={2}>
            <RowsEditor
              columns={[
                { key: 'description', label: 'Description' },
                { key: 'dateOut', label: 'Out', width: '104px', type: 'date' },
                { key: 'dateIn', label: 'In', width: '104px', type: 'date' },
                { key: 'formSigned', label: 'Signed', width: '54px', type: 'check' },
              ]}
              rows={local.keys || []}
              onChange={v => setField('keys', v)}
              addLabel="+ Add key"
            />
          </Section>
          <Section title="References" span={2}
            hint={(local.references || []).length < 2 ? 'Two are required.' : undefined}>
            <RowsEditor
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'title', label: 'Title' },
                { key: 'organization', label: 'Organization' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
                { key: 'relationship', label: 'Relationship' },
              ]}
              rows={local.references || []}
              onChange={v => setField('references', v)}
              addLabel="+ Add reference"
            />
          </Section>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function StaffInformation() {
  const { staff, addStaff, deleteStaff, updateStaffField } = useStore()
  const [detailId, setDetailId] = useState(null)
  const { confirm, node: dialogNode } = useConfirm()

  /* updateStaffField takes (id, key, value); passing it straight in wrote a
     field named after the reference instead of setting staffId. */
  const assignStaffId = useCallback(
    (id, ref) => updateStaffField(id, 'staffId', ref), [updateStaffField])
  useStaffIds(staff, assignStaffId)

  /* Whole-record history: add, duplicate and delete. Field edits inside the
     form are not on this stack — the browser's own undo covers those. A
     delete is undone by putting the record back with its original id, so it
     returns as itself rather than as a copy. */
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [histBusy, setHistBusy] = useState(false)
  const [histNote, setHistNote] = useState('')

  useEffect(() => {
    if (!histNote) return
    const t = setTimeout(() => setHistNote(''), 6000)
    return () => clearTimeout(t)
  }, [histNote])

  const staffRefLive = useRef(staff)
  staffRefLive.current = staff

  const pushHistory = useCallback((entry) => {
    setUndoStack(s => [...s.slice(-19), entry])
    setRedoStack([])
  }, [])

  // Undoing an add reads the record as it stands now, not as it was created
  // — it may have been filled in since.
  const historyForCreate = (id, label) => {
    let snap = null
    return {
      label,
      undo: async () => {
        const live = staffRefLive.current.find(s => s.id === id)
        if (live) snap = JSON.parse(JSON.stringify(live))
        await deleteStaff(id)
        setDetailId(d => (d === id ? null : d))
      },
      redo: async () => { if (snap) await addStaff(snap) },
    }
  }

  const historyForDelete = (records, label) => {
    const snaps = records.map(r => JSON.parse(JSON.stringify(r)))
    return {
      label,
      undo: async () => { for (const s of snaps) await addStaff(s) },
      redo: async () => { for (const s of snaps) await deleteStaff(s.id) },
    }
  }

  /* A ref, not the state flag: two keypresses in the same tick would both
     read the old state and both run, stepping twice through the stack. */
  const histRunning = useRef(false)

  const runHistory = useCallback(async (from, setFrom, setTo, dir) => {
    const entry = from[from.length - 1]
    if (!entry || histRunning.current) return
    histRunning.current = true
    setHistBusy(true)
    try {
      await (dir === 'undo' ? entry.undo() : entry.redo())
      setFrom(s => s.slice(0, -1))
      setTo(s => [...s.slice(-19), entry])
      setHistNote(`${dir === 'undo' ? 'Undid' : 'Redid'}: ${entry.label}`)
    } catch (err) {
      setHistNote(`Could not ${dir}: ${String(err.message || err)}`)
    }
    histRunning.current = false
    setHistBusy(false)
  }, [])

  const doUndo = useCallback(() => runHistory(undoStack, setUndoStack, setRedoStack, 'undo'), [runHistory, undoStack])
  const doRedo = useCallback(() => runHistory(redoStack, setRedoStack, setUndoStack, 'redo'), [runHistory, redoStack])

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || detailId) return
      // Never while typing, and never on auto-repeat: one press, one step.
      if (e.repeat || inEditableField(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo() }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doUndo, doRedo, detailId])

  const handleAdd = async () => {
    const id = await addStaff({})
    if (id) { setDetailId(id); pushHistory(historyForCreate(id, 'Add staff')) }
  }

  /* Everything except what has to be unique to a person: their staff ID,
     their SIN, and the day they started. */
  const handleDuplicate = async (record) => {
    const { id, staffId, sin, startDate, ...rest } = record   // eslint-disable-line no-unused-vars
    const newId = await addStaff({ ...rest, sin: '', startDate: '' })
    if (newId) pushHistory(historyForCreate(newId, 'Duplicate staff'))
  }

  const handleDelete = async (record) => {
    const who = fullName(record) || 'this staff member'
    const ok = await confirm(
      `Delete ${who}? Their whole record goes, including documents, references and keys.`,
      { title: 'Delete staff member' })
    if (!ok) return
    pushHistory(historyForDelete([record], `Delete ${who}`))
    await deleteStaff(record.id)
    setDetailId(d => (d === record.id ? null : d))
  }

  const handleBulkDelete = async (records) => {
    if (!records.length) return false
    const n = records.length
    const ok = await confirm(
      `Delete ${n} staff member${n === 1 ? '' : 's'}? Their whole records go, including documents, references and keys.`,
      { title: 'Delete staff' })
    if (!ok) return false
    pushHistory(historyForDelete(records, `Delete ${n} staff member${n === 1 ? '' : 's'}`))
    for (const r of records) await deleteStaff(r.id)
    return true
  }

  return (
    <>
      {detailId ? (
        <StaffDetail staffId={detailId} onBack={() => setDetailId(null)} onDelete={handleDelete} />
      ) : (
        <StaffList
          onSelect={setDetailId}
          onAdd={handleAdd}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onBulkDelete={handleBulkDelete}
          onUndo={doUndo} onRedo={doRedo} histBusy={histBusy} histNote={histNote}
          undoLabel={undoStack.length ? undoStack[undoStack.length - 1].label : ''}
          redoLabel={redoStack.length ? redoStack[redoStack.length - 1].label : ''}
        />
      )}
      {dialogNode}
    </>
  )
}
