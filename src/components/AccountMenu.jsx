// The avatar menu: who you are signed in as, what level you have, and
// — for admins — the screen where levels are handed out.
//
// The level shown here is the one the server put in the session, not a
// preference held in the browser. Hiding a button from someone who may
// not use it is a courtesy; the refusal that matters happens on the
// server, so nothing here can be clicked around.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LogOut, KeyRound, Users, X, Trash2, ShieldCheck } from 'lucide-react'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
const send = (url, opts = {}) =>
  fetch(`${API_BASE}${url}`, { credentials: 'include', headers: HEADERS, ...opts })

export const ROLE_LABELS = { admin: 'Admin', staff: 'Staff', readonly: 'Read-only' }
const ROLE_BLURB = {
  admin: 'Everything, including accounts, backups and deleting records.',
  staff: 'Day-to-day work. Cannot delete records, change settings or manage accounts.',
  readonly: 'Can look at everything. Cannot change anything.',
}

export const ACCOUNT_CSS = `
.acct{position:relative;display:inline-flex}
.acct .avatar{cursor:pointer;user-select:none}
.acctpop{position:absolute;right:0;top:calc(100% + 8px);z-index:500;width:270px;
  background:#fff;border-radius:12px;box-shadow:0 12px 34px rgba(46,37,22,.28);
  padding:14px;color:#2E2516;text-align:left}
.acctpop .who{font-weight:700;font-size:14px;margin-bottom:2px;word-break:break-word}
.acctpop .mail{font-size:12px;color:#6B6455;margin-bottom:10px;word-break:break-all}
.acctpop .lvl{display:inline-flex;align-items:center;gap:5px;border-radius:6px;
  padding:2px 9px;font-size:11px;font-weight:700;margin-bottom:4px}
.acctpop .lvl.admin{background:#DEF2DE;color:#2b7a2e}
.acctpop .lvl.staff{background:#E4EFF3;color:#3d7f7d}
.acctpop .lvl.readonly{background:#EAE7DF;color:#6B6455}
.acctpop .blurb{font-size:11.5px;color:#6B6455;line-height:1.45;margin:4px 0 12px}
.acctpop .sep{height:1px;background:#E7EBE7;margin:10px -14px}
.acctpop button.item{display:flex;align-items:center;gap:8px;width:100%;background:none;
  border:none;padding:8px 6px;border-radius:7px;font:inherit;font-size:13px;
  color:#2E2516;cursor:pointer;text-align:left}
.acctpop button.item:hover{background:#F1F3F4}
.acctpop button.item.danger{color:#C0392B}

.acctov{position:fixed;inset:0;background:rgba(46,37,22,.35);z-index:600;
  display:flex;align-items:center;justify-content:center;padding:20px}
.acctmodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(46,37,22,.3);
  padding:18px 20px;width:100%;max-width:620px;max-height:86vh;overflow:auto;color:#2E2516}
.acctmodal.narrow{max-width:400px}
.acctmodal h2{margin:0 0 4px;font-size:16px;display:flex;align-items:center;gap:8px}
.acctmodal .hint{font-size:12px;color:#6B6455;margin-bottom:14px;line-height:1.5}
.acctmodal label{display:block;font-size:11px;font-weight:700;color:#6B6455;
  text-transform:uppercase;letter-spacing:.4px;margin:10px 0 4px}
.acctmodal input,.acctmodal select{width:100%;box-sizing:border-box;padding:8px 10px;
  border:1px solid #D5D0C4;border-radius:8px;font:inherit;font-size:13px;background:#fff;color:#2E2516}
.acctmodal input:focus,.acctmodal select:focus{outline:none;border-color:#5FA09E}
.acctmodal .err{background:#fdecea;border:1px solid #f5b5b0;color:#8a1c15;
  border-radius:8px;padding:8px 12px;font-size:12.5px;margin:10px 0}
.acctmodal .ok{background:#DEF2DE;border:1px solid #b6dfb6;color:#2b7a2e;
  border-radius:8px;padding:8px 12px;font-size:12.5px;margin:10px 0}
.acctmodal .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.acctmodal .acts button{border-radius:8px;padding:8px 15px;font:inherit;font-size:12.5px;
  font-weight:700;cursor:pointer;border:none}
.acctmodal .acts .go{background:#5FA09E;color:#fff}
.acctmodal .acts .go:disabled{background:#cbd1d6;cursor:default}
.acctmodal .acts .cancel{background:#F1F3F4;border:1px solid #D5D0C4;color:#2E2516}
/* A table, with the level carrying the colour so who-can-do-what reads at
   a glance rather than by reading every row. Everything stays editable in
   place; the widths are fixed so the columns line up down the table. */
.acctmodal.wide{max-width:1000px}
.accttable{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;
  border:1px solid #E7EBE7;border-radius:10px;overflow:hidden}
.accttable th{background:#EEF3F6;text-align:left;font-size:10.5px;font-weight:700;
  color:#6B6455;text-transform:uppercase;letter-spacing:.4px;padding:9px 10px;
  border-bottom:1px solid #E7EBE7;white-space:nowrap}
.accttable th.sortable{cursor:pointer;user-select:none}
.accttable th.sortable:hover{background:#E2EBF0;color:#2E2516}
.accttable th .arw{color:#5FA09E;margin-left:4px}
.accttable td{padding:7px 10px;border-bottom:1px solid #F1F3F4;vertical-align:middle}
.accttable tr:last-child td{border-bottom:none}
.accttable tbody tr:nth-child(even){background:#FAFBFC}
.accttable tbody tr.off{background:#F7F6F2}
.accttable tbody tr.off td:not(.actcell){opacity:.55}
.accttable tbody tr.me{box-shadow:inset 3px 0 0 #5FA09E}
/* Inputs sit in the cell rather than on top of it — a border on every one
   turns the table into a grid of boxes. They pick up an outline on focus. */
.acctmodal .accttable input[type=text],
.acctmodal .accttable input[type=email]{width:100%;box-sizing:border-box;padding:5px 7px;
  border:1px solid transparent;border-radius:6px;background:transparent;font:inherit;
  font-size:12.5px;color:#2E2516}
.acctmodal .accttable input[type=text]:hover,
.acctmodal .accttable input[type=email]:hover{border-color:#D5D0C4;background:#fff}
.acctmodal .accttable input[type=text]:focus,
.acctmodal .accttable input[type=email]:focus{border-color:#5FA09E;background:#fff;outline:none}
/* The level select is tinted by the level it holds, so admin rows stand
   out from read-only ones without a legend. */
.acctmodal .accttable select.lvl{width:auto;min-width:104px;padding:4px 7px;font-size:12px;
  font-weight:700;border-radius:999px;border:1px solid transparent;cursor:pointer}
.accttable select.lvl.admin{background:#5FA09E;color:#fff}
.accttable select.lvl.staff{background:#A6E2F9;color:#1c4a5a}
.accttable select.lvl.readonly{background:#EEF1F4;color:#6B6455;border-color:#D5D0C4}
.acctmodal .accttable label.tog{display:inline-flex;align-items:center;gap:6px;margin:0;
  font-size:12px;font-weight:600;color:#2E2516;text-transform:none;letter-spacing:0;
  white-space:nowrap;cursor:pointer}
.accttable label.tog input{width:14px;height:14px;margin:0;accent-color:#5FA09E}
.accttable td.actcell{text-align:right;white-space:nowrap}
.accttable .linkbtn{background:none;border:none;color:#5FA09E;font:inherit;font-size:11.5px;
  font-weight:700;cursor:pointer;padding:2px 4px;text-decoration:underline;white-space:nowrap}
.accttable .linkbtn:hover{color:#4c8987}
.accttable .when{font-size:11.5px;color:#6B6455;white-space:nowrap}
/* The password and delete-confirm rows span the table so they read as
   belonging to the row above rather than as another account. */
.accttable tr.subrow td{background:#F1F7F8;border-bottom:1px solid #E7EBE7}
.accttable .pwrow{display:flex;gap:8px;align-items:center}
.acctmodal .accttable .pwrow input{flex:1;border:1px solid #D5D0C4;background:#fff;
  border-radius:7px;padding:7px 9px}
.accttable .pwrow button.go{border:none;border-radius:8px;padding:7px 14px;font:inherit;
  font-size:12.5px;font-weight:700;cursor:pointer;background:#5FA09E;color:#fff;white-space:nowrap}
.accttable .pwrow button.go:disabled{background:#cbd1d6;cursor:default}
.accttable .peek{background:#F1F3F4;border:1px solid #D5D0C4;border-radius:7px;padding:6px 9px;
  font:inherit;font-size:11.5px;font-weight:700;color:#2E2516;cursor:pointer;white-space:nowrap}
.accttable .peek:hover{border-color:#5FA09E}
.accttable .delrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.accttable .delrow .q{font-size:12.5px;color:#8a1c15;font-weight:600}
.accttable .delrow .danger{background:#C0392B;color:#fff;border:none;border-radius:8px;
  padding:7px 14px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.accttable .delrow .danger:disabled{background:#dda9a3;cursor:default}
.accttable .delrow .keep{background:#fff;border:1px solid #D5D0C4;border-radius:8px;
  padding:7px 14px;font:inherit;font-size:12.5px;font-weight:700;color:#2E2516;cursor:pointer}
.acctmodal .delrow input{width:170px;border:1px solid #D5D0C4;border-radius:7px;padding:6px 9px;
  font-size:12.5px}
.acctmodal .iconbtn{background:none;border:none;cursor:pointer;color:#9A948A;padding:2px 4px}
.acctmodal .iconbtn:hover{color:#C0392B}
.acctmodal .addrow{border-top:1px solid #E7EBE7;margin-top:14px;padding-top:6px}
.acctmodal .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.acctmodal .self{font-size:11px;color:#6B6455;font-style:italic}
`

