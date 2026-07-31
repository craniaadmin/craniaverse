// TEMPORARY harness shim. Delete with the harness.
import PROG from './data/programsData.json'
const mk = (i, first, last, grade, school, progs) => ({
  id: 'r' + i, displayName: first + ' ' + last,
  student: { firstName: first, lastName: last, grade, school },
  customer: { guardian1: { 'First Name': 'Pat', 'Last Name': last, 'Phone (Mobile)': '(519) 555-0101', Email: 'pat.' + last.toLowerCase() + '@example.test' } },
  programs: progs,
})
const records = [
  // the two test students, now with schedules the reset script would write
  mk(1, 'Test', 'Studentone', '5', 'Test Public School', [
    { program: 'FLEX MATH - SINGLE', status: 'Active', year: '26_27', schedule: 'Tue 4:30 pm' },
    { program: 'TEKNOKIDS CODING: SCRATCH', status: 'Active', year: '26_27', schedule: 'Sat 9:30 am' },
  ]),
  mk(2, 'Test', 'Studenttwo', '3', 'Test Public School', [
    { program: 'MATH ENRICHMENT - LEVEL 2', status: 'Active', year: '26_27', schedule: 'Wed 5:30 pm' },
    { program: 'TEKNOKIDS EARLY', status: 'Active', year: '26_27', schedule: 'Sat 9:30 am' },
  ]),
  // a long name / long school / genuine conflict, to prove columns don't move
  mk(3, 'Maximiliana', 'Vandenberghe-Whitfield', '11', 'Sir John A. Macdonald Secondary School', [
    { program: 'TEKNOKIDS CODING: HTML/CSS', status: 'Late Start', year: '26_27', schedule: 'Tuesday 4:00 pm' },
  ]),
  mk(4, 'Bo', 'Ng', '1', 'A B C', [
    { program: 'MATH ENRICHMENT - LEVEL 1', status: 'Active', year: '26_27', schedule: 'Mon 5:30 pm' },
  ]),
]
export function useStore() { return { records, programs: PROG.programs, status: 'online' } }
