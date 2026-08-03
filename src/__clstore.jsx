// TEMPORARY harness shim. Delete with the harness.
import PROG from './data/programsData.json'
const mk = (i, first, last, grade, progs) => ({
  id: 'r' + i, displayName: first + ' ' + last,
  student: { firstName: first, lastName: last, grade, school: 'Test Public School' },
  customer: { guardian1: { 'First Name': 'Tas', 'Last Name': last, 'Phone (Mobile)': '(519) 555-0101', Email: 'tas@example.test' } },
  programs: progs,
})
const FM = (schedule, platform, location) => ({
  program: 'FLEX MATH - SINGLE', status: 'Active', year: '26_27', schedule, platform, location,
})
const records = [
  // the screenshot pair, both on Mon 4:30
  mk(1, 'Test', 'Studentone', '5', [FM('Mon 4:30 pm', 'Waterloo East (In-Person)')]),
  // Maya: registration names NO site — used to be filed under Boardwalk
  mk(2, 'Maya', 'Karim', '8', [FM('Mon 4:30 pm', 'Online')]),
  // site in `location` rather than `platform`
  mk(3, 'Wes', 'Tan', '6', [FM('Mon 4:30 pm', 'Online', 'Waterloo East')]),
  // both sites named properly on a slot both run
  mk(4, 'Ada', 'Lovelace', '5', [FM('Tue 4:30 pm', 'Boardwalk (In-Person)')]),
  mk(5, 'Ivy', 'Chen', '5', [FM('Tue 4:30 pm', 'Waterloo East (In-Person)')]),
  // no site, but the slot runs at only ONE site -> still placed
  mk(6, 'Grace', 'Hopper', '4', [FM('Mon 5:30 pm', 'Online')]),
  // sole-session class, stale text
  mk(7, 'Alan', 'Turing', '4', [{ program: 'MATH ENRICHMENT - LEVEL 1', status: 'Active', year: '26_27', schedule: 'Mon 5:30 pm', platform: '' }]),
  // genuine time mismatch
  mk(8, 'Kath', 'Johnson', '7', [{ program: 'TEKNOKIDS CODING: HTML/CSS', status: 'Late Start', year: '26_27', schedule: 'Tuesday 4:00 pm', platform: 'Boardwalk (In-Person)' }]),
]
export function useStore() {
  return { records, programs: PROG.programs, programsState: { locations: PROG.locations }, status: 'online' }
}
