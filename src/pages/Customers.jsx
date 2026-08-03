// Customers — a list of families and a per-student detail view.
//
// The layout follows the Programs page: scoped CSS block, an actions
// toolbar, accent-barred metric tiles, a filters row, and a pill-cell
// table with sortable, reorderable, hideable columns. The dialog host
// and popover styling are duplicated rather than shared with Programs —
// its `.pgov`/`.pgmodal` rules only exist while that page is mounted.
//
// The list gives each student its own row and blanks the guardian cells
// on repeats, the way Programs blanks repeated values within a program.
// The old layout stacked siblings inside one tall cell and lined them up
// with a hard-coded 28px line-height, which came apart the moment a
// guardian name was long enough to wrap.
//
// Column layout lives in localStorage, not on the server: there is no
// per-page state collection for this page the way `programs_state` backs
// Programs, and adding one is a migration on maya-pc for a preference
// that is per-browser anyway.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Trash2, Copy, Undo2, Redo2, Eye, Download, UserPlus, ExternalLink } from 'lucide-react'
import { useStore } from '../data/store'
import {
  engineForEntry, outstandingFor, money, MONTH_KEYS, SCHEDULE_UNITS, TOTAL_LESSONS,
} from '../data/fees'
import { entrySlots } from '../data/enrolment'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }

/* Shared with Contests and Class Lists. The page used to carry its own
   greens and yellows, which read as a different product. */
const STATUS_STYLE = {
  Active:       { bg: '#dff5e0', fg: '#2b7a2e' },
  'Late Start': { bg: '#fff4d6', fg: '#8a6a00' },
  'On-Hold':    { bg: '#eef1f4', fg: '#6B6455' },
  Completed:    { bg: '#e4f2fb', fg: '#1c6ea4' },
  Cancelled:    { bg: '#fde0e0', fg: '#a12626' },
  Inactive:     { bg: '#eef1f4', fg: '#6B6455' },
}
const statusStyle = (s) => STATUS_STYLE[s] || STATUS_STYLE.Inactive

const COLS = [
  { k: 'family',  l: 'Family ID' },
  { k: 'g1',      l: 'Guardian 1' },
  { k: 'g2',      l: 'Guardian 2' },
  { k: 'student', l: 'Student' },   // never hideable — it names the row
  { k: 'grade',   l: 'Grade' },
  { k: 'classes', l: 'Classes' },
]
const LOCKED_COL = 'student'

/* A family reference is an identifier, so it is written to the record and
   never recomputed. Once F0003 belongs to a family it stays theirs even if
   F0002 is deleted — numbers are consumed, not reused. */
const familyRef = (n) => 'F' + String(n).padStart(4, '0')
const refNumber = (ref) => {
  const m = /^F(\d+)$/.exec(String(ref || '').trim())
  return m ? Number(m[1]) : 0
}

/* Give every family a stored reference, assigning above the highest ever
   issued. Runs once per record that lacks one; siblings inherit whatever
   the family already has rather than taking a fresh number. */
function useFamilyIds(records, assign) {
  const done = useRef(new Set())
  const byFamily = useMemo(() => {
    const m = new Map()
    for (const r of (records || [])) {
      if (r.id === 'seed') continue
      const key = guardianIdentity(r) || `unknown-${r.id}`
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(r)
    }
    return m
  }, [records])

  const refs = useMemo(() => {
    let highest = 0
    for (const r of (records || [])) highest = Math.max(highest, refNumber(r.customer?.meta?.familyId))
    const out = new Map()
    for (const [key, members] of byFamily) {
      const existing = members.map(m => m.customer?.meta?.familyId).find(v => refNumber(v) > 0)
      out.set(key, existing || familyRef(++highest))
    }
    return out
  }, [byFamily, records])

  useEffect(() => {
    if (!assign) return
    for (const [key, members] of byFamily) {
      const ref = refs.get(key)
      for (const m of members) {
        if (m.customer?.meta?.familyId === ref) continue
        if (done.current.has(m.id)) continue
        done.current.add(m.id)
        assign(m.id, ref)
      }
    }
  }, [byFamily, refs, assign])

  return refs
}

const SOURCES = ['Website', 'Walk-in', 'Phone', 'Email', 'Referral', 'Returning Family', 'Event', 'Other']
const CONSENTS = ['Photo', 'Walk Home', 'Media / Social', 'Terms & Conditions']

/* Proportions rather than pixels, and they sum to 100 — a fixed layout
   hands leftover space to any pixel column, which starves the text ones
   on a wide screen. Sized so nothing is squeezed at the 820px min-width. */
const SEL_W = '3%'
const ACT_W = '7%'
const COL_W = { family: '12%', g1: '15%', g2: '14%', student: '17%', grade: '9%', classes: '20%' }

const CPREF_KEY = 'customers-cols'
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

/* A record with no guardian name and no email has no family identity yet
   (a just-added blank student), so it stands on its own keyed by its id
   rather than collapsing with every other guardian-less record into one
   fake family. */
function guardianIdentity(r) {
  const g1 = r.customer?.guardian1 || {}
  return `${g1['First Name'] || ''} ${g1['Last Name'] || ''} ${g1['Email'] || ''}`.trim().toLowerCase()
}
const personName = (p) => p ? `${p['First Name'] || ''} ${p['Last Name'] || ''}`.trim() : ''

function classesOf(record) {
  const seen = new Set()
  const out = []
  for (const p of (record.programs || [])) {
    if (!p.program || seen.has(p.program)) continue
    seen.add(p.program)
    out.push(p.program)
  }
  return out
}

