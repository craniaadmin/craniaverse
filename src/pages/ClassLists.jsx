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
import {
  DOW, DOW_ORD, norm, fmtTime, sessionsOf, statedLocationId, matchSession,
} from '../data/enrolment'

/* Fallback only. The real list lives in programs_state and the Programs
   page lets it be renamed and added to, so `useLocName` below prefers
   that and only falls back here. */
const LOCATIONS = { loc_boardwalk: 'Boardwalk', loc_waterloo: 'Waterloo East' }
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const staticLocName = (id) =>
  LOCATIONS[id] || titleCase(String(id || '').replace(/^loc_/, '').replace(/_/g, ' '))

function useLocName() {
  const { programsState } = useStore()
  return useMemo(() => {
    const byId = new Map()
    for (const l of (programsState?.locations || [])) if (l?.id) byId.set(l.id, l.name || '')
    return (id) => byId.get(id) || staticLocName(id)
  }, [programsState])
}

/* Category running order, matching the Programs page. Anything new sorts
   alphabetically after these. */
const CATEGORY_ORDER = ['ENRICHMENT', 'FLEX', 'TEKNOKIDS ROBOTICS', 'TEKNOKIDS CODING',
  'PRIVATE LESSONS', 'PRIVATE PIANO LESSONS', 'CONTESTS', 'SUMMER CAMP', 'CLUBS']

function sessionLabel(s) {
  const day = s.day == null ? '' : DOW[s.day]
  return [day, fmtTime(s.start)].filter(Boolean).join(' ') || 'Unscheduled'
}

/* A program can carry thirty sessions across two locations, and listing them
   all turns the summary line into a wall of times. Name the days it runs and
   the span of start times instead, with locations if it has more than one. */
function summarise(sessions, locNameOf = staticLocName) {
  if (!sessions || sessions.length === 0) return 'No offerings scheduled'
  const days = [...new Set(sessions.map((s) => s.session.day).filter((d) => d != null))]
    .sort((a, b) => DOW_ORD[a] - DOW_ORD[b]).map((d) => DOW[d])
  const starts = [...new Set(sessions.map((s) => s.session.start).filter(Boolean))].sort()
  const locs = [...new Set(sessions.map((s) => s.session.locationId).filter(Boolean))]
  const parts = []
  if (days.length) parts.push(days.join(', '))
  if (starts.length === 1) parts.push(fmtTime(starts[0]))
  else if (starts.length > 1) parts.push(`${fmtTime(starts[0])}–${fmtTime(starts[starts.length - 1])}`)
  if (locs.length > 1) parts.push(`${locs.length} locations`)
  else if (locs.length === 1) parts.push(locNameOf(locs[0]))
  const label = parts.join('  ·  ')
  return label ? `${label}  ·  ${sessions.length} session${sessions.length === 1 ? '' : 's'}` : 'Unscheduled'
}

/* A class like FLEX MATH runs twenty-nine sessions, and spelling every one
   of them out wraps the mismatch banner onto three lines. Name a few and
   count the rest — the class header above already carries the full summary. */
