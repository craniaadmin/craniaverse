import { useState, useEffect } from 'react'
import { Plus, X, Edit2, Copy, Eye, ExternalLink, ChevronLeft, Trash2, GripVertical, Star, Download, RefreshCw } from 'lucide-react'
import PageActions from '../components/PageActions'

const API_BASE = import.meta.env?.VITE_API_URL || ''

const FIELD_TYPES = [
  { value: 'text',     label: 'Short text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'email',    label: 'Email' },
  { value: 'number',   label: 'Number' },
  { value: 'date',     label: 'Date' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'radio',    label: 'Multiple choice' },
  { value: 'checkbox', label: 'Checkboxes' },
]

const HAS_OPTIONS = new Set(['select', 'radio', 'checkbox'])

const genKey = () => 'k_' + Math.random().toString(36).slice(2, 8)

const BLANK_FIELD = () => ({
  key: genKey(),
  label: '',
  type: 'text',
  required: false,
  options: [],
})

const BLANK_FORM = { title: '', description: '', fields: [] }

// ------------------------------ FORMS LIST ------------------------------
function FormsList({ forms, onOpen, onEdit, onDelete, onNew, publicUrl, onOpenBooth, boothUrl, onOpenRegistrations, onOpenStaff }) {
  const registerUrl = `${API_BASE || window.location.origin}/register`
  const staffUrl = `${API_BASE || window.location.origin}/staff-form`
  const [copied, setCopied] = useState(null)
  const copy = async (url, key) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(key); setTimeout(() => setCopied(null), 1400)
    } catch { /* clipboard blocked */ }
  }
  return (
    <div className="page">

      <PageActions
        csvName="crania-forms"
        csvColumns={[
          { key: 'title', label: 'Form' },
          { key: 'fields', label: 'Fields' },
          { key: 'description', label: 'Description' },
          { key: 'url', label: 'Public Link' },
        ]}
        csvRows={() => forms.map(f => ({
          title: f.title || 'Untitled Form',
          fields: (f.fields || []).length,
          description: f.description || '',
          url: publicUrl(f),
        }))}
        backupCollection="forms"
        backupHint="Snapshots of every form definition (last 14 kept). Submissions are not included."
      >
        <button title="Build a new form" onClick={onNew}><Plus size={13} /> New Form</button>
      </PageActions>

      <div style={{ display: 'grid', gap: 12 }}>
        {/* Built-in: Booth Sign-Up */}
        <div style={{
          background: 'linear-gradient(135deg, #f2fbfd 0%, #fdf9e8 100%)',
          border: '1px solid #d5ecef', borderRadius: 12,
          padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr auto',
          gap: 12, alignItems: 'center', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Star size={15} style={{ color: '#5FA09E', fill: '#5FA09E' }} />
              Registration Form
              <span style={{ background: '#5FA09E', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, letterSpacing: '.4px', textTransform: 'uppercase' }}>Built-in</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>Guardians · children · programme enrolments · consent</span>
              <span>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{registerUrl}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn" title={copied === 'reg' ? 'Copied!' : 'Copy public link'} onClick={() => copy(registerUrl, 'reg')}>
              <Copy size={16} />
            </button>
            <button className="icon-btn" title="Open public form" onClick={() => window.open(registerUrl, '_blank')}>
              <ExternalLink size={16} />
            </button>
            <button className="icon-btn" title="View registrations" onClick={onOpenRegistrations}>
              <Eye size={16} />
            </button>
          </div>
        </div>

        <div style={{
          background: '#f2fbfc',
          border: '1px solid #d5ecef', borderRadius: 12,
          padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr auto',
          gap: 12, alignItems: 'center', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
          marginBottom: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Star size={15} style={{ color: '#5FA09E', fill: '#5FA09E' }} />
              Staff Form
              <span style={{ background: '#5FA09E', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, letterSpacing: '.4px', textTransform: 'uppercase' }}>Built-in</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>New staff details · availability · qualifications · documents</span>
              <span>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staffUrl}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn" title={copied === 'staff' ? 'Copied!' : 'Copy public link'} onClick={() => copy(staffUrl, 'staff')}>
              <Copy size={16} />
            </button>
            <button className="icon-btn" title="Open public form" onClick={() => window.open(staffUrl, '_blank')}>
              <ExternalLink size={16} />
            </button>
            <button className="icon-btn" title="View staff records" onClick={onOpenStaff}>
              <Eye size={16} />
            </button>
          </div>
        </div>

        <div style={{
          background: '#f2fbfc',
          border: '1px solid #d5ecef', borderRadius: 12,
          padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr auto',
          gap: 12, alignItems: 'center', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
          marginBottom: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Star size={15} style={{ color: '#5FA09E', fill: '#5FA09E' }} />
              Booth Sign-Up
              <span style={{ background: '#5FA09E', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, letterSpacing: '.4px', textTransform: 'uppercase' }}>Built-in</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>Free assessment · Open house RSVP · Agenda orders</span>
              <span>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{boothUrl}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="icon-btn" title={copied === 'booth' ? 'Copied!' : 'Copy public link'} onClick={() => copy(boothUrl, 'booth')}>
              <Copy size={16} />
            </button>
            <button className="icon-btn" title="Open public form" onClick={() => window.open(boothUrl, '_blank')}>
              <ExternalLink size={16} />
            </button>
            <button className="icon-btn" title="View sign-ups" onClick={onOpenBooth}>
              <Eye size={16} />
            </button>
          </div>
        </div>

        {forms.length === 0 ? (
          <div style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
            padding: '40px 20px', textAlign: 'center', color: 'var(--muted)',
          }}>
            <div style={{ fontSize: 15, marginBottom: 6 }}>No custom forms yet.</div>
            <div style={{ fontSize: 13 }}>Click <b>+</b> above to build one.</div>
          </div>
        ) : (
          <>
          {forms.map((f) => (
            <div key={f.id} style={{
              background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
              padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr auto',
              gap: 12, alignItems: 'center', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
                  {f.title || 'Untitled Form'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{(f.fields || []).length} field{(f.fields || []).length === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {publicUrl(f.id)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="icon-btn" title={copied === f.id ? 'Copied!' : 'Copy public link'} onClick={() => copy(publicUrl(f.id), f.id)}>
                  <Copy size={16} />
                </button>
                <button className="icon-btn" title="Open public form" onClick={() => window.open(publicUrl(f.id), '_blank')}>
                  <ExternalLink size={16} />
                </button>
                <button className="icon-btn" title="View submissions" onClick={() => onOpen(f.id)}>
                  <Eye size={16} />
                </button>
                <button className="icon-btn" title="Edit form" onClick={() => onEdit(f.id)}>
                  <Edit2 size={16} />
                </button>
                <button className="icon-btn" title="Delete form" onClick={() => {
                  if (confirm(`Delete "${f.title || 'Untitled Form'}"? All submissions will also be deleted.`)) onDelete(f.id)
                }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------ BUILDER ------------------------------
function FormBuilder({ initial, onSave, onCancel, publicUrl }) {
  const [form, setForm] = useState(initial || BLANK_FORM)
  const [saving, setSaving] = useState(false)

  const setField = (idx, patch) => {
    setForm(f => ({ ...f, fields: f.fields.map((fld, i) => i === idx ? { ...fld, ...patch } : fld) }))
  }
  const addField = () => setForm(f => ({ ...f, fields: [...f.fields, BLANK_FIELD()] }))
  const removeField = (idx) => setForm(f => ({ ...f, fields: f.fields.filter((_, i) => i !== idx) }))
  const moveField = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= form.fields.length) return
    setForm(f => {
      const next = [...f.fields]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...f, fields: next }
    })
  }

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await onSave(form)
    } finally { setSaving(false) }
  }

  const editing = !!initial?.id

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <button className="icon-btn" onClick={onCancel} title="Back">
          <ChevronLeft size={20} />
        </button>
        <h2 className="page-title" style={{ marginLeft: 4 }}>
          {editing ? 'Edit form' : 'New form'}
        </h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={save} disabled={!form.title.trim() || saving}
            style={{ opacity: !form.title.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create form')}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{
          background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
          padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: 'var(--ink-soft)',
        }}>
          <span style={{ fontWeight: 700 }}>Public link:</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f5f7f8', padding: '3px 7px', borderRadius: 4 }}>
            {publicUrl(initial.id)}
          </span>
          <button className="icon-btn" title="Copy" onClick={async () => {
            try { await navigator.clipboard.writeText(publicUrl(initial.id)) } catch {}
          }} style={{ marginLeft: 'auto' }}>
            <Copy size={14} />
          </button>
        </div>
      )}

      {/* Form meta */}
      <div style={{
        background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20, marginBottom: 20,
      }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, letterSpacing: '.4px', textTransform: 'uppercase' }}>
          Form title
        </label>
        <input
          className="reg-input"
          placeholder="e.g. Summer Camp Interest, Parent Feedback…"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          autoFocus
        />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', margin: '16px 0 6px', letterSpacing: '.4px', textTransform: 'uppercase' }}>
          Description (optional)
        </label>
        <textarea
          className="reg-input"
          rows={2}
          placeholder="Short intro shown above the form."
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          style={{ resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
        />
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {form.fields.map((fld, idx) => (
          <FieldRow
            key={fld.key}
            field={fld}
            onChange={patch => setField(idx, patch)}
            onRemove={() => removeField(idx)}
            onMoveUp={() => moveField(idx, -1)}
            onMoveDown={() => moveField(idx, 1)}
            isFirst={idx === 0}
            isLast={idx === form.fields.length - 1}
          />
        ))}
      </div>

      <button
        onClick={addField}
        style={{
          marginTop: 14, background: 'transparent', border: '2px dashed var(--line)',
          borderRadius: 12, padding: '14px 20px', width: '100%', fontSize: 14, fontWeight: 600,
          color: 'var(--ink-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
        <Plus size={16} /> Add field
      </button>
    </div>
  )
}

function FieldRow({ field, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const showOptions = HAS_OPTIONS.has(field.type)
  const updateOptions = (text) => onChange({ options: text.split('\n').map(s => s.trim()).filter(Boolean) })
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16,
      display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 12, alignItems: 'start',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, alignItems: 'center', color: 'var(--muted)' }}>
        <button onClick={onMoveUp} disabled={isFirst} title="Move up" style={btnGhost(isFirst)}>▲</button>
        <GripVertical size={14} />
        <button onClick={onMoveDown} disabled={isLast} title="Move down" style={btnGhost(isLast)}>▼</button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10 }}>
          <input
            className="reg-input"
            placeholder="Field label (e.g. Your name)"
            value={field.label}
            onChange={e => onChange({ label: e.target.value })}
          />
          <select
            className="reg-input"
            value={field.type}
            onChange={e => onChange({ type: e.target.value })}
          >
            {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {showOptions && (
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4, letterSpacing: '.4px', textTransform: 'uppercase' }}>
              Options (one per line)
            </label>
            <textarea
              className="reg-input"
              rows={3}
              placeholder={"Option A\nOption B\nOption C"}
              value={(field.options || []).join('\n')}
              onChange={e => updateOptions(e.target.value)}
              style={{ resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
            />
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={e => onChange({ required: e.target.checked })}
            style={{ accentColor: 'var(--logo-teal)' }}
          />
          Required
        </label>
      </div>

      <button
        onClick={onRemove}
        title="Remove field"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4 }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

const btnGhost = (disabled) => ({
  background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
  color: disabled ? '#dfe3e6' : 'var(--ink-soft)', fontSize: 10, padding: 2,
})

// ------------------------------ SUBMISSIONS ------------------------------
function SubmissionsView({ form, onBack }) {
  const [subs, setSubs] = useState(null)

  const load = () => {
    setSubs(null)
    fetch(`${API_BASE}/api/forms/${form.id}/submissions`)
      .then(r => r.json()).then(setSubs).catch(() => setSubs([]))
  }
  useEffect(() => { load() }, [form.id])

  const del = async (subId) => {
    if (!confirm('Delete this submission?')) return
    try {
      await fetch(`${API_BASE}/api/forms/${form.id}/submissions/${subId}`, { method: 'DELETE' })
      setSubs(prev => prev.filter(s => s.id !== subId))
    } catch (err) { console.error(err) }
  }

  const exportCsv = () => {
    if (!subs || subs.length === 0) return
    const cols = form.fields.map(f => f.key)
    const header = ['Submitted at', ...form.fields.map(f => f.label || f.key)]
    const rows = subs.map(s => [
      s.submittedAt || '',
      ...cols.map(k => {
        const v = s.answers?.[k]
        return Array.isArray(v) ? v.join('; ') : (v ?? '')
      }),
    ])
    const csv = [header, ...rows].map(row =>
      row.map(cell => {
        const str = String(cell)
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
      }).join(',')
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(form.title || 'form').replace(/[^\w-]+/g, '_')}_submissions.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <button className="icon-btn" onClick={onBack} title="Back">
          <ChevronLeft size={20} />
        </button>
        <h2 className="page-title" style={{ marginLeft: 4 }}>
          {form.title || 'Form'} — Submissions
        </h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={exportCsv} disabled={!subs || subs.length === 0}
            style={{ opacity: !subs || subs.length === 0 ? 0.5 : 1 }}>
            Export CSV
          </button>
        </div>
      </div>

      {subs === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : subs.length === 0 ? (
        <div style={{
          background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
          padding: '60px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14,
        }}>
          No submissions yet. Share the public link with anyone you want to fill it out.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: '#f5f7f8' }}>
                <th style={thStyle}>Submitted</th>
                {form.fields.map(f => (
                  <th key={f.key} style={thStyle}>{f.label || f.key}</th>
                ))}
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s, i) => (
                <tr key={s.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                  <td style={tdStyle}>{fmtDate(s.submittedAt)}</td>
                  {form.fields.map(f => (
                    <td key={f.key} style={tdStyle}>
                      {formatAnswer(s.answers?.[f.key])}
                    </td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button onClick={() => del(s.id)} title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4 }}>
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle = { fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'left', padding: '10px 14px', textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }
const tdStyle = { fontSize: 13, color: 'var(--ink)', padding: '10px 14px', verticalAlign: 'top' }

const formatAnswer = (v) => {
  if (v === undefined || v === null || v === '') return <span style={{ color: 'var(--muted)' }}>—</span>
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}

// ------------------------------ MAIN ------------------------------
// ------------------------------ BOOTH SIGN-UPS VIEW ------------------------------
function BoothSignupsView({ onBack }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    fetch(`${API_BASE}/api/booth-signup`)
      .then(r => r.json())
      .then(d => setList(Array.isArray(d) ? d : []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  const deleteRow = async (email) => {
    if (!confirm(`Delete sign-up for ${email}?`)) return
    try {
      await fetch(`${API_BASE}/api/booth-signup/${encodeURIComponent(email)}`, { method: 'DELETE' })
      setList(prev => prev.filter(e => e.email !== email))
    } catch (err) { console.error(err) }
  }

  // Rollups matching the HTML staff panel.
  const assessBySlot = {}
  let ohCount = 0, agOrders = 0, agReg = 0, agIsl = 0, agRev = 0
  list.forEach(e => {
    if (e.assessDate) {
      const k = `${e.assessDate} • ${e.assessTime || ''}`
      assessBySlot[k] = (assessBySlot[k] || 0) + 1
    }
    if (e.openHouse === 'yes') ohCount++
    if ((e.agReg || 0) + (e.agIsl || 0) > 0) {
      agOrders++
      agReg += Number(e.agReg || 0)
      agIsl += Number(e.agIsl || 0)
      agRev += Number(e.agTotal || 0)
    }
  })
  const slotKeys = Object.keys(assessBySlot).sort()

  const downloadCsv = () => {
    const rows = [[
      'Name', 'Email', 'Phone', 'Child name', 'Child grade',
      'Open house RSVP (Jul 30)', 'Assessment date', 'Assessment time',
      'Agenda regular qty', 'Agenda islamic qty', 'Agenda shipping', 'Agenda shipping address', 'Agenda total ($)',
      'Email consent', 'Signed up at',
    ]]
    list.forEach(e => rows.push([
      e.name, e.email, e.phone, e.child || '', e.grade || '',
      e.openHouse || '', e.assessDate || '', e.assessTime || '',
      e.agReg || 0, e.agIsl || 0, e.agShip || '', e.agAddr || '', e.agTotal || 0,
      e.consent || '', e.when || '',
    ]))
    const csv = rows.map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `booth-signups-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  const copyEmails = async () => {
    try { await navigator.clipboard.writeText(list.map(e => e.email).join(', ')) }
    catch { /* clipboard blocked */ }
  }

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <button className="icon-btn" onClick={onBack} title="Back">
          <ChevronLeft size={20} />
        </button>
        <h2 className="page-title" style={{ marginLeft: 4 }}>Booth Sign-Ups</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={refresh} title="Refresh">
            <RefreshCw size={14} style={{ marginRight: 4 }} /> Refresh
          </button>
          <button className="btn ghost" onClick={copyEmails} disabled={list.length === 0}>
            Copy emails
          </button>
          <button className="btn" onClick={downloadCsv} disabled={list.length === 0}>
            <Download size={14} style={{ marginRight: 4 }} /> CSV
          </button>
        </div>
      </div>

      {/* Rollups */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total sign-ups', value: list.length },
          { label: 'Open House RSVPs', value: ohCount },
          { label: 'Agenda orders', value: `${agOrders} · $${agRev}` },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
            padding: '14px 16px', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
          </div>
        ))}
      </div>

      {slotKeys.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--ink-soft)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--ink)' }}>Assessment bookings by slot</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {slotKeys.map(k => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{k}</span>
                <b style={{ color: '#5FA09E' }}>{assessBySlot[k]}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{
          background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
          padding: '60px 20px', textAlign: 'center', color: 'var(--muted)',
        }}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>No sign-ups yet.</div>
          <div style={{ fontSize: 13 }}>Share the public link to start collecting.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f7f8', borderBottom: '1px solid var(--line)' }}>
                {['Name', 'Email', 'Phone', 'Child · Grade', 'Assessment', 'OH', 'Agenda', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--ink-soft)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => {
                const agSum = (e.agReg || 0) + (e.agIsl || 0)
                return (
                  <tr key={e.email || i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 12px' }}>{e.name || '—'}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{e.email || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{e.phone || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>{e.child ? `${e.child} · ${e.grade || '—'}` : (e.grade || '—')}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {e.assessDate ? `${String(e.assessDate).replace('July', 'Jul')} ${e.assessTime || ''}` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{e.openHouse === 'yes' ? '✓' : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {agSum > 0 ? `${e.agReg || 0}R / ${e.agIsl || 0}I · $${e.agTotal || 0}` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button className="icon-btn" title="Delete" onClick={() => deleteRow(e.email)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* Submissions used to be reachable only by clicking a card on All
   Forms. As its own nav entry it needs somewhere to start, so it asks
   which form you mean — including the two built-in ones, whose
   submissions live elsewhere. */
function PickForm({ forms, onPick, onBooth, onRegistrations, onStaff }) {
  const Row = ({ title, blurb, onClick }) => (
    <button onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
      width: '100%', textAlign: 'left', background: '#fff', border: '1px solid var(--line)',
      borderRadius: 10, padding: '13px 16px', marginBottom: 8, cursor: 'pointer',
      font: 'inherit', color: 'var(--ink)',
    }}>
      <span>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{blurb}</span>
      </span>
      <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Open →</span>
    </button>
  )
  return (
    <div className="page">
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 14px' }}>
        Choose a form to see what has been submitted to it.
      </div>
      <Row title="Registration Form" blurb="Enrolments from the public registration form"
        onClick={onRegistrations} />
      <Row title="Staff Form" blurb="New staff details — these become records on the Staff page"
        onClick={onStaff} />
      <Row title="Booth Sign-Up" blurb="Free assessments, open house RSVPs and agenda orders"
        onClick={onBooth} />
      {forms.length === 0 ? (
        <div style={{
          background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
          padding: '28px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13,
        }}>No custom forms yet — build one under Form Builder.</div>
      ) : forms.map(f => (
        <Row key={f.id} title={f.title || 'Untitled Form'}
          blurb={f.description || `${(f.fields || []).length} field${(f.fields || []).length === 1 ? '' : 's'}`}
          onClick={() => onPick(f.id)} />
      ))}
    </div>
  )
}

/* Starting points for a new form. Picking one opens the builder with
   the fields already laid out, which is the only thing "template" can
   usefully mean here — they are not stored separately. */
const TEMPLATES = [
  {
    title: 'Contact Enquiry',
    description: 'A short form for questions from the website.',
    fields: [
      { label: 'Your name', type: 'text', required: true },
      { label: 'Email', type: 'email', required: true },
      { label: 'Phone', type: 'tel', required: false },
      { label: 'How can we help?', type: 'textarea', required: true },
    ],
  },
  {
    title: 'Trial Class Request',
    description: 'Collects the child and the class they want to try.',
    fields: [
      { label: "Child's name", type: 'text', required: true },
      { label: 'Current grade', type: 'text', required: true },
      { label: 'Program of interest', type: 'select', required: true,
        options: ['Flex Math', 'Math Enrichment', 'TeknoKids', 'ArtsKids'] },
      { label: 'Guardian email', type: 'email', required: true },
      { label: 'Anything we should know?', type: 'textarea', required: false },
    ],
  },
  {
    title: 'Feedback',
    description: 'A rating and a comment, for after a term or an event.',
    fields: [
      { label: 'Which program?', type: 'text', required: true },
      { label: 'How did it go?', type: 'radio', required: true,
        options: ['Very well', 'Well', 'Mixed', 'Not well'] },
      { label: 'Comments', type: 'textarea', required: false },
    ],
  },
]

function Templates({ onUse }) {
  return (
    <div className="page">
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 14px' }}>
        Start from one of these rather than an empty form. Everything stays editable.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {TEMPLATES.map(t => (
          <div key={t.title} style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
            padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{t.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.description}</div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-soft)' }}>
              {t.fields.map(f => <li key={f.label}>{f.label}{f.required ? ' *' : ''}</li>)}
            </ul>
            <button className="btn light" style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
              onClick={() => onUse({
                title: t.title,
                description: t.description,
                fields: t.fields.map((f, i) => ({
                  ...BLANK_FIELD(), key: `f${i}`, label: f.label, type: f.type,
                  required: !!f.required, options: f.options || [],
                })),
              })}>Use this template</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* `initialView` says which of the Forms sub-pages this instance is. The
   nav splits All Forms, Registrations, Submissions, Templates and Form
   Builder across five entries; each mounts this component in the
   matching mode rather than duplicating the loading and saving across
   five files. */
export default function Forms({ onNavigate, initialView = 'list' }) {
  const [forms, setForms] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(() => (
    initialView === 'new' ? { mode: 'new' }
      : initialView === 'submissions' ? { mode: 'picksubs' }
        : initialView === 'templates' ? { mode: 'templates' }
          : { mode: 'list' }
  ))
  // Following the nav to another Forms page remounts with a new prop.
  useEffect(() => {
    setView(initialView === 'new' ? { mode: 'new' }
      : initialView === 'submissions' ? { mode: 'picksubs' }
        : initialView === 'templates' ? { mode: 'templates' }
          : { mode: 'list' })
  }, [initialView])

  useEffect(() => {
    fetch(`${API_BASE}/api/forms`)
      .then(r => r.json()).then(setForms)
      .catch(err => console.error('Failed to load forms:', err))
      .finally(() => setLoading(false))
  }, [])

  const publicUrl = (formOrId) => {
    const origin = API_BASE || window.location.origin
    // Accept either a form object or a bare id (backwards compat).
    if (typeof formOrId === 'object' && formOrId) {
      return `${origin}/form/${formOrId.slug || formOrId.id}`
    }
    const form = forms.find(f => f.id === formOrId)
    return `${origin}/form/${(form && form.slug) || formOrId}`
  }
  const boothUrl = `${API_BASE || window.location.origin}/sign-up`

  const createForm = async (draft) => {
    const res = await fetch(`${API_BASE}/api/forms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.title.trim(),
        description: draft.description.trim(),
        fields: draft.fields.map(cleanField),
      }),
    })
    if (!res.ok) throw new Error('Failed to create')
    const created = await res.json()
    setForms(prev => [...prev, created])
    setView({ mode: 'list' })
  }

  const updateForm = async (id, draft) => {
    const res = await fetch(`${API_BASE}/api/forms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.title.trim(),
        description: draft.description.trim(),
        fields: draft.fields.map(cleanField),
      }),
    })
    if (!res.ok) throw new Error('Failed to update')
    const updated = await res.json()
    setForms(prev => prev.map(f => f.id === id ? updated : f))
    setView({ mode: 'list' })
  }

  const deleteForm = async (id) => {
    try {
      await fetch(`${API_BASE}/api/forms/${id}`, { method: 'DELETE' })
      setForms(prev => prev.filter(f => f.id !== id))
    } catch (err) { console.error(err) }
  }

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading forms…</div>
      </div>
    )
  }

  if (view.mode === 'new') {
    return <FormBuilder initial={view.tpl} onSave={createForm} onCancel={() => setView({ mode: initialView === 'new' ? 'new' : 'list' })} publicUrl={publicUrl} />
  }
  if (view.mode === 'edit') {
    const f = forms.find(x => x.id === view.id)
    if (!f) { setView({ mode: 'list' }); return null }
    return (
      <FormBuilder
        initial={f}
        onSave={(draft) => updateForm(view.id, draft)}
        onCancel={() => setView({ mode: initialView === 'new' ? 'new' : 'list' })}
        publicUrl={publicUrl}
      />
    )
  }
  if (view.mode === 'subs') {
    const f = forms.find(x => x.id === view.id)
    if (!f) { setView({ mode: 'list' }); return null }
    return <SubmissionsView form={f} onBack={() => setView({ mode: 'list' })} />
  }
  if (view.mode === 'picksubs') {
    return <PickForm forms={forms} title="Submissions"
      blurb="Choose a form to see what has been submitted to it."
      onPick={(id) => setView({ mode: 'subs', id })}
      onBooth={() => setView({ mode: 'booth' })}
      onRegistrations={() => onNavigate && onNavigate(['forms', 'Registrations'])} />
  }
  if (view.mode === 'templates') {
    return <Templates onUse={(tpl) => setView({ mode: 'new', tpl })} />
  }
  if (view.mode === 'picksubs') {
    return (
      <PickForm forms={forms}
        onPick={(id) => setView({ mode: 'subs', id })}
        onBooth={() => setView({ mode: 'booth' })}
        onRegistrations={() => onNavigate && onNavigate(['forms', 'Registrations'])}
        onStaff={() => onNavigate && onNavigate(['staff', 'Staff'])} />
    )
  }
  if (view.mode === 'templates') {
    return <Templates onUse={(tpl) => setView({ mode: 'new', tpl })} />
  }
  if (view.mode === 'booth') {
    return <BoothSignupsView onBack={() => setView({ mode: 'list' })} />
  }

  return (
    <FormsList
      forms={forms}
      onOpen={(id) => setView({ mode: 'subs', id })}
      onEdit={(id) => setView({ mode: 'edit', id })}
      onDelete={deleteForm}
      onNew={() => setView({ mode: 'new' })}
      publicUrl={publicUrl}
      boothUrl={boothUrl}
      onOpenBooth={() => setView({ mode: 'booth' })}
      onOpenRegistrations={() => onNavigate && onNavigate(['forms', 'Registrations'])}
      onOpenStaff={() => onNavigate && onNavigate(['staff', 'Staff'])}
    />
  )
}

// Strip UI-only bits before sending to server.
const cleanField = (f) => ({
  key: f.key,
  label: (f.label || '').trim(),
  type: f.type,
  required: !!f.required,
  options: HAS_OPTIONS.has(f.type) ? (f.options || []).map(s => s.trim()).filter(Boolean) : [],
})
