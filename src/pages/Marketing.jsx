// Marketing — a lightweight campaign tracker. State persists at
// GET/PUT /api/campaigns with a 350ms debounce, same pattern as IT
// Accounts. Each campaign is a marketing initiative (a social push, an
// email blast, a flyer run, a paid ad, an event) tracked through a
// simple status pipeline; the Marketing Calendar / Surveys / Leads
// pages are separate, this is just the "what are we running and how's
// it going" list.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, X, Edit2, Trash2, Search } from 'lucide-react'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const CHANNELS = ['Social Media', 'Email', 'Print/Flyer', 'Paid Ads', 'Event', 'Referral', 'Other']
const STATUSES = ['Planned', 'In Progress', 'Live', 'Completed', 'Cancelled']
const STATUS_STYLE = {
  Planned:     { background: '#e8eef3', color: '#3d5a73' },
  'In Progress': { background: '#fff3cd', color: '#8a6a00' },
  Live:        { background: '#c8e6c9', color: '#2e7d32' },
  Completed:   { background: '#dcedc8', color: '#558b2f' },
  Cancelled:   { background: '#f4d9d9', color: '#a12626' },
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

// ---------- store hook ----------
function useCampaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const latest = useRef(campaigns)
  latest.current = campaigns

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/campaigns`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setCampaigns(Array.isArray(j.campaigns) ? j.campaigns : [])
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const mutate = useCallback((mut) => {
    setCampaigns(prev => {
      const next = mut([...prev])
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/campaigns`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify({ campaigns: latest.current }),
        }).catch(() => {})
      }, 350)
      return next
    })
  }, [])

  return { campaigns, loading, status, mutate }
}

export default function Marketing() {
  const { campaigns, loading, status, mutate } = useCampaigns()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState(null) // null | { mode:'new'|'edit', campaign? }

  const saveCampaign = (form) => {
    mutate(list => {
      if (editing.mode === 'new') {
        return [...list, { id: uid(), ...form }]
      }
      return list.map(c => c.id === editing.campaign.id ? { ...c, ...form } : c)
    })
    setEditing(null)
  }
  const deleteCampaign = (id) => {
    const c = campaigns.find(x => x.id === id)
    if (!confirm(`Delete "${c?.name || 'this campaign'}"?`)) return
    mutate(list => list.filter(x => x.id !== id))
  }

  const q = search.trim().toLowerCase()
  const visible = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (!q) return true
    return (c.name || '').toLowerCase().includes(q) ||
      (c.channel || '').toLowerCase().includes(q) ||
      (c.owner || '').toLowerCase().includes(q)
  })

  const metrics = {
    total: campaigns.length,
    live: campaigns.filter(c => c.status === 'Live').length,
    planned: campaigns.filter(c => c.status === 'Planned').length,
    completed: campaigns.filter(c => c.status === 'Completed').length,
  }

  if (loading) {
    return (
      <div className="page">
        <h2 className="page-title">Marketing</h2>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head">
        <h2 className="page-title">Marketing</h2>
        <button className="icon-btn solid" title="New campaign" onClick={() => setEditing({ mode: 'new' })}>
          <Plus size={22} />
        </button>
      </div>

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricTile label="Campaigns" value={metrics.total} />
        <MetricTile label="Live" value={metrics.live} color={metrics.live > 0 ? '#2e7d32' : 'var(--ink)'} />
        <MetricTile label="Planned" value={metrics.planned} />
        <MetricTile label="Completed" value={metrics.completed} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaign, channel, owner…"
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
              <Th>Campaign</Th>
              <Th>Channel</Th>
              <Th>Status</Th>
              <Th>Start</Th>
              <Th>End</Th>
              <Th>Owner</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                {campaigns.length === 0 ? 'No campaigns yet — click + above to add one.' : 'No campaigns match your filters.'}
              </td></tr>
            )}
            {visible.map((c, i) => {
              const st = STATUS_STYLE[c.status] || STATUS_STYLE.Planned
              return (
                <tr key={c.id} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    {c.name || 'Untitled Campaign'}
                    {c.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes}</div>}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{c.channel || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ ...st, borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{c.status || 'Planned'}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>{fmtDate(c.startDate)}</td>
                  <td style={{ padding: '8px 12px' }}>{fmtDate(c.endDate)}</td>
                  <td style={{ padding: '8px 12px' }}>{c.owner || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing({ mode: 'edit', campaign: c })}>
                      <Edit2 size={14} />
                    </button>
                    <button className="icon-btn" title="Delete" onClick={() => deleteCampaign(c.id)}>
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
        <CampaignModal
          mode={editing.mode}
          initial={editing.campaign}
          onClose={() => setEditing(null)}
          onSave={saveCampaign}
          onDelete={editing.mode === 'edit' ? () => { deleteCampaign(editing.campaign.id); setEditing(null) } : null}
        />
      )}
    </div>
  )
}

function CampaignModal({ mode, initial, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || '')
  const [channel, setChannel] = useState(initial?.channel || CHANNELS[0])
  const [status, setStatus] = useState(initial?.status || STATUSES[0])
  const [startDate, setStartDate] = useState(initial?.startDate || '')
  const [endDate, setEndDate] = useState(initial?.endDate || '')
  const [owner, setOwner] = useState(initial?.owner || '')
  const [notes, setNotes] = useState(initial?.notes || '')

  const handleSave = () => {
    if (!name.trim()) { alert('Please enter a campaign name.'); return }
    onSave({ name: name.trim(), channel, status, startDate, endDate, owner: owner.trim(), notes: notes.trim() })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Campaign' : 'New Campaign'}</h2>

        <div className="kb-field">
          <label>Campaign Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Camp Promo" autoFocus />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value)}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="kb-field" style={{ flex: 1 }}>
            <label>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="kb-field">
          <label>Owner</label>
          <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Who's running this?" />
        </div>

        <div className="kb-field">
          <label>Notes</label>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Details, links, results…" />
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
