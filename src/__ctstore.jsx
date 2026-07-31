// TEMPORARY harness shim. Delete with the harness.
import { useState } from 'react'
import PROG from './data/programsData.json'
// Reproduce the live catalogue's damage: nameless programs left in the
// CONTESTS category, which is what was drawing the blank rows.
const blanks = Array.from({ length: 17 }, (_, i) => ({
  id: 'blank_' + i, number: '', code: '', name: '', subject: '', category: 'CONTESTS',
  duration: 55, offerings: [], active: true,
}))
export function useStore() {
  const [programs, setPrograms] = useState([...PROG.programs, ...blanks])
  const [programsState, setProgramsState] = useState(null)
  return { programs, setPrograms, programsState, setProgramsState, staff: [], records: [], status: 'online' }
}
