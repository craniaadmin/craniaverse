// TEMPORARY harness shim. Delete with the harness.
import { useState } from 'react'
import SEED from './data/programsData.json'
const STAFF = [{ firstName: 'Ada', lastName: 'Lovelace' }, { firstName: 'Grace', lastName: 'Hopper' }]
export function useStore() {
  const [programs, setP] = useState(() => JSON.parse(JSON.stringify(SEED.programs || [])))
  const [programsState, setPS] = useState(() => ({}))
  return {
    staff: STAFF, programs, records: [],
    setPrograms: u => setP(prev => (typeof u === 'function' ? u(prev) : u)),
    programsState, setProgramsState: u => setPS(prev => (typeof u === 'function' ? u(prev) : u)),
  }
}
