// Leads — a simple CRM pipeline for prospective families, tracked
// before they become a real Customer/Student record. State persists
// at GET/PUT /api/leads with a 350ms debounce, same pattern as
// Marketing/IT Accounts. "Convert to Customer" creates a real
// registration via POST /api/registrations (with internalNoEmail so
// the family doesn't get a "registration confirmation" email for a
// registration they never actually submitted) and links the lead to
// the resulting student record.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Edit2, Trash2, Search, UserPlus } from 'lucide-react'
import { useStore } from '../data/store'
import PageActions from '../components/PageActions'
import useHistory from '../data/useHistory'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const SOURCES = ['Referral', 'Social Media', 'Website', 'Walk-in', 'Google Search', 'Event/Booth', 'Other']
const STATUSES = ['New', 'Contacted', 'Tour Booked', 'Enrolled', 'Lost']
const STATUS_STYLE = {
  New:          { background: '#e8eef3', color: '#3d5a73' },
  Contacted:    { background: '#fff3cd', color: '#8a6a00' },
  'Tour Booked': { background: '#d6e9fb', color: '#1d5f99' },
  Enrolled:     { background: '#c8e6c9', color: '#2e7d32' },
  Lost:         { background: '#f4d9d9', color: '#a12626' },
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}
const leadName = (l) => `${l.childFirstName || ''} ${l.childLastName || ''}`.trim() || '—'

// ---------- store hook ----------
function useLeads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const latest = useRef(leads)
  latest.current = leads

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/leads`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setLeads(Array.isArray(j.leads) ? j.leads : [])
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const mutate = useCallback((mut) => {
    setLeads(prev => {
      const next = mut([...prev])
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/leads`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify({ leads: latest.current }),
        }).catch(() => {})
      }, 350)
      return next
    })
  }, [])

  return { leads, loading, status, mutate, refresh }
}

