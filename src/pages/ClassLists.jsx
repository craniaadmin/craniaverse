// Class Lists — read-only rosters derived from server data already
// loaded by useStore(): the master Programs list (/api/programs) and
// registrations (/api/registrations). No new storage — this page just
// links the two by matching each student's enrolled program name to a
// program definition, then groups students under whichever session
// (day/time/instructor) their schedule text matches. Classes are laid
// out under their category heading.
//
// Note: an enrolment naming a program that is not in the Programs list
// does not appear anywhere on this page. The block that used to list
// those was removed by request.

import { useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useStore } from '../data/store'

const norm = (s) => String(s || '').trim().toUpperCase()

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_ORD = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }
const LOCATIONS = { loc_boardwalk: 'Boardwalk', loc_waterloo: 'Waterloo East' }
const locName = (id) => LOCATIONS[id] || String(id || '').replace(/^loc_/, '').replace(/_/g, ' ')

/* Category running order, matching the Programs page. Anything new sorts
   alphabetically after these. */
const CATEGORY_ORDER = ['ENRICHMENT', 'FLEX', 'TEKNOKIDS ROBOTICS', 'TEKNOKIDS CODING',
  'PRIVATE LESSONS', 'PRIVATE PIANO LESSONS', 'CONTESTS', 'SUMMER CAMP', 'CLUBS']

// "16:30" -> "4:30 pm"
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

/* An offering covers several days and several times at one location, so it is
   not itself a class session. Flatten it the way the Programs page does — one
   session per day × time — or every roster lumps together. */
function sessionsOf(program) {
  const out = []
  for (const o of (program.offerings || [])) {
    const days = (o.days || []).length ? [...o.days].sort((a, b) => DOW_ORD[a] - DOW_ORD[b]) : [null]
    const times = (o.times || []).length ? o.times : [null]
    for (const day of days) {
      for (const t of times) {
        out.push({
          key: `${o.id}|${day}|${t ? t.start : ''}`,
          day, start: t ? t.start : '', end: t ? t.end : '',
          locationId: o.locationId, instructor: o.instructor || '',
          capacity: o.capacity == null || o.capacity === '' ? null : Number(o.capacity),
        })
      }
    }
  }
  return out
}

function sessionLabel(s) {
  const day = s.day == null ? '' : DOW[s.day]
  return [day, fmtTime(s.start)].filter(Boolean).join(' ') || 'Unscheduled'
}

