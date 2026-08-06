// The avatar menu: who you are signed in as, what level you have, and
// — for admins — the screen where levels are handed out.
//
// The level shown here is the one the server put in the session, not a
// preference held in the browser. Hiding a button from someone who may
// not use it is a courtesy; the refusal that matters happens on the
// server, so nothing here can be clicked around.
import { useCallback, useEffect, useRef, useState } from 'react'
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
.acctmodal table{width:100%;border-collapse:separate;border-spacing:0 6px;font-size:12.5px}
.acctmodal th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;
  color:#6B6455;padding:0 8px}
.acctmodal td{background:#F1F3F4;padding:7px 8px;vertical-align:middle}
.acctmodal td:first-child{border-radius:6px 0 0 6px}
.acctmodal td:last-child{border-radius:0 6px 6px 0;text-align:right;white-space:nowrap}
.acctmodal tr.off td{opacity:.55}
.acctmodal td select{padding:3px 6px;font-size:12px;width:auto}
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
        <div className="hint">At least 10 characters. A few unrelated words works better than a short jumble.</div>
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

// ---- admin: accounts and levels -----------------------------
function UsersModal({ me, onClose }) {
  const [users, setUsers] = useState([])
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ email: '', name: '', password: '', role: 'staff' })

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
      <div className="acctmodal" onMouseDown={e => e.stopPropagation()}>
        <h2><Users size={16} /> Accounts and access levels</h2>
        <div className="hint">
          Admin can do everything. Staff do day-to-day work but cannot delete records,
          change settings or manage accounts. Read-only can look but not change.
        </div>

        {err && <div className="err">{err}</div>}
        {note && <div className="ok">{note}</div>}

        <table>
          <thead>
            <tr><th>Person</th><th>Level</th><th>Last signed in</th><th></th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={u.active ? '' : 'off'}>
                <td>
                  <div style={{ fontWeight: 700 }}>{u.name || '—'}</div>
                  <div style={{ color: '#6B6455' }}>{u.email}</div>
                  {u.id === me.id && <div className="self">this is you</div>}
                </td>
                <td>
                  <select value={u.role} onChange={e => apply(u.id, { role: e.target.value })}>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'never'}</td>
                <td>
                  <label className="self" style={{ marginRight: 8 }}>
                    <input type="checkbox" checked={u.active}
                      onChange={e => apply(u.id, { active: e.target.checked })} /> active
                  </label>
                  <button className="iconbtn" title="Remove this account"
                    onClick={() => remove(u)}><Trash2 size={14} /></button>
                </td>
              </tr>
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
              <input type="text" value={draft.password}
                onChange={e => setDraft(d => ({ ...d, password: e.target.value }))}
                placeholder="at least 10 characters" />
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
