// Logins — a read-only view of every student's portal login, organized
// by student. Same idea as Emergency Contacts: aggregated live from
// useStore().records (the same server data every other page reads),
// with no write path here. Username/password aren't stored fields —
// they're deterministic functions of the student's name (see
// ../data/loginUtils), the same ones the Students detail page's Login
// panel uses, so this page is always in sync with zero extra state.

import { useMemo, useState } from 'react'
import { Search, Copy, Check } from 'lucide-react'
import { useStore } from '../data/store'
import { usernameFor, generatePassword } from '../data/loginUtils'

function studentName(r) {
  return `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim()
}

function useLoginRows() {
  const { records } = useStore()

  return useMemo(() => {
    const rows = records
      .filter((r) => r.id !== 'seed')
      .map((r) => ({
        id: r.id,
        name: studentName(r) || '—',
        email: r.student?.email || '',
        username: usernameFor(r.student?.firstName, r.student?.lastName),
        password: generatePassword(r.student?.firstName, r.student?.lastName),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    const withLogin = rows.filter((row) => row.username && row.password)
    return { rows, withLogin, missing: rows.length - withLogin.length }
  }, [records])
}

export default function Logins({ onNavigate }) {
  const { status: fetchStatus } = useStore()
  const { rows, withLogin, missing } = useLoginRows()
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const visible = useMemo(() => rows.filter((r) => {
    if (!q) return true
    return r.name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q)
  }), [rows, q])

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head">
        <h2 className="page-title">Logins</h2>
      </div>

      {fetchStatus === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — showing cached data.
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricTile label="Students" value={rows.length} hint="total students" />
        <MetricTile label="Logins Available" value={withLogin.length} hint="username + password ready" />
        <MetricTile label="Missing Name" value={missing}
          color={missing > 0 ? '#a12626' : 'var(--ink)'} hint="can't generate without a full name" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student or username…"
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
              <Th>Student</Th>
              <Th>Email</Th>
              <Th>Username</Th>
              <Th>Password</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                {rows.length === 0 ? 'No students yet.' : 'No logins match your search.'}
              </td></tr>
            )}
            {visible.map((r, i) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                  <NameLink onClick={() => onNavigate && onNavigate('Students', r.id)}>{r.name}</NameLink>
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{r.email || '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <CopyableValue value={r.username} mono />
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <CopyableValue value={r.password} mono />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CopyableValue({ value, mono }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span style={{ color: 'var(--muted)' }}>—</span>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 900)
    } catch { /* clipboard blocked */ }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit', fontWeight: mono ? 700 : 400, letterSpacing: mono ? 0.5 : 0 }}>
        {value}
      </span>
      <button
        onClick={copy}
        title="Copy"
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: copied ? '#2e7d32' : 'var(--muted)', display: 'inline-flex', padding: 2,
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  )
}

function NameLink({ children, onClick }) {
  if (!children || children === '—') return <span style={{ color: 'var(--muted)' }}>—</span>
  return (
    <span
      onClick={onClick}
      title="Open this student"
      style={{
        color: 'var(--brand-dark-blue)', fontWeight: 600, cursor: 'pointer',
        textDecoration: 'underline', textDecorationColor: 'transparent',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = 'var(--brand-dark-blue)' }}
      onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = 'transparent' }}
    >{children}</span>
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
