// Logins — every student's portal login, in the same language as Students,
// Programs and Crania Cash: scoped CSS, the teal header, the
// Columns / Export CSV / settings toolbar, metric tiles that filter, a
// filter row under every heading, a select column, and pill cells.
//
// Every row shows the real username and password. Both are generated from
// the student's name by the usual pattern; double-click either one to type
// something else, which is what makes a leaked password fixable. Typing the
// generated value back in returns the field to being generated, so it keeps
// following the name.
//
// Click-to-copy is kept from the old page: it is what this screen is most
// used for.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Download, Copy, Check, AlertTriangle } from 'lucide-react'
import { useStore } from '../data/store'
import { resolveLogin, duplicateUsernames, usernameOwners, usernameAvailable } from '../data/loginUtils'
import BackupPanel, { BACKUP_CSS } from '../components/BackupPanel'
import { ColsPop, CtxMenu, TABLECHROME_CSS } from '../components/TableChrome'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }

const COLS = [
  { k: 'studentId', l: 'Student ID' },
  { k: 'name',      l: 'Student' },      // never hideable — it names the row
  { k: 'grade',     l: 'Grade',    cls: 'center' },
  { k: 'email',     l: 'Email' },
  { k: 'username',  l: 'Username' },
  { k: 'password',  l: 'Password' },
  { k: 'source',    l: 'Set By',   cls: 'center' },
]
const LOCKED_COL = 'name'

const SEL_W = '3%'
const ACT_W = '6%'
const COL_W = {
  studentId: '9%', name: '17%', grade: '6%', email: '19%',
  username: '15%', password: '15%', source: '10%',
}

const CPREF_KEY = 'logins-cols'
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

