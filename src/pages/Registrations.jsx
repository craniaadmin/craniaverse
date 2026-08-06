// Registrations — everything that came in through the public form at
// /register, in one table.
//
// A submission is a family, not a student: one guardian fills the form
// once for however many children they are enrolling. The registration
// records the app stores are per-student, so they are grouped back into
// submissions by their family reference here, and the family columns
// (guardians, address, emergency contact, consent) span the children
// underneath with rowSpan — the browser guarantees that alignment,
// stacked equal-height blocks do not.
//
// Same table idiom as Customers, Students and Staff: metric tiles, a
// filter row under every heading, a column chooser, a select column and
// the shared action bar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'
import { useStore } from '../data/store'
import PageActions, { ColumnsMenu, RowCount } from '../components/PageActions'
import { CtxMenu, TABLECHROME_CSS } from '../components/TableChrome'
import useActionHistory from '../data/useActionHistory'

/* Column order follows the registration form itself: who submitted it,
   then each guardian, then the child, then what they enrolled in. */
const COLS = [
  { k: 'ref',       l: 'Ref',                  scope: 'family' },
  { k: 'date',      l: 'Received',             scope: 'family' },
  { k: 'status',    l: 'Status',               scope: 'family', cls: 'center' },
  { k: 'source',    l: 'Source',               scope: 'family' },
  { k: 'g1',        l: 'Guardian 1',           scope: 'family' },
  { k: 'g1rel',     l: 'G1 Relationship',      scope: 'family' },
  { k: 'g1phone',   l: 'G1 Phone',             scope: 'family' },
  { k: 'g1email',   l: 'G1 Email',             scope: 'family' },
  { k: 'g1occ',     l: 'G1 Occupation',        scope: 'family' },
  { k: 'g2',        l: 'Guardian 2',           scope: 'family' },
  { k: 'g2rel',     l: 'G2 Relationship',      scope: 'family' },
  { k: 'g2phone',   l: 'G2 Phone',             scope: 'family' },
  { k: 'g2email',   l: 'G2 Email',             scope: 'family' },
  { k: 'address',   l: 'Address',              scope: 'family' },
  { k: 'child',     l: 'Child',                scope: 'child' },   // never hideable
  { k: 'dob',       l: 'Date of Birth',        scope: 'child', cls: 'center' },
  { k: 'age',       l: 'Age',                  scope: 'child', cls: 'center' },
  { k: 'grade',     l: 'Grade',                scope: 'child', cls: 'center' },
  { k: 'school',    l: 'School',               scope: 'child' },
  { k: 'allergies', l: 'Allergies / Medical',  scope: 'child' },
  { k: 'program',   l: 'Program',              scope: 'row' },
  { k: 'year',      l: 'Year',                 scope: 'row', cls: 'center' },
  { k: 'location',  l: 'Location',             scope: 'row' },
  { k: 'day',       l: 'Day',                  scope: 'row', cls: 'center' },
  { k: 'time',      l: 'Time',                 scope: 'row', cls: 'center' },
  { k: 'fee',       l: 'Fee',                  scope: 'row', cls: 'center' },
  { k: 'ec1',       l: 'Emergency Contact',    scope: 'family' },
  { k: 'ec1rel',    l: 'EC Relationship',      scope: 'family' },
  { k: 'ec1phone',  l: 'EC Phone',             scope: 'family' },
  { k: 'consent',   l: 'Consent',              scope: 'family', cls: 'center' },
  { k: 'notes',     l: 'Notes',                scope: 'family' },
]
const LOCKED_COL = 'child'
const DEFAULT_SHOWN = ['ref', 'date', 'status', 'g1', 'g1phone', 'child', 'grade', 'program', 'fee']

const W = {
  ref: 74, date: 108, status: 104, source: 112,
  g1: 148, g1rel: 118, g1phone: 128, g1email: 190, g1occ: 130,
  g2: 148, g2rel: 118, g2phone: 128, g2email: 190,
  address: 210, child: 150, dob: 106, age: 62, grade: 66, school: 150,
  allergies: 180, program: 180, year: 84, location: 130, day: 64, time: 82, fee: 88,
  ec1: 150, ec1rel: 118, ec1phone: 128, consent: 84, notes: 190,
}

const CPREF_KEY = 'registrations-cols'
function loadColPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(CPREF_KEY) || '{}')
    return {
      hiddenCols: v.hiddenCols && typeof v.hiddenCols === 'object'
        ? v.hiddenCols
        : Object.fromEntries(COLS.filter(c => !DEFAULT_SHOWN.includes(c.k)).map(c => [c.k, true])),
      colOrder: Array.isArray(v.colOrder) ? v.colOrder : [],
    }
  } catch {
    return {
      hiddenCols: Object.fromEntries(COLS.filter(c => !DEFAULT_SHOWN.includes(c.k)).map(c => [c.k, true])),
      colOrder: [],
    }
  }
}
const saveColPrefs = (v) => { try { localStorage.setItem(CPREF_KEY, JSON.stringify(v)) } catch { /* ignore */ } }

