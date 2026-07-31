// TEMPORARY harness shim. Delete with the harness.
import PROG from './data/programsData.json'
const mk = (i, first, last, grade, progs) => ({
  id: 'r' + i, displayName: first + ' ' + last,
  student: { firstName: first, lastName: last, grade, school: 'Test PS' },
  customer: { guardian1: { 'First Name': 'Pat', 'Last Name': last, 'Phone (Mobile)': '(519) 555-0101', Email: 'pat@example.test' } },
  programs: progs,
})
// mirrors the real failure modes found in server/data.json
const records = [
  // exact match — FLEX MATH - SINGLE genuinely runs Mon 4:30 pm
  mk(1, 'Ada', 'Lovelace', '5', [{ program: 'FLEX MATH - SINGLE', status: 'Active', year: '26_27', schedule: 'Monday 4:30 pm' }]),
  // sole-session class, stale text — should now land in its one session
  mk(2, 'Alan', 'Turing', '4', [{ program: 'MATH ENRICHMENT - LEVEL 1', status: 'Active', year: '26_27', schedule: 'Mon 5:30 pm' }]),
  // sole-session class, no schedule at all
  mk(3, 'Grace', 'Hopper', '4', [{ program: 'MATH ENRICHMENT - LEVEL 1', status: 'Active', year: '26_27' }]),
  // genuine conflict on a multi-session class — must stay flagged
  mk(4, 'Katherine', 'Johnson', '6', [{ program: 'TEKNOKIDS CODING: HTML/CSS', status: 'Active', year: '26_27', schedule: 'Tuesday 4:00 pm' }]),
]
export function useStore() { return { records, programs: PROG.programs, status: 'online' } }
