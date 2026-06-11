import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../data/store'

// ── Small editable building blocks ────────────────────────────────────────
function TextField({ label, value, onChange, type = 'text', variant }) {
  let cls = 'field-val'
  if (variant === 'highlight') cls += ' highlight'
  return (
    <div className="field-row" style={{ gridTemplateColumns: '110px 1fr' }}>
      <label>{label}:</label>
      <input
        type={type}
        className={cls}
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
        style={{ width: '100%', fontFamily: 'inherit', fontSize: 'inherit', boxSizing: 'border-box' }}
      />
    </div>
  )
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="field-row" style={{ gridTemplateColumns: '110px 1fr' }}>
      <label>{label}:</label>
      <div className="field-val">{value || ' '}</div>
    </div>
  )
}

function ageFromDob(dob) {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return ''
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return years > 0 ? years.toFixed(2) : ''
}

function timeWithCompany(startDate) {
  if (!startDate) return ''
  const d = new Date(startDate)
  if (isNaN(d.getTime())) return ''
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  if (years < 0) return ''
  if (years < 1) {
    const months = Math.floor(years * 12)
    return `${months} mo`
  }
  return `${years.toFixed(1)} yr`
}

// ── Generic repeating-rows table ──────────────────────────────────────────
function RowsEditor({ columns, rows, onChange, addLabel = '+ Add row' }) {
  const setCell = (i, key, val) => {
    const next = rows.map((r, ri) => ri === i ? { ...r, [key]: val } : r)
    onChange(next)
  }
  const remove = (i) => onChange(rows.filter((_, ri) => ri !== i))
  const add = () => onChange([...rows, columns.reduce((acc, c) => ({ ...acc, [c.key]: c.type === 'check' ? false : '' }), {})])
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: columns.map(c => c.width || '1fr').join(' ') + ' 24px',
        gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)',
        textDecoration: 'underline', marginBottom: 4,
      }}>
        {columns.map(c => <div key={c.key}>{c.label}</div>)}
        <div></div>
      </div>
      {rows.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4 }}>No rows yet.</div>
      )}
      {rows.map((row, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: columns.map(c => c.width || '1fr').join(' ') + ' 24px',
          gap: 4, marginBottom: 4, alignItems: 'center',
        }}>
          {columns.map(c => (
            <div key={c.key}>
              {c.type === 'check' ? (
                <input type="checkbox" checked={!!row[c.key]} onChange={e => setCell(i, c.key, e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--logo-teal)' }} />
              ) : c.type === 'date' ? (
                <input type="date" value={row[c.key] || ''} onChange={e => setCell(i, c.key, e.target.value)}
                  style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 4, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              ) : (
                <input value={row[c.key] || ''} onChange={e => setCell(i, c.key, e.target.value)}
                  placeholder={c.placeholder || ''}
                  style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 4, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              )}
            </div>
          ))}
          <button onClick={() => remove(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0 }}
            title="Remove">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={add}
        style={{ background: 'none', border: '1px dashed var(--line)', borderRadius: 4, padding: '4px 10px',
          fontSize: 11, color: 'var(--ink-soft)', cursor: 'pointer', marginTop: 4 }}>
        {addLabel}
      </button>
    </div>
  )
}

// ── Availability table ────────────────────────────────────────────────────
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
function AvailabilityEditor({ value, onChange }) {
  const v = value || {}
  const set = (day, key, val) => onChange({ ...v, [day]: { ...(v[day] || {}), [key]: val } })
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 4,
        fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textDecoration: 'underline', marginBottom: 4,
      }}>
        <div></div><div>From</div><div>To</div>
      </div>
      {DAYS.map(day => (
        <div key={day} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--ink)' }}>{day}</div>
          <input type="time" value={(v[day] && v[day].from) || ''} onChange={e => set(day, 'from', e.target.value)}
            style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit' }} />
          <input type="time" value={(v[day] && v[day].to) || ''} onChange={e => set(day, 'to', e.target.value)}
            style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit' }} />
        </div>
      ))}
    </div>
  )
}