function sessionsPhrase(sessions, max = 4) {
  const labels = [...new Set(sessions.map((s) => sessionLabel(s.session)))]
  if (labels.length <= max) return labels.join(', ')
  return `${labels.slice(0, max).join(', ')} and ${labels.length - max} other times`
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
  const locNameOf = useLocName()

  return useMemo(() => {
    const realRecords = records.filter((r) => r.id !== 'seed')

    /* One card per class name. The catalogue holds the same name as several
       program records — FLEX ENGLISH - UNLIMITED exists seven times — and
       giving each its own card split one class across repeated headings.
       Merge their sessions instead, so the class appears once and every
       session it runs is a heading underneath it.

       A record with no name can't be merged by name, so it stays on its own
       keyed by id rather than collapsing every unnamed program into one. */
    const byName = new Map()
    for (const p of programs) {
      const key = norm(p.name) || `#unnamed:${p.id}`
      if (!byName.has(key)) byName.set(key, { program: p, records: [], roster: [], allSessions: [] })
      const c = byName.get(key)
      c.records.push(p)
      /* Two records describing the same physical session — same site, day and
         time — are one class, so collapse them or the merge just moves the
         duplication down a level. Fill in details the winner happens to lack. */
      for (const sess of sessionsOf(p)) {
        const sig = `${sess.locationId}|${sess.day}|${sess.start}|${sess.end}`
        const seen = c.allSessions.find((x) => x.sig === sig)
        if (seen) {
          if (!seen.instructor && sess.instructor) seen.instructor = sess.instructor
          if (seen.capacity == null && sess.capacity != null) seen.capacity = sess.capacity
          continue
        }
        c.allSessions.push({ ...sess, sig })
      }
      // Show the fullest record's details in the header and deep link.
      if ((p.offerings || []).length > (c.program.offerings || []).length) c.program = p
    }
    const classes = [...byName.values()]
    const unlistedByTitle = new Map()

    for (const r of realRecords) {
      for (const entry of (r.programs || [])) {
        if (!entry.program) continue
        const row = { record: r, entry }
        const cls = byName.get(norm(entry.program))
        if (cls) {
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
      /* Merged records arrive in catalogue order, which interleaves sites and
         days. Read them the way a timetable reads: day, then time, then site. */
      cls.allSessions.sort((a, b) =>
        (a.day == null ? 99 : DOW_ORD[a.day]) - (b.day == null ? 99 : DOW_ORD[b.day])
        || String(a.start || '').localeCompare(String(b.start || ''))
        || String(locNameOf(a.locationId) || '').localeCompare(String(locNameOf(b.locationId) || '')))
      const all = cls.allSessions
      const groups = new Map() // session key (or null) -> rows
      for (const row of cls.roster) {
        let s = matchSession(row.entry, all, locNameOf)
        if (!s) {
          /* Record why, so the bucket below can say "booked at the wrong
             site" rather than blaming the time when the time was fine. */
          const wantLoc = statedLocationId(row.entry, all, locNameOf)
          const txt = String(row.entry.schedule || '').toLowerCase()
          const slot = txt ? all.filter((sess) => sess.day != null &&
            txt.includes(DOW[sess.day].toLowerCase()) &&
            (sess.start ? txt.includes(fmtTime(sess.start).toLowerCase()) : true)) : []
          row.why = slot.length === 0 ? 'schedule' : wantLoc ? 'location' : 'nosite'
          row.wantLocName = wantLoc ? locNameOf(wantLoc) : ''
          // Which sites do run that slot — the choice a human has to make.
          row.slotSites = [...new Set(slot.map((sess) => sess.locationId).filter(Boolean))]
            .map(locNameOf).sort()
        }
        // A class that runs one session has nowhere else to put anyone, so
        // stale or missing schedule text should not strand them.
        if (!s && all.length === 1) s = all[0]
        const key = s ? s.key : null
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(row)
      }
      cls.sessions = all.map((s) => ({ session: s, rows: groups.get(s.key) || [] }))
      cls.unspecified = groups.get(null) || []
    }

    const unlisted = Array.from(unlistedByTitle.entries()).map(([title, roster]) => ({ title, roster }))

    return { classes, unlisted, realRecords }
  }, [records, programs, locNameOf])
}

const cardShadow = { boxShadow: 'var(--brand-shadow)' }

export default function ClassLists({ onNavigate }) {
  const { status: fetchStatus } = useStore()
  const locNameOf = useLocName()
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
                        onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate('Programs', c.program.id) }}
                        title="View in Programs"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--brand-dark-blue)', padding: 2, display: 'inline-flex', flexShrink: 0 }}
                      ><ExternalLink size={13} /></button>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {summarise(c.sessions, locNameOf)}
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
                              {s.session.locationId ? ` · ${locNameOf(s.session.locationId)}` : ''}
                              {s.session.capacity != null && ` (${s.rows.length}/${s.session.capacity})`}
                            </div>
                            <Roster rows={s.rows} onNavigate={onNavigate} />
                          </div>
                        ))}
                        {c.unspecified.length > 0 && (
                          <div>
                            {/* Naming the times on both sides turns this from a
                                dead end into something you can act on. */}
                            <div style={{
                              padding: '8px 16px', fontSize: 11, fontWeight: 700,
                              letterSpacing: '.3px', color: '#8a6a00', background: '#fffbf0',
                              borderTop: '1px solid #f4e4bd',
                            }}>
                              {c.unspecified.every((r) => r.why === 'nosite')
                                ? 'NO SITE ON THE REGISTRATION'
                                : c.unspecified.every((r) => r.why === 'location')
                                  ? 'BOOKED AT A SITE THAT DOESN’T RUN THIS CLASS THEN'
                                  : 'SCHEDULE DOESN’T MATCH A LISTED SESSION'}
                              <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                                {c.unspecified.every((r) => r.why === 'nosite')
                                  ? (() => {
                                      /* Only name the sites when every row here is
                                         choosing between the same ones — otherwise the
                                         sentence would merge two different slots. */
                                      const lists = [...new Set(c.unspecified.map((r) => (r.slotSites || []).join(' and ')))]
                                      const where = lists.length === 1 ? lists[0] : 'more than one site'
                                      return ` — that day and time runs at ${where}, and the registration`
                                        + ' doesn’t say which. Set it on the registration and they will drop'
                                        + ' into the right roster.'
                                    })()
                                  : <>
                                      {' '}— this class runs {sessionsPhrase(c.sessions)}.
                                      {c.unspecified.some((r) => r.why === 'location') &&
                                        ' The site each registration names is shown below; that day and time'
                                        + ' runs somewhere else.'}
                                      {' '}Check the registration or the program’s timetable.
                                    </>}
                              </span>
                            </div>
                            <Roster rows={c.unspecified} onNavigate={onNavigate} showSchedule />
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

/* Every roster on the page uses this one column geometry, and the table is
   laid out fixed rather than sized to its contents. Otherwise each class
   measures its own students and the columns land somewhere different in
   every block. The "Says" column is always present, so a class with a
   schedule mismatch lines up with the ones without. */
const COLS = ['20%', '64px', '16%', '26%', '13%', '78px', '120px', '44px']

const CELL = {
  padding: '6px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

function Roster({ rows, onNavigate, showSchedule = false }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
      <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr style={{ textAlign: 'left' }}>
          <Th>Student</Th>
          <Th>Grade</Th>
          <Th>School</Th>
          <Th>Guardian Contact</Th>
          <Th>Says</Th>
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
          const name = `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim()
          const contactLine = [contact.name, contact.phone, contact.email].filter(Boolean).join(' · ')
          return (
            <tr key={r.id + i} style={{ borderTop: '1px solid #f0ede3', background: i % 2 ? '#fafaf7' : '#fff', height: 34 }}>
              <td style={{ ...CELL, fontWeight: 600 }} title={name}>{name || '—'}</td>
              <td style={CELL}>{r.student?.grade || '—'}</td>
              <td style={CELL} title={r.student?.school || ''}>{r.student?.school || '—'}</td>
              <td style={{ ...CELL, color: 'var(--ink-soft)' }} title={contactLine}>
                {contactLine || '—'}
              </td>
              {/* Shows what the registration says about place as well as time.
                  When no site could be read, show the raw platform text rather
                  than nothing — that string is the reason the row is here. */}
              {(() => {
                const raw = String(entry.platform || entry.location || '').trim()
                const place = row.wantLocName || (raw && `“${raw}”`) || ''
                return (
                  <td style={{ ...CELL, color: showSchedule ? '#8a6a00' : 'var(--muted)' }}
                    title={[entry.schedule, raw].filter(Boolean).join(' · ')}>
                    {entry.schedule || (showSchedule ? 'no schedule set' : '—')}
                    {place ? ` · ${place}` : ''}
                  </td>
                )
              })()}
              <td style={CELL}>{entry.year || '—'}</td>
              <td style={{ ...CELL, textAlign: 'center' }}>
                <span style={{
                  background: style.bg, color: style.fg, borderRadius: 999, padding: '3px 10px',
                  fontSize: 11, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase',
                }}>{entry.status || 'Active'}</span>
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                <button
                  onClick={() => onNavigate && onNavigate('Students', r.id)}
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
    overflow: 'hidden', textOverflow: 'ellipsis',
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
