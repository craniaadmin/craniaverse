// Emergency Contacts — a read/organize view aggregated from the same
// server data as Customers/Students (useStore().records, backed by
// /api/registrations). Each registration carries a customer.emergency
// block; this page pulls those out, groups them by family (same
// guardian1 identity used on the Customers page), and lists which
// students each contact covers. Customers missing an emergency contact
// are surfaced separately so the gap is visible.
//
// Editing lives on the Customers page. Clicking a customer name jumps
// straight to that customer's detail view there; clicking a student
// name jumps to that student's detail view on the Students page. There
// is no write path here — it's purely a live, filtered view of server
// data plus navigation shortcuts.

import { useMemo, useState } from 'react'
import { Search, Phone, Mail, AlertTriangle } from 'lucide-react'
import { useStore } from '../data/store'

// A family's identity = normalized guardian1 name + email. A record with
// no guardian identity (e.g. a just-added blank student) stands on its
// own, keyed by its id — mirrors the Customers page grouping.
function guardianIdentity(r) {
  const g1 = r.customer?.guardian1 || {}
  return `${g1['First Name'] || ''} ${g1['Last Name'] || ''} ${g1['Email'] || ''}`.trim().toLowerCase()
}

function guardianName(r) {
  const g1 = r.customer?.guardian1 || {}
  return `${g1['First Name'] || ''} ${g1['Last Name'] || ''}`.trim()
}

function studentName(r) {
  return `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim()
}

// An emergency block "counts" only if it has a name or a way to reach the
// contact — the Relationship field defaults to 'Emergency Contact' so it
// alone doesn't mean the contact was actually filled in.
function emergencyHasContent(em) {
  if (!em) return false
  return Boolean(
    (em['First Name'] || '').trim() ||
    (em['Last Name'] || '').trim() ||
    (em['Phone (Mobile)'] || '').trim() ||
    (em['Email'] || '').trim(),
  )
}

function emergencyContactName(em) {
  return `${em?.['First Name'] || ''} ${em?.['Last Name'] || ''}`.trim()
}

function useEmergencyGroups() {
  const { records } = useStore()

  return useMemo(() => {
    const realRecords = records.filter((r) => r.id !== 'seed')

    // Group records into families.
    const families = new Map() // key -> { customerName, students: [], records: [] }
    for (const r of realRecords) {
      const key = guardianIdentity(r) || `unknown-${r.id}`
      if (!families.has(key)) {
        families.set(key, { customerName: guardianName(r) || '—', students: [], records: [] })
      }
      const fam = families.get(key)
      fam.students.push(r)
      fam.records.push(r)
    }

    const withContact = []
    const missing = []
    for (const fam of families.values()) {
      // Pick the first sibling record that actually has an emergency
      // contact filled in. Siblings almost always share one.
      const source = fam.records.find((r) => emergencyHasContent(r.customer?.emergency))
      const students = [...fam.students].sort((a, b) =>
        (a.student?.firstName || '').localeCompare(b.student?.firstName || '', undefined, { sensitivity: 'base' }))
      const entry = { customerName: fam.customerName, students }
      if (source) {
        withContact.push({ ...entry, emergency: source.customer.emergency, linkId: source.id })
      } else {
        missing.push({ ...entry, linkId: fam.records[0]?.id })
      }
    }

    withContact.sort((a, b) => a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' }))
    missing.sort((a, b) => a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' }))

    const studentsCovered = withContact.reduce((n, f) => n + f.students.length, 0)
    return { withContact, missing, familyCount: families.size, studentsCovered }
  }, [records])
}

export default function EmergencyContacts({ onNavigate }) {
  const { status: fetchStatus } = useStore()
  const { withContact, missing, familyCount, studentsCovered } = useEmergencyGroups()
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const matches = (fam) => {
    if (!q) return true
    const em = fam.emergency || {}
    if (emergencyContactName(em).toLowerCase().includes(q)) return true
    if ((em['Relationship'] || '').toLowerCase().includes(q)) return true
    if ((em['Phone (Mobile)'] || '').toLowerCase().includes(q)) return true
    if ((em['Email'] || '').toLowerCase().includes(q)) return true
    if (fam.customerName.toLowerCase().includes(q)) return true
    return fam.students.some((s) => studentName(s).toLowerCase().includes(q))
  }

  const visible = useMemo(() => withContact.filter(matches), [withContact, q])
  const visibleMissing = useMemo(() => missing.filter((fam) =>
    !q || fam.customerName.toLowerCase().includes(q) ||
    fam.students.some((s) => studentName(s).toLowerCase().includes(q))), [missing, q])

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head">
        <h2 className="page-title">Emergency Contacts</h2>
      </div>

      {fetchStatus === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — showing cached data.
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricTile label="Contacts on File" value={withContact.length} hint="families with a contact" />
        <MetricTile label="Families" value={familyCount} hint="total customer families" />
        <MetricTile label="Students Covered" value={studentsCovered} hint="have an emergency contact" />
        <MetricTile label="Missing Contact" value={missing.length}
          color={missing.length > 0 ? '#a12626' : 'var(--ink)'} hint="families with no contact" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contact, family, or student…"
            style={{
              width: '100%', padding: '7px 8px 7px 30px', fontSize: 13,
              border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff',
            }}
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ background: 'transparent', border: 'none', color: 'var(--brand-dark-blue)',
                     textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
          >Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, overflow: 'auto', boxShadow: 'var(--brand-shadow)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'left' }}>
              <Th>Emergency Contact</Th>
              <Th>Relationship</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Family</Th>
              <Th>Students</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                {withContact.length === 0
                  ? 'No emergency contacts on file yet — they come from the registration form and can be edited on the Customers page.'
                  : 'No emergency contacts match your search.'}
              </td></tr>
            )}
            {visible.map((fam, i) => {
              const em = fam.emergency
              return (
                <tr key={fam.linkId + i} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{emergencyContactName(em) || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{em['Relationship'] || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {em['Phone (Mobile)']
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Phone size={12} color="var(--muted)" />{em['Phone (Mobile)']}
                        </span>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {em['Email']
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Mail size={12} color="var(--muted)" />{em['Email']}
                        </span>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{fam.customerName}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>
                    {fam.students.map((s) => studentName(s)).join(', ')}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <button
                      onClick={() => onNavigate && onNavigate('Customers')}
                      title="View / edit in Customers"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                               color: 'var(--brand-dark-blue)', padding: 2, display: 'inline-flex' }}
                    ><ExternalLink size={13} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Missing contacts */}
      {visibleMissing.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color="#a12626" />
            <h3 style={{ margin: 0, fontSize: 15, color: '#a12626' }}>Missing Emergency Contact</h3>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            These families have no emergency contact on file. Add one on the Customers page.
          </div>
          <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--brand-shadow)' }}>
            {visibleMissing.map((fam, i) => (
              <div key={fam.linkId + i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                borderTop: i > 0 ? '1px solid #f0ede3' : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{fam.customerName}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {fam.students.map((s) => studentName(s)).join(', ')}
                  </div>
                </div>
                <button
                  onClick={() => onNavigate && onNavigate('Customers')}
                  title="Add contact in Customers"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                           color: 'var(--brand-dark-blue)', padding: 2, display: 'inline-flex' }}
                ><ExternalLink size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children }) {
  return <th style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
    padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap',
  }}>{children}</th>
}

function MetricTile({ label, value, hint, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px',
      boxShadow: '0 1px 3px rgba(20,30,45,.06)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}
