// Temporary preview harness shim — stands in for ../data/store so the Programs page
// can be rendered without the app's auth shell. Delete along with __pgharness.jsx.
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
  const setPrograms = (updater) =>
    setProgramsState(prev => (typeof updater === 'function' ? updater(prev) : updater))
  return { staff: STAFF, programs, setPrograms, records: [] }
}
