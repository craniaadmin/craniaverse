import { useState, useEffect, useCallback } from 'react'

const prog = (name, status, rate) => ({
  program: name, active: status === 'Active', status, year: '26_27',
  billing: 'Monthly', rate, fees: {},
})

/* The reported case: Test Studentone and Test Studenttwo have the same
   parents, but only the first record carries the guardian's email — and
   they were handed different family references. */
const PARENT_WITH_EMAIL = {
  'First Name': 'Dana', 'Last Name': 'Testparent', 'Relationship': 'Mother',
  'Phone (Mobile)': '519-555-0100', 'Email': 'dana@x.test',
}
const PARENT_NO_EMAIL = {
  'First Name': 'Dana', 'Last Name': 'Testparent', 'Relationship': 'Mother',
  'Phone (Mobile)': '519-555-0100',
}
const OTHER = {
  'First Name': 'Sam', 'Last Name': 'Other', 'Email': 'sam@x.test',
}

const rec = (id, fam, first, last, g1, progs) => ({
  id, createdAt: '2026-06-0' + id + 'T09:00:00Z', displayName: first + ' ' + last,
  student: { firstName: first, lastName: last, grade: '5', school: 'Elmwood PS', notes: [] },
  customer: { student: {}, guardian1: g1, guardian2: {}, emergency: {},
    meta: { familyId: fam, source: 'Website', consents: {} } },
  programs: progs,
})

let STATE = [
  rec('1', 'F0007', 'Test', 'Studentone', PARENT_WITH_EMAIL, [prog('FLEX MATH - SINGLE', 'Active', '$199')]),
  rec('2', 'F0003', 'Test', 'Studenttwo', PARENT_NO_EMAIL, [prog('FLEX MATH - SINGLE', 'Active', '$199')]),
  rec('3', 'F0009', 'Unrelated', 'Child', OTHER, [prog('FLEX MATH - SINGLE', 'Active', '$199')]),
]

const PROGRAMS = [{ id: 'p1', name: 'FLEX MATH - SINGLE', category: 'FLEX' }]
let PSTATE = { categoryOrder: ['FLEX'], catColors: { FLEX: '#D8ECF8' } }

const L = new Set()
const notify = () => L.forEach(l => l())
const setState = (fn) => { STATE = fn(STATE); notify() }
window.__cu = { get records() { return STATE } }

export function useStore() {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump(n => n + 1); L.add(l); return () => L.delete(l) }, [])
  return {
    records: STATE, programs: PROGRAMS, programsState: PSTATE,
    setProgramsState: useCallback((u) => { PSTATE = typeof u === 'function' ? u(PSTATE) : u; notify() }, []),
    status: 'online', select: () => {}, refresh: async () => { notify() },
    updateCustomerField: useCallback((id, sec, k, v) => setState(rs => rs.map(r => r.id === id
      ? { ...r, customer: { ...r.customer, [sec]: { ...r.customer[sec], [k]: v } } } : r)), []),
    updateStudentField: useCallback(() => {}, []),
    updatePrograms: useCallback((id, programs) => setState(rs => rs.map(r => r.id === id
      ? { ...r, programs } : r)), []),
    addRegistration: async () => null,
    deleteRegistration: async (id) => setState(rs => rs.filter(r => r.id !== id)),
    restoreRegistration: async (record) => { setState(rs => rs.some(r => r.id === record.id) ? rs : [...rs, record]); return record.id },
  }
}
