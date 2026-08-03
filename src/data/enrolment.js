// Shared enrolment matching — used by Class Lists (to build rosters) and by
// Programs (to show a live enrolment count per session).
//
// It lives here rather than in either page because the two must agree: a
// student the roster puts in Monday-at-Boardwalk has to be the same student
// the Programs page counts against Monday-at-Boardwalk. When this logic was
// duplicated they drifted, and a Waterloo East registration was showing on a
// Boardwalk roster.

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DOW_ORD = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }

export const norm = (s) => String(s || '').trim().toUpperCase()

// "16:30" -> "4:30 pm"
export function fmtTime(t) {
  if (!t) return ''
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return t
  let h = parseInt(m[1], 10)
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m[2]} ${ampm}`
}

/* An offering covers several days and several times at one location, so it is
   not itself a class session. Flatten it — one session per day × time — or
   every roster lumps together. */
export function sessionsOf(program) {
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

/* The site a registration names. The public form writes it into `platform` as
   "Boardwalk (In-Person)" and into `location` as "Boardwalk", so read both. A
   bare "Online" names no site and must not be read as one, which is why this
   matches against the locations actually on offer rather than looking for a
   bracket. Longest name first, so sites whose names nest — "Waterloo"
   alongside "Waterloo East" — resolve to the one actually named. */
export function statedLocationId(entry, sessions, locNameOf) {
  const hint = `${entry?.location || ''} ${entry?.platform || ''}`.trim().toLowerCase()
  if (!hint) return null
  const ids = [...new Set(sessions.map((s) => s.locationId).filter(Boolean))]
  const named = ids
    .map((id) => ({ id, name: String(locNameOf(id) || '').toLowerCase() }))
    .filter((x) => x.name)
    .sort((a, b) => b.name.length - a.name.length)
  for (const { id, name } of named) if (hint.includes(name)) return id
  return null
}

/* Match a registration's free-text schedule ("Mon 4:30 pm") to one of the
   program's sessions.

   Location is part of the match, not decoration — a class running the same
   day and time at both sites would otherwise resolve to whichever offering
   sat first in the array. When a registration names a site with no session at
   the stated time, or names none at all where several sites run that slot,
   this returns null rather than guessing. */
/* The slots one enrolment covers. A DOUBLE attends twice a week and an
   UNLIMITED up to five times, and the registration form already collects
   that — it joins the picks into `schedule` as "Thu 4:30 pm, Sat 9:30 am".
   Newer records carry `sessions[]` instead, which is the shape to prefer.

   Splitting matters for correctness, not just completeness: matched as one
   string, "Thu 4:30 pm, Sat 9:30 am" contains both "sat" and "4:30 pm", so
   it matched a Saturday 4:30 class the student had never enrolled in. */
export function entrySlots(entry) {
  const list = entry && Array.isArray(entry.sessions) ? entry.sessions : null
  if (list && list.length) {
    const out = list
      .map((s) => [s && s.day, s && s.time].filter(Boolean).join(' ').trim())
      .filter(Boolean)
    if (out.length) return out
  }
  return String((entry && entry.schedule) || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
}

// Match one slot's text — "Mon 4:30 pm" — against the program's sessions.
function matchOneSlot(text, entry, sessions, locNameOf) {
  const s = String(text || '').toLowerCase()
  if (!s) return null
  const dayTime = sessions.filter((sess) => {
    if (sess.day == null) return false
    const day = s.includes(DOW[sess.day].toLowerCase())
    const time = sess.start ? s.includes(fmtTime(sess.start).toLowerCase()) : true
    return day && time
  })
  if (dayTime.length === 0) return null

  const wantLoc = statedLocationId(entry, sessions, locNameOf)
  if (wantLoc) return dayTime.find((sess) => sess.locationId === wantLoc) || null

  const sites = new Set(dayTime.map((sess) => sess.locationId).filter(Boolean))
  return sites.size > 1 ? null : dayTime[0]
}

/* Every session this enrolment belongs to — a twice-weekly student turns up
   on two registers, so they must appear on both. */
export function matchSessions(entry, sessions, locNameOf) {
  if (!sessions || sessions.length === 0) return []
  const seen = new Set()
  const out = []
  for (const slot of entrySlots(entry)) {
    const hit = matchOneSlot(slot, entry, sessions, locNameOf)
    if (hit && !seen.has(hit.key)) { seen.add(hit.key); out.push(hit) }
  }
  return out
}

// First match only — for callers that need a single answer.
export function matchSession(entry, sessions, locNameOf) {
  return matchSessions(entry, sessions, locNameOf)[0] || null
}

export const sessionKey = (name, locationId, day, start) =>
  `${norm(name)}|${locationId || ''}|${day == null ? '' : day}|${start || ''}`

/* How many students are actually booked into each session, keyed by
   sessionKey(). Programs reads this so its Enrolment column reflects the
   register rather than a number somebody typed once. */
export function buildEnrolmentIndex(records, programs, locNameOf) {
  const byName = new Map()
  for (const p of (programs || [])) {
    const k = norm(p.name)
    if (!k) continue
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(...sessionsOf(p))
  }
  const counts = new Map()
  for (const r of (records || [])) {
    if (r.id === 'seed') continue
    for (const entry of (r.programs || [])) {
      if (!entry.program) continue
      const sessions = byName.get(norm(entry.program))
      if (!sessions || !sessions.length) continue
      let hits = matchSessions(entry, sessions, locNameOf)
      // A class that runs one session has nowhere else to put anyone.
      if (!hits.length && sessions.length === 1) hits = [sessions[0]]
      // Counted once per session attended — a DOUBLE fills a seat twice.
      for (const s of hits) {
        const key = sessionKey(entry.program, s.locationId, s.day, s.start)
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
  }
  return counts
}
