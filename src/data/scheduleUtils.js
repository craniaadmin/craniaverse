// Shared lesson-row / schedule-autopopulation logic used by the
// Students detail page's Comments tab, the standalone Attendance /
// Comments pages, AND the server (registration-migration defaults).
// Pure JS, no React/DOM — safe to import from both Vite and Node.
//
// There is no separate storage for attendance/comments; every surface
// reads and writes the same PocketBase `comments` collection row,
// keyed by `${studentId}` + `${year}|${program}`.

export const ATTEND_STYLE = {
  P: { background: '#c8e6c9', color: '#2e7d32' },
  L: { background: '#fff9c4', color: '#f57f17' },
  E: { background: '#dcedc8', color: '#558b2f' },
  A: { background: '#ffcdd2', color: '#c62828' },
}

export const ATTEND_LABEL = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' }

export const EMPTY_ROW = (n) => ({
  lessonNo: n, day: '', date: '', attendance: '', uniform: '',
  lessonPlan: '', homeworkCompleted: '', performance: '',
  behaviour: '', homeworkAssigned: '', parentComm: '', teacher: '',
})

export const DEFAULT_ROWS = () => Array.from({ length: 7 }, (_, j) => EMPTY_ROW(j + 1))

// The "YY_YY" academic year that's current right now, e.g. "26_27".
// School years run Sept–June; we treat July/Aug as already belonging
// to the upcoming year (that's when registration for the new year
// happens), so this never needs a manual bump each September like the
// hardcoded '25_26' strings it replaces did.
export function currentAcademicYear(now = new Date()) {
  const y = now.getFullYear()
  const startYear = now.getMonth() >= 6 ? y : y - 1 // getMonth() 6 = July (0-indexed)
  return `${String(startYear).slice(-2)}_${String(startYear + 1).slice(-2)}`
}

// A handful of years around the current one, current year first, for
// year-picker dropdowns (e.g. Students.jsx "add program tab").
export function academicYearOptions(now = new Date()) {
  const y = now.getFullYear()
  const startYear = now.getMonth() >= 6 ? y : y - 1
  const label = (s) => `${String(s).slice(-2)}_${String(s + 1).slice(-2)}`
  return [0, -1, -2, 1, -3].map(off => label(startYear + off))
}
export const ACADEMIC_YEARS = academicYearOptions()

const DAY_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

// Parse "Mon 4:30 pm, Wed 5:30 pm" → [{day:'Mon', time:'4:30 pm'}, ...]
export function parseSchedule(schedule) {
  if (!schedule) return []
  return String(schedule).split(',').map(s => {
    const m = s.trim().match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b\s*(.*)$/i)
    if (!m) return null
    const day = m[1].charAt(0).toUpperCase() + m[1].slice(1, 3).toLowerCase()
    return { day, time: (m[2] || '').trim() }
  }).filter(Boolean)
}

// Pick a sensible "term start" — anchor by the tab's academic year
// (e.g. "25_26" → Sep 1, 2025). Falls back to today if unparseable.
// Only used as a FALLBACK when real calendar week-dates aren't
// available (e.g. offline) — see weekDatesFromCalendarEvents below
// for the normal, calendar-accurate path.
export function termStartDate(yearStr) {
  const m = String(yearStr || '').match(/^(\d{2})/)
  if (m) {
    const yy = parseInt(m[1], 10)
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy
    return new Date(yyyy, 8, 1) // Sept 1 of the start year
  }
  return new Date()
}

