// Contacts — a standalone business/vendor directory: suppliers,
// contractors, partner schools, professional services (accountant,
// lawyer, etc.), community partners. Deliberately separate from
// Customers (families), Staff (employees), and Emergency Contacts
// (derived from registrations) — this is for people/companies outside
// the school. State persists at GET/PUT /api/contacts with a 350ms
// debounce, same pattern as Marketing/Leads.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Edit2, Trash2, Search, Phone, Mail, Globe } from 'lucide-react'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const CATEGORIES = ['Vendor/Supplier', 'Contractor', 'Partner School', 'Professional Services', 'Community Partner', 'Other']
const CATEGORY_STYLE = {
  'Vendor/Supplier':       { background: '#e8eef3', color: '#3d5a73' },
  Contractor:              { background: '#fff3cd', color: '#8a6a00' },
  'Partner School':        { background: '#d6e9fb', color: '#1d5f99' },
  'Professional Services': { background: '#e6dcf5', color: '#5b3a91' },
  'Community Partner':     { background: '#dcedc8', color: '#558b2f' },
  Other:                   { background: '#ece9e0', color: '#6b6455' },
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// ---------- store hook ----------
function useContacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const latest = useRef(contacts)
  latest.current = contacts

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/contacts`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setContacts(Array.isArray(j.contacts) ? j.contacts : [])
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const mutate = useCallback((mut) => {
    setContacts(prev => {
      const next = mut([...prev])
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/contacts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify({ contacts: latest.current }),
        }).catch(() => {})
      }, 350)
      return next
    })
  }, [])

  return { contacts, loading, status, mutate }
}

export default function Contacts() {
  const { contacts, loading, status, mutate } = useContacts()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [editing, setEditing] = useState(null) // null | { mode:'new'|'edit', contact? }

  const saveContact = (form) => {
    mutate(list => {
      if (editing.mode === 'new') {
        return [...list, { id: uid(), ...form }]
      }
      return list.map(c => c.id === editing.contact.id ? { ...c, ...form } : c)
    })
    setEditing(null)
  }
  const deleteContact = (id) => {
    const c = contacts.find(x => x.id === id)
    if (!confirm(`Delete "${c?.name || 'this contact'}"?`)) return
    mutate(list => list.filter(x => x.id !== id))
  }

  const q = search.trim().toLowerCase()
  const visible = contacts.filter(c => {
    if (catFilter !== 'all' && c.category !== catFilter) return false
    if (!q) return true
    return (c.name || '').toLowerCase().includes(q) ||
      (c.contactPerson || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))

  if (loading) {
    return (
      <div className="page">
        <h2 className="page-title">Contacts</h2>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head">
        <h2 className="page-title">Contacts</h2>
        <button className="icon-btn solid" title="New contact" onClick={() => setEditing({ mode: 'new' })}>
          <Plus size={22} />
        </button>
      </div>

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, contact person, email, phone…"
            style={{ width: '100%', padding: '7px 8px 7px 30px', fontSize: 13, border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }}
          />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || catFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setCatFilter('all') }}
            style={{ background: 'transparent', border: 'none', color: 'var(--brand-dark-blue)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>
            Clear
          </button>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 10, overflow: 'auto', boxShadow: 'var(--brand-shadow)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Contact Person</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                {contacts.length === 0 ? 'No contacts yet — click + above to add one.' : 'No contacts match your filters.'}
              </td></tr>
            )}
            {visible.map((c, i) => {
              const st = CATEGORY_STYLE[c.category] || CATEGORY_STYLE.Other
              return (
                <tr key={c.id} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    {c.name || 'Unnamed'}
                    {c.website && (
                      <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer"
                        style={{ marginLeft: 6, color: 'var(--muted)', display: 'inline-flex', verticalAlign: 'middle' }}
                        title={c.website} onClick={e => e.stopPropagation()}>
                        <Globe size={12} />
                      </a>
                    )}
                    {c.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes}</div>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ ...st, borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{c.category || 'Other'}</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{c.contactPerson || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {c.phone ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={12} color="var(--muted)" />{c.phone}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {c.email ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mail size={12} color="var(--muted)" />{c.email}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing({ mode: 'edit', contact: c })}>
                      <Edit2 size={14} />
                    </button>
                    <button className="icon-btn" title="Delete" onClick={() => deleteContact(c.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <ContactModal
          mode={editing.mode}
          initial={editing.contact}
          onClose={() => setEditing(null)}
          onSave={saveContact}
          onDelete={editing.mode === 'edit' ? () => { deleteContact(editing.contact.id); setEditing(null) } : null}
        />
      )}
    </div>
  )
}

function ContactModal({ mode, initial, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || '')
  const [category, setCategory] = useState(initial?.category || CATEGORIES[0])
  const [contactPerson, setContactPerson] = useState(initial?.contactPerson || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [address, setAddress] = useState(initial?.address || '')
  const [website, setWebsite] = useState(initial?.website || '')
  const [notes, setNotes] = useState(initial?.notes || '')

  const handleSave = () => {
    if (!name.trim()) { alert('Please enter a name.'); return }
    onSave({
      name: name.trim(), category, contactPerson: contactPerson.trim(),
      phone: phone.trim(), email: email.trim(), address: address.trim(),
      website: website.trim(), notes: notes.trim(),
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Contact' : 'New Contact'}</h2>

        <div className="kb-field">
          <label>Name (person or company)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vistaprint, Bell, Dr. Smith" autoFocus />
        </div>

        <div className="kb-field">
          <label>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="kb-field">
          <label>Contact Person</label>
          <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>

        <div className="kb-field">
          <label>Website</label>
          <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="e.g. vistaprint.ca" />
        </div>

        <div className="kb-field">
          <label>Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} />
        </div>

        <div className="kb-field">
          <label>Notes</label>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Account #, terms, who to ask for…" />
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

function Th({ children }) {
  return <th style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
    padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap',
  }}>{children}</th>
}
