// Class Lists — read-only rosters derived from server data already
// loaded by useStore(): the master Programs list (/api/programs) and
// registrations (/api/registrations). No new storage — this page just
// links the two by matching each student's enrolled program title to
// a program definition, then further groups students under whichever
// offering (day/time/teacher) their schedule text matches.
// Registrations whose program title doesn't match anything in the
// Programs list are surfaced under "Needs Attention" instead of being
// silently dropped, so data drift is visible rather than hidden.

import { useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react'
import { useStore } from '../data/store'

const norm = (s) => String(s || '').trim().toUpperCase()

// "16:30:00" -> "4:30 pm"
function fmtTime(t) {
  if (!t) return ''
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return t
  let h = parseInt(m[1], 10)
  const min = m[2]
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${min} ${ampm}`
}

function offeringLabel(o) {
  return [o.day, fmtTime(o.start)].filter(Boolean).join(' ') || 'Unscheduled'
}

// Best-effort match of a student's free-text schedule ("Mon 4:30 pm")
// to one of the program's offerings, so rosters split by actual class
// session rather than lumping every enrollee together.
function matchOffering(scheduleText, offerings) {
  const s = String(scheduleText || '').toLowerCase()
  if (!s || !offerings || offerings.length === 0) return null
  return offerings.find((o) => {
    if (!o.day) return false
    const day = s.includes(o.day.toLowerCase())
    const time = o.start ? s.includes(fmtTime(o.start).toLowerCase()) : true
    return day && time
  }) || null
}

function guardianContact(customer) {
  const g = customer?.guardian1 || {}
  const name = `${g['First Name'] || ''} ${g['Last Name'] || ''}`.trim()
  const phone = g['Phone (Mobile)'] || g['Phone (Home)'] || ''
  const email = g['Email'] || ''
  return { name, phone, email }
}

const STATUS_STYLE = {
  Active:       { bg: '#dff5e0', fg: '#2b7a2e' },
  'Late Start': { bg: '#fff4d6', fg: '#8a6a00' },
  'On-Hold':    { bg: '#eef1f4', fg: '#5b6573' },
  Completed:    { bg: '#e4f2fb', fg: '#1c6ea4' },
  Cancelled:    { bg: '#fde0e0', fg: '#a12626' },
}
function statusStyle(s) { return STATUS_STYLE[s] || { bg: '#eef1f4', fg: '#5b6573' } }

// ---- build class groups from store data ----
function useClassLists() {
  const { records, programs } = useStore()

  return useMemo(() => {
    const realRecords = records.filter((r) => r.id !== 'seed')

    // The same program title can have more than one row — one per
    // location (Boardwalk, Waterloo East, ...), each with its own
    // offerings. Keying this map by title alone would let the last
    // location's row silently shadow every earlier one, so students
    // registered at "the other" location would either attribute to
    // the wrong location's roster or vanish from theirs entirely.
    // Keep every location's row as a candidate, then route each
    // student to whichever one's offerings actually match their
    // schedule text (falling back to the first candidate when no
    // offering matches, same as the single-location case always did).
    const classes = programs.map((p) => ({ program: p, roster: [] }))
    const byTitle = new Map() // norm(title) -> class wrapper[]
    for (const c of classes) {
      const key = norm(c.program.title)
      if (!byTitle.has(key)) byTitle.set(key, [])
      byTitle.get(key).push(c)
    }
    const unlistedByTitle = new Map()

    for (const r of realRecords) {
      for (const entry of (r.programs || [])) {
        if (!entry.program) continue
        const row = { record: r, entry }
        const candidates = byTitle.get(norm(entry.program))
        if (candidates && candidates.length > 0) {
          let cls = candidates[0]
          if (candidates.length > 1) {
            const matched = candidates.find((c) =>
              matchOffering(entry.schedule, (c.program.offerings || []).filter((o) => o.active !== false)))
            if (matched) cls = matched
          }
          cls.roster.push(row)
        } else {
          const key = entry.program
          if (!unlistedByTitle.has(key)) unlistedByTitle.set(key, [])
          unlistedByTitle.get(key).push(row)
        }
      }
    }

    // Sub-group each class's roster by matched offering.
    for (const cls of classes) {
      const offerings = (cls.program.offerings || []).filter((o) => o.active !== false)
      const groups = new Map() // offering (or null) -> rows
      for (const row of cls.roster) {
        const o = matchOffering(row.entry.schedule, offerings)
        const key = o || null
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(row)
      }
      const sessions = offerings
        .map((o) => ({ offering: o, rows: groups.get(o) || [] }))
      const unspecified = groups.get(null) || []
      cls.sessions = sessions
      cls.unspecified = unspecified
    }

    const unlisted = Array.from(unlistedByTitle.entries()).map(([title, roster]) => ({ title, roster }))

    return { classes, unlisted, realRecords }
  }, [records, programs])
}

const cardShadow = { boxShadow: 'var(--brand-shadow)' }

export default function ClassLists({ onNavigate }) {
  const { status: fetchStatus } = useStore()
  const { classes, unlisted } = useClassLists()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [hideEmpty, setHideEmpty] = useState(true)
  const [expanded, setExpanded] = useState(() => new Set())

  const categories = useMemo(
    () => Array.from(new Set(classes.map((c) => c.program.category).filter(Boolean))).sort(),
    [classes],
  )

  const q = search.trim().toLowerCase()
  const matchesSearch = (c) => {
    if (!q) return true
    if ((c.program.title || '').toLowerCase().includes(q)) return true
    if ((c.program.category || '').toLowerCase().includes(q)) return true
    if ((c.program.subject || '').toLowerCase().includes(q)) return true
    return c.roster.some((row) =>
      `${row.record.student?.firstName || ''} ${row.record.student?.lastName || ''}`.toLowerCase().includes(q))
  }

  const visible = useMemo(() => {
    return classes
      .filter((c) => (category === 'all' ? true : c.program.category === category))
      .filter((c) => (hideEmpty ? c.roster.length > 0 : true))
      .filter(matchesSearch)
      .sort((a, b) => b.roster.length - a.roster.length || a.program.title.localeCompare(b.program.title))
  }, [classes, category, hideEmpty, q])

  // ---- metrics ----
  const metrics = useMemo(() => {
    const withStudents = classes.filter((c) => c.roster.length > 0)
    const uniqueStudents = new Set()
    let enrollments = 0
    let atCapacity = 0
    for (const c of classes) {
      for (const row of c.roster) { uniqueStudents.add(row.record.id); enrollments++ }
      for (const s of c.sessions) {
        if (s.offering.spots != null && s.rows.length >= s.offering.spots) atCapacity++
      }
    }
    const needsAttention = unlisted.reduce((n, u) => n + u.roster.length, 0)
    return {
      classesRunning: withStudents.length,
      uniqueStudents: uniqueStudents.size,
      enrollments,
      atCapacity,
      needsAttention,
    }
  }, [classes, unlisted])

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const expandAll = () => setExpanded(new Set(visible.map((c) => c.program.title + c.program.number)))
  const collapseAll = () => setExpanded(new Set())

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      <div className="page-head">
        <h2 className="page-title">Class Lists</h2>
      </div>

      {fetchStatus === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — showing cached data.
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricTile label="Classes Running" value={metrics.classesRunning} hint="with at least one student" />
        <MetricTile label="Students Enrolled" value={metrics.uniqueStudents} hint={`${metrics.enrollments} enrollments`} />
        <MetricTile label="At Capacity" value={metrics.atCapacity}
          color={metrics.atCapacity > 0 ? '#a12626' : 'var(--ink)'} hint="sessions full or over" />
        <MetricTile label="Needs Attention" value={metrics.needsAttention}
          color={metrics.needsAttention > 0 ? '#a12626' : 'var(--ink)'}
          hint="unmatched program names" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', top: 9, left: 10, color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search class or student…"
            style={{
              width: '100%', padding: '7px 8px 7px 30px', fontSize: 13,
              border: '1px solid #d5d0c4', borderRadius: 8, background: '#fff',
            }}
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: '7px 10px', fontSize: 13, border: '1px solid #d5d0c4',
            borderRadius: 8, background: '#fff', color: 'var(--brand-dark-brown)',
          }}
        >
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}>
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)}
            style={{ accentColor: 'var(--brand-dark-blue)' }} />
          Hide empty classes
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={expandAll} style={toolbarBtn}>Expand all</button>
          <button onClick={collapseAll} style={toolbarBtn}>Collapse all</button>
        </div>
      </div>

      {/* Class cards */}
      {visible.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 10, padding: 32, textAlign: 'center', color: 'var(--muted)', ...cardShadow }}>
          No classes match your filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((c) => {
            const key = c.program.title + c.program.number
            const isOpen = expanded.has(key)
            const capacity = c.sessions.reduce((sum, s) => sum + (s.offering.spots != null ? s.offering.spots : 0), 0)
            const hasCapacity = c.sessions.some((s) => s.offering.spots != null)
            return (
              <div key={key} style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', ...cardShadow, opacity: c.program.active === false ? 0.6 : 1 }}>
                <div
                  onClick={() => toggle(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer',
                    background: isOpen ? '#f4f9f9' : '#fff',
                  }}
                >
                  {isOpen ? <ChevronDown size={16} color="var(--brand-dark-blue)" /> : <ChevronRight size={16} color="var(--brand-dark-blue)" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--brand-dark-blue)' }}>{c.program.title}</span>
                      {c.program.category && (
                        <span style={pillStyle}>{c.program.category}</span>
                      )}
                      {c.program.active === false && (
                        <span style={{ ...pillStyle, background: '#eef1f4', color: '#5b6573' }}>Inactive</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate('Programs') }}
                        title="View in Programs"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand-dark-blue)', padding: 2, display: 'inline-flex' }}
                      ><ExternalLink size={13} /></button>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.sessions.length === 0
                        ? 'No offerings scheduled'
                        : c.sessions.map((s) => `${offeringLabel(s.offering)}${s.offering.teacher ? ` · ${s.offering.teacher}` : ''}`).join('  •  ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
                      {c.roster.length}{hasCapacity ? ` / ${capacity}` : ''}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>enrolled</div>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #f0ede3' }}>
                    {c.roster.length === 0 ? (
                      <div style={{ padding: '18px 16px', color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>
                        No students enrolled yet.
                      </div>
                    ) : c.sessions.length === 0 ? (
                      <Roster rows={c.roster} onNavigate={onNavigate} />
                    ) : (
                      <>
                        {c.sessions.filter((s) => s.rows.length > 0).map((s, i) => (
                          <div key={i}>
                            <div style={{
                              padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '.4px', color: 'var(--ink-soft)', background: '#fafaf7',
                            }}>
                              {offeringLabel(s.offering)}{s.offering.teacher ? ` — ${s.offering.teacher}` : ''}
                              {s.offering.spots != null && ` (${s.rows.length}/${s.offering.spots})`}
                            </div>
                            <Roster rows={s.rows} onNavigate={onNavigate} />
                          </div>
                        ))}
                        {c.unspecified.length > 0 && (
                          <div>
                            <div style={{
                              padding: '8px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '.4px', color: 'var(--ink-soft)', background: '#fafaf7',
                            }}>
                              Schedule not matched to an offering
                            </div>
                            <Roster rows={c.unspecified} onNavigate={onNavigate} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Needs attention */}
      {unlisted.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color="#a12626" />
            <h3 style={{ margin: 0, fontSize: 15, color: '#a12626' }}>Needs Attention</h3>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            These registrations reference a program title that no longer matches anything in the Programs list —
            check for typos or renamed/deleted programs.
          </div>
          <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', ...cardShadow }}>
            {unlisted.map((u, i) => (
              <div key={u.title} style={{ padding: '10px 16px', borderTop: i > 0 ? '1px solid #f0ede3' : 'none' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#a12626', marginBottom: 4 }}>{u.title}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  {u.roster.map((row) => `${row.record.student?.firstName || ''} ${row.record.student?.lastName || ''}`.trim()).join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Roster({ rows, onNavigate }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left' }}>
          <Th>Student</Th>
          <Th>Grade</Th>
          <Th>School</Th>
          <Th>Guardian Contact</Th>
          <Th>Year</Th>
          <Th align="center">Status</Th>
          <Th></Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const { record: r, entry } = row
          const contact = guardianContact(r.customer)
          const style = statusStyle(entry.status)
          return (
            <tr key={r.id + i} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff' }}>
              <td style={{ padding: '6px 12px', fontWeight: 600 }}>{r.student?.firstName} {r.student?.lastName}</td>
              <td style={{ padding: '6px 12px' }}>{r.student?.grade || '—'}</td>
              <td style={{ padding: '6px 12px' }}>{r.student?.school || '—'}</td>
              <td style={{ padding: '6px 12px', color: 'var(--ink-soft)' }}>
                {contact.name || '—'}
                {contact.phone && <span> · {contact.phone}</span>}
                {contact.email && <span> · {contact.email}</span>}
              </td>
              <td style={{ padding: '6px 12px' }}>{entry.year || '—'}</td>
              <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                <span style={{
                  background: style.bg, color: style.fg, borderRadius: 999, padding: '3px 10px',
                  fontSize: 11, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase',
                }}>{entry.status || 'Active'}</span>
              </td>
              <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                <button
                  onClick={() => onNavigate && onNavigate('Students')}
                  title="View in Students"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand-dark-blue)', padding: 2, display: 'inline-flex' }}
                ><ExternalLink size={13} /></button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Th({ children, align = 'left' }) {
  return <th style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--muted)',
    padding: '8px 12px', textAlign: align, whiteSpace: 'nowrap',
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

const pillStyle = {
  background: '#eefaff', color: 'var(--brand-dark-blue)', borderRadius: 999,
  padding: '2px 8px', fontSize: 11, fontWeight: 700,
}

const toolbarBtn = {
  background: '#eef1f2', border: 'none', borderRadius: 8, padding: '7px 12px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)', fontFamily: 'inherit',
}