// ---- change my own password ---------------------------------
function PasswordModal({ user, onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (next !== again) { setErr('The two new passwords do not match.'); return }
    setBusy(true); setErr('')
    try {
      const res = await send(`/api/users/${user.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, password: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(body.error || 'Could not change the password.'); return }
      setDone(true)
      setTimeout(onClose, 1200)
    } catch { setErr('Network problem — please try again.') } finally { setBusy(false) }
  }

  return (
    <div className="acctov" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="acctmodal narrow" onMouseDown={e => e.stopPropagation()}>
        <h2><KeyRound size={16} /> Change your password</h2>
        <div className="hint">At least 9 characters. A few unrelated words works better than a short jumble.</div>
        <label>Current password</label>
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoFocus />
        <label>New password</label>
        <input type="password" value={next} onChange={e => setNext(e.target.value)} />
        <label>New password again</label>
        <input type="password" value={again} onChange={e => setAgain(e.target.value)} />
        {err && <div className="err">{err}</div>}
        {done && <div className="ok">Password changed.</div>}
        <div className="acts">
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="go" disabled={busy || !current || !next || !again} onClick={save}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* One account, everything about it editable in place.

   Name and email commit when you leave the field rather than on every
   keystroke — a PUT per character would be a lot of requests and would
   reject every half-typed address on the way. Level and active apply at
   once, because a dropdown and a tick have no half-finished state.

   Setting a password is offered for other people only. The server asks
   for the current password when you change your own, which an admin
   acting on their own row cannot supply here — that is what the Change
   password item in the menu is for. */
/* A sortable heading. Clicking the one already sorted flips direction. */
function SortTh({ k, sort, onSort, children }) {
  const on = sort.key === k
  return (
    <th className="sortable" onClick={() => onSort(s => ({ key: k, dir: s.key === k ? -s.dir : 1 }))}
      title={`Sort by ${String(children).toLowerCase()}`}>
      {children}{on && <span className="arw">{sort.dir > 0 ? '▲' : '▼'}</span>}
    </th>
  )
}

/* A password box that starts hidden with a Show beside it. Used for both
   setting someone's password and creating an account — a password typed
   in the clear is readable by whoever is standing behind you, and these
   screens get used at a front desk. */
function PasswordBox({ value, onChange, placeholder, autoFocus }) {
  const [shown, setShown] = useState(false)
  return (
    <>
      <input type={shown ? 'text' : 'password'} value={value} placeholder={placeholder}
        autoFocus={autoFocus} autoComplete="new-password"
        onChange={e => onChange(e.target.value)} />
      <button type="button" className="peek" aria-pressed={shown}
        title={shown ? 'Hide the password' : 'Show what you have typed'}
        onClick={() => setShown(v => !v)}>{shown ? 'Hide' : 'Show'}</button>
    </>
  )
}

/* One account as a row, everything about it editable in place.

   Name and email commit when you leave the field rather than on every
   keystroke — a PUT per character would be a lot of requests and would
   reject every half-typed address on the way. Level and active apply at
   once, because a dropdown and a tick have no half-finished state.

   Setting a password is offered for other people only. The server asks
   for the current password when you change your own, which an admin
   acting on their own row cannot supply here — that is what the Change
   password item in the menu is for. */
function AccountRow({ u, isMe, cols, onPatch, onRemove, onSetPassword }) {
  const [name, setName] = useState(u.name || '')
  const [email, setEmail] = useState(u.email || '')
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [typed, setTyped] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  /* Re-sync when the row is replaced by the server's copy, so a rejected
     edit snaps back to what is actually stored rather than sitting there
     looking saved. */
  useEffect(() => { setName(u.name || '') }, [u.name])
  useEffect(() => { setEmail(u.email || '') }, [u.email])

  const commit = (field, value, current) => {
    const v = value.trim()
    if (v === String(current || '')) return
    onPatch(u.id, { [field]: v })
  }

  const savePw = async () => {
    setPwBusy(true)
    const ok = await onSetPassword(u.id, pw)
    setPwBusy(false)
    if (ok) { setPw(''); setPwOpen(false) }
  }

  /* Deleting takes the account and its history with it and there is no
     undo, so it asks, names who, and wants the email typed back. Reading
     the address off the row above is easy; doing it by accident is not. */
  const armed = typed.trim().toLowerCase() === String(u.email || '').toLowerCase()
  const doDelete = async () => {
    if (!armed) return
    setDelBusy(true)
    await onRemove(u)
    setDelBusy(false)
  }

  return (
    <>
      <tr className={(u.active ? '' : 'off ') + (isMe ? 'me' : '')}>
        <td>
          <input type="text" value={name} placeholder="Full name" title="Click to edit"
            onChange={e => setName(e.target.value)}
            onBlur={() => commit('name', name, u.name)} />
        </td>
        <td>
          <input type="email" value={email} title="Click to edit"
            onChange={e => setEmail(e.target.value)}
            onBlur={() => commit('email', email, u.email)} />
        </td>
        <td>
          <select className={'lvl ' + u.role} value={u.role} title={ROLE_BLURB[u.role]}
            onChange={e => onPatch(u.id, { role: e.target.value })}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </td>
        <td>
          <label className="tog" title={u.active ? 'Switch this account off' : 'Switch this account on'}>
            <input type="checkbox" checked={u.active}
              onChange={e => onPatch(u.id, { active: e.target.checked })} />
            Active
          </label>
        </td>
        <td className="when">
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'never'}
          {isMe && <em style={{ color: '#5FA09E', fontWeight: 700 }}> · you</em>}
        </td>
        <td className="actcell">
          {!isMe && (
            <button type="button" className="linkbtn"
              onClick={() => { setPwOpen(v => !v); setConfirmDel(false) }}>
              {pwOpen ? 'Cancel' : 'Password'}
            </button>
          )}
          <button className="iconbtn" title="Remove this account"
            onClick={() => { setConfirmDel(v => !v); setPwOpen(false); setTyped('') }}>
            <Trash2 size={14} />
          </button>
        </td>
      </tr>

      {pwOpen && (
        <tr className="subrow">
          <td colSpan={cols}>
            <div className="pwrow">
              <PasswordBox value={pw} onChange={setPw} autoFocus
                placeholder={`New password for ${u.name || u.email} — at least 9 characters`} />
              <button className="go" disabled={pwBusy || !pw} onClick={savePw}>
                {pwBusy ? 'Saving…' : 'Save password'}
              </button>
            </div>
          </td>
        </tr>
      )}

      {confirmDel && (
        <tr className="subrow">
          <td colSpan={cols}>
            <div className="delrow">
              <span className="q">
                Delete {u.name || u.email}? This cannot be undone — type
                {' '}<strong>{u.email}</strong> to confirm.
              </span>
              <input type="text" value={typed} placeholder="Type the email"
                onChange={e => setTyped(e.target.value)} />
              <button className="danger" disabled={!armed || delBusy} onClick={doDelete}>
                {delBusy ? 'Deleting…' : 'Delete account'}
              </button>
              <button className="keep" onClick={() => { setConfirmDel(false); setTyped('') }}>
                Keep it
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ---- admin: accounts and levels -----------------------------
function UsersModal({ me, onClose }) {
  const [users, setUsers] = useState([])
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ email: '', name: '', password: '', role: 'staff' })
  const [sort, setSort] = useState({ key: 'name', dir: 1 })

  /* Level sorts by how much it can do rather than alphabetically — Admin,
     Staff, Read-only is the order people think in, and A-R-S is not. */
  const sorted = useMemo(() => {
    const rank = { admin: 0, staff: 1, readonly: 2 }
    const val = (u) => {
      if (sort.key === 'role') return rank[u.role] ?? 9
      if (sort.key === 'lastLoginAt') return u.lastLoginAt || ''   // never signed in sorts first
      return String(u.name || u.email || '').toLowerCase()
    }
    return [...users].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -sort.dir
      if (av > bv) return sort.dir
      return String(a.email).localeCompare(String(b.email))
    })
  }, [users, sort])

  const load = useCallback(async () => {
    try {
      const res = await send('/api/users')
      if (!res.ok) { setErr('Could not load accounts.'); return }
      setUsers(await res.json())
    } catch { setErr('Network problem — please try again.') }
  }, [])
  useEffect(() => { load() }, [load])

  const apply = async (id, patch) => {
    setErr(''); setNote('')
    const res = await send(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(body.error || 'Could not save that change.'); load(); return }
    setUsers(us => us.map(u => (u.id === id ? body : u)))
  }

  /* Admin setting someone else's password: the server does not ask for
     the current one in that case, only for your own. Returns whether it
     stuck, so the row can clear and close its field. */
  const setPassword = async (id, password) => {
    setErr(''); setNote('')
    const res = await send(`/api/users/${id}/password`, {
      method: 'POST', body: JSON.stringify({ password }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(body.error || 'Could not set that password.'); return false }
    setNote('Password changed. Tell them what you set — it cannot be read back.')
    return true
  }

  const remove = async (u) => {
    setErr(''); setNote('')
    const res = await send(`/api/users/${u.id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(body.error || 'Could not remove that account.'); return }
    setUsers(us => us.filter(x => x.id !== u.id))
    setNote(`Removed ${u.email}.`)
  }

  const add = async () => {
    setBusy(true); setErr(''); setNote('')
    try {
      const res = await send('/api/users', { method: 'POST', body: JSON.stringify(draft) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(body.error || 'Could not create that account.'); return }
      setUsers(us => [...us, body])
      setNote(`Created ${body.email}. Tell them the password you set — it cannot be read back.`)
      setDraft({ email: '', name: '', password: '', role: 'staff' })
    } catch { setErr('Network problem — please try again.') } finally { setBusy(false) }
  }

  return (
    <div className="acctov" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="acctmodal wide" onMouseDown={e => e.stopPropagation()}>
        <h2><Users size={16} /> Accounts and access levels</h2>
        <div className="hint">
          Admin can do everything. Staff do day-to-day work but cannot delete records,
          change settings or manage accounts. Read-only can look but not change.
        </div>

        {err && <div className="err">{err}</div>}
        {note && <div className="ok">{note}</div>}

        <table className="accttable">
          <thead>
            <tr>
              <SortTh k="name" sort={sort} onSort={setSort}>Name</SortTh>
              <th>Email</th>
              <SortTh k="role" sort={sort} onSort={setSort}>Level</SortTh>
              <th>Status</th>
              <SortTh k="lastLoginAt" sort={sort} onSort={setSort}>Last signed in</SortTh>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(u => (
              <AccountRow key={u.id} u={u} isMe={u.id === me.id} cols={6}
                onPatch={apply} onRemove={remove} onSetPassword={setPassword} />
            ))}
          </tbody>
        </table>

        <div className="addrow">
          <h2 style={{ fontSize: 14, marginTop: 8 }}>Add someone</h2>
          <div className="grid2">
            <div>
              <label>Name</label>
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <label>Email</label>
              <input type="email" value={draft.email}
                onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
            </div>
            <div>
              <label>Password</label>
              <div className="pwfield">
                <PasswordBox value={draft.password} placeholder="at least 9 characters"
                  onChange={v => setDraft(d => ({ ...d, password: v }))} />
              </div>
            </div>
            <div>
              <label>Level</label>
              <select value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="acts">
            <button className="go" disabled={busy || !draft.email || !draft.password} onClick={add}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </div>

        <div className="acts">
          <button className="cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function AccountMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDown) }
  }, [open])

  if (!user) return <div className="avatar">?</div>
  const role = user.role || 'staff'

  return (
    <div className="acct" ref={ref}>
      <div className="avatar" title={`${user.email} · ${ROLE_LABELS[role]}`}
        onClick={() => setOpen(o => !o)}>{user.initials || '??'}</div>

      {open && (
        <div className="acctpop">
          <div className="who">{user.name || user.email}</div>
          <div className="mail">{user.email}</div>
          <span className={'lvl ' + role}><ShieldCheck size={11} /> {ROLE_LABELS[role]}</span>
          <div className="blurb">{ROLE_BLURB[role]}</div>
          <div className="sep" />
          <button className="item" onClick={() => { setModal('password'); setOpen(false) }}>
            <KeyRound size={14} /> Change my password
          </button>
          {role === 'admin' && (
            <button className="item" onClick={() => { setModal('users'); setOpen(false) }}>
              <Users size={14} /> Accounts and access levels
            </button>
          )}
          <div className="sep" />
          <button className="item danger" onClick={onLogout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}

      {modal === 'password' && <PasswordModal user={user} onClose={() => setModal(null)} />}
      {modal === 'users' && <UsersModal me={user} onClose={() => setModal(null)} />}
    </div>
  )
}
