// TEMPORARY harness shim. Delete with the harness.
import { useState } from 'react'
import PROG from './data/programsData.json'
export function useStore() {
  const [programs, setPrograms] = useState(PROG.programs)
  const [programsState, setProgramsState] = useState(null)
  return { programs, setPrograms, programsState, setProgramsState, staff: [], records: [], status: 'online' }
}