// ── Documents list ────────────────────────────────────────────────────────
const DOCUMENTS = [
  'Current Resume',
  'Vulnerable Sector Check',
  'First Aid Certificate (if certified/requested)',
  'Transcript (if in school within the past year)',
  'Sample of Work (if requested)',
  'Tax Forms (Federal & Provincial)',
  'Direct Deposit Form',
  'Signed Contract',
]
function DocumentsEditor({ value, onChange }) {
  const v = value || {}
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 90px', gap: 4,
        fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textDecoration: 'underline', marginBottom: 6,
      }}>
        <div></div><div style={{ textAlign: 'center' }}>In Dropbox</div>
      </div>
      {DOCUMENTS.map(doc => (
        <div key={doc} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 4, alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 12 }}>{doc}</div>
          <div style={{ textAlign: 'center' }}>
            <input type="checkbox" checked={!!v[doc]} onChange={e => onChange({ ...v, [doc]: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--logo-teal)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Address group ─────────────────────────────────────────────────────────
function AddressGroup({ heading, value, onChange }) {
  const v = value || {}
  const set = (k, val) => onChange({ ...v, [k]: val })
  return (
    <div>
      <div className="panel-teal-head">{heading}</div>
      <TextField label="# Street" value={v.street} onChange={x => set('street', x)} />
      <TextField label="Unit" value={v.unit} onChange={x => set('unit', x)} />
      <TextField label="City" value={v.city} onChange={x => set('city', x)} />
      <TextField label="Province" value={v.province} onChange={x => set('province', x)} />
      <TextField label="Postal Code" value={v.postalCode} onChange={x => set('postalCode', x)} />
      <TextField label="Country" value={v.country} onChange={x => set('country', x)} />
    </div>
  )
}

// ── Staff list view ───────────────────────────────────────────────────────
function StaffList({ onSelect, onAdd }) {
  const { staff } = useStore()
  const [search, setSearch] = useState('')
  const filtered = staff
    .filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.firstName || '').localeCompare(b.firstName || '', undefined, { sensitivity: 'base' }))
  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="page-title" style={{ marginRight: 'auto' }}>Staff Information</h2>
        <button className="icon-btn solid" onClick={onAdd} title="Add new staff"><Plus size={22} /></button>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--logo-teal)', borderRadius: '10px 10px 0 0', padding: '14px 20px',
      }}>
        <svg width="18" height="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff…"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: 14, color: '#fff', fontFamily: 'inherit', letterSpacing: '.2px' }} />
        <style>{`input::placeholder { color: rgba(255,255,255,0.6); }`}</style>
      </div>
      <div style={{ border: '2px solid var(--logo-teal)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: '#fff' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 1.4fr 1fr 0.5fr',
          background: '#3d8e90', padding: '11px 20px',
        }}>
          {['Name', 'Role', 'Phone', 'Email', 'Start Date', 'More'].map(h => (
            <div key={h} style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{h}</div>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14, fontStyle: 'italic' }}>
            No staff found.
          </div>
        ) : (
          filtered.map((s, i) => (
            <div key={s.id} style={{
              display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 1.4fr 1fr 0.5fr',
              padding: '13px 20px', alignItems: 'center',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
              background: i % 2 === 0 ? '#fff' : '#fafbfb',
            }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.firstName} {s.lastName}</div>
              <div style={{ fontSize: 13 }}>{s.role || '—'}</div>
              <div style={{ fontSize: 13 }}>{s.phoneMobile || s.phone || '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--logo-teal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email || '—'}</div>
              <div style={{ fontSize: 13 }}>{s.startDate || '—'}</div>
              <div>
                <button onClick={() => onSelect(s.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--logo-teal)', padding: 4 }}
                  title="View details">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Staff detail (the full form) ──────────────────────────────────────────
function StaffDetail({ staffId, onBack }) {
  const { staff, updateStaffField, deleteStaff, programs } = useStore()
  const record = staff.find(s => s.id === staffId)
  const [local, setLocal] = useState(record || {})
  const saveTimers = useRef({})

  useEffect(() => { if (record) setLocal(record) }, [staffId])

  if (!record) {
    return (
      <div className="page">
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--logo-teal)', fontWeight: 700 }}>
          ← All Staff
        </button>
        <div style={{ padding: 24, color: 'var(--muted)' }}>Staff member not found.</div>
      </div>
    )
  }

  // Debounced field setter — instant local update, throttled API push.
  const setField = (key, val) => {
    setLocal(prev => ({ ...prev, [key]: val }))
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => updateStaffField(staffId, key, val), 400)
  }

  // Programs taught — pull from the live programs list, find offerings whose
  // teacher matches this staff member's full name.
  const fullName = `${local.firstName || ''} ${local.lastName || ''}`.trim()
  const taughtPrograms = useMemo(() => {
    if (!fullName) return []
    const out = []
    ;(programs || []).forEach(p => {
      const matchingOff = (p.offerings || []).filter(o => o.teacher === fullName && o.active)
      if (matchingOff.length) {
        out.push({
          title: p.title,
          location: p.location,
          slots: matchingOff.map(o => `${o.day} ${o.start.slice(0, 5)}`).join(', '),
        })
      }
    })
    return out
  }, [programs, fullName])

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--logo-teal)', fontWeight: 700, fontSize: 14,
        marginBottom: 12, padding: 0,
      }}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        All Staff
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="page-title" style={{ marginTop: 0, marginRight: 'auto' }}>
          {local.firstName} {local.middleName} {local.lastName}
        </h2>
        <button
          onClick={() => { if (confirm('Delete this staff member?')) { deleteStaff(staffId); onBack() } }}
          style={{ background: '#f3eded', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', color: 'var(--danger)', fontWeight: 600, fontSize: 12 }}>
          Delete
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', gap: 20 }}>
        {/* ── LEFT COLUMN ───────────────────────────────────────────────── */}
        <div>
          <div className="panel-teal-head">Staff Name</div>
          <TextField label="First Name" value={local.firstName} onChange={v => setField('firstName', v)} />
          <TextField label="Middle Name" value={local.middleName} onChange={v => setField('middleName', v)} />
          <TextField label="Last Name" value={local.lastName} onChange={v => setField('lastName', v)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Date of Birth</div>
          <TextField label="DOB" value={local.dob} type="date" onChange={v => setField('dob', v)} />
          <ReadOnlyField label="Current Age" value={ageFromDob(local.dob)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Gender</div>
          <TextField label="Gender" value={local.gender} onChange={v => setField('gender', v)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Concerns (optional)</div>
          <TextField label="Health" value={local.healthConcerns} onChange={v => setField('healthConcerns', v)} />
          <TextField label="Other" value={local.otherConcerns} onChange={v => setField('otherConcerns', v)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Phone Number</div>
          <TextField label="Home" value={local.phoneHome} onChange={v => setField('phoneHome', v)} />
          <TextField label="Mobile" value={local.phoneMobile} onChange={v => setField('phoneMobile', v)} />

          <div style={{ marginTop: 16 }}>
            <AddressGroup heading="Current Address" value={local.currentAddress}
              onChange={v => setField('currentAddress', v)} />
          </div>
          <div style={{ marginTop: 16 }}>
            <AddressGroup heading="Permanent Address" value={local.permanentAddress}
              onChange={v => setField('permanentAddress', v)} />
          </div>
        </div>

        {/* ── MIDDLE COLUMN ─────────────────────────────────────────────── */}
        <div>
          <div className="panel-teal-head">Availability / Preferences</div>
          <AvailabilityEditor value={local.availability} onChange={v => setField('availability', v)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Education</div>
          <RowsEditor
            columns={[
              { key: 'degree', label: 'Degree(s)' },
              { key: 'institution', label: 'Institution(s)' },
              { key: 'from', label: 'From', width: '90px', type: 'date' },
              { key: 'to', label: 'To', width: '90px', type: 'date' },
            ]}
            rows={local.education || []}
            onChange={v => setField('education', v)}
          />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Work Experience</div>
          <RowsEditor
            columns={[
              { key: 'title', label: 'Title' },
              { key: 'organization', label: 'Organization' },
              { key: 'from', label: 'From', width: '90px', type: 'date' },
              { key: 'to', label: 'To', width: '90px', type: 'date' },
            ]}
            rows={local.workExperience || []}
            onChange={v => setField('workExperience', v)}
          />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Teachables</div>
          <RowsEditor
            columns={[
              { key: 'subject', label: 'Subject' },
              { key: 'comfort', label: 'Comfort (1-5)', width: '80px' },
              { key: 'gradeRange', label: 'Grade Range', width: '90px' },
              { key: 'years', label: 'Years', width: '60px' },
            ]}
            rows={local.teachables || []}
            onChange={v => setField('teachables', v)}
          />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Programs (auto)</div>
          {taughtPrograms.length === 0 ? (
            <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', padding: '4px 2px' }}>
              No programs assigned yet. Assign on the Programs page.
            </div>
          ) : (
            taughtPrograms.map((p, i) => (
              <div key={i} style={{
                background: '#eef1f2', borderRadius: 5, padding: '6px 10px',
                marginBottom: 4, fontSize: 12,
              }}>
                <div style={{ fontWeight: 700 }}>{p.title}</div>
                <div style={{ color: 'var(--ink-soft)' }}>{p.location} · {p.slots}</div>
              </div>
            ))
          )}
        </div>

        {/* ── RIGHT COLUMN ──────────────────────────────────────────────── */}
        <div>
          <div className="panel-teal-head">Start Date</div>
          <TextField label="Start Date" value={local.startDate} type="date" onChange={v => setField('startDate', v)} />
          <ReadOnlyField label="Time at Crania" value={timeWithCompany(local.startDate)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>SIN Number</div>
          <TextField label="SIN" value={local.sin} onChange={v => setField('sin', v)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Emergency Contact</div>
          <TextField label="First Name" value={local.emergencyFirstName} onChange={v => setField('emergencyFirstName', v)} />
          <TextField label="Last Name" value={local.emergencyLastName} onChange={v => setField('emergencyLastName', v)} />
          <TextField label="Phone" value={local.emergencyPhone} onChange={v => setField('emergencyPhone', v)} />
          <TextField label="Email" value={local.emergencyEmail} onChange={v => setField('emergencyEmail', v)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Documents Required</div>
          <DocumentsEditor value={local.documents} onChange={v => setField('documents', v)} />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Keys</div>
          <RowsEditor
            columns={[
              { key: 'description', label: 'Description' },
              { key: 'dateOut', label: 'Date Out', width: '90px', type: 'date' },
              { key: 'dateIn', label: 'Date In', width: '90px', type: 'date' },
              { key: 'formSigned', label: 'Signed', width: '60px', type: 'check' },
            ]}
            rows={local.keys || []}
            onChange={v => setField('keys', v)}
          />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>References (Min. Two)</div>
          <RowsEditor
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'title', label: 'Title' },
              { key: 'organization', label: 'Organization' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'relationship', label: 'Relationship' },
            ]}
            rows={local.references || []}
            onChange={v => setField('references', v)}
          />

          <div className="panel-teal-head" style={{ marginTop: 16 }}>Compensation</div>
          <TextField label="Rate / Hour" value={local.ratePerHour} variant="highlight" onChange={v => setField('ratePerHour', v)} />
          <TextField label="Role" value={local.role} onChange={v => setField('role', v)} />
        </div>
      </div>
    </div>
  )
}

export default function StaffInformation() {
  const { addStaff } = useStore()
  const [detailId, setDetailId] = useState(null)
  const handleAdd = async () => {
    const id = await addStaff()
    if (id) setDetailId(id)
  }
  if (detailId) return <StaffDetail staffId={detailId} onBack={() => setDetailId(null)} />
  return <StaffList onSelect={setDetailId} onAdd={handleAdd} />
}
