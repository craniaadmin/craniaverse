import { useState, useEffect, useRef } from 'react'
import { useStore } from '../data/store'

// ─── Customer list view ────────────────────────────────────────────────────

function CustomerList({ onSelect }) {
  const { records } = useStore()
  const [search, setSearch] = useState('')

  // Group records by family (guardian1 name + email as key)
  const grouped = records.reduce((acc, r) => {
    const g1 = r.customer?.guardian1
    const parentKey = g1 ? `${g1['First Name']} ${g1['Last Name']} ${g1['Email']}`.trim().toLowerCase() : `unknown-${r.id}`
    if (!acc[parentKey]) acc[parentKey] = []
    acc[parentKey].push(r)
    return acc
  }, {})

  const customerUnits = Object.entries(grouped).map(([_, students]) => {
    const first = students[0]
    const g1 = first.customer?.guardian1
    const g2 = first.customer?.guardian2
    const g1Name = g1 ? `${g1['First Name'] || ''} ${g1['Last Name'] || ''}`.trim() : '—'
    const g2Name = g2 ? `${g2['First Name'] || ''} ${g2['Last Name'] || ''}`.trim() : ''
    return {
      students: [...students].sort((a, b) => (a.student.firstName || '').localeCompare(b.student.firstName || '', undefined, { sensitivity: 'base' })),
      g1Name,
      g1Email: g1?.['Email'] || '',
      g2Name,
    }
  })

  customerUnits.sort((a, b) => (a.g1Name || '').localeCompare(b.g1Name || '', undefined, { sensitivity: 'base' }))

  const filtered = customerUnits.filter(unit => {
    const q = search.toLowerCase()
    if (!q) return true
    const g1Match = unit.g1Name.toLowerCase().includes(q) || unit.g1Email.toLowerCase().includes(q)
    const g2Match = unit.g2Name.toLowerCase().includes(q)
    const studentMatch = unit.students.some(s =>
      `${s.student.firstName} ${s.student.lastName}`.toLowerCase().includes(q)
    )
    return g1Match || g2Match || studentMatch
  })

  const getClasses = (r) =>
    Array.from(new Set((r.programs || []).map(p => p.program).filter(Boolean))).join(', ') || '—'

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <h2 className="page-title">Customers</h2>

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--logo-teal)', borderRadius: '10px 10px 0 0', padding: '14px 20px',
      }}>
        <svg width="18" height="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search parents or students…"
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: 14, color: '#fff', fontFamily: 'inherit', letterSpacing: '.2px',
          }}
        />
        <style>{`input::placeholder { color: rgba(255,255,255,0.6); }`}</style>
      </div>

      {/* Table */}
      <div style={{ border: '2px solid var(--logo-teal)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: '#fff' }}>

        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '140px 140px 180px 60px 1fr',
          background: '#3d8e90', padding: '10px 20px',
          borderBottom: '1px solid rgba(255,255,255,.15)',
        }}>
          {['Guardian 1', 'Guardian 2', 'Student Names', 'Grade', 'Classes'].map((h, idx) => (
            <div key={idx} style={{ color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '.6px', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, fontStyle: 'italic' }}>
            No families found.
          </div>
        ) : (
          filtered.map((unit, i) => {
            const ROW_H = 28 // px per student row
            return (
              <div
                key={`${unit.g1Name}-${unit.g1Email}-${i}`}
                onClick={() => onSelect(unit.students[0].id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 140px 180px 60px 1fr',
                  padding: '10px 20px',
                  alignItems: 'start',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
                  background: i % 2 === 0 ? '#fff' : '#fafbfb',
                  minHeight: unit.students.length * ROW_H + 20,
                  cursor: 'pointer',
                }}
              >
                {/* Guardian 1 — vertically centred in the row */}
                <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: `${ROW_H}px` }}>
                  {unit.g1Name || '—'}
                </div>

                {/* Guardian 2 */}
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: `${ROW_H}px` }}>
                  {unit.g2Name || '—'}
                </div>

                {/* Student names stacked — clickable */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {unit.students.map(r => (
                    <div
                      key={r.id}
                      onClick={() => onSelect(r.id)}
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--logo-teal)', lineHeight: `${ROW_H}px`, cursor: 'pointer' }}
                    >
                      {r.student.firstName} {r.student.lastName}
                    </div>
                  ))}
                </div>

                {/* Grades stacked */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {unit.students.map(r => (
                    <div key={r.id} style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: `${ROW_H}px` }}>
                      {r.student.grade || '—'}
                    </div>
                  ))}
                </div>

                {/* Classes stacked */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  {unit.students.map(r => (
                    <div key={r.id} style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: `${ROW_H}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                      {getClasses(r)}
                    </div>
                  ))}
                </div>

              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Customer detail view ──────────────────────────────────────────────────

const FEE_LABELS = ['REG', 'MAT', 'A', 'S', 'O', 'N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J']
const FEE_KEYS   = ['reg', 'mat', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul']

const STATUS_STYLE = {
  'Completed': { background: '#e0e4e8', color: '#5b6573' },
  'Late Start': { background: '#cfe6b4', color: '#3a6020' },
  'On-Hold':   { background: '#f6e3a1', color: '#7a5c00' },
  'Cancelled': { background: '#f6b0b0', color: '#8b1a1a' },
  'Active':    { background: '#cfe6b4', color: '#3a6020' },
}

function Field({ label, value, readOnly, onChange, highlightEmail = true }) {
  let cls = 'field-val'
  if (label === 'Email' && highlightEmail) cls += ' highlight'
  if (label === 'Medical Conditions' && value) cls += ' danger'
  const isLink = value === 'link'
  if (isLink) cls = 'field-val link'
  return (
    <div className="field-row" style={{ gridTemplateColumns: '92px 1fr' }}>
      <label>{label}:</label>
      {(readOnly || isLink) ? (
        <div className={cls}>{value || ' '}</div>
      ) : (
        <input
          className={cls}
          value={value || ''}
          onChange={e => onChange && onChange(e.target.value)}
          style={{ width: '100%', fontFamily: 'inherit', fontSize: 'inherit', cursor: 'text', boxSizing: 'border-box' }}
        />
      )}
    </div>
  )
}

function Column({ title, data, readOnlyKeys, onChange, highlightEmail = true }) {
  return (
    <div>
      <div className="panel-teal-head">{title}</div>
      {Object.entries(data).map(([k, v]) => (
        <Field key={k} label={k} value={v} readOnly={readOnlyKeys?.includes(k)} highlightEmail={highlightEmail} onChange={val => onChange && onChange(k, val)} />
      ))}
    </div>
  )
}

function FeeSquare({ state, onChange }) {
  const colors = { paid: '#cfe6b4', pending: '#f6e3a1', overdue: '#e8503f', empty: '#e8ecef' }
  const next = { paid: 'pending', pending: 'overdue', overdue: 'empty', empty: 'paid' }
  return (
    <button
      type="button"
      onClick={() => onChange(next[state] || 'paid')}
      style={{
        width: 16, height: 16, borderRadius: 3, border: 'none',
        background: colors[state] || colors.empty, cursor: 'pointer', padding: 0, flexShrink: 0,
      }}
      title={state}
    />
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

function ProgramRow({ prog, onToggleActive, onFeeChange }) {
  const status = prog.active ? 'Active' : 'Inactive'
  const statusStyle = prog.active
    ? { background: '#cfe6b4', color: '#3a6020' }
    : { background: '#e0e4e8', color: '#5b6573' }
  const payment = derivedPayment(prog.fees)
  const paymentColor = payment === 'Paid' ? '#cfe6b4' : payment === 'Pending' ? '#f6e3a1' : payment === 'Overdue' ? '#e8503f' : '#e8ecef'
  const paymentTextColor = payment === 'Overdue' ? '#fff' : '#5b6573'

  return (
    <tr className="cust-prog-row">
      <td className="cust-prog-cell" style={{ textAlign: 'center', padding: '10px' }}>
        <input type="checkbox" checked={prog.active || false} onChange={() => onToggleActive(prog)}
          style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#2c7a7b' }} />
      </td>
      <td className="cust-prog-cell">
        <span className="cust-pill" style={statusStyle}>{status}</span>
      </td>
      <td className="cust-prog-cell">{prog.year}</td>
      <td className="cust-prog-cell" style={{ fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {prog.program}
      </td>
      <td className="cust-prog-cell" style={{ whiteSpace: 'nowrap' }}>
        {prog.rate && (
          <><b>{prog.rate}</b>{prog.rateUnit && <span style={{ color: '#8b95a3', fontSize: 12 }}> {prog.rateUnit}</span>}</>
        )}
      </td>
      <td className="cust-prog-cell">
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
          {FEE_KEYS.map((k) => (
            <FeeSquare key={k} state={prog.fees?.[k] || 'empty'} onChange={(state) => onFeeChange(prog, k, state)} />
          ))}
        </div>
      </td>
      <td className="cust-prog-cell">
        {payment && <span className="cust-pill" style={{ background: paymentColor, color: paymentTextColor }}>{payment}</span>}
      </td>
    </tr>
  )
}

function CustomerDetail({ recordId, onBack, onSelectRecord }) {
  const { records, updateCustomerField, updateStudentField } = useStore()
  const selected = records.find(r => r.id === recordId) || records[0]

  // Find all siblings (same parents)
  const siblings = records.filter(r => {
    const sameParent = (
      r.customer?.guardian1?.['First Name'] === selected.customer?.guardian1?.['First Name'] &&
      r.customer?.guardian1?.['Last Name'] === selected.customer?.guardian1?.['Last Name'] &&
      r.customer?.guardian1?.['Email'] === selected.customer?.guardian1?.['Email']
    )
    return sameParent
  }).sort((a, b) => (a.student.firstName || '').localeCompare(b.student.firstName || '', undefined, { sensitivity: 'base' }))

  const siblingIdx = siblings.findIndex(s => s.id === recordId)

  const allPrograms = selected.programs || []
  const [showOnlyActive, setShowOnlyActive] = useState(false)
  const [progs, setProgs] = useState(allPrograms)
  const [custFields, setCustFields] = useState(selected.customer)
  const RAW_API_URL = import.meta.env && import.meta.env.VITE_API_URL
  const API_BASE = RAW_API_URL !== undefined ? RAW_API_URL : 'http://localhost:4000'
  const saveTimers = useRef({})

  useEffect(() => {
    setProgs(allPrograms)
    setCustFields(selected.customer)
  }, [recordId])

  const customerToStudentKey = (key) => {
    const map = {
      'First Name': 'firstName',
      'Last Name': 'lastName',
      'Gender': 'gender',
      'DOB': 'dob',
      'Email': 'email',
      'Current Grade': 'grade',
      'School': 'school',
      'Medical Conditions': 'medical',
    }
    return map[key] || key
  }

  const updateCustField = (section, key, val) => {
    setCustFields(prev => ({ ...prev, [section]: { ...prev[section], [key]: val } }))
    updateCustomerField(selected.id, section, key, val)
    // Also sync student edits to the main student record
    if (section === 'student') {
      const studentKey = customerToStudentKey(key)
      updateStudentField(selected.id, studentKey, val)
    }
    clearTimeout(saveTimers.current[section])
    saveTimers.current[section] = setTimeout(() => {
      setCustFields(current => {
        fetch(`${API_BASE}/api/registrations/${selected.id}/customer`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify({ [section]: current[section] }),
        }).catch(() => {})
        return current
      })
    }, 600)
  }

  const { student, guardian1, guardian2, emergency } = custFields

  const displayedPrograms = showOnlyActive ? progs.filter(p => p.active) : progs

  const toggleActive = (prog) => {
    const updated = progs.map(p => p === prog ? { ...p, active: !p.active } : p)
    setProgs(updated)
    persistPrograms(updated)
  }

  const updateFee = (prog, key, state) => {
    const updated = progs.map(p => p === prog ? { ...p, fees: { ...p.fees, [key]: state } } : p)
    setProgs(updated)
    persistPrograms(updated)
  }

  const persistPrograms = (newPrograms) => {
    fetch(`${API_BASE}/api/registrations/${selected.id}/programs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify(newPrograms),
    }).catch(() => {})
  }

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--logo-teal)', fontWeight: 700, fontSize: 14,
          marginBottom: 12, padding: 0,
        }}
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        All Customers
      </button>

      <h2 className="page-title" style={{ marginTop: 0, marginBottom: 20 }}>Customers</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22 }}>
        <Column title="Guardian 1" data={guardian1} onChange={(k, v) => updateCustField('guardian1', k, v)} />
        <Column title="Guardian 2" data={guardian2} onChange={(k, v) => updateCustField('guardian2', k, v)} />
        <Column title="Emergency Contact" data={emergency} highlightEmail={false} onChange={(k, v) => updateCustField('emergency', k, v)} />
        <div>
          <div className="panel-teal-head">Students</div>
          <div style={{ padding: '4px 0 10px' }}>
            {siblings.map(s => {
              const isActive = s.id === recordId
              return (
                <div
                  key={s.id}
                  onClick={() => onSelectRecord?.(s.id)}
                  style={{
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? 'var(--ink)' : 'var(--logo-teal)',
                    background: isActive ? 'rgba(61,142,144,.10)' : 'transparent',
                    padding: '4px 8px',
                    borderRadius: 4,
                    marginBottom: 2,
                  }}
                >
                  {s.student.firstName} {s.student.lastName}
                </div>
              )
            })}
          </div>
          {Object.entries(student).map(([k, v]) => (
            <Field key={k} label={k} value={v} readOnly={['Current Age'].includes(k)} highlightEmail={false} onChange={val => updateCustField('student', k, val)} />
          ))}
        </div>
      </div>

      {/* Programs */}
      <div style={{ marginTop: 32 }}>
        <div style={{
          background: '#1e1e1e', color: '#fff',
          fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 600,
          padding: '14px 18px', borderRadius: '9px 9px 0 0', letterSpacing: '.3px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Programs – {student['First Name']} {student['Last Name']}</span>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={showOnlyActive} onChange={(e) => setShowOnlyActive(e.target.checked)}
              style={{ accentColor: '#fff', cursor: 'pointer' }} />
            Active only
          </label>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderTop: 'none', borderRadius: '0 0 9px 9px', overflowX: 'auto' }}>
          <table className="cust-prog-table">
            <thead>
              <tr>
                <th className="cust-prog-th">ACTIVE</th>
                <th className="cust-prog-th">STATUS</th>
                <th className="cust-prog-th">YEAR</th>
                <th className="cust-prog-th">PROGRAM</th>
                <th className="cust-prog-th">RATE</th>
                <th className="cust-prog-th">
                  <div style={{ fontSize: 10, color: '#8b95a3', marginBottom: 3, textAlign: 'center', letterSpacing: 1 }}>FEE SCHEDULE</div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                    {FEE_LABELS.map((m, i) => (
                      <span key={i} style={{ width: 16, textAlign: 'center', fontSize: 9, color: '#8b95a3', fontWeight: 700 }}>{m}</span>
                    ))}
                  </div>
                </th>
                <th className="cust-prog-th">PAYMENT</th>
              </tr>
            </thead>
            <tbody>
              {displayedPrograms.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '22px', color: '#8b95a3', fontStyle: 'italic', fontSize: 14 }}>
                    {showOnlyActive ? 'No active programs.' : 'No programs registered.'}
                  </td>
                </tr>
              ) : (
                displayedPrograms.map((p, i) => (
                  <ProgramRow key={i} prog={p} onToggleActive={toggleActive} onFeeChange={updateFee} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Root: switches between list and detail ────────────────────────────────

export default function Customers() {
  const { select } = useStore()
  const [detailId, setDetailId] = useState(null)

  const handleSelect = (id) => {
    select(id)
    setDetailId(id)
  }

  if (detailId) {
    return <CustomerDetail recordId={detailId} onBack={() => setDetailId(null)} onSelectRecord={setDetailId} />
  }

  return <CustomerList onSelect={handleSelect} />
}
