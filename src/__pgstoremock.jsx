// TEMPORARY harness shim standing in for ../data/store. Delete with the harness.
import { useState } from 'react'
import SEED from './data/programsData.json'

const STAFF = [
  { firstName: 'Ada', lastName: 'Lovelace' },
  { firstName: 'Alan', lastName: 'Turing' },
  { firstName: 'Grace', lastName: 'Hopper' },
]

export function useStore() {
  const [programs, setProgramsState] = useState(() =>
    JSON.parse(JSON.stringify(Array.isArray(SEED) ? SEED : SEED.programs || [])))
  const [programsState, setPS] = useState(() => ({}))
  const setPrograms = (u) => setProgramsState(prev => (typeof u === 'function' ? u(prev) : u))
  const setProgramsState2 = (u) => setPS(prev => (typeof u === 'function' ? u(prev) : u))
  return {
    staff: STAFF, programs, setPrograms,
    programsState, setProgramsState: setProgramsState2,
    records: [],
  }
}