const CSS = `
.cu{--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;--dark-brown:#2E2516;
    --line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;--danger:#C0392B;
    --shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}
.cu .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.cu .actions button{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:6px 12px;
    font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;
    display:inline-flex;align-items:center;gap:5px}
.cu .actions button:hover:not(:disabled){background:#f4f2ea}
.cu .actions button:disabled{opacity:.4;cursor:default}
.cu .actions button.danger{color:var(--danger);border-color:#eecfca}
.cu .actions button.danger:hover{background:#fdf3f1}

.cu .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.cu .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.cu .metric.clickable{cursor:pointer}
.cu .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.cu .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.cu .metric.mstu{border-bottom-color:var(--yellow)}
.cu .metric.menr{border-bottom-color:var(--light-blue)}
.cu .metric.mnone{border-bottom-color:#c0392b}
.cu .metric.mowed{border-bottom-color:#8a6a00}
.cu .famref{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--muted);font-weight:600}
.cu .filters .toggle{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;
    color:var(--muted);cursor:pointer}
.cu .filters .toggle input{accent-color:var(--teal);cursor:pointer;margin:0}
.cu .frow .selin{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--field);
    border-radius:8px;font:inherit;font-size:13px;background:#fff;color:var(--dark-brown)}
.cu .frow .selin:focus{outline:none;border-color:var(--teal)}
.cu .consents{display:flex;flex-direction:column;gap:6px;margin-top:10px;padding-top:10px;
    border-top:1px solid var(--line)}
.cu .consent{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dark-brown);cursor:pointer}
.cu .consent input{accent-color:var(--teal);cursor:pointer;margin:0}
.cu .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.cu .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.cu .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.cu .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.cu .filters input[type=search],.cu .filters select{padding:7px 12px;border:1px solid var(--field);
    border-radius:8px;font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit}
.cu .filters input[type=search]:focus,.cu .filters select:focus{outline:none;border-color:var(--teal)}
.cu .filters input[type=search]{width:240px}
/* Scoped to this input. The old rule was a bare input::placeholder in a
   page-level <style>, which turned every placeholder on the page white. */
.cu .filters input[type=search]::placeholder{color:var(--faint)}
.cu .filters .addbtn{border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;
    background:var(--light-blue);color:var(--dark-brown);cursor:pointer;font-family:inherit;margin-left:auto;
    display:inline-flex;align-items:center;gap:5px}
.cu .filters .addbtn:hover{filter:brightness(1.08)}
.cu .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.cu .clearf:hover{background:#f1f5f4}

.cu .bulkbar{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#eef7f6;
    border:1px solid var(--line);border-radius:10px;margin-bottom:12px}
.cu .bulkbar .n{font-weight:700;font-size:13px;margin-right:14px}
.cu .bulkbar button{border:none;border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:600;
    cursor:pointer;font-family:inherit}
.cu .bulkbar .del{background:#c0392b;color:#fff}
.cu .bulkbar .clr{background:transparent;border:1px solid var(--field);color:var(--muted)}
.cu .bulkbar .acts{display:inline-flex;align-items:center;gap:8px}

.cu .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.cu table{width:100%;min-width:820px;table-layout:fixed;border-collapse:separate;
    border-spacing:5px 5px;background:#fff}
.cu thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
/* Icons are pinned to the right only, so padding belongs on that side.
   Reserving 30px each way left "Family ID" about 30px and it read "FAMIL". */
.cu thead th.colh .lbl{display:block;text-align:center;padding:0 20px 0 4px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cu thead th.selcol,.cu thead th:empty,.cu thead th.blankhead,
.cu tbody td.selcol,.cu tbody td.actcell{background:transparent}
.cu thead th.selcol input,.cu tbody td.selcol input{width:12px;height:12px;margin:0;
    accent-color:var(--teal);vertical-align:middle;cursor:pointer}
.cu tbody td.actcell{white-space:nowrap;text-align:center}
/* A student in two classes must show both names, not the first and an
   ellipsis — which class the second one is, is the whole point of the
   column. Only this column wraps; the row grows to fit. */
.cu tbody td.col-classes{white-space:normal;height:auto;padding-top:3px;padding-bottom:3px}
.cu .selcol{text-align:center}
.cu thead th .arw{opacity:.85;font-size:10px}
.cu thead th.colh{cursor:grab}
.cu thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1}
.cu thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.cu thead th.colh:hover .eye{opacity:1}
.cu thead th .sortable{cursor:pointer}

.cu tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:22px;overflow:hidden;text-overflow:ellipsis}
.cu tbody td.rep{background:transparent !important}
.cu tbody tr.grpsep td{background:transparent;height:1px;padding:0;border-radius:0;
    border-top:1px solid #CFD6D8}
.cu tbody tr.grpsep td.nosep{border-top:none}
.cu tbody tr{cursor:pointer}
.cu tbody tr:hover td{background:#E4EFF3}
.cu tbody tr.sel td{background:#DCEEEC}
.cu td.col-grade{text-align:center}
.cu .sname{font-weight:700;color:#3d7f7d}
.cu button.clink{background:none;border:none;padding:0;margin:0;font:inherit;font-size:12px;
    color:#3d7f7d;cursor:pointer;text-align:left}
.cu button.clink:hover{text-decoration:underline}
.cu .dash{color:var(--faint)}
.cu .rowbtn{background:none;border:none;color:#c9c3b5;padding:0 2px;margin:0;line-height:1;
    cursor:pointer;transition:color .15s;display:inline-flex;vertical-align:middle}
.cu .rowbtn.rb-add:hover,.cu .rowbtn.rb-dup:hover{color:var(--teal)}
.cu thead tr.frow th{background:#eaf3f2;padding:5px 6px;border-radius:0}
.cu thead tr.frow th:empty{background:transparent}
.cu .colf{width:100%;background:#fff;border:1px solid var(--field);border-radius:7px;padding:4px 6px;
    font-size:11.5px;color:var(--dark-brown);font-weight:600;cursor:pointer;font-family:inherit}
.cu .colf.on{background:var(--light-blue);border-color:var(--light-blue)}
.cu .rowbtn.rb-del:hover{color:#c0392b}
.cu .empty{text-align:center;color:var(--muted);padding:60px 20px}
.cu .empty b{color:var(--dark-brown)}
.cu .tcount{color:var(--muted);font-size:12px;padding:10px 2px;text-align:right}

/* ---- detail view ---- */
.cu .back{display:inline-flex;align-items:center;gap:5px;background:none;border:none;cursor:pointer;
    color:var(--teal);font-weight:700;font-size:13.5px;margin-bottom:10px;padding:0;font-family:inherit}
.cu .back:hover{text-decoration:underline}
.cu .panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:22px}
.cu .sec-h{font-size:13px;font-weight:700;color:var(--teal);margin:0 0 12px;padding-bottom:7px;
    border-bottom:1px solid var(--line);text-transform:uppercase;letter-spacing:.4px}
.cu .frow{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center;margin-bottom:8px}
.cu .frow label{text-align:right;font-size:12px;font-weight:600;color:var(--muted);line-height:1.2}
.cu .frow input,.cu .frow .ro{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--field);
    border-radius:8px;font:inherit;font-size:13px;background:#fff;color:var(--dark-brown)}
.cu .frow input:focus{outline:none;border-color:var(--teal)}
.cu .frow .ro{background:var(--pill);color:var(--muted)}
.cu .frow input.warn{background:#fffbf0;border-color:#f4d67a}
.cu .frow input.bad{background:#fde0e0;border-color:#e8b4b4;color:#a12626;font-weight:600}
.cu .sibs{margin-bottom:12px}
.cu .sib{cursor:pointer;font-size:13px;font-weight:600;color:var(--teal);padding:5px 9px;
    border-radius:7px;margin-bottom:3px;background:transparent}
.cu .sib:hover{background:#f1f5f4}
.cu .sib.on{background:#DCEEEC;color:var(--dark-brown);font-weight:700}
.cu .addsib{background:transparent;border:1px dashed var(--teal);color:var(--teal);border-radius:8px;
    padding:6px 11px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;
    display:inline-flex;align-items:center;gap:5px;margin-top:4px}
.cu .progh{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:26px 0 10px;
    padding-bottom:7px;border-bottom:1px solid var(--line)}
.cu .progh .t{font-size:13px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.4px}
.cu .progh label{font-size:12.5px;font-weight:600;color:var(--muted);display:flex;align-items:center;gap:7px;cursor:pointer}
.cu .progh label input{accent-color:var(--teal);cursor:pointer}
.cu .ptable{width:100%;border-collapse:separate;border-spacing:5px 5px;background:#fff}
.cu .ptable thead th{background:var(--teal);color:#fff;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 8px;border-radius:6px;white-space:nowrap}
.cu .ptable tbody td{background:var(--pill);border-radius:5px;font-size:12px;padding:5px 8px;
    text-align:center;vertical-align:middle;white-space:nowrap}
.cu .ptable tbody tr:hover td{background:#E4EFF3}
.cu .ptable .pname{font-weight:600;text-transform:uppercase;text-align:left}
.cu .pill{display:inline-block;border-radius:999px;padding:3px 10px;font-size:10.5px;font-weight:700;
    letter-spacing:.3px;text-transform:uppercase;white-space:nowrap}
.cu .feelab{font-size:9px;color:#fff;font-weight:700;width:16px;display:inline-block;text-align:center}
.cu .feebtn{background:#fff;border:1px solid var(--field);border-radius:7px;padding:3px 9px;
    font-size:11.5px;font-weight:700;color:var(--dark-brown);cursor:pointer;font-family:inherit;white-space:nowrap}
.cu .feebtn:hover{background:#f1f5f4}
/* The panel is rendered inside a table cell, and .cu tbody td sets
   white-space:nowrap — which the labels and the hint inherit, so they ran
   past the edge of their column instead of wrapping. Reset it here. */
.cu .feepanel{background:#fff;border:1px solid var(--line);border-left:3px solid var(--teal);
    border-radius:10px;padding:14px 16px;margin:2px 4px 0;text-align:left;white-space:normal}
.cu .feehead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;
    padding-bottom:7px;border-bottom:1px solid var(--line)}
.cu .feehead .t{font-size:12.5px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.4px}
.cu .pdfbtn{background:var(--pill);border:1px solid var(--field);border-radius:7px;padding:4px 10px;
    font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--dark-brown)}
.cu .pdfbtn:disabled{opacity:.5;cursor:default}
/* Three flex columns, each a stack of "label … control" rows — the
   template's layout. The label takes the slack and the control is a fixed
   96px, so nothing can be pushed out of the panel however long a label or a
   <select> option runs. The auto-fit grid this replaced could not shrink
   below its widest option ("Every 3 Months") and overflowed by 60px. */
.cu .fspgrid{display:flex;gap:24px;align-items:flex-start;margin-bottom:2px}
.cu .fspcol{flex:1;min-width:0}
.cu .fsprow{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.cu .fsprow label{flex:1;min-width:0;font-size:11.5px;font-weight:600;color:var(--muted)}
.cu .fsprow input,.cu .fsprow select{flex:0 0 96px;min-width:0;box-sizing:border-box;background:#fff;
    border:1px solid var(--field);border-radius:6px;height:24px;padding:0 7px;
    font:inherit;font-size:11.5px;color:var(--dark-brown)}
.cu .fsprow input:focus,.cu .fsprow select:focus{outline:none;border-color:var(--teal)}
.cu .fsprow.calc b{font-size:12px;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.cu .fsprow.calc.total b{font-size:14px}
.cu .fsprow.calc.paidline b{color:#2b7a2e}
.cu .fsprow.calc.owedline b{color:var(--danger)}
.cu .fsprow.fee input{flex:0 0 72px;text-align:right}
.cu .fsprow.fee label,.cu .fsprow.fee input{color:var(--danger)}
.cu .fsprow.paidfee label{color:#2b7a2e}
.cu .fsprow.paidfee input{color:#2b7a2e;background:#DEF2DE;border-color:#8CC79A;font-weight:700}
.cu .fsprow.mo label{color:var(--danger)}
.cu .fsprow.mo b{font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--danger)}
.cu .fsprow.mo.off label,.cu .fsprow.mo.off b{color:var(--faint)}
.cu .fsprow.mo.paidmo label{color:#2b7a2e}
.cu .fsprow.mo.paidmo b{color:#2b7a2e;font-weight:800}
.cu .fsphr{height:1px;background:var(--line);margin:8px 0}
.cu .fsphint{font-size:10.5px;color:var(--faint);margin:8px 0 0;line-height:1.4}
.cu .fspmh{font-size:11.5px;font-weight:700;color:var(--teal);margin-bottom:6px;
    padding-bottom:4px;border-bottom:1px solid var(--light-blue)}
.cu .fspcol.months{padding:0 6px;align-self:flex-start}
.cu .discwrap{flex:0 0 96px;display:flex;gap:3px;min-width:0}
.cu .discwrap input{flex:1;min-width:0}
.cu .discwrap select.discunit{flex:0 0 38px;padding:0 2px}
/* One column is unreadably narrow on a laptop; stack them instead. */
@media (max-width:1080px){ .cu .fspgrid{flex-wrap:wrap} .cu .fspcol{flex:1 1 260px} }
.cu .sessrows{border-top:1px solid var(--line);margin-top:12px;padding-top:10px}
.cu .sesshead{font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;
    letter-spacing:.4px;margin-bottom:7px}
.cu .sessrow{display:flex;gap:6px;align-items:center;margin-bottom:5px}
.cu .sessrow select{width:80px;flex:none}
.cu .sessrow input{flex:1;min-width:0}
.cu .sessrow select,.cu .sessrow input{padding:5px 8px;border:1px solid var(--field);border-radius:7px;
    font:inherit;font-size:12.5px;background:#fff;color:var(--dark-brown);box-sizing:border-box}
.cu .sessrow select:focus,.cu .sessrow input:focus{outline:none;border-color:var(--teal)}
.cu .sessx{background:none;border:none;color:#c9c3b5;font-size:16px;cursor:pointer;padding:0 5px;line-height:1}
.cu .sessx:hover{color:var(--danger)}
.cu .sessadd{background:transparent;border:1px dashed var(--teal);color:var(--teal);border-radius:7px;
    padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;margin-top:3px}

.cupop{position:fixed;z-index:220;background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:8px 12px 10px;min-width:190px;max-height:360px;
    overflow:auto;color:#2E2516;font-family:inherit}
.cupop .h{font-size:12px;color:#6B6455;font-weight:700;margin:2px 2px 7px}
.cupop .ch{display:flex;align-items:center;gap:9px;padding:5px 3px;font-size:13px;font-weight:600;cursor:pointer}
.cupop .ch:hover{background:#f4f2ea;border-radius:6px}
.cupop .ch input{margin:0;accent-color:#5FA09E}
.cupop .ch.locked{opacity:.5;cursor:default}
.cupop .allrow{border-top:1px solid #EDEAE2;margin-top:4px;padding-top:4px;display:flex;gap:4px;
    position:sticky;bottom:0;background:#fff}
.cupop .allrow button{background:none;border:none;color:#5FA09E;font-weight:700;font-size:12.5px;
    text-align:center;padding:6px 8px;border-radius:6px;flex:1;cursor:pointer;font-family:inherit}
.cupop .allrow button:hover{background:#f4f2ea}

.cumenu{position:fixed;z-index:301;background:#fff;border:1px solid #E7EBE7;border-radius:10px;
    box-shadow:0 8px 24px rgba(46,37,22,.2);overflow:hidden;min-width:190px;color:#2E2516;font-family:inherit}
.cumenu div{padding:9px 15px;font-size:13px;cursor:pointer;font-weight:600}
.cumenu div:hover{background:#f1f5f4}
.cumenu div.del{color:#C0392B}
.cumenu .sep{height:1px;background:#E7EBE7;padding:0;margin:2px 0;cursor:default}
.cumenu .sep:hover{background:#E7EBE7}

.cuov{position:fixed;inset:0;background:rgba(46,37,22,.45);display:flex;align-items:center;
    justify-content:center;z-index:400;overflow:auto;padding:40px 16px}
.cumodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);width:100%;
    max-width:420px;margin:auto;padding:22px;color:#2E2516;font-family:inherit}
.cumodal h2{font-size:18px;margin:0 0 14px;color:#2E2516}
.cumodal .msg{font-size:13.5px;line-height:1.5;margin-bottom:18px}
.cumodal .macts{display:flex;gap:10px;justify-content:flex-end}
.cumodal .macts button{font:inherit;cursor:pointer;border:none;border-radius:8px;padding:8px 14px;
    background:#5FA09E;color:#fff;font-weight:600}
.cumodal .macts button:hover{filter:brightness(1.06)}
.cumodal .macts button.cancel{background:#eee;color:#2E2516}
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
        <div className="cuov"
          onClick={e => { if (e.target === e.currentTarget) finish(dlg.type === 'confirm' ? false : null) }}>
          <div className="cumodal" onClick={e => e.stopPropagation()}>
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

// ─── Shared bits ───────────────────────────────────────────────────────────

const ColsPop = React.forwardRef(function ColsPop({ rect, hiddenCols, onToggle, onAll, onNone }, ref) {
  const style = {
    top: Math.min(rect.bottom + 6, window.innerHeight - 300),
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 230)),
  }
  return (
    <div className="cupop" ref={ref} style={style}>
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
    <div className="cumenu" ref={ref} style={style}>
      {items.map((it, i) => it.sep
        ? <div key={i} className="sep" />
        : <div key={i} className={it.danger ? 'del' : ''} onClick={() => { onClose(); it.on() }}>{it.label}</div>)}
    </div>
  )
}

// ─── Customer list view ────────────────────────────────────────────────────

function CustomerList({ onSelect, onAdd, onAddSibling, onDuplicate, onDelete, onNavigate, familyIds }) {
  const { records, programs } = useStore()
  const dialog = useDialog()
  const [search, setSearch] = useState('')
  const [noClassesOnly, setNoClassesOnly] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [colFilters, setColFilters] = useState({})
  const [sort, setSort] = useState({ key: 'g1', dir: 1 })
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

  // Programs are named as free text on a registration; map back to a
  // program record so a class can link to it.
  const progByName = useMemo(() => {
    const m = new Map()
    for (const p of (programs || [])) if (p.name) m.set(String(p.name).trim().toUpperCase(), p)
    return m
  }, [programs])

  /* One row per student. Guardian identity groups them into families so
     the guardian cells can be blanked on repeats. */
  const allRows = useMemo(() => {
    const real = records.filter(r => r.id !== 'seed')
    const byFamily = new Map()
    for (const r of real) {
      const key = guardianIdentity(r) || `unknown-${r.id}`
      if (!byFamily.has(key)) byFamily.set(key, [])
      byFamily.get(key).push(r)
    }
    const rows = []
    for (const [key, students] of byFamily) {
      const first = students[0]
      const g1 = personName(first.customer?.guardian1)
      const g2 = personName(first.customer?.guardian2)
      const g1Email = first.customer?.guardian1?.['Email'] || ''
      const family = familyIds.get(key) || ''
      const sorted = [...students].sort((a, b) =>
        (a.student?.firstName || '').localeCompare(b.student?.firstName || '', undefined, { sensitivity: 'base' }))
      for (const s of sorted) {
        const progs = s.programs || []
        rows.push({
          id: s.id, record: s, familyKey: key, family,
          g1, g2, g1Email,
          student: `${s.student?.firstName || ''} ${s.student?.lastName || ''}`.trim(),
          grade: s.student?.grade || '',
          classList: classesOf(s),
          // Enrolled once but nothing running now — distinct from never enrolled.
          inactive: progs.length > 0 && !progs.some(p => p.active),
        })
      }
    }
    return rows
  }, [records, familyIds])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = allRows.filter(r => {
      if (noClassesOnly && r.classList.length > 0) return false
      if (!showInactive && r.inactive) return false
      for (const [k, want] of Object.entries(colFilters)) {
        if (!want) continue
        // Classes is a list, so a row matches if any of them is the one picked.
        if (k === 'classes') { if (!r.classList.includes(want)) return false }
        else if (String(r[k] || '') !== want) return false
      }
      if (!q) return true
      return r.g1.toLowerCase().includes(q) || r.g2.toLowerCase().includes(q) ||
             r.g1Email.toLowerCase().includes(q) || r.student.toLowerCase().includes(q) ||
             r.classList.some(c => c.toLowerCase().includes(q))
    })
    const val = (r) => {
      if (sort.key === 'classes') return r.classList.join(', ').toLowerCase()
      if (sort.key === 'grade') {
        const n = parseFloat(String(r.grade).replace(/[^0-9.]/g, ''))
        return isFinite(n) ? n : 999
      }
      return String(r[sort.key] || '').toLowerCase()
    }
    /* Ties fall back to guardian then student, so siblings stay together
       and the repeat-blanking below has runs to work with. */
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -sort.dir
      if (av > bv) return sort.dir
      const g = a.g1.localeCompare(b.g1, undefined, { sensitivity: 'base' })
      if (g) return g
      return a.student.localeCompare(b.student, undefined, { sensitivity: 'base' })
    })
  }, [allRows, search, noClassesOnly, showInactive, colFilters, sort])

  const metrics = useMemo(() => {
    const fams = new Set(allRows.map(r => r.familyKey))
    let enrolments = 0, noClasses = 0
    for (const r of allRows) {
      enrolments += (r.record.programs || []).filter(p => p.active).length
      if (r.classList.length === 0) noClasses++
    }
    // Real money still to collect, from the same engine the fee panel uses.
    const owed = outstandingFor(allRows.map(r => r.record))
    return { families: fams.size, students: allRows.length, enrolments, noClasses, owed }
  }, [allRows])

  /* Values actually present, so a filter never offers a dead end. */
  const filterOptions = useMemo(() => {
    const out = {}
    for (const c of COLS) {
      const vals = new Set()
      for (const r of allRows) {
        if (c.k === 'classes') r.classList.forEach(v => v && vals.add(v))
        else if (r[c.k]) vals.add(String(r[c.k]))
      }
      out[c.k] = [...vals].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    }
    return out
  }, [allRows])

  const anyFilterActive = !!search || noClassesOnly || showInactive || Object.values(colFilters).some(Boolean)
  const clearAllFilters = () => { setSearch(''); setNoClassesOnly(false); setShowInactive(false); setColFilters({}) }
  const allSel = visible.length > 0 && visible.every(r => selected.has(r.id))
  const selectedRows = useMemo(() => visible.filter(r => selected.has(r.id)), [visible, selected])

  const bulkDelete = async () => {
    const n = selectedRows.length
    const ok = await dialog.confirm(
      `Delete ${n} student${n === 1 ? '' : 's'}? This also removes their linked customer and guardian information, and cannot be undone.`,
      { title: 'Delete Selected' })
    if (!ok) return
    for (const r of selectedRows) await onDelete(r.record, { silent: true })
    setSelected(new Set())
  }

  const exportCsv = () => {
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const head = ['Guardian 1', 'Guardian 1 Email', 'Guardian 2', 'Student', 'Grade', 'School', 'Classes']
    const lines = [head.join(',')]
    for (const r of allRows) {
      lines.push([r.g1, r.g1Email, r.g2, r.student, r.grade,
        r.record.student?.school || '', r.classList.join('; ')].map(esc).join(','))
    }
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `crania-customers-export-${new Date().toISOString().slice(0, 10)}.csv`
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

  // ---- body rows, with repeated guardians blanked ----
  const bodyRows = []
  let prevFam = null
  visible.forEach((r) => {
    const sameFam = prevFam !== null && prevFam === r.familyKey
    if (prevFam !== null && prevFam !== r.familyKey) {
      bodyRows.push(
        <tr className="grpsep" key={'sep-' + r.id}>
          <td className="nosep" /><td colSpan={orderedCols.length + 1} />
        </tr>
      )
    }
    prevFam = r.familyKey

    const isSel = selected.has(r.id)
    const tds = orderedCols.map(c => {
      const k = c.k
      // Family reference belongs to the family, not each sibling.
      if ((k === 'g1' || k === 'g2' || k === 'family') && sameFam) {
        return <td key={k} className={`col-${k} rep`} />
      }

      let content
      if (k === 'family') {
        content = r.family ? <span className="famref">{r.family}</span> : <span className="dash">—</span>
      } else if (k === 'student') {
        content = <span className="sname">{r.student || <span className="dash">—</span>}</span>
      } else if (k === 'classes') {
        content = r.classList.length === 0 ? <span className="dash">—</span> : r.classList.map((c, i) => {
          const prog = progByName.get(c.trim().toUpperCase())
          return (
            <React.Fragment key={c}>
              {i > 0 && ', '}
              {prog ? (
                <button className="clink" title={`Open ${c} in Programs`}
                  onClick={e => { e.stopPropagation(); onNavigate && onNavigate('Programs', prog.id) }}
                >{c}</button>
              ) : <span title="Not in the Programs list">{c}</span>}
            </React.Fragment>
          )
        })
      } else {
        content = r[k] === '' || r[k] == null ? <span className="dash">—</span> : r[k]
      }

      const title = k === 'classes' ? r.classList.join(', ') : String(r[k] || '')
      return <td key={k} className={`col-${k}`} title={title}>{content}</td>
    })

    bodyRows.push(
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
        {tds}
        <td className="actcell" onClick={e => e.stopPropagation()}>
          <button className="rowbtn rb-add" title="Add a sibling to this family"
            onClick={() => onAddSibling(r.record)}><UserPlus size={12} /></button>
          <button className="rowbtn rb-dup" title="Duplicate this student"
            onClick={() => onDuplicate(r.record)}><Copy size={12} /></button>
          <button className="rowbtn rb-del" title="Delete this student"
            onClick={() => onDelete(r.record)}><Trash2 size={12} /></button>
        </td>
      </tr>
    )
  })

  return (
    <div className="page cu" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>
      <h2 className="page-title">Customers</h2>

      <div className="actions">
        <button title="Choose which columns are shown" style={{ marginLeft: 'auto' }}
          onClick={e => setPop({ kind: 'cols', rect: e.currentTarget.getBoundingClientRect() })}
        ><Eye size={13} /> Columns</button>
        <button title="Download every student as a CSV file" onClick={exportCsv}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="label">Families</div><div className="value">{metrics.families}</div>
          <div className="hint">grouped by guardian</div>
        </div>
        <div className="metric mstu">
          <div className="label">Students</div><div className="value">{metrics.students}</div>
          <div className="hint">across all families</div>
        </div>
        <div className="metric menr">
          <div className="label">Active Enrolments</div><div className="value">{metrics.enrolments}</div>
          <div className="hint">programs marked active</div>
        </div>
        <div className={'metric mnone clickable' + (noClassesOnly ? ' on' : '')}
          title="Click to show only students with no classes"
          onClick={() => setNoClassesOnly(v => !v)}>
          <div className="label">No Classes</div><div className="value">{metrics.noClasses}</div>
          <div className="hint">not enrolled in anything</div>
        </div>
        <div className="metric mowed">
          <div className="label">Outstanding Fees</div>
          <div className="value" style={{ fontSize: metrics.owed >= 100000 ? 19 : 22 }}>{money(metrics.owed)}</div>
          <div className="hint">still to collect</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search guardians, students or classes…" autoComplete="off" />
        <label className="toggle" title="Students whose programs have all finished">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
        <button className="addbtn" onClick={onAdd}><UserPlus size={14} /> Add Family</button>
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
          <div className="empty"><b>No families yet.</b><br />Click “Add Family” to create your first one.</div>
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
              {/* Filter row: each column offers the values actually present,
                  so narrowing to a grade or a class needs no typing. */}
              <tr className="frow">
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
          { label: 'Add Sibling', on: () => onAddSibling(rowCtx.row.record) },
          { sep: true },
          { label: 'Delete Student', danger: true, on: () => onDelete(rowCtx.row.record) },
        ]} />
      )}
    </div>
  )
}

// ─── Customer detail view ──────────────────────────────────────────────────

const FEE_LABELS = ['REG', 'MAT', 'A', 'S', 'O', 'N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J']
const FEE_KEYS   = ['reg', 'mat', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul']

const SECTIONS = ['student', 'guardian1', 'guardian2', 'emergency']

function Field({ label, value, readOnly, onChange, highlightEmail = true }) {
  let cls = ''
  if (label === 'Email' && highlightEmail) cls = 'warn'
  if (label === 'Medical Conditions' && value) cls = 'bad'
  return (
    <div className="frow">
      <label>{label}:</label>
      {readOnly
        ? <div className="ro">{value || ' '}</div>
        : <input className={cls} value={value || ''} onChange={e => onChange && onChange(e.target.value)} />}
    </div>
  )
}

function FeeSquare({ state, onChange, amount, label }) {
  const colors = { paid: '#cfe6b4', pending: '#f6e3a1', overdue: '#e8503f', empty: '#e8ecef' }
  const next = { paid: 'pending', pending: 'overdue', overdue: 'empty', empty: 'paid' }
  // Carries the money, so hovering a square answers "how much is this one?"
  const title = amount != null && amount > 0
    ? [label, money(amount), state].filter(Boolean).join(' · ')
    : state
  return (
    <button type="button" onClick={() => onChange(next[state] || 'paid')}
      style={{
        width: 16, height: 16, borderRadius: 3, border: 'none',
        background: colors[state] || colors.empty, cursor: 'pointer', padding: 0, flexShrink: 0,
      }}
      title={title} />
  )
}

function derivedPayment(fees) {
  const states = Object.values(fees || {}).filter(s => s && s !== 'empty')
  if (!states.length) return ''
  if (states.includes('overdue')) return 'Overdue'
  if (states.includes('pending')) return 'Pending'
  if (states.every(s => s === 'paid')) return 'Paid'
  return ''
}

const PAYMENT_STYLE = {
  Paid:    { bg: '#dff5e0', fg: '#2b7a2e' },
  Pending: { bg: '#fff4d6', fg: '#8a6a00' },
  Overdue: { bg: '#fde0e0', fg: '#a12626' },
}

/* Opening the panel on a program that has never been costed should show the
   price it is sold at, not zero — a total of $138 beside a row reading
   "$289 /wk" looks like the calculator is broken when it is only unfilled. */
const feeCalcFor = (prog) => {
  if (prog && prog.feeCalc) return prog.feeCalc
  const n = Number(String((prog && prog.rate) || '').replace(/[^\d.]/g, ''))
  return { firstLesson: 1, monthlyFee: Number.isFinite(n) ? n : 0, regFee: 79, matFee: 59, discount: 0, discountType: '%' }
}

// Stable across filtering, unlike a position in the visible array.
const progKey = (prog, i) => `${prog?.program || ''}|${prog?.year || ''}|${i}`

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/* When a class runs more than once a week. A DOUBLE attends twice and an
   UNLIMITED up to five times, and each slot is its own register — so each
   needs recording separately rather than being crammed into one line.
   `schedule` is kept in step because the roster pages match on it. */
function SessionRows({ prog, onChange }) {
  const rows = entrySlots(prog).map((text) => {
    const m = /^\s*(\S+)\s+(.*)$/.exec(text) || []
    return { day: m[1] || '', time: (m[2] || '').trim() }
  })
  const list = rows.length ? rows : [{ day: '', time: '' }]

  const commit = (next) => {
    const clean = next.filter(s => s.day || s.time)
    onChange(
      clean.map(s => ({ day: s.day, time: s.time, duration: '' })),
      clean.map(s => [s.day, s.time].filter(Boolean).join(' ')).join(', '),
    )
  }
  const setAt = (i, patch) => commit(list.map((s, k) => k === i ? { ...s, ...patch } : s))

  return (
    <div className="sessrows">
      <div className="sesshead">Sessions — one register each</div>
      {list.map((s, i) => (
        <div className="sessrow" key={i}>
          <select value={s.day} onChange={e => setAt(i, { day: e.target.value })}>
            <option value="">Day</option>
            {DAY_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input placeholder="4:30 pm" value={s.time} onChange={e => setAt(i, { time: e.target.value })} />
          <button className="sessx" title="Remove this session"
            onClick={() => commit(list.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      <button className="sessadd" onClick={() => commit([...list, { day: '', time: '' }])}>
        + Add session
      </button>
    </div>
  )
}

function ProgramRow({ prog, onToggleActive, onFeeChange, onCalcChange, onSessionsChange, expanded, onToggleExpand, onPdf, pdfBusy }) {
  const status = prog.active ? 'Active' : 'Inactive'
  const ss = statusStyle(status)
  /* Payment now follows the money, not just the square colours: a program
     is Paid when the ticked squares cover the total the engine computes. */
  const e = prog.feeCalc ? engineForEntry(prog) : null
  const payment = e
    ? (e.total > 0 && e.paid >= e.total - 0.005 ? 'Paid' : e.paid > 0 ? 'Partial' : 'Unpaid')
    : derivedPayment(prog.fees)
  const ps = PAYMENT_STYLE[payment] || { bg: '#eef1f4', fg: '#6B6455' }
  const fc = feeCalcFor(prog)
  const setCalc = (patch) => onCalcChange(prog, { ...fc, ...patch })

  return (
    <>
      <tr>
        <td>
          <input type="checkbox" checked={prog.active || false} onChange={() => onToggleActive(prog)}
            style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#5FA09E', margin: 0 }} />
        </td>
        <td><span className="pill" style={{ background: ss.bg, color: ss.fg }}>{status}</span></td>
        <td>{prog.year || '—'}</td>
        <td className="pname">{prog.program || '—'}</td>
        <td>
          {prog.rate
            ? <><b>{prog.rate}</b>{prog.rateUnit && <span style={{ color: '#9A948A' }}> {prog.rateUnit}</span>}</>
            : <span style={{ color: '#9A948A' }}>—</span>}
        </td>
        <td>
          {/* Each square is worth what that installment bills, so hovering
              one answers "how much is this?" without opening the panel. */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
            {FEE_KEYS.map((k, i) => (
              <FeeSquare key={k} state={prog.fees?.[k] || 'empty'}
                amount={e ? e.amountFor(MONTH_KEYS[i]) : null}
                label={FEE_LABELS[i]}
                onChange={s => onFeeChange(prog, k, s)} />
            ))}
          </div>
        </td>
        <td>{payment && <span className="pill" style={{ background: ps.bg, color: ps.fg }}>{payment}</span>}</td>
        <td>
          <button className="feebtn" onClick={onToggleExpand}>
            {e ? money(e.total) : 'Fees'} {expanded ? '▴' : '▾'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ background: 'transparent', padding: '0 0 10px' }}>
            <FeePanel prog={prog} fc={fc} engine={e} setCalc={setCalc}
              onBilling={v => onCalcChange(prog, fc, v)}
              onSessions={(sessions, schedule) => onSessionsChange(prog, sessions, schedule)}
              onPdf={onPdf} pdfBusy={pdfBusy} />
          </td>
        </tr>
      )}
    </>
  )
}

/* Our payment squares hold four states — paid / pending / overdue / empty —
   where the template holds a boolean, so "has this been paid" is a string
   test, not truthiness. Only `paid` is money actually received. */
const paidMonth = (prog, key) =>
  String((prog?.fees || {})[String(key).toLowerCase()] || '').toLowerCase() === 'paid'

/* The calculator, matching the Customers template: ten billed months of
   3.5 lessons, first month pro-rated by the starting lesson. */
function FeePanel({ prog, fc, engine, setCalc, onBilling, onSessions, onPdf, pdfBusy }) {
  const e = engine || engineForEntry({ ...prog, feeCalc: fc })
  const num = (v) => (v === '' ? '' : Number(v))
  return (
    <div className="feepanel">
      <div className="feehead">
        <span className="t">Fee Schedule — {prog.program || 'Program'}</span>
        <button className="pdfbtn" disabled={pdfBusy} onClick={() => onPdf(prog, fc)}>
          {pdfBusy ? 'Preparing…' : '📄 PDF'}
        </button>
      </div>
      {/* Three columns of flex rows, as the template lays it out: the label
          takes the slack and the control is a fixed 96px. An earlier version
          used auto-fit grid tracks, which could not shrink below the widest
          <select> option and pushed the controls out of the panel. */}
      <div className="fspgrid">
        <div className="fspcol">
          <div className="fsprow"><label>Billing</label>
            <select value={prog.billing || 'Monthly'} onChange={ev => onBilling(ev.target.value)}>
              {SCHEDULE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="fsprow"><label>First Lesson Number</label>
            <input type="number" min="1" max="35" value={fc.firstLesson ?? 1}
              onChange={ev => setCalc({ firstLesson: num(ev.target.value) })} />
          </div>
          <div className="fsprow"><label>Monthly Fee ($)</label>
            <input type="number" min="0" step="0.01" value={fc.monthlyFee ?? ''}
              onChange={ev => setCalc({ monthlyFee: num(ev.target.value) })} />
          </div>
          <div className="fsprow"><label>Discount</label>
            <span className="discwrap">
              <input type="number" min="0" step="0.5" value={fc.discount ?? 0}
                onChange={ev => setCalc({ discount: num(ev.target.value) })} />
              <select className="discunit" value={fc.discountType || '%'}
                onChange={ev => setCalc({ discountType: ev.target.value })}>
                <option value="%">%</option><option value="$">$</option>
              </select>
            </span>
          </div>
        </div>

        <div className="fspcol">
          <div className="fsprow calc"><label>Total Lessons / Weeks</label><b>{e.lessons}</b></div>
          <div className="fsprow calc"><label>Total Lesson Fees</label><b>{money(e.lessonFees)}</b></div>
          <div className={'fsprow fee' + (paidMonth(prog, 'REG') ? ' paidfee' : '')}>
            <label>Registration Fee ($)</label>
            <input type="number" min="0" step="0.01" value={fc.regFee ?? 0}
              onChange={ev => setCalc({ regFee: num(ev.target.value) })} />
          </div>
          <div className={'fsprow fee' + (paidMonth(prog, 'MAT') ? ' paidfee' : '')}>
            <label>Material Fee ($)</label>
            <input type="number" min="0" step="0.01" value={fc.matFee ?? 0}
              onChange={ev => setCalc({ matFee: num(ev.target.value) })} />
          </div>
          <div className="fsphr" />
          <div className="fsprow calc total"><label>Total Fees (Inc. Registration &amp; Material)</label><b>{money(e.total)}</b></div>
          <div className="fsprow calc"><label>Last Month + Registration &amp; Material Fees</label><b>{money(e.upfront)}</b></div>
          <div className="fsprow calc paidline"><label>Paid So Far</label><b>{money(e.paid)}</b></div>
          <div className="fsprow calc owedline"><label>Outstanding</label><b>{money(Math.max(0, e.total - e.paid))}</b></div>
          <div className="fsphint">
            The first month is pro-rated by lessons remaining; following months are the full monthly fee.
          </div>
        </div>

        <div className="fspcol months">
          <div className="fspmh">Installments</div>
          {e.installments.map((i, k) => {
            const blank = i.skipped || !i.amount
            const ticked = !blank && paidMonth(prog, MONTH_KEYS[k + 3])
            return (
              <div key={i.label} className={'fsprow mo' + (blank ? ' off' : '') + (ticked ? ' paidmo' : '')}>
                <label>{i.label}</label>
                <b>{blank ? '—' : money(i.amount) + (ticked ? ' ✓' : '')}</b>
              </div>
            )
          })}
        </div>
      </div>
      <SessionRows prog={prog} onChange={onSessions} />
    </div>
  )
}

function CustomerDetail({ recordId, onBack, onSelectRecord, onAddSibling, onDelete, onNavigate }) {
  const { records, updateCustomerField, updateStudentField } = useStore()
  const selected = records.find(r => r.id === recordId) || records[0]

  const selectedIdentity = guardianIdentity(selected)
  const siblings = (selectedIdentity
    ? records.filter(r => guardianIdentity(r) === selectedIdentity)
    : [selected]
  ).sort((a, b) => (a.student?.firstName || '').localeCompare(b.student?.firstName || '', undefined, { sensitivity: 'base' }))

  const [showOnlyActive, setShowOnlyActive] = useState(false)
  const [progs, setProgs] = useState(selected.programs || [])
  const [custFields, setCustFields] = useState(selected.customer)
  const saveTimers = useRef({})
  const latest = useRef(custFields)
  latest.current = custFields

  // Undo covers field edits only. Deleting a student is a server-side
  // delete that would come back with a different id, so it is not undoable
  // and deliberately not on the stack.
  const undoStack = useRef([])
  const redoStack = useRef([])
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)
  const editingKey = useRef(null)

  useEffect(() => {
    setProgs(selected.programs || [])
    setCustFields(selected.customer)
    undoStack.current = []; redoStack.current = []
    setUndoLen(0); setRedoLen(0); editingKey.current = null
  }, [recordId]) // eslint-disable-line react-hooks/exhaustive-deps

  const customerToStudentKey = (key) => ({
    'First Name': 'firstName', 'Last Name': 'lastName', 'Gender': 'gender', 'DOB': 'dob',
    'Email': 'email', 'Current Grade': 'grade', 'School': 'school', 'Medical Conditions': 'medical',
  })[key] || key

  const persistSection = useCallback((section, data) => {
    fetch(`${API_BASE}/api/registrations/${selected.id}/customer`, {
      method: 'PUT', headers: HEADERS, body: JSON.stringify({ [section]: data }),
    }).catch(() => {})
  }, [selected.id])

  const updateCustField = (section, key, val) => {
    /* One undo step per field rather than per keystroke — push a snapshot
       only when the field being edited changes. */
    const id = section + '|' + key
    if (editingKey.current !== id) {
      undoStack.current.push(JSON.stringify(latest.current))
      if (undoStack.current.length > 50) undoStack.current.shift()
      redoStack.current = []
      setRedoLen(0); setUndoLen(undoStack.current.length)
      editingKey.current = id
    }
    setCustFields(prev => ({ ...prev, [section]: { ...prev[section], [key]: val } }))
    updateCustomerField(selected.id, section, key, val)
    if (section === 'student') updateStudentField(selected.id, customerToStudentKey(key), val)
    clearTimeout(saveTimers.current[section])
    saveTimers.current[section] = setTimeout(() => {
      persistSection(section, latest.current[section])
    }, 600)
  }

  // Undo/redo replays every section, so the store and the server both end
  // up matching what is on screen rather than a half-applied mixture.
  const applyFields = useCallback((next) => {
    setCustFields(next)
    latest.current = next
    for (const section of SECTIONS) {
      const data = next[section] || {}
      for (const [k, v] of Object.entries(data)) {
        updateCustomerField(selected.id, section, k, v)
        if (section === 'student') updateStudentField(selected.id, customerToStudentKey(k), v)
      }
      persistSection(section, data)
    }
    editingKey.current = null
  }, [selected.id, updateCustomerField, updateStudentField, persistSection])

  const doUndo = useCallback(() => {
    const snap = undoStack.current.pop()
    if (!snap) return
    redoStack.current.push(JSON.stringify(latest.current))
    applyFields(JSON.parse(snap))
    setUndoLen(undoStack.current.length); setRedoLen(redoStack.current.length)
  }, [applyFields])

  const doRedo = useCallback(() => {
    const snap = redoStack.current.pop()
    if (!snap) return
    undoStack.current.push(JSON.stringify(latest.current))
    applyFields(JSON.parse(snap))
    setUndoLen(undoStack.current.length); setRedoLen(redoStack.current.length)
  }, [applyFields])

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

  const persistPrograms = (next) => {
    fetch(`${API_BASE}/api/registrations/${selected.id}/programs`, {
      method: 'PUT', headers: HEADERS, body: JSON.stringify(next),
    }).catch(() => {})
  }
  const toggleActive = (prog) => {
    const updated = progs.map(p => p === prog ? { ...p, active: !p.active } : p)
    setProgs(updated); persistPrograms(updated)
  }
  const updateFee = (prog, key, state) => {
    const updated = progs.map(p => p === prog ? { ...p, fees: { ...p.fees, [key]: state } } : p)
    setProgs(updated); persistPrograms(updated)
  }

  /* Fee inputs and billing cadence. `billing` sits beside feeCalc rather
     than inside it — `schedule` on a program entry is already the class
     time, so the cadence needs its own field. */
  const updateCalc = (prog, feeCalc, billing) => {
    const updated = progs.map(p => p === prog
      ? { ...p, feeCalc, ...(billing != null ? { billing } : {}) }
      : p)
    setProgs(updated); persistPrograms(updated)
  }

  /* Sessions and the schedule text move together: the roster pages match
     on , so leaving it stale would strand the student. */
  const updateSessions = (prog, sessions, schedule) => {
    const updated = progs.map(p => p === prog ? { ...p, sessions, schedule } : p)
    setProgs(updated); persistPrograms(updated)
  }

  const [openFees, setOpenFees] = useState(() => new Set())
  const toggleFees = (k) => setOpenFees(s => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })

  const [pdfBusy, setPdfBusy] = useState(false)
  const downloadPdf = async (prog, fc) => {
    setPdfBusy(true)
    try {
      /* The generator draws a finished schedule — it takes computed totals
         and installments, not the inputs — so run the engine here and hand
         it the same numbers the panel is showing. */
      const e = engineForEntry({ ...prog, feeCalc: fc })
      const yearLabel = /^\d{2}_\d{2}$/.test(prog.year || '')
        ? `20${prog.year.slice(0, 2)}–${prog.year.slice(3)}`
        : (prog.year || '')
      const yearStart = /^\d{2}_\d{2}$/.test(prog.year || '') ? 2000 + Number(prog.year.slice(0, 2)) : 2026
      const res = await fetch(`${API_BASE}/api/fee-schedule/pdf`, {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({
          studentName: `${selected.student?.firstName || ''} ${selected.student?.lastName || ''}`.trim(),
          programName: prog.program || '',
          yearLabel, yearStart,
          weeksPerYear: TOTAL_LESSONS,
          firstLesson: fc.firstLesson || 1,
          scheduledWeeks: e.lessons,
          tuition: e.lessonFees, regFee: e.regFee, matFee: e.matFee, total: e.total,
          installments: e.installments.map((i, k) => ({
            month: String(i.month || '').toLowerCase(),
            kind: (i.skipped || !i.amount)
              ? 'skip'
              : (k === e.mIdx && e.lessonsFirstMonth < TOTAL_LESSONS / 10 ? 'prorated' : 'full'),
            amount: i.amount || 0,
          })),
          filename: `fee-schedule-${(prog.program || 'program').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `fee-schedule-${(prog.program || 'program').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      dialog.alert('Could not build the PDF', 'The fee schedule service did not respond. The figures on screen are still correct.')
    } finally {
      setPdfBusy(false)
    }
  }

  const { student, guardian1, guardian2, emergency } = custFields
  const meta = custFields.meta || {}
  const displayed = showOnlyActive ? progs.filter(p => p.active) : progs

  const panel = (title, data, opts = {}) => (
    <div>
      <div className="sec-h">{title}</div>
      {Object.entries(data || {}).map(([k, v]) => (
        <Field key={k} label={k} value={v}
          readOnly={opts.readOnlyKeys?.includes(k)}
          highlightEmail={opts.highlightEmail !== false}
          onChange={val => updateCustField(opts.section, k, val)} />
      ))}
    </div>
  )

  return (
    <div className="page cu" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>

      <button className="back" onClick={onBack}><ChevronLeft size={16} /> All Customers</button>
      <h2 className="page-title">Customers</h2>

      <div className="actions">
        <button title="Undo (Ctrl+Z)" disabled={!undoLen} onClick={doUndo}><Undo2 size={13} /> Undo</button>
        <button title="Redo (Ctrl+Shift+Z)" disabled={!redoLen} onClick={doRedo}><Redo2 size={13} /></button>
        <button title="Open this student on the Students page" style={{ marginLeft: 'auto' }}
          onClick={() => onNavigate && onNavigate('Students', selected.id)}>
          <ExternalLink size={13} /> View in Students
        </button>
        <button className="danger" title="Delete this student" onClick={() => onDelete(selected)}>
          <Trash2 size={13} /> Delete Student
        </button>
      </div>

      <div className="panels">
        {/* Where the family came from and what they've agreed to. Both are
            asked on the registration form and had nowhere to live here. */}
        <div>
          <div className="sec-h">Registration</div>
          <div className="frow">
            <label>Source:</label>
            <select className="selin" value={meta.source || ''}
              onChange={e => updateCustField('meta', 'source', e.target.value)}>
              <option value="">—</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="frow">
            <label>Joined:</label>
            <div className="ro">{(selected.createdAt || '').slice(0, 10) || '—'}</div>
          </div>
          <div className="consents">
            {CONSENTS.map(c => (
              <label key={c} className="consent">
                <input type="checkbox" checked={!!(meta.consents || {})[c]}
                  onChange={e => updateCustField('meta', 'consents',
                    { ...(meta.consents || {}), [c]: e.target.checked })} />
                {c}
              </label>
            ))}
          </div>
        </div>
        {panel('Guardian 1', guardian1, { section: 'guardian1' })}
        {panel('Guardian 2', guardian2, { section: 'guardian2' })}
        {panel('Emergency Contact', emergency, { section: 'emergency', highlightEmail: false })}
        <div>
          <div className="sec-h">Students</div>
          <div className="sibs">
            {siblings.map(s => (
              <div key={s.id} className={'sib' + (s.id === recordId ? ' on' : '')}
                onClick={() => onSelectRecord?.(s.id)}>
                {s.student?.firstName} {s.student?.lastName}
              </div>
            ))}
            <button className="addsib" onClick={() => onAddSibling(selected)}>
              <UserPlus size={13} /> Add Sibling
            </button>
          </div>
          {Object.entries(student || {}).map(([k, v]) => (
            <Field key={k} label={k} value={v} readOnly={k === 'Current Age'} highlightEmail={false}
              onChange={val => updateCustField('student', k, val)} />
          ))}
        </div>
      </div>

      <div className="progh">
        <span className="t">Programs — {student?.['First Name']} {student?.['Last Name']}</span>
        <label>
          <input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)} />
          Active only
        </label>
      </div>
      <div className="card">
        <table className="ptable">
          <thead>
            <tr>
              <th>Active</th><th>Status</th><th>Year</th><th>Program</th><th>Rate</th>
              <th>
                <div style={{ marginBottom: 3, letterSpacing: 1 }}>Fee Schedule</div>
                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                  {FEE_LABELS.map((m, i) => <span key={i} className="feelab">{m}</span>)}
                </div>
              </th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr><td colSpan={7} style={{ background: 'transparent', padding: '26px', color: 'var(--muted)' }}>
                {showOnlyActive ? 'No active programs.' : 'No programs registered.'}
              </td></tr>
            ) : displayed.map((p, i) => (
              <ProgramRow key={i} prog={p} onToggleActive={toggleActive} onFeeChange={updateFee}
                onCalcChange={updateCalc} onSessionsChange={updateSessions} expanded={openFees.has(progKey(p, i))} onToggleExpand={() => toggleFees(progKey(p, i))}
                onPdf={downloadPdf} pdfBusy={pdfBusy} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Root: switches between list and detail ────────────────────────────────

export default function Customers(props) {
  return <DialogHost><CustomersPage {...props} /></DialogHost>
}

function CustomersPage({ initialRecordId, onConsumeInitialRecord, onNavigate }) {
  const { records, select, addRegistration, deleteRegistration, updateCustomerField } = useStore()
  const dialog = useDialog()
  const [detailId, setDetailId] = useState(null)

  const handleSelect = (id) => { select(id); setDetailId(id) }

  /* Stamp the family reference onto any record missing one, then leave it
     alone forever — it is the identifier, not a position in a list. */
  const assignFamilyId = useCallback((recordId, ref) => {
    const rec = records.find(r => r.id === recordId)
    const meta = { ...(rec?.customer?.meta || {}), familyId: ref }
    updateCustomerField(recordId, 'meta', 'familyId', ref)
    fetch(`${API_BASE}/api/registrations/${recordId}/customer`, {
      method: 'PUT', headers: HEADERS, body: JSON.stringify({ meta }),
    }).catch(() => {})
  }, [records, updateCustomerField])

  const familyIds = useFamilyIds(records, assignFamilyId)

  // Opened via onNavigate('Customers', recordId) from another page.
  useEffect(() => {
    if (initialRecordId) {
      handleSelect(initialRecordId)
      onConsumeInitialRecord && onConsumeInitialRecord()
    }
  }, [initialRecordId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    try {
      const id = await addRegistration({ studentFirstName: 'New', studentLastName: 'Student', forceNew: true })
      if (id) setDetailId(id)
    } catch (err) {
      dialog.alert('Could not add family', String(err.message || err))
    }
  }

  /* Copy an existing student — same family, same school and grade, name
     marked so the duplicate is obvious until it is edited. Programs are
     deliberately not copied: enrolments are per child and per session, and
     silently double-booking a class is worse than retyping one. */
  const handleDuplicate = async (record) => {
    const s = record.student || {}
    try {
      const id = await handleAddSibling(record, {
        studentFirstName: s.firstName || 'New',
        studentLastName: `${s.lastName || 'Student'} (copy)`,
        grade: s.grade || '', school: s.school || '',
      })
      if (id) setDetailId(id)
    } catch (err) {
      dialog.alert('Could not duplicate', String(err.message || err))
    }
  }

  // Adds another child under the same guardians and emergency contact, so
  // it groups as a sibling automatically.
  const handleAddSibling = async (record, over = {}) => {
    try {
      const g1 = record.customer?.guardian1 || {}
      const g2 = record.customer?.guardian2 || {}
      const em = record.customer?.emergency || {}
      const id = await addRegistration({
        studentFirstName: over.studentFirstName || 'New',
        studentLastName: over.studentLastName || 'Student',
        grade: over.grade, school: over.school, forceNew: true,
        g1FirstName: g1['First Name'], g1LastName: g1['Last Name'], g1Relationship: g1['Relationship'],
        g1PhoneHome: g1['Phone (Home)'], g1PhoneMobile: g1['Phone (Mobile)'], g1Email: g1['Email'],
        g1Address1: g1['Street Address'], g1Address2: g1['Unit'], g1City: g1['City'],
        g1Province: g1['Province'], g1Postal: g1['Postal Code'], g1Occupation: g1['Occupation'],
        g2FirstName: g2['First Name'], g2LastName: g2['Last Name'], g2Relationship: g2['Relationship'],
        g2PhoneHome: g2['Phone (Home)'], g2PhoneMobile: g2['Phone (Mobile)'], g2Email: g2['Email'],
        g2Address1: g2['Street Address'], g2Address2: g2['Unit'], g2City: g2['City'],
        g2Province: g2['Province'], g2Postal: g2['Postal Code'], g2Occupation: g2['Occupation'],
        emFirstName: em['First Name'], emLastName: em['Last Name'], emRelationship: em['Relationship'],
        emPhone: em['Phone (Mobile)'], emEmail: em['Email'],
      })
      if (id && !over.studentLastName) setDetailId(id)
      return id
    } catch (err) {
      dialog.alert('Could not add sibling', String(err.message || err))
    }
  }

  const handleDelete = async (record, opts = {}) => {
    const name = `${record.student?.firstName || ''} ${record.student?.lastName || ''}`.trim() || 'this student'
    if (!opts.silent) {
      const ok = await dialog.confirm(
        `Delete ${name}? This also removes their linked customer and guardian information, and cannot be undone.`)
      if (!ok) return
    }
    try {
      await deleteRegistration(record.id)
      if (detailId === record.id || !opts.silent) {
        // Jump to a remaining sibling if there is one, else back to the list.
        // Only match a real guardian identity — a blank student has none, so
        // it should return to the list rather than jump to another blank.
        const identity = guardianIdentity(record)
        const sibling = identity && records.find(r => r.id !== record.id && guardianIdentity(r) === identity)
        setDetailId(sibling && detailId === record.id ? sibling.id : null)
      }
    } catch (err) {
      dialog.alert('Could not delete', String(err.message || err))
    }
  }

  if (detailId) {
    return <CustomerDetail recordId={detailId} onBack={() => setDetailId(null)} onSelectRecord={setDetailId}
      onAddSibling={handleAddSibling} onDelete={handleDelete} onNavigate={onNavigate} />
  }

  return <CustomerList onSelect={handleSelect} onAdd={handleAdd} onAddSibling={handleAddSibling}
    onDuplicate={handleDuplicate} onDelete={handleDelete} onNavigate={onNavigate} familyIds={familyIds} />
}