const money = (n) => (Number.isFinite(Number(n)) && Number(n) !== 0
  ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : '')

function ageFrom(dob) {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return ''
  const y = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return y > 0 ? String(Math.floor(y)) : ''
}

const personName = (o) => {
  if (!o) return ''
  const first = o['First Name'] || o.firstName || ''
  const last = o['Last Name'] || o.lastName || ''
  return `${first} ${last}`.trim() || o['Name'] || o.name || ''
}
const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k]) return o[k]
  return ''
}

/* Nothing on the form asks for a status, so it is derived: a submission
   with no active enrolment is still waiting to be confirmed. Showing
   "Confirmed" for everything would make the tile meaningless. */
function statusOf(programs) {
  if (!programs.length) return 'Awaiting'
  if (programs.some(p => p.active)) return 'Confirmed'
  return 'Awaiting'
}

const CSS = TABLECHROME_CSS + `
.rg{position:relative;--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;
    --dark-brown:#2E2516;--line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;
    --danger:#C0392B;--good:#2b7a2e;--shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}

.rg .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.rg .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.rg .metric.clickable{cursor:pointer}
.rg .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.rg .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.rg .metric.mkid{border-bottom-color:var(--light-blue)}
.rg .metric.mwait{border-bottom-color:#8a6a00}
.rg .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.rg .metric .value{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.rg .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.rg .filters{display:flex;align-items:center;gap:8px;padding:2px 0 14px;flex-wrap:wrap}
.rg .filters input[type=search]{padding:7px 12px;border:1px solid var(--field);border-radius:8px;
    font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit;width:300px}
.rg .filters input[type=search]:focus{outline:none;border-color:var(--teal)}
.rg .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.rg .clearf:hover{background:#f1f5f4}

.rg .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.rg .card > table{border-collapse:separate;border-spacing:5px 5px;background:#fff}
.rg thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
.rg thead th.colh .lbl{display:block;text-align:center;padding:0 6px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rg thead th.colh{cursor:grab}
.rg thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;background:var(--teal);padding-left:4px;border-radius:3px}
.rg thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.rg thead th.colh:hover .eye{opacity:1}
.rg thead th .arw{opacity:.85;font-size:10px}
.rg thead th .sortable{cursor:pointer}
.rg thead tr.colfrow th{background:#eaf3f2;padding:5px 6px;border-radius:0}
.rg thead tr.colfrow th:empty{background:transparent}
.rg .colf{width:100%;background:#fff;border:1px solid var(--field);border-radius:7px;padding:4px 6px;
    font-size:11.5px;color:var(--dark-brown);font-weight:600;cursor:pointer;font-family:inherit}
.rg .colf.on{background:var(--light-blue);border-color:var(--light-blue)}
.rg thead th.selcol,.rg tbody td.selcol{background:transparent}
.rg .selcol{text-align:center}
.rg .selcol input{width:12px;height:12px;margin:0;accent-color:var(--teal);cursor:pointer}

.rg tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:26px;
    overflow:hidden;text-overflow:ellipsis}
.rg tbody td.center{text-align:center}
.rg tbody td.famcell{background:#EDF3F4;vertical-align:top;padding-top:5px}
.rg tbody td.kidcell{background:#F2F5F3;vertical-align:top;padding-top:5px}
.rg tbody tr:hover td:not(.famcell):not(.kidcell){background:#E4EFF3}
.rg tbody tr.famhot td.famcell,.rg tbody tr.kidhot td.kidcell{background:#DCEEEC}
.rg tbody tr.sel td{background:#DCEEEC}
.rg .rref{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;font-weight:700;color:var(--muted)}
.rg .cname{font-weight:700;color:#3d7f7d}
.rg .dash{color:var(--faint)}
.rg .tag{display:inline-block;border-radius:5px;padding:1px 8px;font-size:11px;font-weight:700}
.rg .tag.ok{background:#DEF2DE;color:var(--good)}
.rg .tag.wait{background:#FBF3CE;color:#7a6417}
.rg .empty{text-align:center;color:var(--muted);padding:60px 20px}
.rg .empty b{color:var(--dark-brown)}
.rg .offline{background:#fffbf0;border:1px solid #f4d67a;color:#8a6a00;padding:8px 12px;
    border-radius:8px;margin-bottom:12px;font-size:13px}
.rg .rowbtn{background:none;border:none;color:#c9c3b5;padding:0 2px;cursor:pointer;
    display:inline-flex;vertical-align:middle;transition:color .15s}
.rg .rowbtn:hover{color:var(--teal)}
.rg tbody td.actcell{background:transparent;text-align:center;white-space:nowrap}

/* ── edit dialog ── */
.rgov{position:fixed;inset:0;background:rgba(46,37,22,.35);z-index:400;
    display:flex;align-items:flex-start;justify-content:center;padding:28px 20px;overflow:auto}
.rgmodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(46,37,22,.3);
    padding:20px 22px 22px;width:100%;max-width:680px;color:#2E2516}
.rgmodal h2{margin:0 0 3px;font-size:17px}
.rgmodal .who{font-size:12.5px;color:#6B6455;margin-bottom:14px}
.rgmodal .egroup{font-size:12px;font-weight:700;color:#5FA09E;text-transform:uppercase;
    letter-spacing:.4px;border-bottom:1px solid #E7EBE7;padding-bottom:6px;margin:16px 0 11px}
.rgmodal .egrid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
.rgmodal .ef{display:flex;flex-direction:column;gap:4px;min-width:0}
.rgmodal .ef.wide{grid-column:span 2}
.rgmodal .ef span{font-size:11px;font-weight:700;color:#6B6455;text-transform:uppercase;letter-spacing:.3px}
.rgmodal .ef input{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #D5D0C4;
    border-radius:8px;font:inherit;font-size:13px;background:#fff;color:#2E2516}
.rgmodal .ef input:focus{outline:none;border-color:#5FA09E}
.rgmodal .ef input[type=checkbox]{width:16px;height:16px;accent-color:#5FA09E;padding:0}
.rgmodal .eprog{border:1px solid #E7EBE7;border-radius:10px;padding:12px 13px;margin-bottom:10px;background:#FBFCFC}
.rgmodal .edrop{margin-top:9px;background:none;border:1px solid #E7EBE7;border-radius:7px;
    padding:5px 11px;font:inherit;font-size:11.5px;font-weight:600;color:#C0392B;cursor:pointer}
.rgmodal .edrop:hover{border-color:#C0392B}
.rgmodal .eadd{background:none;border:1px dashed #D5D0C4;border-radius:8px;padding:7px 13px;
    font:inherit;font-size:12px;font-weight:600;color:#6B6455;cursor:pointer}
.rgmodal .eadd:hover{border-color:#5FA09E;color:#5FA09E}
.rgmodal .enote{font-size:11.5px;color:#6B6455;font-style:italic;background:#F4F7F8;
    border-radius:8px;padding:8px 11px;margin-top:10px}
.rgmodal .eerr{background:#fdecea;border:1px solid #f5b5b0;color:#8a1c15;border-radius:8px;
    padding:8px 12px;font-size:12.5px;margin-top:12px}
.rgmodal .eacts{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}
.rgmodal .eacts button{border-radius:8px;padding:9px 16px;font:inherit;font-size:13px;
    font-weight:700;cursor:pointer;border:none}
.rgmodal .eacts .go{background:#5FA09E;color:#fff}
.rgmodal .eacts .go:disabled{background:#cbd1d6;cursor:default}
.rgmodal .eacts .cancel{background:#F1F3F4;border:1px solid #D5D0C4;color:#2E2516}
@media (max-width:560px){.rgmodal .egrid{grid-template-columns:1fr}.rgmodal .ef.wide{grid-column:span 1}}
`

