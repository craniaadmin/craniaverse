// Seed events for the admin Calendar — derived from Crania's published
// 2025-2026 academic calendar (holidays, contests, recitals, breaks).
// Loaded into localStorage on first visit when the user has no events yet.

const dateOnly = (date, title, calendar = 'dayschool', extra = {}) => ({
  id: `seed_${date}_${title.replace(/\W+/g, '_').toLowerCase()}`,
  title,
  calendar,
  startDate: date,
  time: '',
  lessonNumber: '',
  notes: '',
  recurrence: { freq: 'none', interval: 1, byweekday: [], until: '', exdates: [] },
  ...extra,
})

// Multi-day breaks rendered as one event per day so they show up on every
// affected cell — keeps the seed dumb and explicit.
const range = (startDate, endDate, title, calendar = 'dayschool') => {
  const out = []
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push(dateOnly(k, title, calendar))
  }
  return out
}

export const CALENDAR_SEED = [
  // Fall 2025
  dateOnly('2025-08-04', 'Civic Holiday'),
  dateOnly('2025-09-01', 'Labour Day'),
  dateOnly('2025-09-02', 'Public Elementary PD Day'),
  dateOnly('2025-09-03', 'First Day of Public School'),
  dateOnly('2025-09-04', 'First Day of Day School'),
  dateOnly('2025-09-08', 'First Day of Afterschool', 'afterschool'),
  dateOnly('2025-09-30', 'Truth & Reconciliation Day'),
  dateOnly('2025-10-02', 'CMS CLMC Math Contest'),
  dateOnly('2025-10-10', 'Public Elementary PD Day'),
  dateOnly('2025-10-11', 'Holiday'),
  dateOnly('2025-10-13', 'Thanksgiving Day'),
  ...range('2025-10-14', '2025-10-16', 'Afterschool Holiday', 'afterschool'),
  dateOnly('2025-10-30', 'CMS COMC Math Contest'),
  dateOnly('2025-11-05', 'AMC 10/12 A'),
  dateOnly('2025-11-12', 'UW CEMC BCC+CIMC'),
  dateOnly('2025-11-13', 'AMC 10/12 B'),
  dateOnly('2025-11-17', 'UW CEMC BCC + PD Day'),
  dateOnly('2025-11-20', 'CMS CJMC Contest'),

  // Winter holidays
  dateOnly('2025-12-06', 'Christmas Piano Recital', 'dayschool', { time: '6:00 pm' }),
  ...range('2025-12-22', '2026-01-03', 'Christmas Break'),

  // Winter 2026
  dateOnly('2026-01-16', 'PD Day'),
  dateOnly('2026-01-22', 'AMC 8 Contest'),
  dateOnly('2026-02-05', 'AIME I'),
  dateOnly('2026-02-11', 'AIME II (tentative)'),
  dateOnly('2026-02-14', 'Holiday'),
  dateOnly('2026-02-16', 'Family Day'),
  ...range('2026-02-17', '2026-02-19', 'Afterschool Holiday', 'afterschool'),
  dateOnly('2026-02-25', 'UW CEMC PCF Contest'),
  ...range('2026-03-16', '2026-03-20', 'March Break'),
  dateOnly('2026-03-21', 'March Break / USAMO'),
  dateOnly('2026-03-22', 'USAJMO Contest'),

  // Spring 2026
  dateOnly('2026-04-01', 'UW CEMC FGH Math Contest'),
  dateOnly('2026-04-03', 'Good Friday'),
  dateOnly('2026-04-06', 'Easter Monday'),
  dateOnly('2026-04-24', 'Public Elementary PD Day'),
  dateOnly('2026-05-13', 'UW CEMC Gauss Contest'),
  dateOnly('2026-05-16', 'Holiday'),
  dateOnly('2026-05-18', 'Victoria Day'),
  ...range('2026-05-19', '2026-05-21', 'Afterschool Holiday', 'afterschool'),
  dateOnly('2026-05-29', 'Public Elementary PD Day'),
  dateOnly('2026-06-06', 'Spring Piano Recital', 'dayschool', { time: '6:00 pm' }),
  dateOnly('2026-06-19', 'Last Day of Day School'),
  dateOnly('2026-06-20', 'Last Day of Afterschool', 'afterschool'),
  dateOnly('2026-06-25', 'Last Day of Public School'),

  // Summer Camp — single recurring event so it's editable as one series
  {
    id: 'seed_summer_camp',
    title: 'Summer Camp',
    calendar: 'dayschool',
    startDate: '2026-07-06',
    time: '',
    lessonNumber: '',
    notes: 'Two-week summer program',
    recurrence: {
      freq: 'DAILY', interval: 1,
      byweekday: [0, 1, 2, 3, 4],   // Mon–Fri
      until: '2026-07-17',
      exdates: [],
    },
  },
]
