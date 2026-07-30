// TEMPORARY harness shim for ../data/store. Delete with the harness.
import PROG from './data/programsData.json'
const names = ['FLEX MATH - SINGLE', 'MATH ENRICHMENT - LEVEL 2', 'TEKNOKIDS CODING: SCRATCH',
  'CONTEST - CEMC GAUSS', 'PIANO PRIVATE 30MIN - JR', 'ARTSKIDS CROCHET - FULL DAY']
const mk = (i, first, last, grade, progs) => ({
  id: 'r' + i, displayName: first + ' ' + last,
  student: { firstName: first, lastName: last, grade, school: 'Test PS' },
  customer: { guardian1: { 'First Name': 'Pat', 'Last Name': last, 'Phone (Mobile)': '(519) 555-0101', Email: 'pat@example.test' } },
  programs: progs.map(n => ({ program: n, status: 'Active', year: '26_27', schedule: 'Mon 4:30 pm' })),
})
const records = [
  mk(1, 'Ada', 'Lovelace', '5', [names[0], names[2]]),
  mk(2, 'Alan', 'Turing', '3', [names[1], names[3]]),
  mk(3, 'Grace', 'Hopper', '7', [names[0], names[4]]),
  mk(4, 'Katherine', 'Johnson', '9', [names[5]]),
]
export function useStore() {
  return { records, programs: PROG.programs, status: 'online' }
}