// ISO YYYY-MM-DD — what <input type="date"> expects.
export function fmtScheduledDate(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export const TERM_WEEKS = 35 // standard Crania school year length

// Cadence: how many calendar days between week-cycles. Only used by
// the fallback flat-cadence generator (no real calendar available).
export function cadenceWeekStep(programInfo) {
  if (!programInfo) return 7
  const period = String(programInfo.period || '').toLowerCase()
  if (period.includes('month')) return 30
  if (period.includes('2-week') || period.includes('biweek') || period.includes('bi-week')) return 14
  return 7 // default: weekly
}

// ---------- Calendar-accurate week dates ----------
// Pull the real Monday-of-instructional-week dates out of a Calendar
// page's "Week 1".."Week N" markers for one calendar (normally the
// "Afterschool" calendar). These already skip Thanksgiving, Winter
// Break, March Break, etc. — the actual closures — instead of
// assuming a flat 7-day cadence between lessons.
// Returns a 1-indexed array: weekDates[1] = ISO date of Week 1's Monday.
export function weekDatesFromCalendarEvents(events, calendarId) {
  const weeks = (events || [])
    .filter(e => e.calId === calendarId && /^Week\s+\d+$/i.test(e.title || ''))
    .map(e => ({ n: Number(e.title.replace(/\D/g, '')), date: e.date }))
    .filter(w => w.n >= 1 && w.date)
  const arr = []
  for (const w of weeks) arr[w.n] = w.date
  return arr
}

// Build N lesson rows with day + date computed from real calendar
// week-dates (preferred). Stops early (padding with blank rows) if
// `count` exceeds the number of weeks the calendar actually defines,
// rather than guessing dates past the end of the school year.
export function generateScheduledRowsFromWeeks(slots, weekDates, count) {
  if (!slots.length || !weekDates || weekDates.length <= 1) return null // caller should fall back
  const rows = []
  for (let i = 0; i < count; i++) {
    const slot = slots[i % slots.length]
    const weekNo = Math.floor(i / slots.length) + 1
    const mondayIso = weekDates[weekNo]
    if (!mondayIso) { rows.push(EMPTY_ROW(i + 1)); continue }
    const monday = new Date(mondayIso + 'T00:00:00')
    const slotDayIdx = DAY_IDX[slot.day] ?? 1
    const offset = (slotDayIdx - 1 + 7) % 7 // days after Monday (Monday=1)
    const d = new Date(monday)
    d.setDate(d.getDate() + offset)
    rows.push({ ...EMPTY_ROW(i + 1), day: slot.day, date: fmtScheduledDate(d) })
  }
  return rows
}

// Flat-cadence fallback (no calendar data available, e.g. offline).
export function generateScheduledRows(slots, startDate, count, weekStep) {
  if (!slots.length) return Array.from({ length: count }, (_, j) => EMPTY_ROW(j + 1))
  const rows = []
  const startDayIdx = startDate.getDay()
  for (let i = 0; i < count; i++) {
    const slot = slots[i % slots.length]
    const cycleIdx = Math.floor(i / slots.length)
    const slotDayIdx = DAY_IDX[slot.day] ?? 1
    const dayOffset = (slotDayIdx - startDayIdx + 7) % 7
    const d = new Date(startDate)
    d.setDate(d.getDate() + dayOffset + cycleIdx * weekStep)
    rows.push({ ...EMPTY_ROW(i + 1), day: slot.day, date: fmtScheduledDate(d) })
  }
  return rows
}

// Look up cadence info (sessions/period) for a tab's program by title.
export function programInfoFor(prog, allPrograms) {
  if (!prog || !prog.program) return null
  const title = String(prog.program).toUpperCase().trim()
  return (allPrograms || []).find(p => String(p.title || '').toUpperCase().trim() === title) || null
}

// Build the autopopulated rows for a tab (used when no saved comments
// exist yet). Default count = sessions/period × 35 weeks.
// `weekDates` (optional) = real calendar week-dates from
// weekDatesFromCalendarEvents — when supplied, lesson dates land on
// the actual instructional weeks (skipping real breaks) instead of a
// flat 7-day guess anchored at Sept 1.
export function buildScheduledRows(prog, allPrograms, weekDates, count) {
  const slots = parseSchedule(prog && prog.schedule)
  const info = programInfoFor(prog, allPrograms)
  const perWeek = slots.length || Number(info && info.sessions) || 1
  const total = count != null ? count : perWeek * TERM_WEEKS

  const fromCalendar = generateScheduledRowsFromWeeks(slots, weekDates, total)
  if (fromCalendar) return fromCalendar

  // Fallback: flat cadence anchored at the tab's year (only when the
  // calendar hasn't loaded yet, e.g. first paint or offline).
  const start = termStartDate(prog && prog.year)
  const step = cadenceWeekStep(info)
  return generateScheduledRows(slots, start, total, step)
}

// Base key is year|program, same as before — this keeps the common
// case (one tab per program) reading/writing the same PocketBase row
// it always has. When a student has more than one tab for the same
// (year, program) with a DIFFERENT schedule — e.g. a Double course
// registered for two timeslots, "Mon 4:30 pm" and "Wed 5:30 pm" —
// dedupeProgramTabs tags the later ones with a `__slot` so they get
// their own distinct key (`base#2`, `base#3`, ...) instead of
// colliding with the first tab's storage row.
export const tabKeyOf = (prog) => {
  const base = `${prog.year}|${prog.program}`
  return prog && prog.__slot ? `${base}#${prog.__slot}` : base
}

// A registration can end up with the exact same (year, program) tab
// listed more than once for two different reasons:
//  1. A genuine duplicate — e.g. a double-submit when adding a
//     program — where the schedule (or lack of one) is identical.
//     These should collapse to one tab, or editing one would silently
//     mirror into a "phantom" identical twin.
//  2. A legitimate second registration for the same program at a
//     DIFFERENT timeslot — e.g. a Double course registered for both
//     "Mon 4:30 pm" and "Wed 5:30 pm". These are two real tabs and
//     must both survive, each with its own PocketBase comments row
//     (see tabKeyOf above) so editing one never touches the other.
// We tell the two apart by comparing the `schedule` string: identical
// schedule -> true duplicate (drop it); different schedule -> keep it,
// tagged with a slot suffix so its tabKey doesn't collide.
export function dedupeProgramTabs(programs) {
  const seenSchedules = new Map() // base key -> Set of schedule signatures already kept
  const out = []
  for (const p of programs || []) {
    if (!p || !p.program) continue
    const base = `${p.year}|${p.program}`
    const sig = String(p.schedule || '').trim().toLowerCase()
    const seenSet = seenSchedules.get(base) || new Set()
    if (seenSet.has(sig)) continue // true duplicate (same or same-blank schedule) — drop
    const slot = seenSet.size // 0 for the first tab kept under this base key, 1 for the next distinct one, etc.
    seenSet.add(sig)
    seenSchedules.set(base, seenSet)
    out.push(slot > 0 ? { ...p, __slot: slot + 1 } : p)
  }
  return out
}