export default function Leads({ onNavigate }) {
  const { leads, loading, status, mutate, refresh } = useLeads()
  const { refresh: refreshStore } = useStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState(null) // null | { mode:'new'|'edit', lead? }
  const [converting, setConverting] = useState(null) // lead id currently converting

  const saveLead = (form) => {
    mutate(list => {
      if (editing.mode === 'new') {
        return [...list, { id: uid(), status: 'New', createdAt: new Date().toISOString(), ...form }]
      }
      return list.map(l => l.id === editing.lead.id ? { ...l, ...form } : l)
    })
    setEditing(null)
  }
  const deleteLead = (id) => {
    const l = leads.find(x => x.id === id)
    if (!confirm(`Delete lead "${leadName(l)}"?`)) return
    mutate(list => list.filter(x => x.id !== id))
  }

  const convertToCustomer = async (lead) => {
    if (!lead.childFirstName?.trim() || !lead.childLastName?.trim()) {
      alert('Add the child’s first and last name before converting this lead.')
      return
    }
    if (lead.convertedRecordId) {
      onNavigate && onNavigate('Students', lead.convertedRecordId)
      return
    }
    if (!confirm(`Convert "${leadName(lead)}" into a real Student/Customer record?`)) return
    setConverting(lead.id)
    try {
      const res = await fetch(`${API_BASE}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify({
          studentFirstName: lead.childFirstName.trim(),
          studentLastName: lead.childLastName.trim(),
          g1FirstName: (lead.parentName || '').split(' ')[0] || '',
          g1LastName: (lead.parentName || '').split(' ').slice(1).join(' ') || '',
          g1Email: lead.email || '',
          g1PhoneMobile: lead.phone || '',
          additionalNotes: lead.notes || '',
          forceNew: true,
          internalNoEmail: true,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const record = await res.json()
      mutate(list => list.map(l => l.id === lead.id ? { ...l, status: 'Enrolled', convertedRecordId: record.id } : l))
      refreshStore && refreshStore()
      onNavigate && onNavigate('Students', record.id)
    } catch (err) {
      console.error(err)
      alert('Could not convert this lead — please try again.')
    } finally {
      setConverting(null)
    }
  }

  const q = search.trim().toLowerCase()
  const visible = leads.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (!q) return true
    return leadName(l).toLowerCase().includes(q) ||
      (l.parentName || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q)
  })

  const metrics = STATUSES.reduce((acc, s) => ({ ...acc, [s]: leads.filter(l => l.status === s).length }), {})

  // Undo/redo over the page's own data — see src/data/useHistory.js
  const hist = useHistory(leads, next => mutate(() => next), { label: 'lead change', enabled: !loading })

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }


  return (
    <div className="page" style={{ paddingBottom: 32 }}>

      <PageActions
        {...hist}
        csvName="crania-leads"
        csvColumns={[
          { key: 'child', label: 'Child' },
          { key: 'parentName', label: 'Parent/Guardian' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'source', label: 'Source' },
          { key: 'status', label: 'Status' },
          { key: 'followUpDate', label: 'Follow-up Date' },
          { key: 'createdAt', label: 'Created' },
          { key: 'notes', label: 'Notes' },
        ]}
        csvRows={() => visible.map(l => ({
          child: leadName(l) === '—' ? '' : leadName(l),
          parentName: l.parentName || '',
          email: l.email || '',
          phone: l.phone || '',
          source: l.source || '',
          status: l.status || 'New',
          followUpDate: l.followUpDate || '',
          createdAt: (l.createdAt || '').slice(0, 10),
          notes: l.notes || '',
        }))}
        backupCollection="leads"
        backupHint="Snapshots of the whole leads pipeline (last 14 kept)."
        onRestored={refresh}
      >
        <button className="icon-btn solid" title="New lead" onClick={() => setEditing({ mode: 'new' })}>
          <Plus size={22} />
        </button>
        <button title="Add a new lead" onClick={() => setEditing({ mode: 'new' })}>
          <Plus size={13} /> Add Lead
        </button>
      </PageActions>

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STATUSES.length}, 1fr)`, gap: 12, marginBottom: 16 }}>
        {STATUSES.map(s => (
          <MetricTile key={s} label={s} value={metrics[s] || 0} color={STATUS_STYLE[s]?.color} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search child, parent, email, phone…"
            style={{ width: '100%', padding: '7px 8px 7px 30px', fontSize: 13, border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff' }}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search || statusFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setStatusFilter('all') }}
            style={{ background: 'transparent', border: 'none', color: 'var(--brand-dark-blue)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>
            Clear
          </button>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 10, overflow: 'auto', boxShadow: 'var(--brand-shadow)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
              <Th>Child</Th>
              <Th>Parent</Th>
              <Th>Contact</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th>Follow-up</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                {leads.length === 0 ? 'No leads yet — click + above to add one.' : 'No leads match your filters.'}
              </td></tr>
            )}
            {visible.map((l, i) => {
              const st = STATUS_STYLE[l.status] || STATUS_STYLE.New
              return (
                <tr key={l.id} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    {leadName(l)}
                    {l.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.notes}</div>}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{l.parentName || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>
                    {l.email && <div>{l.email}</div>}
                    {l.phone && <div>{l.phone}</div>}
                    {!l.email && !l.phone && '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{l.source || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ ...st, borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{l.status || 'New'}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>{fmtDate(l.followUpDate)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title={l.convertedRecordId ? 'Open student record' : 'Convert to Customer'}
                      onClick={() => convertToCustomer(l)} disabled={converting === l.id}
                      style={{ opacity: converting === l.id ? 0.5 : 1 }}>
                      <UserPlus size={14} />
                    </button>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing({ mode: 'edit', lead: l })}>
                      <Edit2 size={14} />
                    </button>
                    <button className="icon-btn" title="Delete" onClick={() => deleteLead(l.id)}>
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
        <LeadModal
          mode={editing.mode}
          initial={editing.lead}
          onClose={() => setEditing(null)}
          onSave={saveLead}
          onDelete={editing.mode === 'edit' ? () => { deleteLead(editing.lead.id); setEditing(null) } : null}
        />
      )}
    </div>
  )
}

function LeadModal({ mode, initial, onClose, onSave, onDelete }) {
  const [childFirstName, setChildFirstName] = useState(initial?.childFirstName || '')
  const [childLastName, setChildLastName] = useState(initial?.childLastName || '')
  const [parentName, setParentName] = useState(initial?.parentName || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [source, setSource] = useState(initial?.source || SOURCES[0])
  const [status, setStatus] = useState(initial?.status || STATUSES[0])
  const [followUpDate, setFollowUpDate] = useState(initial?.followUpDate || '')
  const [notes, setNotes] = useState(initial?.notes || '')

  const handleSave = () => {
    if (!childFirstName.trim() && !parentName.trim()) { alert('Please enter at least a child or parent name.'); return }
    onSave({
      childFirstName: childFirstName.trim(), childLastName: childLastName.trim(),
      parentName: parentName.trim(), email: email.trim(), phone: phone.trim(),
      source, status, followUpDate, notes: notes.trim(),
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Lead' : 'New Lead'}</h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Child First Name</label>
            <input value={childFirstName} onChange={e => setChildFirstName(e.target.value)} autoFocus />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Child Last Name</label>
            <input value={childLastName} onChange={e => setChildLastName(e.target.value)} />
          </div>
        </div>

        <div className="kb-field">
          <label>Parent/Guardian Name</label>
          <input value={parentName} onChange={e => setParentName(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Source</label>
            <select value={source} onChange={e => setSource(e.target.value)}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="kb-field">
          <label>Follow-up Date</label>
          <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
        </div>

        <div className="kb-field">
          <label>Notes</label>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="How they heard about us, interests, conversation notes…" />
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

function MetricTile({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 3px rgba(20,30,45,.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
    </div>
  )
}
