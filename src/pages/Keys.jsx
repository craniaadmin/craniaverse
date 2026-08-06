// Keys — who holds which key, when it went out, whether it came back, and
// whether the form was signed.
//
// There is no separate storage for this. Every staff record already carries
// a `keys` array, edited person by person in the Staff detail form; this is
// that same data laid out the other way round — one row per key across
// everybody, which is the way the question is actually asked. Nobody wants
// to know which keys Rob has. They want to know who has the back door key,
// and who is still holding one they should have handed back.
//
// Edits write straight back through updateStaffField(id, 'keys', next), so
// a change here shows on that person's own page immediately and vice versa
// — there is only ever one copy.
//
// Same table idiom as Logins and Staff: scoped CSS, the teal header, metric
// tiles that double as filters, a filter row under every heading, sortable
// draggable columns, and the shared action bar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Plus } from 'lucide-react'
import { useStore } from '../data/store'
import { ColsPop, CtxMenu, TABLECHROME_CSS } from '../components/TableChrome'
import PageActions from '../components/PageActions'
import useActionHistory from '../data/useActionHistory'

const COLS = [
  { k: 'staffId', l: 'Staff ID' },
  { k: 'name',    l: 'Staff Name' },   // never hideable — it names the row
  { k: 'key',     l: 'Key' },
  { k: 'dateOut', l: 'Date Out', cls: 'center' },
  { k: 'dateIn',  l: 'Date In',  cls: 'center' },
  { k: 'signed',  l: 'Signed',   cls: 'center' },
  { k: 'status',  l: 'Status',   cls: 'center' },
]
const LOCKED_COL = 'name'

const COL_W = {
  staffId: '10%', name: '20%', key: '26%',
  dateOut: '12%', dateIn: '12%', signed: '9%', status: '11%',
}

const CPREF_KEY = 'keys-cols'
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

const fullName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim()
const todayISO = () => new Date().toISOString().slice(0, 10)

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/* How long a key has been out, for the ones that have not come back. A date
   on its own does not say "this has been out for two years"; this does. */
function daysOut(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
}

