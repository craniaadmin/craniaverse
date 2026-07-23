// Shared lesson-row / schedule-autopopulation logic used by the
// Students detail page's Comments tab AND the standalone Attendance /
// Comments pages. Kept as one pure module so all three surfaces build
// the exact same lessonNo/day/date sequence for a given (program, year)
// tab — there is no separate storage for attendance/comments; every
// surface reads and writes the same PocketBase `comments` collection
// row, keyed by `${studentId}` + `${year}|${program}`.

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
export const ACADEMIC_YEARS = ['24_25', '25_26', '26_27', '23_24', '22_23']

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

// Cadence: how many calendar days between week-cycles.
export function cadenceWeekStep(programInfo) {
  if (!programInfo) return 7
  const period = String(programInfo.period || '').toLowerCase()
  if (period.includes('month')) return 30
  if (period.includes('2-week') || period.includes('biweek') || period.includes('bi-week')) return 14
  return 7 // default: weekly
}

// Build N lesson rows with day + date prefilled from the schedule slots.
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
export function buildScheduledRows(prog, allPrograms, count) {
  const slots = parseSchedule(prog && prog.schedule)
  const start = termStartDate(prog && prog.year)
  const info = programInfoFor(prog, allPrograms)
  const step = cadenceWeekStep(info)
  const perWeek = slots.length || Number(info && info.sessions) || 1
  const total = count != null ? count : perWeek * TERM_WEEKS
  return generateScheduledRows(slots, start, total, step)
}

export const tabKeyOf = (prog) => `${prog.year}|${prog.program}`