const studentName = (r) => `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim()

const CSS = BACKUP_CSS + TABLECHROME_CSS + `
.lg{position:relative;--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;
    --dark-brown:#2E2516;--line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;
    --danger:#C0392B;--good:#2b7a2e;--shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}

.lg .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.lg .actions button{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:6px 12px;
    font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;
    display:inline-flex;align-items:center;gap:5px}
.lg .actions button:hover{background:#f4f2ea}
.lg .actions .gearbtn{font-size:14px;line-height:1;padding:6px 10px}
.lgsettings{position:absolute;right:34px;z-index:240;width:340px;margin-top:4px}

.lg .offline{background:#fffbf0;border:1px solid #f4d67a;color:#8a6a00;padding:8px 12px;
    border-radius:8px;margin-bottom:12px;font-size:13px}

.lg .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.lg .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.lg .metric.clickable{cursor:pointer}
.lg .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.lg .metric.on{outline:2px solid var(--teal);outline-offset:1px}
.lg .metric.mcustom{border-bottom-color:var(--light-blue)}
.lg .metric.mmiss{border-bottom-color:var(--danger)}
.lg .metric.mdup{border-bottom-color:#8a6a00}
.lg .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.lg .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.lg .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.lg .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.lg .filters input[type=search]{padding:7px 12px;border:1px solid var(--field);border-radius:8px;
    font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit;width:280px}
.lg .filters input[type=search]:focus{outline:none;border-color:var(--teal)}
.lg .clearf{background:#fff;border:1px solid var(--field);border-radius:8px;padding:8px 12px;
    font-size:13px;color:var(--muted);font-weight:600;cursor:pointer;font-family:inherit}
.lg .clearf:hover{background:#f1f5f4}
.lg .toggle{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);
    font-weight:600;cursor:pointer;user-select:none}
.lg .toggle input{width:14px;height:14px;accent-color:var(--teal);cursor:pointer;margin:0}

.lg .bulkbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
    background:#E4EFF3;border:1px solid var(--light-blue);border-radius:10px;
    padding:8px 12px;margin-bottom:10px;font-size:12.5px;color:var(--dark-brown)}
.lg .bulkbar .n{font-weight:700}
.lg .bulkbar button{border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:600;
    cursor:pointer;font-family:inherit;border:none}
.lg .bulkbar .exp{background:var(--teal);color:#fff}
.lg .bulkbar .clr{background:transparent;border:1px solid var(--field);color:var(--muted)}

.lg .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.lg .card > table{width:100%;min-width:1000px;table-layout:fixed;border-collapse:separate;
    border-spacing:5px 5px;background:#fff}
.lg thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
.lg thead th.colh .lbl{display:block;text-align:center;padding:0 6px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lg thead th.colh.sorted .lbl{padding-right:20px}
.lg thead th.colh{cursor:grab}
.lg thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1;
    background:var(--teal);padding-left:4px;border-radius:3px}
.lg thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.lg thead th.colh:hover .eye{opacity:1}
.lg thead th .arw{opacity:.85;font-size:10px}
.lg thead th .sortable{cursor:pointer}
.lg thead tr.colfrow th{background:#eaf3f2;padding:5px 6px;border-radius:0}
.lg thead tr.colfrow th:empty{background:transparent}
.lg .colf{width:100%;background:#fff;border:1px solid var(--field);border-radius:7px;padding:4px 6px;
    font-size:11.5px;color:var(--dark-brown);font-weight:600;cursor:pointer;font-family:inherit}
.lg .colf.on{background:var(--light-blue);border-color:var(--light-blue)}
.lg thead th.selcol,.lg thead th.blankhead,.lg tbody td.selcol,.lg tbody td.actcell{background:transparent}
.lg thead th.selcol input,.lg tbody td.selcol input{width:12px;height:12px;margin:0;
    accent-color:var(--teal);vertical-align:middle;cursor:pointer}
.lg .selcol{text-align:center}

.lg tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:26px;overflow:hidden;text-overflow:ellipsis}
.lg tbody td.center{text-align:center}
.lg tbody tr{cursor:pointer}
.lg tbody tr:hover td{background:#E4EFF3}
.lg tbody tr.sel td{background:#DCEEEC}
.lg tbody tr.rdup td{background:#FBF3CE}
.lg tbody td.actcell{white-space:nowrap;text-align:center}
.lg .rowbtn{background:none;border:none;color:#c9c3b5;padding:0 2px;margin:0;line-height:1;
    cursor:pointer;transition:color .15s;display:inline-flex;vertical-align:middle}
.lg .rowbtn:hover{color:var(--teal)}
.lg .sref{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--muted);font-weight:600}
.lg .sname{font-weight:700;color:#3d7f7d}
.lg .dash{color:var(--faint)}
.lg .mono{font-family:ui-monospace,Consolas,monospace;font-weight:700;letter-spacing:.3px}
.lg .copywrap{display:inline-flex;align-items:center;gap:5px;max-width:100%}
.lg .copywrap .v{overflow:hidden;text-overflow:ellipsis}
.lg .copybtn{background:none;border:none;padding:1px;cursor:pointer;color:var(--faint);
    display:inline-flex;flex:none}
.lg .copybtn:hover{color:var(--teal)}
.lg .tag{display:inline-block;border-radius:5px;padding:1px 8px;font-size:11px;font-weight:700}
.lg .tag.gen{background:var(--pill);color:var(--muted)}
.lg .tag.set{background:#DEF2DE;color:var(--good)}
.lg .warnrow{display:flex;align-items:center;gap:7px;background:#FBF3CE;border:1px solid #E8DCA0;
    color:#7a6417;border-radius:9px;padding:8px 12px;margin-bottom:10px;font-size:12.5px;font-weight:600}
.lg .empty{text-align:center;color:var(--muted);padding:60px 20px}
.lg .empty b{color:var(--dark-brown)}
.lg .tcount{text-align:right;font-size:11.5px;color:var(--muted);padding:7px 2px 0}

/* ── edit dialog ── */
.lg .ovl{position:fixed;inset:0;background:rgba(46,37,22,.35);z-index:300;
    display:flex;align-items:center;justify-content:center;padding:20px}
.lg .modal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(46,37,22,.3);
    padding:18px 20px;width:100%;max-width:430px}
.lg .modal h3{margin:0 0 4px;font-size:15px;color:var(--dark-brown)}
.lg .modal .who{font-size:12px;color:var(--muted);margin-bottom:14px}
.lg .modal .frow{margin-bottom:12px}
.lg .modal label{display:block;font-size:11px;font-weight:700;color:var(--muted);
    text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}
.lg .modal input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--field);
    border-radius:8px;font:inherit;font-size:13px;background:#fff;color:var(--dark-brown)}
.lg .modal input:focus{outline:none;border-color:var(--teal)}
.lg .modal .note{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.45}
.lg .modal .err{font-size:11.5px;color:var(--danger);margin-top:4px;font-weight:600}
.lg .modal .acts{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:16px}
.lg .modal button{border-radius:8px;padding:8px 15px;font:inherit;font-size:12.5px;
    font-weight:700;cursor:pointer;border:none}
.lg .modal .save{background:var(--teal);color:#fff}
.lg .modal .save:disabled{background:#cbd1d6;cursor:default}
.lg .modal .cancel{background:var(--pill);border:1px solid var(--field);color:var(--dark-brown)}
.lg .modal .reset{background:transparent;border:1px solid var(--field);color:var(--muted);
    margin-right:auto;display:inline-flex;align-items:center;gap:5px}
`

function Copyable({ value, mono }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="dash">—</span>
  const copy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 900)
    } catch { /* clipboard blocked */ }
  }
  return (
    <span className="copywrap">
      <span className={'v' + (mono ? ' mono' : '')}>{value}</span>
      <button className="copybtn" title="Copy" onClick={copy}
        style={copied ? { color: 'var(--good)' } : undefined}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  )
}

/* Setting a login is the one write on this page, so it is deliberate: a
   dialog rather than an inline edit, with the generated value shown as the
   placeholder so it is obvious what clearing the box gets you back. */
function EditLogin({ row, owners, onClose, onSave }) {
  const [username, setUsername] = useState(row.login.customUsername ? row.login.username : '')
  const [password, setPassword] = useState(row.login.customPassword ? row.login.password : '')

  const clash = !usernameAvailable(owners, username, row.id)

  return (
    <div className="ovl" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <h3>Login</h3>
        <div className="who">{row.name}{row.studentId ? ` · ${row.studentId}` : ''}</div>

        <div className="frow">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder={row.login.generatedUsername || 'generated from the name'} />
          {clash
            ? <div className="err">Another student already uses that username.</div>
            : <div className="note">Leave blank to use the generated one.</div>}
        </div>

        <div className="frow">
          <label>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)}
            placeholder={row.login.generatedPassword || 'generated from the name'} />
          <div className="note">
            Leave blank to use the generated one. A generated password can be
            worked out from the student's name, so set one here if it needs to
            be private.
          </div>
        </div>

        <div className="acts">
          {row.login.custom && (
            <button type="button" className="reset"
              onClick={() => { setUsername(''); setPassword('') }}>
              <RotateCcw size={12} /> Reset to generated
            </button>
          )}
          <button type="button" className="cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="save" disabled={clash}
            onClick={() => onSave(row.id, username.trim(), password.trim())}>Save</button>
        </div>
      </div>
    </div>
  )
}

function LoginsSettings({ onClose }) {
  const ref = useRef(null)
  const { refresh } = useStore()
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])
  return (
    <div className="lgsettings" ref={ref} onMouseDown={e => e.stopPropagation()}>
      <BackupPanel base="customers"
        hint={'Logins are held on the registrations, so these are the same snapshots the '
          + 'Customers page takes — restoring one replaces every registration (last 14 kept).'}
        onRestored={async () => { await refresh(); onClose() }} />
    </div>
  )
}

export default function Logins({ onNavigate }) {
  const { records, status: fetchStatus, updateStudentField } = useStore()
  const [search, setSearch] = useState('')
  const [customOnly, setCustomOnly] = useState(false)
  const [dupsOnly, setDupsOnly] = useState(false)
  const [colFilters, setColFilters] = useState({})
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const [selected, setSelected] = useState(() => new Set())
  const [{ hiddenCols, colOrder }, setColPrefs] = useState(loadColPrefs)
  const [pop, setPop] = useState(null)
  const [rowCtx, setRowCtx] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState(null)
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

  const owners = useMemo(() => usernameOwners(records), [records])
  const taken = useMemo(() => duplicateUsernames(records), [records])

  const allRows = useMemo(() => records.filter(r => r.id !== 'seed').map(r => {
    const login = resolveLogin(r.student)
    return {
      id: r.id, record: r,
      studentId: r.customer?.meta?.studentId || '',
      name: studentName(r) || '',
      grade: r.student?.grade || '',
      email: r.student?.email || '',
      username: login.username,
      password: login.password,
      source: login.custom ? 'Changed' : 'Generated',
      login,
      duplicate: Boolean(login.username && taken.has(login.username.toLowerCase())),
      incomplete: !login.username || !login.password,
    }
  }), [records, taken])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = allRows.filter(r => {
      if (customOnly && !r.login.custom) return false
      if (dupsOnly && !r.duplicate) return false
      for (const [k, want] of Object.entries(colFilters)) {
        if (!want) continue
        if (String(r[k] ?? '') !== want) return false
      }
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q)
        || r.email.toLowerCase().includes(q) || r.studentId.toLowerCase().includes(q)
    })
    const val = (r) => {
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
  }, [allRows, search, customOnly, dupsOnly, colFilters, sort])

  const metrics = useMemo(() => ({
    students: allRows.length,
    custom: allRows.filter(r => r.login.custom).length,
    missing: allRows.filter(r => r.incomplete).length,
    duplicates: allRows.filter(r => r.duplicate).length,
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

  const anyFilterActive = !!search || customOnly || dupsOnly || Object.values(colFilters).some(Boolean)
  const clearAllFilters = () => {
    setSearch(''); setCustomOnly(false); setDupsOnly(false); setColFilters({})
  }

  const allSel = visible.length > 0 && visible.every(r => selected.has(r.id))
  const selectedRows = useMemo(() => visible.filter(r => selected.has(r.id)), [visible, selected])

  /* Writes both fields at once. A blank string is stored rather than the key
     removed, and resolveLogin treats blank as "no override" — so clearing a
     box really does hand the student back to the generated value. */
  const saveLogin = (recordId, username, password) => {
    updateStudentField(recordId, 'loginUsername', username)
    updateStudentField(recordId, 'loginPassword', password)
    fetch(`${API_BASE}/api/registrations/${recordId}/student`, {
      method: 'PUT', headers: HEADERS,
      body: JSON.stringify({ loginUsername: username, loginPassword: password }),
    }).catch(() => {})
    setEditing(null)
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
    a.download = `crania-logins-${new Date().toISOString().slice(0, 10)}.csv`
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
    <div className="page lg" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>
      <h2 className="page-title">Logins</h2>

      <div className="actions">
        <button title="Choose which columns are shown" style={{ marginLeft: 'auto' }}
          onClick={e => setPop({ kind: 'cols', rect: e.currentTarget.getBoundingClientRect() })}
        ><Eye size={13} /> Columns</button>
        <button title="Download the logins as a CSV file" onClick={() => exportCsv()}>
          <Download size={13} /> Export CSV
        </button>
        <button className="gearbtn" title="Backups" onClick={() => setSettingsOpen(true)}>⚙</button>
      </div>

      {settingsOpen && <LoginsSettings onClose={() => setSettingsOpen(false)} />}

      {fetchStatus === 'offline' && (
        <div className="offline">Working offline — showing cached data.</div>
      )}

      {metrics.duplicates > 0 && (
        <div className="warnrow">
          <AlertTriangle size={14} />
          {metrics.duplicates} students share a username with someone else — they cannot both
          sign in. Give one of each pair a username of their own.
        </div>
      )}

      <div className="metrics">
        <div className="metric">
          <div className="label">Students</div><div className="value">{metrics.students}</div>
          <div className="hint">with a portal login</div>
        </div>
        <div className={'metric mcustom clickable' + (customOnly ? ' on' : '')}
          title="Click to show only logins that were set by hand"
          onClick={() => setCustomOnly(v => !v)}>
          <div className="label">Changed</div><div className="value">{metrics.custom}</div>
          <div className="hint">set by hand, not generated</div>
        </div>
        <div className={'metric mdup clickable' + (dupsOnly ? ' on' : '')}
          title="Click to show only clashing usernames"
          onClick={() => setDupsOnly(v => !v)}>
          <div className="label">Duplicate Usernames</div><div className="value">{metrics.duplicates}</div>
          <div className="hint">two students, one username</div>
        </div>
        <div className="metric mmiss">
          <div className="label">No Login</div><div className="value">{metrics.missing}</div>
          <div className="hint">needs a full name</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search student, username, email or ID…" autoComplete="off" />
        <label className="toggle" title="Only logins that were changed by hand">
          <input type="checkbox" checked={customOnly} onChange={e => setCustomOnly(e.target.checked)} />
          Changed only
        </label>
        {anyFilterActive && <button className="clearf" onClick={clearAllFilters}>Clear Filters</button>}
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <span className="n">{selected.size} selected</span>
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <button className="exp" onClick={() => exportCsv(selectedRows)}>Export Selected</button>
            <button className="clr" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </span>
        </div>
      )}

      <div className="card">
        {allRows.length === 0 ? (
          <div className="empty"><b>No students yet.</b><br />
            Logins appear here once students are registered.</div>
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
              {/* Not `frow` — that name belongs to the detail field rows on
                  other pages and sets display:grid, which takes the row out
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
                  <tr key={r.id}
                    className={(isSel ? 'sel ' : '') + (r.duplicate ? 'rdup' : '')}
                    title="Click to change this login; right-click for more"
                    onClick={() => setEditing(r)}
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
                      } else if (k === 'username' || k === 'password') {
                        content = <Copyable value={r[k]} mono />
                      } else if (k === 'source') {
                        content = <span className={'tag ' + (r.login.custom ? 'set' : 'gen')}>{r.source}</span>
                      } else {
                        content = r[k] === '' || r[k] == null ? <span className="dash">—</span> : r[k]
                      }
                      return (
                        <td key={k} className={`col-${k}${c.cls ? ' ' + c.cls : ''}`}
                          title={String(r[k] ?? '')}>{content}</td>
                      )
                    })}
                    <td className="actcell" onClick={e => e.stopPropagation()}>
                      <button className="rowbtn" title="Change this login"
                        onClick={() => setEditing(r)}><Pencil size={12} /></button>
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
          { label: 'Change Login', on: () => setEditing(rowCtx.row) },
          { label: 'Open in Students', on: () => onNavigate && onNavigate('Students', rowCtx.row.id) },
          ...(rowCtx.row.login.custom
            ? [{ label: 'Reset to Generated', on: () => saveLogin(rowCtx.row.id, '', '') }]
            : []),
          { label: 'Export This Student', on: () => exportCsv([rowCtx.row]) },
        ]} />
      )}

      {editing && (
        <EditLogin row={editing} owners={owners}
          onClose={() => setEditing(null)} onSave={saveLogin} />
      )}
    </div>
  )
}
