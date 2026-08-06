// Emergency Contacts — a read-only view aggregated from the same server
// data as Customers/Students (useStore().records, backed by
// /api/registrations). Each registration carries a customer.emergency
// block; this page pulls those out, groups them by family (the same
// guardian1 identity the Customers page uses), and lists which students
// each contact covers.
//
// Rows are grouped by the contact rather than by the family, and the
// contact's own cells are blanked on repeats the way Programs blanks
// repeated values — one person who covers three families used to appear
// as three unrelated rows on a page whose first column is their name.
//
// Families with no contact on file are rows in the same table, tinted
// and gathered at the end, rather than a second differently-styled list
// below it. The "Missing" metric tile filters to them.
//
// There is no write path here. Editing lives on the Customers page;
// clicking a customer or student name jumps to their detail view.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildFamilyIndex } from '../data/family'
import BackupPanel, { BACKUP_CSS } from '../components/BackupPanel'
import { Phone, Mail, Eye, Download } from 'lucide-react'
import { useStore } from '../data/store'
import PageActions, { PAGEACTIONS_CSS } from '../components/PageActions'

const COLS = [
  { k: 'contact',      l: 'Emergency Contact' },  // never hideable — it names the row
  { k: 'relationship', l: 'Relationship' },
  { k: 'phone',        l: 'Phone' },
  { k: 'email',        l: 'Email' },
  { k: 'customer',     l: 'Customer' },
  { k: 'students',     l: 'Students' },
]
const LOCKED_COL = 'contact'

/* Proportions rather than pixels, summing to 100 — a fixed layout gives
   leftover space to any pixel column, starving the text ones on a wide
   screen. Sized so nothing is squeezed at the 900px min-width. */
const SEL_W = '3%'
const COL_W = {
  contact: '17%', relationship: '11%', phone: '12%',
  email: '20%', customer: '15%', students: '22%',
}

const CPREF_KEY = 'emergency-cols'
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