// Best-effort match of a student's free-text schedule ("Mon 4:30 pm")
// to one of the program's sessions, so rosters split by actual class
// session rather than lumping every enrollee together.
function matchSession(scheduleText, sessions) {
  const s = String(scheduleText || '').toLowerCase()
  if (!s || !sessions || sessions.length === 0) return null
  return sessions.find((sess) => {
    if (sess.day == null) return false
    const day = s.includes(DOW[sess.day].toLowerCase())
    const time = sess.start ? s.includes(fmtTime(sess.start).toLowerCase()) : true
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
  'On-Hold':    { bg: '#eef1f4', fg: '#6B6455' },
  Completed:    { bg: '#e4f2fb', fg: '#1c6ea4' },
  Cancelled:    { bg: '#fde0e0', fg: '#a12626' },
}
function statusStyle(s) { return STATUS_STYLE[s] || { bg: '#eef1f4', fg: '#6B6455' } }

// ---- build class groups from store data ----
function useClassLists() {
  const { records, programs } = useStore()

  return useMemo(() => {
    const realRecords = records.filter((r) => r.id !== 'seed')

    // A registration names its program as free text, so classes are keyed by
    // name. The same name can appear on more than one program record, so keep
    // every one as a candidate and route each student to whichever record has
    // a session matching their schedule text, falling back to the first.
    const classes = programs.map((p) => ({ program: p, roster: [], allSessions: sessionsOf(p) }))
    const byName = new Map() // norm(name) -> class wrapper[]
    for (const c of classes) {
      const key = norm(c.program.name)
      if (!key) continue
      if (!byName.has(key)) byName.set(key, [])
      byName.get(key).push(c)
    }
    const unlistedByTitle = new Map()

    for (const r of realRecords) {
      for (const entry of (r.programs || [])) {
        if (!entry.program) continue
        const row = { record: r, entry }
        const candidates = byName.get(norm(entry.program))
        if (candidates && candidates.length > 0) {
          let cls = candidates[0]
          if (candidates.length > 1) {
            const matched = candidates.find((c) => matchSession(entry.schedule, c.allSessions))
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

    // Sub-group each class's roster by matched session.
    for (const cls of classes) {
      const all = cls.allSessions
      const groups = new Map() // session key (or null) -> rows
      for (const row of cls.roster) {
        const s = matchSession(row.entry.schedule, all)
        const key = s ? s.key : null
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(row)
      }
      cls.sessions = all.map((s) => ({ session: s, rows: groups.get(s.key) || [] }))
      cls.unspecified = groups.get(null) || []
    }

    const unlisted = Array.from(unlistedByTitle.entries()).map(([title, roster]) => ({ title, roster }))

    return { classes, unlisted, realRecords }
  }, [records, programs])
}

const cardShadow = { boxShadow: 'var(--brand-shadow)' }

export default function ClassLists({ onNavigate }) {
  const { status: fetchStatus } = useStore()
  const { classes } = useClassLists()
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
    if ((c.program.name || '').toLowerCase().includes(q)) return true
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
      .sort((a, b) => b.roster.length - a.roster.length
        || String(a.program.name || '').localeCompare(String(b.program.name || '')))
  }, [classes, category, hideEmpty, q])

  /* Classes sit under their category heading, in the same running order the
     Programs page uses. */
  const grouped = useMemo(() => {
    const buckets = new Map()
    for (const c of visible) {
      const cat = c.program.category || 'Uncategorised'
      if (!buckets.has(cat)) buckets.set(cat, [])
      buckets.get(cat).push(c)
    }
    const rank = (cat) => {
      const i = CATEGORY_ORDER.indexOf(cat)
      return i < 0 ? CATEGORY_ORDER.length : i
    }
    return [...buckets.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
      .map(([cat, items]) => ({
        category: cat,
        items,
        students: items.reduce((n, c) => n + c.roster.length, 0),
      }))
  }, [visible])

  // ---- metrics ----
  const metrics = useMemo(() => {
    const withStudents = classes.filter((c) => c.roster.length > 0)
    const uniqueStudents = new Set()
    let enrollments = 0
    let atCapacity = 0
    for (const c of classes) {
      for (const row of c.roster) { uniqueStudents.add(row.record.id); enrollments++ }
      for (const s of c.sessions) {
        if (s.session.capacity != null && s.rows.length >= s.session.capacity) atCapacity++
      }
    }
    return {
      classesRunning: withStudents.length,
      uniqueStudents: uniqueStudents.size,
      enrollments,
      atCapacity,
    }
  }, [classes])

  const toggle = (key) => setExpanded((prev) => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const expandAll = () => setExpanded(new Set(visible.map((c) => c.program.id || (c.program.name + c.program.number))))
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricTile label="Classes Running" value={metrics.classesRunning} hint="with at least one student" />
        <MetricTile label="Students Enrolled" value={metrics.uniqueStudents} hint={`${metrics.enrollments} enrollments`} />
        <MetricTile label="At Capacity" value={metrics.atCapacity}
          color={metrics.atCapacity > 0 ? '#a12626' : 'var(--ink)'} hint="sessions full or over" />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {grouped.map((group) => (
            <section key={group.category}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '0 2px 7px', marginBottom: 10,
                borderBottom: '2px solid var(--brand-dark-blue)',
              }}>
                <h3 style={{
                  margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: '.6px',
                  textTransform: 'uppercase', color: 'var(--brand-dark-blue)',
                }}>{group.category}</h3>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {group.items.length} class{group.items.length === 1 ? '' : 'es'} · {group.students} enrolled
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {group.items.map((c) => {
            const key = c.program.id || (c.program.name + c.program.number)
            const isOpen = expanded.has(key)
            const capacity = c.sessions.reduce((sum, s) => sum + (s.session.capacity != null ? s.session.capacity : 0), 0)
            const hasCapacity = c.sessions.some((s) => s.session.capacity != null)
            return (
              <div key={key} style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', ...cardShadow, opacity: c.program.active === false ? 0.6 : 1 }}>
                <div
                  onClick={() => toggle(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer',
                    background: isOpen ? '#f4f9f9' : '#fff',
                  }}
                >
                  <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                    {isOpen ? <ChevronDown size={16} color="var(--brand-dark-blue)" /> : <ChevronRight size={16} color="var(--brand-dark-blue)" />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* The name has to be allowed to shrink, or a long one pushes
                        the link and the count out of alignment row to row. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{
                        fontWeight: 700, fontSize: 14, color: 'var(--brand-dark-blue)',
                        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{c.program.name}</span>
                      {c.program.active === false && (
                        <span style={{ ...pillStyle, background: '#eef1f4', color: '#6B6455', flexShrink: 0 }}>Inactive</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate('Programs') }}
                        title="View in Programs"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand-dark-blue)', padding: 2, display: 'inline-flex', flexShrink: 0 }}
                      ><ExternalLink size={13} /></button>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.sessions.length === 0
                        ? 'No offerings scheduled'
                        : c.sessions.map((s) => `${sessionLabel(s.session)}${s.session.instructor ? ` · ${s.session.instructor}` : ''}`).join('  •  ')}
                    </div>
                  </div>
                  {/* Fixed width so the counts line up down the column instead of
                      drifting with the number of digits. */}
                  <div style={{ textAlign: 'right', flexShrink: 0, width: 78 }}>
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
                              {sessionLabel(s.session)}{s.session.instructor ? ` — ${s.session.instructor}` : ''}
                              {s.session.locationId ? ` · ${locName(s.session.locationId)}` : ''}
                              {s.session.capacity != null && ` (${s.rows.length}/${s.session.capacity})`}
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
            </section>
          ))}
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
