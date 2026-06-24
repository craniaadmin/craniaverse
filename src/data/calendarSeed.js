// Seed events for the admin Calendar — transcribed directly from the 12
// monthly calendar PNGs published at https://crania-schools.com/calendar/.
// Loaded into localStorage on first visit when the user has no events.
//
// Categorisation rules used during transcription:
//   • Holidays / closures shown in red text -> dayschool calendar
//     (those days the day-school program is closed).
//   • "Afterschool (HOLIDAY)" markers (where day-school is open) ->
//     afterschool calendar, so admins can filter to the program that's
//     actually affected.
//   • Math contests (blue text) -> afterschool calendar — those are
//     afterschool-program events.
//   • Recitals, public-school dates, first/last days -> dayschool.
//   • Mother's / Father's Day -> personal.

const dateOnly = (date, title, calendar = 'dayschool', extra = {}) => ({
  id: `seed_${date}_${title.replace(/\W+/g, '_').toLowerCase()}_${calendar}`,
  title,
  calendar,
  startDate: date,
  time: '',
  lessonNumber: '',
  notes: '',
  recurrence: { freq: 'none', interval: 1, byweekday: [], until: '', exdates: [] },
  ...extra,
})

// Multi-day breaks emitted as one event per day so they show up on every
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
  // ── Aug 2025 ──────────────────────────────────────────────────
  dateOnly('2025-08-04', 'Civic Holiday'),

  // ── Sep 2025 ──────────────────────────────────────────────────
  dateOnly('2025-09-01', 'Labour Day'),
  dateOnly('2025-09-02', 'Public Elementary PD Day'),
  dateOnly('2025-09-03', 'First Day of Public School'),
  dateOnly('2025-09-04', 'First Day of Day School'),
  dateOnly('2025-09-08', 'First Day of Afterschool Program', 'afterschool'),
  dateOnly('2025-09-30', 'National Day for Truth and Reconciliation'),

  // ── Oct 2025 ──────────────────────────────────────────────────
  dateOnly('2025-10-02', 'CMS CLMC (Lynx) Math Contest', 'afterschool'),
  dateOnly('2025-10-10', 'Public Elementary PD Day'),
  dateOnly('2025-10-11', 'Holiday'),
  dateOnly('2025-10-13', 'Thanksgiving Day'),
  dateOnly('2025-10-14', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2025-10-15', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2025-10-16', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2025-10-30', 'CMS COMC Math Contest', 'afterschool'),

  // ── Nov 2025 ──────────────────────────────────────────────────
  dateOnly('2025-11-05', 'AMC 10/12 A Math Contest', 'afterschool'),
  dateOnly('2025-11-12', 'UW CEMC CIMC Math Contest', 'afterschool',
    { notes: 'BCC originally scheduled here was moved to Nov 17.' }),
  dateOnly('2025-11-13', 'AMC 10/12 B Math Contest', 'afterschool'),
  dateOnly('2025-11-17', 'UW CEMC BCC Math Contest', 'afterschool',
    { notes: 'New time/location — moved from Nov 12.' }),
  dateOnly('2025-11-17', 'Public Elementary PD Day'),
  dateOnly('2025-11-20', 'CMS CJMC (Canada Jay) Math Contest', 'afterschool',
    { notes: 'New time/location.' }),

  // ── Dec 2025 ──────────────────────────────────────────────────
  dateOnly('2025-12-06', 'Christmas Piano Recital', 'dayschool', { time: '6:00 pm' }),
  ...range('2025-12-22', '2025-12-31', 'Christmas Break'),

  // ── Jan 2026 ──────────────────────────────────────────────────
  ...range('2026-01-01', '2026-01-03', 'Christmas Break'),
  dateOnly('2026-01-16', 'Public Elementary PD Day'),
  dateOnly('2026-01-22', 'AMC 8 Math Contest', 'afterschool'),

  // ── Feb 2026 ──────────────────────────────────────────────────
  dateOnly('2026-02-05', 'AIME I Math Contest', 'afterschool'),
  dateOnly('2026-02-11', 'AIME II Math Contest (tentative)', 'afterschool'),
  dateOnly('2026-02-14', 'Holiday'),
  dateOnly('2026-02-16', 'Family Day'),
  dateOnly('2026-02-17', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2026-02-18', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2026-02-19', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2026-02-25', 'UW CEMC PCF Math Contest', 'afterschool'),

  // ── Mar 2026 ──────────────────────────────────────────────────
  ...range('2026-03-16', '2026-03-21', 'March Break'),
  dateOnly('2026-03-21', 'USAMO / USAJMO Math Contest', 'afterschool'),
  dateOnly('2026-03-22', 'USAMO / USAJMO Math Contest', 'afterschool'),

  // ── Apr 2026 ──────────────────────────────────────────────────
  dateOnly('2026-04-01', 'UW CEMC FGH Math Contest', 'afterschool'),
  dateOnly('2026-04-03', 'Good Friday'),
  dateOnly('2026-04-06', 'Easter Monday — Day School Closed'),
  dateOnly('2026-04-06', 'Easter Monday — Afterschool Open', 'afterschool'),
  dateOnly('2026-04-24', 'Public Elementary PD Day'),

  // ── May 2026 ──────────────────────────────────────────────────
  dateOnly('2026-05-10', "Mother's Day", 'personal'),
  dateOnly('2026-05-13', 'UW CEMC Gauss Math Contest', 'afterschool'),
  dateOnly('2026-05-16', 'Holiday'),
  dateOnly('2026-05-18', 'Victoria Day'),
  dateOnly('2026-05-19', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2026-05-20', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2026-05-21', 'Afterschool Holiday (Day School Open)', 'afterschool'),
  dateOnly('2026-05-29', 'Public Elementary PD Day'),

  // ── Jun 2026 ──────────────────────────────────────────────────
  dateOnly('2026-06-06', 'Spring Piano Recital', 'dayschool', { time: '6:00 pm' }),
  dateOnly('2026-06-19', 'Last Day of Day School'),
  dateOnly('2026-06-20', 'Last Day of Afterschool Program', 'afterschool'),
  dateOnly('2026-06-21', "Father's Day", 'personal'),
  dateOnly('2026-06-25', 'Last Day of Public School'),

  // ── Jul 2026 ──────────────────────────────────────────────────
  // Summer Camp — single recurring event so it's editable as one series.
  // RRULE: weekdays only from Jul 6 through Jul 17.
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