function guardianName(r) {
  const g1 = r.customer?.guardian1 || {}
  return `${g1['First Name'] || ''} ${g1['Last Name'] || ''}`.trim()
}
function studentName(r) {
  return `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim()
}

// An emergency block "counts" only if it has a name or a way to reach the
// contact — the Relationship field defaults to 'Emergency Contact', so it
// alone doesn't mean the contact was actually filled in.
function emergencyHasContent(em) {
  if (!em) return false
  return Boolean(
    (em['First Name'] || '').trim() ||
    (em['Last Name'] || '').trim() ||
    (em['Phone (Mobile)'] || '').trim() ||
    (em['Email'] || '').trim(),
  )
}
function emergencyContactName(em) {
  return `${em?.['First Name'] || ''} ${em?.['Last Name'] || ''}`.trim()
}
// Two families share a contact when the person is the same, so match on
// everything that identifies them rather than the name alone.
function contactKey(em) {
  return [emergencyContactName(em), em?.['Phone (Mobile)'] || '', em?.['Email'] || '']
    .join('|').trim().toLowerCase()
}

const CSS = BACKUP_CSS + `
.ec{--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;--dark-brown:#2E2516;
    --line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;--danger:#C0392B;
    --shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}
.ec .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.ec .actions button{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:6px 12px;
    font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;
    display:inline-flex;align-items:center;gap:5px}
.ec .actions button:hover{background:#f4f2ea}

.ec .offline{background:#fffbf0;border:1px solid #f4d67a;color:#8a6a00;padding:8px 12px;
    border-radius:8px;margin-bottom:12px;font-size:13px}

.ec .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.ec .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.ec .metric.clickable{cursor:pointer}
.ec .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.ec .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.ec .metric.mcust{border-bottom-color:var(--yellow)}
.ec .metric.mcov{border-bottom-color:var(--light-blue)}
.ec .metric.mmiss{border-bottom-color:#c0392b}
.ec .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.ec .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.ec .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.ec .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.ec .filters input[type=search]{padding:7px 12px;border:1px solid var(--field);border-radius:8px;
    font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit;width:260px}
.ec .filters input[type=search]:focus{outline:none;border-color:var(--teal)}
.ec .filters input[type=search]::placeholder{color:var(--faint)}
.ec .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.ec .clearf:hover{background:#f1f5f4}
.ec .toggle{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);
    font-weight:600;cursor:pointer;user-select:none}
.ec .toggle input{width:14px;height:14px;accent-color:var(--teal);cursor:pointer;margin:0}
.ec .actions .gearbtn{font-size:14px;line-height:1;padding:6px 10px}
.ecsettings{position:absolute;right:34px;z-index:240;width:330px;margin-top:4px}
.ec .bulkbar{display:flex;align-items:center;justify-content:space-between;gap:12px;
    background:#E4EFF3;border:1px solid var(--light-blue);border-radius:10px;
    padding:8px 12px;margin-bottom:10px;font-size:12.5px;color:var(--dark-brown)}
.ec .bulkbar .n{font-weight:700}
.ec .bulkbar .acts{display:inline-flex;align-items:center;gap:8px}
.ec .bulkbar button{border:none;border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:600;
    cursor:pointer;font-family:inherit}
.ec .bulkbar .exp{background:var(--teal);color:#fff}
.ec .bulkbar .clr{background:transparent;border:1px solid var(--field);color:var(--muted)}
/* Filter row and the select column, matching Customers. */
.ec thead tr.colfrow th{background:#eaf3f2;padding:5px 6px;border-radius:0}
.ec thead tr.colfrow th:empty{background:transparent}
.ec .colf{width:100%;background:#fff;border:1px solid var(--field);border-radius:7px;padding:4px 6px;
    font-size:11.5px;color:var(--dark-brown);font-weight:600;cursor:pointer;font-family:inherit}
.ec .colf.on{background:var(--light-blue);border-color:var(--light-blue)}
.ec thead th.selcol,.ec tbody td.selcol{background:transparent;text-align:center}
.ec thead th.selcol input,.ec tbody td.selcol input{width:12px;height:12px;margin:0;
    accent-color:var(--teal);vertical-align:middle;cursor:pointer}
.ec tbody tr.sel td{background:#DCEEEC}
.ec tbody tr.grpsep td.nosep{border-top:none}

.ec .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.ec table{width:100%;min-width:900px;table-layout:fixed;border-collapse:separate;
    border-spacing:5px 5px;background:#fff}
.ec thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
/* The sort arrow and eye sit absolutely at right:3px, so only the RIGHT
   padding reserves anything — the matching 30px on the left bought nothing
   and truncated short headers like "Grade". Right side unchanged; left cut. */
.ec thead th.colh .lbl{display:block;text-align:center;padding:0 30px 0 4px;
    overflow:hidden;text-overflow:ellipsis}
.ec thead th .arw{opacity:.85;font-size:10px}
.ec thead th.colh{cursor:grab}
.ec thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1}
.ec thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.ec thead th.colh:hover .eye{opacity:1}
.ec thead th .sortable{cursor:pointer}

.ec tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:22px;overflow:hidden;text-overflow:ellipsis}
.ec tbody td.rep{background:transparent !important}
.ec tbody tr.grpsep td{background:transparent;height:1px;padding:0;border-radius:0;
    border-top:1px solid #CFD6D8}
.ec tbody tr:hover td{background:#E4EFF3}
.ec tbody tr.rmiss td{background:#FBF3E0}
.ec tbody tr.rmiss:hover td{background:#F6EAD0}
.ec td.col-relationship,.ec td.col-phone{text-align:center}
.ec .cname{font-weight:700;color:#3d7f7d}
.ec .miss{color:#8a6a00;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
.ec .dash{color:var(--faint)}
.ec .withicon{display:inline-flex;align-items:center;gap:5px;vertical-align:middle}
.ec button.nlink{background:none;border:none;padding:0;margin:0;font:inherit;font-size:12px;
    font-weight:600;color:#3d7f7d;cursor:pointer;text-align:left}
.ec button.nlink:hover{text-decoration:underline}
.ec .empty{text-align:center;color:var(--muted);padding:60px 20px}
.ec .empty b{color:var(--dark-brown)}
.ec .tcount{color:var(--muted);font-size:12px;padding:10px 2px;text-align:right}
.ec .tcount .tnote{float:left;color:#8a6a00;font-weight:600}

.ecpop{position:fixed;z-index:220;background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:8px 12px 10px;min-width:190px;max-height:360px;
    overflow:auto;color:#2E2516;font-family:inherit}
.ecpop .h{font-size:12px;color:#6B6455;font-weight:700;margin:2px 2px 7px}
.ecpop .ch{display:flex;align-items:center;gap:9px;padding:5px 3px;font-size:13px;font-weight:600;cursor:pointer}
.ecpop .ch:hover{background:#f4f2ea;border-radius:6px}
.ecpop .ch input{margin:0;accent-color:#5FA09E}
.ecpop .ch.locked{opacity:.5;cursor:default}
.ecpop .allrow{border-top:1px solid #EDEAE2;margin-top:4px;padding-top:4px;display:flex;gap:4px;
    position:sticky;bottom:0;background:#fff}
.ecpop .allrow button{background:none;border:none;color:#5FA09E;font-weight:700;font-size:12.5px;
    text-align:center;padding:6px 8px;border-radius:6px;flex:1;cursor:pointer;font-family:inherit}
.ecpop .allrow button:hover{background:#f4f2ea}

.ecmenu{position:fixed;z-index:301;background:#fff;border:1px solid #E7EBE7;border-radius:10px;
    box-shadow:0 8px 24px rgba(46,37,22,.2);overflow:hidden;min-width:190px;color:#2E2516;font-family:inherit}
.ecmenu div{padding:9px 15px;font-size:13px;cursor:pointer;font-weight:600}
.ecmenu div:hover{background:#f1f5f4}
.ecmenu .sep{height:1px;background:#E7EBE7;padding:0;margin:2px 0;cursor:default}
.ecmenu .sep:hover{background:#E7EBE7}
`

const ColsPop = React.forwardRef(function ColsPop({ rect, hiddenCols, onToggle, onAll, onNone }, ref) {
  const style = {
    top: Math.min(rect.bottom + 6, window.innerHeight - 320),
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 230)),
  }
  return (
    <div className="ecpop" ref={ref} style={style}>
      <div className="h">Show Columns</div>
      {COLS.map(c => {
        const locked = c.k === LOCKED_COL
        return (
          <label key={c.k} className={'ch' + (locked ? ' locked' : '')}
            title={locked ? 'The contact name always stays visible' : undefined}>
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
    <div className="ecmenu" ref={ref} style={style}>
      {items.map((it, i) => it.sep
        ? <div key={i} className="sep" />
        : <div key={i} onClick={() => { onClose(); it.on() }}>{it.label}</div>)}
    </div>
  )
}

function NameLink({ children, onClick, title }) {
  if (!children) return <span className="dash">—</span>
  return (
    <button className="nlink" title={title}
      onClick={e => { e.stopPropagation(); onClick && onClick() }}>{children}</button>
  )
}

/* Emergency contacts are stored on the registrations, so the snapshots here
   are the same ones the Customers page takes — same endpoint, same list.
   Said plainly in the hint, so a restore from this page is not a surprise. */
function EmergencySettings({ onClose }) {
  const ref = useRef(null)
  const { refresh } = useStore()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  return (
    <div className="ecsettings" ref={ref} onMouseDown={e => e.stopPropagation()}>
      <BackupPanel base="customers"
        hint={'Emergency contacts are held on the registrations, so these are the same '
          + 'snapshots the Customers page takes — restoring one replaces every registration '
          + '(last 14 kept).'}
        onRestored={async () => { await refresh(); onClose() }} />
    </div>
  )
}

function useEmergencyRows() {
  const { records } = useStore()

  return useMemo(() => {
    const realRecords = records.filter(r => r.id !== 'seed')

    // Group records into families, by the same rule the Customers page
    // uses — siblings whose records differ slightly must not come out as
    // two families with two emergency contacts.
    const familyIndex = buildFamilyIndex(realRecords)
    const families = new Map()
    for (const r of realRecords) {
      const key = familyIndex.get(r.id) || `unknown-${r.id}`
      if (!families.has(key)) families.set(key, { customerName: guardianName(r) || '—', records: [] })
      families.get(key).records.push(r)
    }

    const rows = []
    let missingCount = 0, studentsCovered = 0
    const contacts = new Set()

    for (const fam of families.values()) {
      // The first sibling that actually has a contact filled in — siblings
      // almost always share one.
      const source = fam.records.find(r => emergencyHasContent(r.customer?.emergency))
      const students = [...fam.records].sort((a, b) =>
        (a.student?.firstName || '').localeCompare(b.student?.firstName || '', undefined, { sensitivity: 'base' }))
      /* Inactive means finished, not merely not-running: a family that has
         just registered is exactly who you want a contact for. Same rule as
         the Customers list. */
      const isDone = (p) => ['completed', 'cancelled', 'inactive']
        .includes(String(p.status || '').toLowerCase())
      const inactive = students.every(s => {
        const progs = s.programs || []
        return progs.length > 0 && progs.every(isDone)
      })

      const base = {
        id: (source || fam.records[0])?.id,
        customer: fam.customerName,
        students,
        studentNames: students.map(studentName).join(', '),
        linkId: (source || fam.records[0])?.id,
        inactive,
      }
      if (source) {
        const em = source.customer.emergency
        const key = contactKey(em)
        contacts.add(key)
        studentsCovered += students.length
        rows.push({
          ...base, missing: false, contactKey: key,
          contact: emergencyContactName(em),
          relationship: em['Relationship'] || '',
          phone: em['Phone (Mobile)'] || '',
          email: em['Email'] || '',
        })
      } else {
        missingCount++
        rows.push({
          ...base, missing: true, contactKey: '',
          contact: '', relationship: '', phone: '', email: '',
        })
      }
    }

    return {
      rows,
      familyCount: families.size,
      contactCount: contacts.size,
      studentsCovered,
      missingCount,
    }
  }, [records])
}

export default function EmergencyContacts({ onNavigate }) {
  const { status: fetchStatus } = useStore()
  const { rows: allRows, familyCount, contactCount, studentsCovered, missingCount } = useEmergencyRows()

  const [search, setSearch] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [colFilters, setColFilters] = useState({})
  const [selected, setSelected] = useState(() => new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sort, setSort] = useState({ key: 'contact', dir: 1 })
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = allRows.filter(r => {
      if (missingOnly && !r.missing) return false
      if (!showInactive && r.inactive) return false
      for (const [k, want] of Object.entries(colFilters)) {
        if (!want) continue
        // Students is a list, so the row matches if any of them is the pick.
        if (k === 'students') { if (!r.students.some(s => studentName(s) === want)) return false }
        else if (String(r[k] || '') !== want) return false
      }
      if (!q) return true
      return r.contact.toLowerCase().includes(q) ||
             r.relationship.toLowerCase().includes(q) ||
             r.phone.toLowerCase().includes(q) ||
             r.email.toLowerCase().includes(q) ||
             r.customer.toLowerCase().includes(q) ||
             r.studentNames.toLowerCase().includes(q)
    })
    const val = (r) => String(r[sort.key === 'students' ? 'studentNames' : sort.key] || '').toLowerCase()
    /* Families with no contact always sit at the end rather than sorting
       to the top on an empty name. Ties fall back to the contact then the
       customer, so a shared contact's rows stay adjacent for the blanking
       below to collapse. */
    return [...out].sort((a, b) => {
      if (a.missing !== b.missing) return a.missing ? 1 : -1
      const av = val(a), bv = val(b)
      if (av < bv) return -sort.dir
      if (av > bv) return sort.dir
      const c = a.contact.localeCompare(b.contact, undefined, { sensitivity: 'base' })
      if (c) return c
      return a.customer.localeCompare(b.customer, undefined, { sensitivity: 'base' })
    })
  }, [allRows, search, missingOnly, showInactive, colFilters, sort])

  /* Only values that are actually present, so a filter never offers a
     choice that returns nothing. */
  const filterOptions = useMemo(() => {
    const out = {}
    for (const c of COLS) {
      const vals = new Set()
      for (const r of allRows) {
        if (c.k === 'students') r.students.forEach(s => { const n = studentName(s); if (n) vals.add(n) })
        else if (r[c.k]) vals.add(String(r[c.k]))
      }
      out[c.k] = [...vals].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    }
    return out
  }, [allRows])

  const anyFilterActive = !!search || missingOnly || showInactive
    || Object.values(colFilters).some(Boolean)
  const clearAllFilters = () => {
    setSearch(''); setMissingOnly(false); setShowInactive(false); setColFilters({})
  }

  const allSel = visible.length > 0 && visible.every(r => selected.has(r.id))
  const selectedRows = useMemo(() => visible.filter(r => selected.has(r.id)), [visible, selected])

  /* Everything by default, or just the ticked rows — a printed call list
     for one class or one trip is the reason to tick anything here. */
  const exportCsv = (rows) => {
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const head = ['Emergency Contact', 'Relationship', 'Phone', 'Email', 'Customer', 'Students', 'Status']
    const lines = [head.join(',')]
    for (const r of (rows && rows.length ? rows : allRows)) {
      lines.push([r.contact, r.relationship, r.phone, r.email, r.customer, r.studentNames,
        r.missing ? 'Missing' : 'On file'].map(esc).join(','))
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `crania-emergency-contacts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  useEffect(() => {
    if (!pop) return
    const onDown = e => { if (popRef.current && !popRef.current.contains(e.target)) setPop(null) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [pop])

  const arrow = k => sort.key === k ? <span className="arw">{sort.dir > 0 ? '▲' : '▼'}</span> : null

  // ---- body rows, with a shared contact's own cells blanked on repeats ----
  const CONTACT_CELLS = new Set(['contact', 'relationship', 'phone', 'email'])
  const bodyRows = []
  let prevKey = null
  visible.forEach((r) => {
    // Every family with no contact shares one group, so a run of them is
    // not sliced up by a divider between each row.
    const groupKey = r.missing ? '__missing__' : r.contactKey
    const sameGroup = prevKey !== null && prevKey === groupKey
    if (prevKey !== null && prevKey !== groupKey) {
      bodyRows.push(
        <tr className="grpsep" key={'sep-' + r.linkId}>
          <td className="nosep" /><td colSpan={orderedCols.length} />
        </tr>
      )
    }
    prevKey = groupKey

    const tds = orderedCols.map(c => {
      const k = c.k
      if (CONTACT_CELLS.has(k) && sameGroup && !r.missing) return <td key={k} className={`col-${k} rep`} />

      let content, title = String(r[k] || '')
      if (k === 'contact') {
        content = r.missing
          ? <span className="miss">No contact on file</span>
          : <span className="cname">{r.contact || <span className="dash">—</span>}</span>
        if (r.missing) title = 'This customer has no emergency contact — add one on the Customers page'
      } else if (k === 'phone') {
        content = r.phone
          ? <span className="withicon"><Phone size={11} color="var(--muted)" />{r.phone}</span>
          : <span className="dash">—</span>
      } else if (k === 'email') {
        content = r.email
          ? <span className="withicon"><Mail size={11} color="var(--muted)" />{r.email}</span>
          : <span className="dash">—</span>
      } else if (k === 'customer') {
        content = <NameLink title="Open this customer"
          onClick={() => onNavigate && onNavigate('Customers', r.linkId)}>{r.customer}</NameLink>
      } else if (k === 'students') {
        title = r.studentNames
        content = r.students.map((s, j) => (
          <React.Fragment key={s.id}>
            {j > 0 && <span className="dash">, </span>}
            <NameLink title="Open this student"
              onClick={() => onNavigate && onNavigate('Students', s.id)}>{studentName(s)}</NameLink>
          </React.Fragment>
        ))
      } else {
        content = r[k] ? r[k] : <span className="dash">—</span>
      }
      return <td key={k} className={`col-${k}`} title={title}>{content}</td>
    })

    const isSel = selected.has(r.id)
    bodyRows.push(
      <tr key={r.linkId} className={(r.missing ? 'rmiss' : '') + (isSel ? ' sel' : '')}
        onContextMenu={e => { e.preventDefault(); setRowCtx({ x: e.clientX, y: e.clientY, row: r }) }}>
        <td className="selcol" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isSel} onChange={e => setSelected(s => {
            const n = new Set(s)
            if (e.target.checked) n.add(r.id); else n.delete(r.id)
            return n
          })} />
        </td>
        {tds}
      </tr>
    )
  })

  return (
    <div className="page ec" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      <div className="actions">
        <button title="Choose which columns are shown" style={{ marginLeft: 'auto' }}
          onClick={e => setPop({ kind: 'cols', rect: e.currentTarget.getBoundingClientRect() })}
        ><Eye size={13} /> Columns</button>
        <button title="Download the contact list as a CSV file" onClick={() => exportCsv()}>
          <Download size={13} /> Export CSV
        </button>
        <button className="gearbtn" title="Backups" onClick={() => setSettingsOpen(true)}>⚙</button>
      </div>

      {settingsOpen && (
        <EmergencySettings onClose={() => setSettingsOpen(false)} />
      )}

      {fetchStatus === 'offline' && (
        <div className="offline">Working offline — showing cached data.</div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="label">Contacts on File</div><div className="value">{contactCount}</div>
          <div className="hint">unique people</div>
        </div>
        <div className="metric mcust">
          <div className="label">Customers</div><div className="value">{familyCount}</div>
          <div className="hint">grouped by guardian</div>
        </div>
        <div className="metric mcov">
          <div className="label">Students Covered</div><div className="value">{studentsCovered}</div>
          <div className="hint">have an emergency contact</div>
        </div>
        <div className={'metric mmiss clickable' + (missingOnly ? ' on' : '')}
          title="Click to show only customers with no contact"
          onClick={() => setMissingOnly(v => !v)}>
          <div className="label">Missing Contact</div><div className="value">{missingCount}</div>
          <div className="hint">customers with no contact</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search contact, customer or student…" autoComplete="off" />
        <label className="toggle" title="Families whose programs have all finished">
          <input type="checkbox" checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <span className="n">{selected.size} selected</span>
          <span className="acts">
            <button className="exp" onClick={() => exportCsv(selectedRows)}>Export Selected</button>
            <button className="clr" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </span>
        </div>
      )}

      <div className="card">
        {allRows.length === 0 ? (
          <div className="empty">
            <b>No customers yet.</b><br />
            Emergency contacts come from the registration form and are edited on the Customers page.
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
            </colgroup>
            <thead>
              {/* Not `frow` — that name belongs to the field rows elsewhere
                  and sets display:grid, which takes the row out of table
                  layout and wrecks every column width. */}
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
              </tr>
              <tr>
                <th className="selcol">
                  <input type="checkbox" checked={allSel} title="Select all shown"
                    onChange={e =>
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
              </tr>
            </thead>
            <tbody>{bodyRows}</tbody>
          </table>
        )}
      </div>
      <div className="tcount">
        {missingCount > 0 && !missingOnly && (
          <span className="tnote">
            {missingCount} customer{missingCount === 1 ? ' has' : 's have'} no emergency contact — tinted below,
            or click the Missing Contact tile.
          </span>
        )}
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
          {
            label: rowCtx.row.missing ? 'Add Contact on Customers' : 'Open Customer',
            on: () => onNavigate && onNavigate('Customers', rowCtx.row.linkId),
          },
          ...(rowCtx.row.students.length === 1 ? [{
            label: 'Open Student',
            on: () => onNavigate && onNavigate('Students', rowCtx.row.students[0].id),
          }] : []),
        ]} />
      )}
    </div>
  )
}
