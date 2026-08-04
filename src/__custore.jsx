import { useState, useEffect, useCallback } from 'react'

const G = (f, l) => ({
  'First Name': f, 'Last Name': l, 'Relationship': 'Mother',
  'Phone (Mobile)': '519-555-0143', 'Email': (f + '@x.test').toLowerCase(),
  'Street Address': '14 Elm Row', 'City': 'Waterloo', 'Province': 'ON',
  'Postal Code': 'N2L 3G1', 'Occupation': 'Physician',
})
const prog = (name, status, rate, fees) => ({
  program: name, active: status === 'Active', status, year: '26_27',
  billing: 'Monthly', rate, rateUnit: '/wk', fees: fees || {},
})
const rec = (id, fam, first, last, grade, g1, g2, progs) => ({
  id, createdAt: '2026-06-0' + id + 'T09:00:00Z', displayName: first + ' ' + last,
  student: { firstName: first, lastName: last, grade, school: 'Elmwood PS', dob: '2015-04-11', medical: '', notes: [] },
  customer: {
    student: {}, guardian1: g1, guardian2: g2,
    emergency: { 'First Name': 'Rita', 'Last Name': 'Vance' },
    meta: { familyId: fam, source: 'Website', consents: {} },
  },
  programs: progs,
})

const OKA1 = G('Amara', 'Okafor'), OKA2 = G('Chidi', 'Okafor')
const SHA1 = G('Priya', 'Sharma')

let STATE = [
  rec('1', 'F0001', 'Zara', 'Okafor', '4', OKA1, OKA2, [
    prog('MATH ENRICHMENT - LEVEL 2', 'Active', '$289', { reg: 'paid', mat: 'paid' }),
    prog('Private Piano — 30 min', 'Active', '$420'),
  ]),
  rec('2', 'F0001', 'Kofi', 'Okafor', '2', OKA1, OKA2, [
    prog('Flex Math — Grades 3-4', 'New', '$249'),
  ]),
  rec('3', 'F0002', 'Aditi', 'Sharma', '7', SHA1, {}, [
    prog('FLEX MATH - DOUBLE', 'Active', '$319'),
  ]),
]

const PROGRAMS = [
  { id: 'p1', name: 'FLEX MATH - DOUBLE', category: 'FLEX' },
  { id: 'p2', name: 'MATH ENRICHMENT - LEVEL 2', category: 'ENRICHMENT' },
]
let PSTATE = {
  categoryOrder: ['ENRICHMENT', 'FLEX', 'PRIVATE PIANO LESSONS'],
  catColors: { ENRICHMENT: '#DEF2DE', FLEX: '#D8ECF8', 'PRIVATE PIANO LESSONS': '#FCE6D2' },
}

const L = new Set()
const notify = () => L.forEach(l => l())
const setState = (fn) => { STATE = fn(STATE); notify() }
window.__cu = { get records() { return STATE } }

export function useStore() {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump(n => n + 1); L.add(l); return () => L.delete(l) }, [])
  return {
    records: STATE,
    programs: PROGRAMS,
    programsState: PSTATE,
    setProgramsState: useCallback((u) => { PSTATE = typeof u === 'function' ? u(PSTATE) : u; notify() }, []),
    status: 'online', select: () => {}, refresh: async () => { notify() },
    updateCustomerField: useCallback((id, sec, k, v) => setState(rs => rs.map(r => r.id === id
      ? { ...r, customer: { ...r.customer, [sec]: { ...r.customer[sec], [k]: v } } } : r)), []),
    updateStudentField: useCallback(() => {}, []),
    updatePrograms: useCallback((id, programs) => setState(rs => rs.map(r => r.id === id
      ? { ...r, programs } : r)), []),
    addRegistration: async () => null,
    deleteRegistration: async (id) => setState(rs => rs.filter(r => r.id !== id)),
    restoreRegistration: async (record) => {
      setState(rs => (rs.some(r => r.id === record.id) ? rs : [...rs, record]))
      return record.id
    },
  }
}
