// TEMPORARY harness shim. Delete with the harness.
import PROG from './data/programsData.json'
export function useStore() { return { programs: PROG.programs, records: [], status: 'online' } }