const CSS = TABLECHROME_CSS + `
.ky{position:relative;--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;
    --dark-brown:#2E2516;--line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;
    --danger:#C0392B;--good:#2b7a2e;--shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}

.ky .offline{background:#fffbf0;border:1px solid #f4d67a;color:#8a6a00;padding:8px 12px;
    border-radius:8px;margin-bottom:12px;font-size:13px}

.ky .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.ky .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.ky .metric.clickable{cursor:pointer}
.ky .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.ky .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.ky .metric.mout{border-bottom-color:var(--light-blue)}
.ky .metric.msign{border-bottom-color:var(--danger)}
.ky .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.ky .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.ky .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.ky .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.ky .filters input[type=search]{padding:7px 12px;border:1px solid var(--field);border-radius:8px;
    font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit;width:280px}
.ky .filters input[type=search]:focus{outline:none;border-color:var(--teal)}
.ky .filters input[type=search]::placeholder{color:var(--faint)}
.ky .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.ky .clearf:hover{background:#f1f5f4}
.ky .hinttext{font-size:11.5px;color:var(--muted);font-style:italic}

.ky .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.ky .card > table{width:100%;min-width:840px;table-layout:fixed;border-collapse:separate;
    border-spacing:5px 5px;background:#fff}
.ky thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
.ky thead th.colh .lbl{display:block;text-align:center;padding:0 6px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ky thead th.colh.sorted .lbl{padding-right:20px}
.ky thead th.colh{cursor:grab}
.ky thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1;
    background:var(--teal);padding-left:4px;border-radius:3px}
.ky thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.ky thead th.colh:hover .eye{opacity:1}
.ky thead th .arw{opacity:.85;font-size:10px}
.ky thead th .sortable{cursor:pointer}
.ky thead tr.colfrow th{background:#eaf3f2;padding:5px 6px;border-radius:0}
.ky thead tr.colfrow th:empty{background:transparent}
.ky .colf{width:100%;background:#fff;border:1px solid var(--field);border-radius:7px;padding:4px 6px;
    font-size:11.5px;color:var(--dark-brown);font-weight:600;cursor:pointer;font-family:inherit}
.ky .colf.on{background:var(--light-blue);border-color:var(--light-blue)}

.ky tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:26px;overflow:hidden;text-overflow:ellipsis}
.ky tbody td.center{text-align:center}
.ky tbody td.editable{cursor:text}
.ky tbody tr:hover td{background:#E4EFF3}
/* A key that is out and whose form was never signed is the one row on this
   page that is a problem rather than a fact, so it says so. */
.ky tbody tr.runsigned td{background:#FBF3CE}
.ky .sref{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--muted);font-weight:600}
.ky .sname{font-weight:700;color:#3d7f7d}
.ky .dash{color:var(--faint)}
.ky .tag{display:inline-block;border-radius:5px;padding:1px 8px;font-size:11px;font-weight:700}
.ky .tag.out{background:#E4EFF3;color:#1c6ea4}
.ky .tag.back{background:#DEF2DE;color:var(--good)}
.ky .ago{color:var(--muted);font-size:11px;margin-left:5px}
.ky .sigbox{width:13px;height:13px;margin:0;accent-color:var(--teal);cursor:pointer;vertical-align:middle}
.ky .empty{text-align:center;color:var(--muted);padding:60px 20px}
.ky .empty b{color:var(--dark-brown)}
.ky .tcount{text-align:right;font-size:11.5px;color:var(--muted);padding:7px 2px 0}

/* ── inline edit ── */
.ky td.editable:hover{outline:1px dashed #b9c6c5;outline-offset:-1px}
.ky .celledit{display:block}
.ky .celledit input{width:100%;box-sizing:border-box;padding:1px 5px;border:1px solid var(--teal);
    border-radius:4px;background:#fff;color:var(--dark-brown);font:inherit;font-size:12px;outline:none}

/* ── add dialog ── */
.kyov{position:fixed;inset:0;background:rgba(46,37,22,.35);z-index:400;
    display:flex;align-items:center;justify-content:center;padding:20px}
.kymodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(46,37,22,.3);
    padding:18px 20px 20px;width:100%;max-width:440px;color:#2E2516}
.kymodal h2{margin:0 0 14px;font-size:16px}
.kymodal label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;
    color:#6B6455;text-transform:uppercase;letter-spacing:.3px;margin-bottom:11px}
.kymodal input,.kymodal select{padding:7px 10px;border:1px solid #D5D0C4;border-radius:8px;
    font:inherit;font-size:13px;background:#fff;color:#2E2516}
.kymodal input:focus,.kymodal select:focus{outline:none;border-color:#5FA09E}
.kymodal .check{flex-direction:row;align-items:center;gap:7px;text-transform:none;
    font-size:12.5px;letter-spacing:0}
.kymodal .check input{width:15px;height:15px;accent-color:#5FA09E;margin:0}
.kymodal .macts{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.kymodal .macts button{border-radius:8px;padding:8px 15px;font:inherit;font-size:12.5px;
    font-weight:700;cursor:pointer;border:none}
.kymodal .macts .go{background:#5FA09E;color:#fff}
.kymodal .macts .go:disabled{background:#cbd1d6;cursor:default}
.kymodal .macts .cancel{background:#F1F3F4;border:1px solid #D5D0C4;color:#2E2516}
`

/* Enter or clicking away saves, Escape abandons — the same box the Logins
   page uses, so an editable cell behaves the same wherever you meet one. */
function CellEdit({ value, type, onCommit, onCancel }) {
  const [v, setV] = useState(value ?? '')
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; if (el) { el.focus(); if (type !== 'date') el.select() } }, [type])
  return (
    <span className="celledit">
      <input ref={ref} type={type || 'text'} value={v} spellCheck={false} autoComplete="off"
        onChange={e => setV(e.target.value)}
        onMouseDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        onBlur={() => onCommit(v)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit(v) }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }} />
    </span>
  )
}

