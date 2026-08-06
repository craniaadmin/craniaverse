// IT Accounts — password / credentials manager under Operations.
// Ported from the v28 client mockup; state is persisted server-side
// via GET/PUT /api/it-accounts with a 350 ms debounce.
//
// v1 covers categories, accounts (add/edit/delete), password
// show/hide, copy user/pass, search + category filter, active flag.
// Skipped for v1 (data still round-trips as-is): drag/drop reorder,
// undo/redo, CSV export, category-color palette manager, master
// password gate, cost/start-date UI polish, encryption of passwords.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageActions, { PAGEACTIONS_CSS } from '../components/PageActions'
import useHistory from '../data/useHistory'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const DEFAULT_CAT_COLOR = '#5FA09E'
const DEFAULT_ACC_COLOR = '#EEF3F6'

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const money = (n) => {
  if (n === '' || n == null) return ''
  const num = Number(n)
  if (!Number.isFinite(num)) return ''
  return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

// ---------- store hook ----------
function useItAccounts() {
  const [data, setData] = useState({ categories: [], accounts: [] })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const latest = useRef(data)
  latest.current = data

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/it-accounts`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setData({
        categories: Array.isArray(j.categories) ? j.categories : [],
        accounts:   Array.isArray(j.accounts)   ? j.accounts   : [],
      })
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const mutate = useCallback((mut) => {
    setData(prev => {
      const next = { categories: [...prev.categories], accounts: [...prev.accounts] }
      mut(next)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/it-accounts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify(latest.current),
        }).catch(() => {})
      }, 350)
      return next
    })
  }, [])

  return { data, loading, status, mutate, refresh }
}

// ---------- ITAccounts page ----------
export default function ITAccounts() {
  const { data, loading, status, mutate, refresh } = useItAccounts()
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [showAllPw, setShowAllPw] = useState(false)
  const [editing, setEditing]     = useState(null) // { mode:'edit'|'new', account, catId }
  const [addingCat, setAddingCat] = useState(false)

  const catById = useMemo(
    () => Object.fromEntries(data.categories.map(c => [c.id, c])),
    [data.categories],
  )

  const filteredAccountsByCat = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = {}
    for (const cat of data.categories) out[cat.id] = []
    for (const a of data.accounts) {
      if (catFilter !== 'all' && a.catId !== catFilter) continue
      if (q) {
        const hay = ((a.name || '') + ' ' + (a.user || '') + ' ' + (a.url || '')
          + ' ' + (a.notes || '')).toLowerCase()
        if (!hay.includes(q)) continue
      }
      const bucket = out[a.catId] || (out[a.catId] = [])
      bucket.push(a)
    }
    return out
  }, [data.categories, data.accounts, catFilter, query])

  const visibleCats = useMemo(() => {
    return data.categories.filter(c => {
      if (catFilter !== 'all' && c.id !== catFilter) return false
      // Hide categories with zero visible accounts when a search is active.
      if (query.trim() && (filteredAccountsByCat[c.id] || []).length === 0) return false
      return true
    })
  }, [data.categories, catFilter, query, filteredAccountsByCat])

  // ----- category mutations -----
  const addCategory = (name, color) => {
    if (!name.trim()) return
    mutate(d => { d.categories.push({ id: uid(), name: name.trim(), color: color || DEFAULT_CAT_COLOR }) })
  }
  const renameCategory = (id, name) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    mutate(d => {
      const i = d.categories.findIndex(c => c.id === id)
      if (i !== -1) d.categories[i] = { ...d.categories[i], name: trimmed }
    })
  }
  const deleteCategory = (id) => {
    const cat = catById[id]
    const count = data.accounts.filter(a => a.catId === id).length
    const label = cat?.name || 'this category'
    if (!confirm(`Delete "${label}" and its ${count} account${count === 1 ? '' : 's'}?`)) return
    mutate(d => {
      d.categories = d.categories.filter(c => c.id !== id)
      d.accounts   = d.accounts.filter(a => a.catId !== id)
    })
  }

  // ----- account mutations -----
  const saveAccount = (form) => {
    mutate(d => {
      if (editing.mode === 'new') {
        d.accounts.push({ id: uid(), color: DEFAULT_ACC_COLOR, ...form })
      } else {
        const i = d.accounts.findIndex(a => a.id === editing.account.id)
        if (i !== -1) d.accounts[i] = { ...d.accounts[i], ...form }
      }
    })
    setEditing(null)
  }
  const deleteAccount = (id) => {
    const acc = data.accounts.find(a => a.id === id)
    if (!confirm(`Delete "${acc?.name || 'this account'}"?`)) return
    mutate(d => { d.accounts = d.accounts.filter(a => a.id !== id) })
  }
  const duplicateAccount = (id) => {
    mutate(d => {
      const i = d.accounts.findIndex(a => a.id === id)
      if (i === -1) return
      d.accounts.splice(i + 1, 0, { ...d.accounts[i], id: uid() })
    })
  }
  const toggleActive = (id) => {
    mutate(d => {
      const i = d.accounts.findIndex(a => a.id === id)
      if (i === -1) return
      d.accounts[i] = { ...d.accounts[i], active: d.accounts[i].active === false ? true : false }
    })
  }

  // Undo/redo over the page's own data — see src/data/useHistory.js
  const hist = useHistory(data, next => mutate(() => next), { label: 'account change' })

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }


  return (
    <div className="page">

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      <style>{PAGEACTIONS_CSS}</style>
      <PageActions
        {...hist}
        csvName="crania-it-accounts"
        csvColumns={[
          { key: 'category', label: 'Category' },
          { key: 'name', label: 'Account' },
          { key: 'url', label: 'Website' },
          { key: 'user', label: 'Username' },
          { key: 'cost', label: 'Monthly Cost' },
          { key: 'start', label: 'Start Date' },
          { key: 'active', label: 'Active' },
          { key: 'notes', label: 'Notes' },
        ]}
        csvRows={() => visibleCats.flatMap(cat =>
          (filteredAccountsByCat[cat.id] || []).map(a => ({
            category: cat.name || '',
            name: a.name || '',
            url: a.url || '',
            user: a.user || '',
            cost: a.cost === '' || a.cost == null ? '' : Number(a.cost),
            start: a.start || '',
            active: a.active === false ? 'No' : 'Yes',
            notes: a.notes || '',
          })))}
        backupCollection="itAccounts"
        backupHint="Snapshots of every IT account and category (last 14 kept)."
        onRestored={refresh}
      >
        <button title={showAllPw ? 'Hide every password' : 'Reveal every password'}
          onClick={() => setShowAllPw(v => !v)}>
          {showAllPw ? 'Hide Passwords' : 'Show Passwords'}
        </button>
        <button title="Add a category" onClick={() => setAddingCat(true)}>+ Add Category</button>
      </PageActions>

      <div className="ita-toolbar">
        <input
          className="ita-search"
          type="search"
          placeholder="Search accounts, usernames, websites…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(query || catFilter !== 'all') && (
          <button className="clear" onClick={() => { setQuery(''); setCatFilter('all') }}>Clear</button>
        )}
      </div>

      <div className="ita-board">
        {visibleCats.length === 0 && (
          <div className="ita-nomatch">
            {query || catFilter !== 'all'
              ? 'No accounts match your filters.'
              : 'No categories yet — click "+ Add Category" above to get started.'}
          </div>
        )}
        {visibleCats.map(cat => (
          <CategoryList
            key={cat.id}
            cat={cat}
            accounts={filteredAccountsByCat[cat.id] || []}
            showAllPw={showAllPw}
            onAddAccount={() => setEditing({ mode: 'new', catId: cat.id })}
            onEditAccount={(a) => setEditing({ mode: 'edit', account: a })}
            onDeleteAccount={deleteAccount}
            onDuplicateAccount={duplicateAccount}
            onToggleActive={toggleActive}
            onRenameCategory={(name) => renameCategory(cat.id, name)}
            onDeleteCategory={() => deleteCategory(cat.id)}
          />
        ))}
      </div>

      {editing && (
        <AccountModal
          mode={editing.mode}
          initial={editing.account}
          initialCatId={editing.catId || editing.account?.catId}
          categories={data.categories}
          onClose={() => setEditing(null)}
          onSave={saveAccount}
          onDelete={editing.mode === 'edit'
            ? () => { deleteAccount(editing.account.id); setEditing(null) }
            : null}
        />
      )}

      {addingCat && (
        <CategoryModal
          onClose={() => setAddingCat(false)}
          onSave={(name, color) => { addCategory(name, color); setAddingCat(false) }}
        />
      )}
    </div>
  )
}

// ---------- Category list ----------
function CategoryList({
  cat, accounts, showAllPw,
  onAddAccount, onEditAccount, onDeleteAccount, onDuplicateAccount, onToggleActive,
  onRenameCategory, onDeleteCategory,
}) {
  const color = cat.color || DEFAULT_CAT_COLOR
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft]     = useState(cat.name)

  return (
    <div className="ita-list" style={{ borderLeftColor: color }}>
      <div className="ita-list-head" style={{ background: color + '22' }}>
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={() => { onRenameCategory(nameDraft); setEditingName(false) }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--brand-dark-blue)', borderRadius: 6 }}
          />
        ) : (
          <span
            className="name"
            style={{ cursor: 'text' }}
            title="Click to rename"
            onClick={() => { setNameDraft(cat.name); setEditingName(true) }}
          >
            {cat.name}
          </span>
        )}
        <span className="count">{accounts.length}</span>
        <button className="lbtn del" title="Delete category" onClick={onDeleteCategory}>×</button>
      </div>
      <div className="ita-items">
        {accounts.length === 0 && <div className="ita-empty">No accounts</div>}
        {accounts.map(a => (
          <AccountRow
            key={a.id}
            account={a}
            showAllPw={showAllPw}
            onEdit={() => onEditAccount(a)}
            onDelete={() => onDeleteAccount(a.id)}
            onDuplicate={() => onDuplicateAccount(a.id)}
            onToggleActive={() => onToggleActive(a.id)}
          />
        ))}
      </div>
      <button className="ita-add-item" onClick={onAddAccount} title="Add account">+</button>
    </div>
  )
}

// ---------- Account row ----------
function AccountRow({ account: a, showAllPw, onEdit, onDelete, onDuplicate, onToggleActive }) {
  const [showPw, setShowPw]       = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [copiedField, setCopiedField] = useState('')

  const showThisPw = showAllPw || showPw
  const inactive   = a.active === false

  const copy = async (label, value) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(label)
      setTimeout(() => setCopiedField(''), 900)
    } catch { /* clipboard blocked */ }
  }

  return (
    <div
      className={'ita-acc' + (inactive ? ' inactive' : '')}
      style={{ background: a.color || DEFAULT_ACC_COLOR }}
      onMouseEnter={() => a.notes && setShowNotes(true)}
      onMouseLeave={() => setShowNotes(false)}
    >
      <span className="txt" onClick={onEdit} title="Click to edit">
        {a.name || '(unnamed)'}{inactive && <> <span className="inactchip">Inactive</span></>}
      </span>

      <div className="slot" title={a.user}>
        <span className="val">{a.user || <em style={{ color: '#b0aa9b' }}>—</em>}</span>
        {a.user && (
          <button className={'ibtn' + (copiedField === 'user' ? ' ok' : '')} title="Copy username"
            onClick={() => copy('user', a.user)}>
            {copiedField === 'user' ? '✓' : '⎘'}
          </button>
        )}
      </div>

      <div className="slot pw" title={showThisPw ? a.pass : ''}>
        <span className={'val' + (a.pass ? '' : ' empty')}>
          {a.pass ? (showThisPw ? a.pass : '••••••••') : '(no password)'}
        </span>
        {a.pass && (
          <>
            <button className="ibtn" title={showThisPw ? 'Hide' : 'Show'}
              onClick={() => setShowPw(v => !v)}>{showThisPw ? '🙈' : '👁'}</button>
            <button className={'ibtn' + (copiedField === 'pass' ? ' ok' : '')} title="Copy password"
              onClick={() => copy('pass', a.pass)}>
              {copiedField === 'pass' ? '✓' : '⎘'}
            </button>
          </>
        )}
      </div>

      {a.url && (
        <a
          className="ibtn"
          href={a.url.startsWith('http') ? a.url : ('https://' + a.url)}
          target="_blank" rel="noreferrer"
          title={`Open ${a.url}`}
          onClick={e => e.stopPropagation()}
        >
          ↗
        </a>
      )}

      {a.cost !== '' && a.cost != null && (
        <div className="slot cost" title={`$${a.cost}/mo`}><span className="val">{money(a.cost)}</span></div>
      )}
      {a.start && (
        <div className="slot start" title={`Started ${a.start}`}><span className="val">{fmtDate(a.start)}</span></div>
      )}

      <button className="ibtn" title="Toggle active" onClick={onToggleActive}>
        {inactive ? '○' : '●'}
      </button>
      <button className="ibtn" title="Duplicate" onClick={onDuplicate}>⧉</button>
      <button className="ibtn del" title="Delete" onClick={onDelete}>×</button>

      {showNotes && a.notes && <div className="ita-notepop">{a.notes}</div>}
    </div>
  )
}

// ---------- Account modal ----------
function AccountModal({ mode, initial, initialCatId, categories, onClose, onSave, onDelete }) {
  const [name,   setName]   = useState(initial?.name || '')
  const [catId,  setCatId]  = useState(initial?.catId || initialCatId || (categories[0]?.id || ''))
  const [url,    setUrl]    = useState(initial?.url  || '')
  const [user,   setUser]   = useState(initial?.user || '')
  const [pass,   setPass]   = useState(initial?.pass || '')
  const [showPw, setShowPw] = useState(false)
  const [cost,   setCost]   = useState(initial?.cost === '' || initial?.cost == null ? '' : String(initial.cost))
  const [start,  setStart]  = useState(initial?.start || '')
  const [notes,  setNotes]  = useState(initial?.notes || '')
  const [active, setActive] = useState(initial?.active === false ? false : true)

  const genPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
    let out = ''
    const arr = new Uint32Array(16)
    ;(globalThis.crypto || {}).getRandomValues?.(arr)
    for (let i = 0; i < 16; i++) out += chars[(arr[i] || Math.floor(Math.random() * 1e9)) % chars.length]
    setPass(out); setShowPw(true)
  }

  const handleSave = () => {
    if (!name.trim())  { alert('Please enter an account name.'); return }
    if (!catId)        { alert('Please choose a category.'); return }
    onSave({
      catId,
      name:  name.trim(),
      url:   url.trim(),
      user:  user.trim(),
      pass,
      notes: notes.trim(),
      cost:  cost === '' ? '' : Number(cost),
      start,
      active,
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{mode === 'edit' ? 'Edit Account' : 'New Account'}</h2>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
          </label>
        </div>

        <div className="kb-field">
          <label>Account / Service Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
                 placeholder="e.g. Canva, CRA My Business, Instagram" autoFocus />
        </div>

        <div className="kb-field">
          <label>Category</label>
          <select value={catId} onChange={e => setCatId(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="kb-field">
          <label>Website / Login Page</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="e.g. canva.com" />
        </div>

        <div className="kb-field">
          <label>Username / Email</label>
          <input value={user} onChange={e => setUser(e.target.value)} autoComplete="off" />
        </div>

        <div className="kb-field">
          <label>Password</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type={showPw ? 'text' : 'password'}
              value={pass}
              onChange={e => setPass(e.target.value)}
              autoComplete="new-password"
              style={{ flex: 1 }}
            />
            <button type="button" onClick={() => setShowPw(v => !v)} title="Show/hide"
              style={{ padding: '8px 10px', background: '#eee', border: '1px solid #d5d0c4', borderRadius: 6, cursor: 'pointer' }}>
              {showPw ? '🙈' : '👁'}
            </button>
            <button type="button" onClick={genPassword} title="Generate a strong password"
              style={{ padding: '8px 10px', background: 'var(--brand-light-brown)',
                       color: 'var(--brand-dark-brown)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              Generate
            </button>
          </div>
        </div>

        <div className="kb-field">
          <label>Monthly Cost ($)</label>
          <input type="number" min="0" step="0.01" placeholder="0.00"
                 value={cost} onChange={e => setCost(e.target.value)} />
        </div>

        <div className="kb-field">
          <label>Start Date</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>

        <div className="kb-field">
          <label>Notes (2FA, Security Questions, Who Uses It…)</label>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. 2FA goes to the school phone; recovery email is the admin account…" />
        </div>

        <div className="kb-actions">
          {onDelete && <button className="del" onClick={onDelete}>Delete</button>}
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Category modal ----------
function CategoryModal({ onClose, onSave }) {
  const [name,  setName]  = useState('')
  const [color, setColor] = useState(DEFAULT_CAT_COLOR)

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h2>New Category</h2>
        <div className="kb-field">
          <label>Category Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. School, Finance, Social Media" autoFocus />
        </div>
        <div className="kb-field">
          <label>Category Colour</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            style={{ width: 60, height: 32 }} />
        </div>
        <div className="kb-actions">
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={() => name.trim() && onSave(name, color)}>Save</button>
        </div>
      </div>
    </div>
  )
}