/* The three stores a registration is spread across, written in whichever
   combination changed. Shared by the dialog's Save and by Undo, so taking
   a change back goes down the same path that made it — there is no second
   write route to drift out of step with the first. */
async function putSections(recordId, sections) {
  const base = import.meta.env?.VITE_API_URL || ''
  const H = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
  const calls = []
  for (const [part, body] of Object.entries(sections)) {
    if (!body) continue
    calls.push(fetch(`${base}/api/registrations/${recordId}/${part}`,
      { method: 'PUT', headers: H, body: JSON.stringify(body) }))
  }
  if (!calls.length) return
  const results = await Promise.all(calls)
  const bad = results.find(r => !r.ok)
  if (bad) throw new Error(`The server refused the change (HTTP ${bad.status}).`)
}

export default function Registrations({ onNavigate }) {
  const { records, status: fetchStatus, refresh } = useStore()
  const [search, setSearch] = useState('')
  const [waitingOnly, setWaitingOnly] = useState(false)
  const [colFilters, setColFilters] = useState({})
  const [sort, setSort] = useState({ key: 'date', dir: -1 })
  const [selected, setSelected] = useState(() => new Set())
  const [{ hiddenCols, colOrder }, setColPrefs] = useState(loadColPrefs)
  const [rowCtx, setRowCtx] = useState(null)
  const [editing, setEditing] = useState(null)   // { sub, child }
  const [hover, setHover] = useState({ fam: null, kid: null })
  const dragCol = useRef(null)

  /* Undo/redo. The edit dialog is the only thing on this page that writes,
     and it writes straight to the API rather than through a piece of state
     this page owns — so the step records the change itself: the sections
     as they were, and the sections as they were saved. */
  const hist = useActionHistory()
  const pushHist = hist.push

  const onEdited = useCallback(async (entry) => {
    await refresh()
    if (!entry) return
    pushHist({
      label: entry.label,
      undo: async () => { await putSections(entry.recordId, entry.before); await refresh() },
      redo: async () => { await putSections(entry.recordId, entry.after); await refresh() },
    })
  }, [refresh, pushHist])

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

  /* One submission per family: the form is filled once per household,
     however many children are on it. */
  const submissions = useMemo(() => {
    const byFamily = new Map()
    for (const r of (records || [])) {
      if (r.id === 'seed') continue
      const meta = r.customer?.meta || {}
      const key = meta.familyId || `unfiled-${r.id}`
      if (!byFamily.has(key)) byFamily.set(key, [])
      byFamily.get(key).push(r)
    }
    const out = []
    for (const [ref, kids] of byFamily) {
      const first = kids[0]
      const cust = first.customer || {}
      const meta = cust.meta || {}
      const g1 = cust.guardian1 || {}
      const g2 = cust.guardian2 || {}
      const em = cust.emergency || {}
      const consents = Object.entries(meta.consents || {}).filter(([, v]) => v).map(([k]) => k)

      const children = kids.map(k => {
        const programs = (k.programs || [])
        return {
          id: k.id,
          record: k,
          name: `${k.student?.firstName || ''} ${k.student?.lastName || ''}`.trim(),
          dob: k.student?.dob || '',
          age: ageFrom(k.student?.dob),
          grade: k.student?.grade || '',
          school: k.student?.school || '',
          allergies: k.student?.medical || '',
          programs: programs.length ? programs : [{}],   // one blank row so the child still shows
          rawPrograms: programs,
        }
      })

      const allPrograms = children.flatMap(c => c.rawPrograms)
      out.push({
        ref,
        date: (first.createdAt || '').slice(0, 16).replace('T', ' '),
        status: statusOf(allPrograms),
        source: meta.source || '',
        g1: personName(g1), g1rel: pick(g1, 'Relationship'), g1phone: pick(g1, 'Phone', 'Mobile'),
        g1email: pick(g1, 'Email'), g1occ: pick(g1, 'Occupation'),
        g2: personName(g2), g2rel: pick(g2, 'Relationship'), g2phone: pick(g2, 'Phone', 'Mobile'),
        g2email: pick(g2, 'Email'),
        address: pick(cust.address || {}, 'Address') || [
          pick(cust.address || {}, 'Street'), pick(cust.address || {}, 'City'),
        ].filter(Boolean).join(', '),
        ec1: personName(em), ec1rel: pick(em, 'Relationship'), ec1phone: pick(em, 'Phone'),
        consent: consents.length ? 'Yes' : '',
        notes: k0Notes(first),
        children,
        childCount: children.length,
        programCount: allPrograms.length,
        fees: allPrograms.reduce((t, p) => t + (Number(p.fee) || 0), 0),
      })
    }
    return out
  }, [records])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = submissions.filter(s => {
      if (waitingOnly && s.status !== 'Awaiting') return false
      for (const [k, want] of Object.entries(colFilters)) {
        if (!want) continue
        const inFamily = String(s[k] ?? '') === want
        const inChild = s.children.some(c => String(c[k] ?? '') === want
          || c.programs.some(p => String(programField(p, k) ?? '') === want))
        if (!inFamily && !inChild) return false
      }
      if (!q) return true
      return [s.ref, s.g1, s.g2, s.g1email, s.g2email, s.g1phone, s.source, s.notes]
        .some(v => String(v || '').toLowerCase().includes(q))
        || s.children.some(c => c.name.toLowerCase().includes(q)
          || c.school.toLowerCase().includes(q)
          || c.rawPrograms.some(p => String(p.title || '').toLowerCase().includes(q)))
    })
    const val = (s) => {
      if (sort.key === 'fee') return s.fees
      if (sort.key === 'child') return (s.children[0]?.name || '').toLowerCase()
      return String(s[sort.key] ?? '').toLowerCase()
    }
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -sort.dir
      if (av > bv) return sort.dir
      return String(a.ref).localeCompare(String(b.ref))
    })
  }, [submissions, search, waitingOnly, colFilters, sort])

  const metrics = useMemo(() => ({
    regs: submissions.length,
    kids: submissions.reduce((t, s) => t + s.childCount, 0),
    waiting: submissions.filter(s => s.status === 'Awaiting').length,
  }), [submissions])

  const filterOptions = useMemo(() => {
    const out = {}
    for (const c of COLS) {
      const vals = new Set()
      for (const s of submissions) {
        if (c.scope === 'family' && s[c.k]) vals.add(String(s[c.k]))
        if (c.scope === 'child') for (const k of s.children) if (k[c.k]) vals.add(String(k[c.k]))
        if (c.scope === 'row') {
          for (const k of s.children) for (const p of k.programs) {
            const v = programField(p, c.k)
            if (v) vals.add(String(v))
          }
        }
      }
      out[c.k] = [...vals].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    }
    return out
  }, [submissions])

  const anyFilterActive = !!search || waitingOnly || Object.values(colFilters).some(Boolean)
  const clearAllFilters = () => { setSearch(''); setWaitingOnly(false); setColFilters({}) }

  const totalRows = visible.reduce((t, s) =>
    t + s.children.reduce((n, c) => n + c.programs.length, 0), 0)
  const allRowIds = visible.flatMap(s => s.children.map(c => c.id))
  const allSel = allRowIds.length > 0 && allRowIds.every(id => selected.has(id))


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
  const arrow = (k) => (sort.key === k ? <span className="arw">{sort.dir === 1 ? '▲' : '▼'}</span> : null)

  /* One row per child-programme, with the family cells spanning all of
     that family's rows and the child cells spanning that child's. */
  const bodyRows = []
  for (const s of visible) {
    const famRows = s.children.reduce((n, c) => n + c.programs.length, 0)
    let famDone = false
    for (const child of s.children) {
      let kidDone = false
      child.programs.forEach((prog, pi) => {
        const isSel = selected.has(child.id)
        const tds = []
        tds.push(
          <td key="sel" className="selcol" onClick={e => e.stopPropagation()}>
            {pi === 0 && (
              <input type="checkbox" checked={isSel} onChange={e => setSelected(prev => {
                const n = new Set(prev)
                if (e.target.checked) n.add(child.id); else n.delete(child.id)
                return n
              })} />
            )}
          </td>,
        )
        for (const c of orderedCols) {
          if (c.scope === 'family') {
            if (famDone) continue
            tds.push(
              <td key={c.k} rowSpan={famRows} className={`famcell col-${c.k}${c.cls ? ' ' + c.cls : ''}`}
                title={String(s[c.k] ?? '')}>{familyCell(c.k, s)}</td>,
            )
          } else if (c.scope === 'child') {
            if (kidDone) continue
            tds.push(
              <td key={c.k} rowSpan={child.programs.length}
                className={`kidcell col-${c.k}${c.cls ? ' ' + c.cls : ''}`}
                title={String(child[c.k] ?? '')}>{childCell(c.k, child)}</td>,
            )
          } else {
            const v = programField(prog, c.k)
            tds.push(
              <td key={c.k} className={`col-${c.k}${c.cls ? ' ' + c.cls : ''}`} title={String(v ?? '')}>
                {c.k === 'fee'
                  ? (money(v) || <span className="dash">—</span>)
                  : (v || <span className="dash">—</span>)}
              </td>,
            )
          }
        }
        /* Only on the child's first row, and spanning the rest of them.
           A hidden cell on the others would still be a cell, and the
           rowSpan above already covers those rows — the table would end
           up one column wider than its headers. */
        if (!kidDone) {
          tds.push(
            <td key="act" className="actcell" rowSpan={child.programs.length}
              onClick={e => e.stopPropagation()}>
              <button className="rowbtn" title="Edit this registration"
                onClick={() => setEditing({ sub: s, child })}><Pencil size={12} /></button>
            </td>,
          )
        }
        famDone = true
        kidDone = true
        bodyRows.push(
          <tr key={`${child.id}-${pi}`}
            className={(isSel ? 'sel ' : '')
              + (hover.fam === s.ref ? 'famhot ' : '')
              + (hover.kid === child.id ? 'kidhot' : '')}
            onMouseEnter={() => setHover({ fam: s.ref, kid: child.id })}
            onMouseLeave={() => setHover({ fam: null, kid: null })}
            onDoubleClick={() => setEditing({ sub: s, child })}
            onContextMenu={e => { e.preventDefault(); setRowCtx({ x: e.clientX, y: e.clientY, child, sub: s }) }}>
            {tds}
          </tr>,
        )
      })
    }
  }

  const csvColumns = COLS.map(c => ({ key: c.k, label: c.l }))
  const csvRows = () => {
    const out = []
    for (const s of visible) {
      for (const child of s.children) {
        for (const prog of child.programs) {
          const row = {}
          for (const c of COLS) {
            row[c.k] = c.scope === 'family' ? s[c.k]
              : c.scope === 'child' ? child[c.k]
                : programField(prog, c.k)
          }
          out.push(row)
        }
      }
    }
    return out
  }

  return (
    <div className="page rg" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      <PageActions
        {...hist}
        csvName="crania-registrations"
        csvColumns={csvColumns}
        csvRows={csvRows}
        backupCollection="registrations"
        backupHint="Snapshots of every registration submitted through the public form (last 14 kept)."
        /* Columns is a set-once thing and goes under the gear. Open Form
           stays on the bar — checking what the public sees is part of
           working this page. The chooser is a fixed popover at a lower
           z-index than the panel, so the panel closes on the way. */
        settingsExtra={
          <ColumnsMenu cols={COLS} hiddenCols={hiddenCols} lockedKey={LOCKED_COL}
            onToggle={(k, on) => setPrefs(p => {
              const n = { ...p.hiddenCols }
              if (on) delete n[k]; else n[k] = true
              p.hiddenCols = n
            })}
            onAll={() => setPrefs(p => { p.hiddenCols = {} })}
            onNone={() => setPrefs(p => {
              p.hiddenCols = Object.fromEntries(COLS.filter(c => c.k !== LOCKED_COL).map(c => [c.k, true]))
            })} />
        }
      >
        <button title="Open the public registration form"
          onClick={() => window.open(`${import.meta.env?.VITE_API_URL || window.location.origin}/register`, '_blank')}>
          Open Form
        </button>
      </PageActions>

      {fetchStatus === 'offline' && (
        <div className="offline">Working offline — showing cached registrations.</div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="label">Registrations</div><div className="value">{metrics.regs}</div>
          <div className="hint">submitted through the form</div>
        </div>
        <div className="metric mkid">
          <div className="label">Students</div><div className="value">{metrics.kids}</div>
          <div className="hint">across all submissions</div>
        </div>
        <div className={'metric mwait clickable' + (waitingOnly ? ' on' : '')}
          title="Click to show only submissions still waiting"
          onClick={() => setWaitingOnly(v => !v)}>
          <div className="label">Awaiting Confirmation</div><div className="value">{metrics.waiting}</div>
          <div className="hint">no active enrolment yet</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search guardian, child, school, program or ref…" autoComplete="off" />
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
      </div>

      <div className="card">
        {submissions.length === 0 ? (
          <div className="empty"><b>No registrations yet.</b><br />
            Submissions from the public form appear here.</div>
        ) : visible.length === 0 ? (
          <div className="empty"><b>Nothing to show.</b><br />Your search or filter is too narrow.
            <div style={{ marginTop: 14 }}>
              <button className="clearf" onClick={clearAllFilters}>Clear All Filters</button>
            </div>
          </div>
        ) : (
          <table>
            <colgroup>
              <col style={{ width: 26 }} />
              {orderedCols.map(c => <col key={c.k} style={{ width: W[c.k] || 120 }} />)}
              <col style={{ width: 34 }} />
            </colgroup>
            <thead>
              {/* Not `frow` — that name sets display:grid elsewhere and
                  takes the row out of table layout. */}
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
                    onChange={e => setSelected(e.target.checked ? new Set(allRowIds) : new Set())} />
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
                <th />
              </tr>
            </thead>
            <tbody>{bodyRows}</tbody>
          </table>
        )}
      </div>
      {/* A submission can carry more than one child, so rows and
          registrations are different numbers — the count is registrations,
          with the row total alongside it. */}
      <RowCount shown={visible.length} total={submissions.length}
        note={`${totalRows} row${totalRows === 1 ? '' : 's'}`} />

      {editing && (
        <EditRegistration sub={editing.sub} child={editing.child}
          onClose={() => setEditing(null)}
          onSaved={onEdited} />
      )}

      {rowCtx && (
        <CtxMenu x={rowCtx.x} y={rowCtx.y} onClose={() => setRowCtx(null)} items={[
          { label: 'Edit Registration', on: () => setEditing({ sub: rowCtx.sub, child: rowCtx.child }) },
          { label: 'Open in Customers', on: () => onNavigate && onNavigate('Customers', rowCtx.child.id) },
          { label: 'Open in Students', on: () => onNavigate && onNavigate('Students', rowCtx.child.id) },
        ]} />
      )}
    </div>
  )
}

/* Module level, not nested inside the dialog. A component defined during
   render is a new type on every keystroke, so React unmounts the old
   input and mounts a fresh one — the field loses focus after a single
   character and the form becomes unusable. */
function EField({ label, value, onChange, type = 'text', wide }) {
  return (
    <label className={'ef' + (wide ? ' wide' : '')}>
      <span>{label}</span>
      <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

/* Editing a registration touches three separate stores on the record —
   the child, the household, and the enrolments — so the dialog collects
   all of it and writes whichever parts actually changed. Sending all
   three every time would rewrite the household for a spelling fix on a
   child's name. */
function EditRegistration({ sub, child, onClose, onSaved }) {
  const rec = child.record
  const cust = rec.customer || {}
  const [student, setStudent] = useState({
    firstName: rec.student?.firstName || '', lastName: rec.student?.lastName || '',
    dob: rec.student?.dob || '', grade: rec.student?.grade || '',
    school: rec.student?.school || '', medical: rec.student?.medical || '',
  })
  const [g1, setG1] = useState({ ...(cust.guardian1 || {}) })
  const [g2, setG2] = useState({ ...(cust.guardian2 || {}) })
  const [em, setEm] = useState({ ...(cust.emergency || {}) })
  const [meta, setMeta] = useState({ ...(cust.meta || {}) })
  const [programs, setPrograms] = useState(() =>
    JSON.parse(JSON.stringify(child.rawPrograms || [])))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const setP = (i, k, v) => setPrograms(ps => ps.map((p, n) => (n === i ? { ...p, [k]: v } : p)))
  const removeP = (i) => setPrograms(ps => ps.filter((_, n) => n !== i))

  const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b)

  const save = async () => {
    setBusy(true); setErr('')

    /* Only the parts that actually changed are sent, and the same parts —
       as they were before — are what Undo puts back. Sending all three
       every time would rewrite the household for a spelling fix on a
       child's name, and undoing it would then rewrite the household back
       over whatever anyone else had corrected in the meantime. */
    const wasStudent = {
      firstName: rec.student?.firstName || '', lastName: rec.student?.lastName || '',
      dob: rec.student?.dob || '', grade: rec.student?.grade || '',
      school: rec.student?.school || '', medical: rec.student?.medical || '',
    }
    const before = {}
    const after = {}
    if (changed(student, wasStudent)) {
      before.student = wasStudent
      after.student = student
    }
    if (changed(g1, cust.guardian1 || {}) || changed(g2, cust.guardian2 || {})
      || changed(em, cust.emergency || {}) || changed(meta, cust.meta || {})) {
      before.customer = {
        guardian1: cust.guardian1 || {}, guardian2: cust.guardian2 || {},
        emergency: cust.emergency || {}, meta: cust.meta || {},
      }
      after.customer = { guardian1: g1, guardian2: g2, emergency: em, meta }
    }
    if (changed(programs, child.rawPrograms || [])) {
      before.programs = child.rawPrograms || []
      after.programs = programs
    }

    if (!Object.keys(after).length) { onClose(); return }
    try {
      await putSections(rec.id, after)
      await onSaved({
        recordId: rec.id,
        label: `Edit ${child.name || 'registration'} (${sub.ref})`,
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
      })
      onClose()
    } catch (e) {
      setErr(String(e?.message || '').startsWith('The server refused')
        ? e.message
        : 'Could not reach the server. Nothing was saved.')
      setBusy(false)
    }
  }

  return (
    <div className="rgov" onMouseDown={onClose}>
      <div className="rgmodal" onMouseDown={e => e.stopPropagation()}>
        <h2>Edit registration</h2>
        <div className="who">{sub.ref} · {child.name || 'unnamed child'}</div>

        <div className="egroup">Child</div>
        <div className="egrid">
          <EField label="First name" value={student.firstName} onChange={v => setStudent(s => ({ ...s, firstName: v }))} />
          <EField label="Last name" value={student.lastName} onChange={v => setStudent(s => ({ ...s, lastName: v }))} />
          <EField label="Date of birth" type="date" value={student.dob} onChange={v => setStudent(s => ({ ...s, dob: v }))} />
          <EField label="Grade" value={student.grade} onChange={v => setStudent(s => ({ ...s, grade: v }))} />
          <EField label="School" value={student.school} onChange={v => setStudent(s => ({ ...s, school: v }))} wide />
          <EField label="Allergies / medical" value={student.medical} onChange={v => setStudent(s => ({ ...s, medical: v }))} wide />
        </div>

        <div className="egroup">Guardian 1</div>
        <div className="egrid">
          <EField label="First name" value={g1['First Name']} onChange={v => setG1(o => ({ ...o, 'First Name': v }))} />
          <EField label="Last name" value={g1['Last Name']} onChange={v => setG1(o => ({ ...o, 'Last Name': v }))} />
          <EField label="Relationship" value={g1['Relationship']} onChange={v => setG1(o => ({ ...o, Relationship: v }))} />
          <EField label="Phone" value={g1['Phone']} onChange={v => setG1(o => ({ ...o, Phone: v }))} />
          <EField label="Email" value={g1['Email']} onChange={v => setG1(o => ({ ...o, Email: v }))} wide />
        </div>

        <div className="egroup">Guardian 2</div>
        <div className="egrid">
          <EField label="First name" value={g2['First Name']} onChange={v => setG2(o => ({ ...o, 'First Name': v }))} />
          <EField label="Last name" value={g2['Last Name']} onChange={v => setG2(o => ({ ...o, 'Last Name': v }))} />
          <EField label="Relationship" value={g2['Relationship']} onChange={v => setG2(o => ({ ...o, Relationship: v }))} />
          <EField label="Phone" value={g2['Phone']} onChange={v => setG2(o => ({ ...o, Phone: v }))} />
          <EField label="Email" value={g2['Email']} onChange={v => setG2(o => ({ ...o, Email: v }))} wide />
        </div>

        <div className="egroup">Emergency contact</div>
        <div className="egrid">
          <EField label="First name" value={em['First Name']} onChange={v => setEm(o => ({ ...o, 'First Name': v }))} />
          <EField label="Last name" value={em['Last Name']} onChange={v => setEm(o => ({ ...o, 'Last Name': v }))} />
          <EField label="Relationship" value={em['Relationship']} onChange={v => setEm(o => ({ ...o, Relationship: v }))} />
          <EField label="Phone" value={em['Phone']} onChange={v => setEm(o => ({ ...o, Phone: v }))} />
        </div>

        <div className="egroup">Submission</div>
        <div className="egrid">
          <EField label="Source" value={meta.source} onChange={v => setMeta(o => ({ ...o, source: v }))} />
          <EField label="Notes" value={meta.notes} onChange={v => setMeta(o => ({ ...o, notes: v }))} wide />
        </div>

        {/* Guardian and emergency details belong to the household, so
            editing them here changes them for every child on this
            submission — worth saying rather than surprising someone. */}
        {sub.childCount > 1 && (
          <div className="enote">
            Guardian, emergency and submission details are shared with the
            other {sub.childCount - 1} child{sub.childCount - 1 === 1 ? '' : 'ren'} on {sub.ref}.
          </div>
        )}

        <div className="egroup">Enrolments</div>
        {programs.length === 0 && <div className="enote">No enrolments on this child.</div>}
        {programs.map((p, i) => (
          <div className="eprog" key={i}>
            <div className="egrid">
              <EField label="Program" value={p.title} onChange={v => setP(i, 'title', v)} wide />
              <EField label="Year" value={p.year} onChange={v => setP(i, 'year', v)} />
              <EField label="Location" value={p.location} onChange={v => setP(i, 'location', v)} />
              <EField label="Day" value={p.day} onChange={v => setP(i, 'day', v)} />
              <EField label="Time" value={p.time} onChange={v => setP(i, 'time', v)} />
              <EField label="Fee" type="number" value={p.fee} onChange={v => setP(i, 'fee', v === '' ? '' : Number(v))} />
              <label className="ef">
                <span>Active</span>
                <input type="checkbox" checked={p.active !== false}
                  onChange={e => setP(i, 'active', e.target.checked)} />
              </label>
            </div>
            <button type="button" className="edrop" onClick={() => removeP(i)}>Remove enrolment</button>
          </div>
        ))}
        <button type="button" className="eadd"
          onClick={() => setPrograms(ps => [...ps, { title: '', year: '', location: '', day: '', time: '', fee: '', active: true }])}>
          + Add enrolment
        </button>

        {err && <div className="eerr">{err}</div>}

        <div className="eacts">
          <button type="button" className="cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="go" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- cell helpers -------------------------------------------------------
function k0Notes(record) {
  return record?.customer?.meta?.notes || record?.student?.notes || ''
}

function programField(p, k) {
  if (!p) return ''
  switch (k) {
    case 'program':  return p.title || p.name || ''
    case 'year':     return p.year || ''
    case 'location': return p.location || ''
    case 'day':      return p.day || ''
    case 'time':     return p.time || ''
    case 'fee':      return p.fee ?? ''
    default:         return ''
  }
}

function familyCell(k, s) {
  const v = s[k]
  if (k === 'ref') return <span className="rref">{v || '—'}</span>
  if (k === 'status') {
    return <span className={'tag ' + (v === 'Confirmed' ? 'ok' : 'wait')}>{v}</span>
  }
  return v || <span className="dash">—</span>
}

function childCell(k, child) {
  const v = child[k]
  if (k === 'child') return <span className="cname">{child.name || <span className="dash">—</span>}</span>
  return v || <span className="dash">—</span>
}