function AddKeyDialog({ staff, onClose, onSave }) {
  const [staffId, setStaffId] = useState(staff[0]?.id || '')
  const [description, setDescription] = useState('')
  const [dateOut, setDateOut] = useState(todayISO())
  const [formSigned, setFormSigned] = useState(false)
  const can = staffId && description.trim()
  return (
    <div className="kyov" onMouseDown={onClose}>
      <div className="kymodal" onMouseDown={e => e.stopPropagation()}>
        <h2>Log a key</h2>
        <label>
          Staff member
          <select value={staffId} onChange={e => setStaffId(e.target.value)}>
            {staff.map(s => (
              <option key={s.id} value={s.id}>
                {fullName(s) || 'Unnamed'}{s.staffId ? ` · ${s.staffId}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Key
          <input value={description} autoFocus placeholder="e.g. Front door"
            onChange={e => setDescription(e.target.value)} />
        </label>
        <label>
          Date out
          <input type="date" value={dateOut} onChange={e => setDateOut(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={formSigned} onChange={e => setFormSigned(e.target.checked)} />
          Form signed
        </label>
        <div className="macts">
          <button type="button" className="cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="go" disabled={!can}
            onClick={() => onSave(staffId, {
              description: description.trim(), dateOut, dateIn: '', formSigned,
            })}>Log key</button>
        </div>
      </div>
    </div>
  )
}

export default function Keys({ onNavigate }) {
  const { staff, status: fetchStatus, updateStaffField, refreshStaff } = useStore()
  const [search, setSearch] = useState('')
  const [outOnly, setOutOnly] = useState(false)
  const [unsignedOnly, setUnsignedOnly] = useState(false)
  const [colFilters, setColFilters] = useState({})
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const [{ hiddenCols, colOrder }, setColPrefs] = useState(loadColPrefs)
  const [pop, setPop] = useState(null)
  const [rowCtx, setRowCtx] = useState(null)
  const [editing, setEditing] = useState(null)   // { rowId, field }
  const [adding, setAdding] = useState(false)
  const dragCol = useRef(null)
  const popRef = useRef(null)

  /* Undo/redo. A key lives inside one staff record's `keys` array and the
     only setter is updateStaffField, which replaces that array — so the step
     records the array before and after for that one person. Snapshotting the
     whole staff list would take everyone else's edits with it. */
  const hist = useActionHistory()
  const pushHist = hist.push
  const staffRef = useRef(staff)
  staffRef.current = staff

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

  /* One row per key, across everybody. A staff member with no keys
     contributes no rows — an empty row under someone's name would read as
     "holds a key with no description", which is a different and alarming
     thing from holding none. */
  const allRows = useMemo(() => {
    const out = []
    for (const s of staff) {
      const keys = Array.isArray(s.keys) ? s.keys : []
      keys.forEach((k, i) => {
        const returned = Boolean(k.dateIn)
        out.push({
          id: `${s.id}::${i}`,
          staffRecordId: s.id,
          index: i,
          staffId: s.staffId || '',
          name: fullName(s) || 'Unnamed',
          key: k.description || '',
          dateOut: k.dateOut || '',
          dateIn: k.dateIn || '',
          signed: k.formSigned ? 'Yes' : 'No',
          formSigned: Boolean(k.formSigned),
          status: returned ? 'Returned' : 'Out',
          returned,
          out: !returned,
          days: returned ? null : daysOut(k.dateOut),
        })
      })
    }
    return out
  }, [staff])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = allRows.filter(r => {
      if (outOnly && r.returned) return false
      if (unsignedOnly && r.formSigned) return false
      for (const [k, want] of Object.entries(colFilters)) {
        if (!want) continue
        if (String(r[k] ?? '') !== want) return false
      }
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.key.toLowerCase().includes(q)
        || r.staffId.toLowerCase().includes(q)
    })
    const val = (r) => {
      // Dates sort as ISO strings, which is chronological already.
      if (sort.key === 'dateOut' || sort.key === 'dateIn') return r[sort.key] || ''
      return String(r[sort.key] || '').toLowerCase()
    }
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -sort.dir
      if (av > bv) return sort.dir
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [allRows, search, outOnly, unsignedOnly, colFilters, sort])

  const metrics = useMemo(() => ({
    issued: allRows.length,
    out: allRows.filter(r => r.out).length,
    unsigned: allRows.filter(r => !r.formSigned).length,
    holders: new Set(allRows.map(r => r.staffRecordId)).size,
  }), [allRows])

  /* Only values actually present, so a filter never offers a dead end. */
  const filterOptions = useMemo(() => {
    const out = {}
    for (const c of COLS) {
      const vals = new Set()
      for (const r of allRows) if (r[c.k]) vals.add(String(r[c.k]))
      out[c.k] = [...vals].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    }
    return out
  }, [allRows])

  const anyFilterActive = !!search || outOnly || unsignedOnly || Object.values(colFilters).some(Boolean)
  const clearAllFilters = () => {
    setSearch(''); setOutOnly(false); setUnsignedOnly(false); setColFilters({})
  }

  /* Every write goes through here, so every write is undoable. The array is
     read live rather than from a render, because the same record can be
     edited from the Staff page at the same time. */
  const writeKeys = useCallback((staffRecordId, mut, label) => {
    const rec = staffRef.current.find(s => s.id === staffRecordId)
    if (!rec) return
    const before = JSON.parse(JSON.stringify(Array.isArray(rec.keys) ? rec.keys : []))
    const after = mut(JSON.parse(JSON.stringify(before)))
    if (!after || JSON.stringify(before) === JSON.stringify(after)) return
    updateStaffField(staffRecordId, 'keys', after)
    pushHist({
      label,
      undo: () => updateStaffField(staffRecordId, 'keys', before),
      redo: () => updateStaffField(staffRecordId, 'keys', after),
    })
  }, [updateStaffField, pushHist])

  const setField = (row, field, value) => {
    setEditing(null)
    writeKeys(row.staffRecordId,
      keys => keys.map((k, i) => (i === row.index ? { ...k, [field]: value } : k)),
      `${row.name} — ${row.key || 'key'}`)
  }

  const toggleSigned = (row) => setField(row, 'formSigned', !row.formSigned)

  const markReturned = (row) =>
    setField(row, 'dateIn', row.dateIn ? '' : todayISO())

  const removeKey = (row) =>
    writeKeys(row.staffRecordId,
      keys => keys.filter((_, i) => i !== row.index),
      `Remove ${row.key || 'key'} from ${row.name}`)

  const addKey = (staffRecordId, entry) => {
    setAdding(false)
    const who = staffRef.current.find(s => s.id === staffRecordId)
    writeKeys(staffRecordId, keys => [...keys, entry],
      `Log ${entry.description} to ${fullName(who) || 'staff'}`)
  }

  useEffect(() => {
    if (!pop) return undefined
    const onDown = e => { if (popRef.current && !popRef.current.contains(e.target)) setPop(null) }
    const id = setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => { clearTimeout(id); window.removeEventListener('mousedown', onDown) }
  }, [pop])

  const arrow = k => (sort.key === k ? <span className="arw">{sort.dir > 0 ? '▲' : '▼'}</span> : null)

  return (
    <div className="page ky" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      <PageActions
        {...hist}
        csvName="crania-keys"
        csvColumns={COLS.map(c => ({ key: c.k, label: c.l }))}
        csvRows={() => visible}
        backupCollection="staff"
        backupHint={'Keys are held on the staff records, so these are snapshots of every staff '
          + 'member — restoring one replaces them all (last 14 kept).'}
        onRestored={refreshStaff}
        settingsExtra={close => (
          <button title="Choose which columns are shown"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              close()
              setPop({ kind: 'cols', rect })
            }}><Eye size={13} /> Columns</button>
        )}
      >
        <button title="Log a key out to a staff member" disabled={!staff.length}
          onClick={() => setAdding(true)}><Plus size={13} /> Log a Key</button>
      </PageActions>

      {fetchStatus === 'offline' && (
        <div className="offline">Working offline — showing cached data.</div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="label">Keys Issued</div><div className="value">{metrics.issued}</div>
          <div className="hint">
            {metrics.holders} staff member{metrics.holders === 1 ? '' : 's'} on record
          </div>
        </div>
        <div className={'metric mout clickable' + (outOnly ? ' on' : '')}
          title="Click to show only keys that have not come back"
          onClick={() => setOutOnly(v => !v)}>
          <div className="label">Currently Out</div><div className="value">{metrics.out}</div>
          <div className="hint">no date in yet</div>
        </div>
        <div className={'metric msign clickable' + (unsignedOnly ? ' on' : '')}
          title="Click to show only keys with no signed form"
          onClick={() => setUnsignedOnly(v => !v)}>
          <div className="label">Unsigned</div>
          <div className="value" style={{ color: metrics.unsigned > 0 ? 'var(--danger)' : undefined }}>
            {metrics.unsigned}
          </div>
          <div className="hint">form not signed for</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search staff, key or ID…" autoComplete="off" />
        <span className="hinttext">
          Double-click a key, date out or date in to change it. Click the tick to sign.
        </span>
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
      </div>

      <div className="card">
        {allRows.length === 0 ? (
          <div className="empty">
            <b>No keys on record.</b><br />
            Keys appear here once one is logged out to a staff member — from this page,
            or from the Keys section of that person’s own page.
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <b>Nothing to show.</b><br />Your search or filter is too narrow.
            <div style={{ marginTop: 14 }}>
              <button className="clearf" onClick={clearAllFilters}>Clear All Filters</button>
            </div>
          </div>
        ) : (
          <table>
            <colgroup>
              {orderedCols.map(c => <col key={c.k} style={{ width: COL_W[c.k] }} />)}
            </colgroup>
            <thead>
              {/* Not `frow` — that name belongs to the detail field rows on
                  other pages and sets display:grid, which takes the row out
                  of table layout and breaks every column width. */}
              <tr className="colfrow">
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
              </tr>
              <tr>
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
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id}
                  className={r.out && !r.formSigned ? 'runsigned' : ''}
                  onContextMenu={e => { e.preventDefault(); setRowCtx({ x: e.clientX, y: e.clientY, row: r }) }}>
                  {orderedCols.map(c => {
                    const k = c.k
                    const on = editing && editing.rowId === r.id && editing.field === k
                    let content
                    if (k === 'staffId') {
                      content = r.staffId ? <span className="sref">{r.staffId}</span> : <span className="dash">—</span>
                    } else if (k === 'name') {
                      content = <span className="sname">{r.name}</span>
                    } else if (k === 'key') {
                      content = on
                        ? <CellEdit value={r.key} onCommit={v => setField(r, 'description', v.trim())}
                            onCancel={() => setEditing(null)} />
                        : (r.key || <span className="dash">—</span>)
                    } else if (k === 'dateOut' || k === 'dateIn') {
                      const field = k === 'dateOut' ? 'dateOut' : 'dateIn'
                      content = on
                        ? <CellEdit value={r[k]} type="date" onCommit={v => setField(r, field, v)}
                            onCancel={() => setEditing(null)} />
                        : r[k]
                          ? <>
                              {fmtDate(r[k])}
                              {k === 'dateOut' && r.days != null && r.days > 0 && (
                                <span className="ago">{r.days}d</span>
                              )}
                            </>
                          : <span className="dash">—</span>
                    } else if (k === 'signed') {
                      content = (
                        <input type="checkbox" className="sigbox" checked={r.formSigned}
                          title={r.formSigned ? 'Form signed — click to unsign' : 'Form not signed — click to sign'}
                          onChange={() => toggleSigned(r)} />
                      )
                    } else if (k === 'status') {
                      content = <span className={'tag ' + (r.returned ? 'back' : 'out')}>{r.status}</span>
                    } else {
                      content = r[k] || <span className="dash">—</span>
                    }
                    const editable = k === 'key' || k === 'dateOut' || k === 'dateIn'
                    return (
                      <td key={k}
                        className={`col-${k}${c.cls ? ' ' + c.cls : ''}${editable ? ' editable' : ''}`}
                        title={editable ? 'Double-click to change' : String(r[k] ?? '')}
                        onDoubleClick={editable ? () => setEditing({ rowId: r.id, field: k }) : undefined}>
                        {content}
                      </td>
                    )
                  })}
                </tr>
              ))}
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
          {
            label: rowCtx.row.returned ? 'Mark as still out' : 'Mark returned today',
            on: () => markReturned(rowCtx.row),
          },
          {
            label: rowCtx.row.formSigned ? 'Mark form unsigned' : 'Mark form signed',
            on: () => toggleSigned(rowCtx.row),
          },
          { label: 'Open in Staff', on: () => onNavigate && onNavigate(['staff', 'Staff'], rowCtx.row.staffRecordId) },
          { label: 'Remove This Key', danger: true, on: () => removeKey(rowCtx.row) },
        ]} />
      )}

      {adding && (
        <AddKeyDialog staff={staff} onClose={() => setAdding(false)} onSave={addKey} />
      )}
    </div>
  )
}
