import { useState, useEffect, useCallback } from 'react'

const G = (f, l, rel, phone, occ) => ({
  'First Name': f, 'Last Name': l, 'Relationship': rel,
  'Phone (Mobile)': phone, 'Email': (f + '@x.test').toLowerCase(),
  'Street Address': '14 Elm Row', 'Unit': '', 'City': 'Waterloo',
  'Province': 'ON', 'Postal Code': 'N2L 3G1', 'Occupation': occ,
})
const prog = (name, status, rate, fees) => ({
  program: name, active: status === 'Active', status, year: '26_27',
  billing: 'Monthly', rate: '$' + rate, rateUnit: '/wk',
  schedule: 'Mon 4:30 pm', location: 'Waterloo East', platform: '',
  fees: fees || {},
  feeCalc: { firstLesson: 1, monthlyFee: Number(rate), regFee: 79, matFee: 59, discount: 0, discountType: '%' },
})
const rec = (id, fam, first, last, grade, school, g1, g2, progs, extra = {}) => ({
  id, createdAt: '2026-06-0' + id + 'T09:00:00Z', displayName: first + ' ' + last,
  student: {
    firstName: first, lastName: last, grade, school, dob: '2015-04-11',
    medical: extra.medical || '', notes: extra.notes || [],
  },
  customer: {
    student: {}, guardian1: g1, guardian2: g2,
    emergency: {
      'First Name': 'Rita', 'Last Name': 'Vance', 'Relationship': 'Aunt',
      'Phone (Mobile)': '519-555-0300', 'Email': 'rita@x.test',
    },
    meta: { familyId: fam, source: 'Website', consents: { Photo: true } },
  },
  programs: progs,
})

const OKA1 = G('Amara', 'Okafor', 'Mother', '519-555-0143', 'Physician')
const OKA2 = G('Chidi', 'Okafor', 'Father', '519-555-0144', 'Engineer')
const SHA1 = G('Priya', 'Sharma', 'Mother', '519-555-0177', 'Teacher')
const SAN1 = G('Maria', 'Santos', 'Mother', '519-555-0190', 'Nurse')

const ALL_PAID = {
  reg: 'paid', mat: 'paid', sep: 'paid', oct: 'paid', nov: 'paid', dec: 'paid',
  jan: 'paid', feb: 'paid', mar: 'paid', apr: 'paid', may: 'paid', jun: 'paid',
}

let STATE = [
  rec('1', 'F0001', 'Zara', 'Okafor', '4', 'Elmwood PS', OKA1, OKA2, [
    prog('MATH ENRICHMENT - LEVEL 2', 'Active', '289', { reg: 'paid', mat: 'paid', sep: 'paid' }),
    prog('FLEX ENGLISH - DOUBLE', 'Active', '299'),
  ], { medical: 'Peanut allergy', notes: ['Prefers afternoons'] }),
  rec('2', 'F0001', 'Kofi', 'Okafor', '2', 'Elmwood PS', OKA1, OKA2, [
    prog('FLEX MATH - SINGLE', 'New', '249'),
  ]),
  rec('3', 'F0002', 'Aditi', 'Sharma', '7', 'Centennial PS', SHA1, {}, [
    prog('TEKNOKIDS CODING: JAVASCRIPT/AI', 'Active', '319', ALL_PAID),
  ]),
  rec('4', 'F0003', 'Lucas', 'Santos', '9', 'Bluevale CI', SAN1, {}, [
    prog('PRIVATE PIANO LESSONS', 'On Hold', '420'),
  ]),
]

// Catalogue entries carry the category the pills are tinted by.
const PROGRAMS = [
  { id: 'p1', name: 'MATH ENRICHMENT - LEVEL 2', category: 'ENRICHMENT' },
  { id: 'p2', name: 'FLEX ENGLISH - DOUBLE', category: 'FLEX' },
  { id: 'p3', name: 'FLEX MATH - SINGLE', category: 'FLEX' },
  { id: 'p4', name: 'TEKNOKIDS CODING: JAVASCRIPT/AI', category: 'TEKNOKIDS CODING' },
  { id: 'p5', name: 'PRIVATE PIANO LESSONS', category: 'PRIVATE PIANO LESSONS' },
]

let PSTATE = {
  catColors: {
    ENRICHMENT: '#DEF2DE', FLEX: '#D8ECF8',
    'TEKNOKIDS CODING': '#E7DEF5', 'PRIVATE PIANO LESSONS': '#FCE6D2',
  },
}

const L = new Set()
const notify = () => L.forEach(l => l())
const setState = (fn) => { STATE = fn(STATE); notify() }

// Exposed so the geometry checks can drive undo/redo and restore.
window.__cu = {
  get records() { return STATE },
  get pstate() { return PSTATE },
}

export function useStore() {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump(n => n + 1); L.add(l); return () => L.delete(l) }, [])
  return {
    records: STATE,
    programs: PROGRAMS,
    programsState: PSTATE,
    setProgramsState: useCallback((updater) => {
      PSTATE = typeof updater === 'function' ? updater(PSTATE) : updater
      notify()
    }, []),
    status: 'online', select: () => {}, refresh: async () => { notify() },
    updateCustomerField: useCallback((id, sec, k, v) => setState(rs => rs.map(r => r.id === id
      ? { ...r, customer: { ...r.customer, [sec]: { ...r.customer[sec], [k]: v } } } : r)), []),
    updateStudentField: useCallback(() => {}, []),
    updatePrograms: useCallback((id, programs) => setState(rs => rs.map(r => r.id === id
      ? { ...r, programs } : r)), []),
    addRegistration: async () => {
      const id = 'new-' + Date.now()
      setState(rs => [...rs, rec(id, 'F0009', 'New', 'Student', '', '', {}, {}, [])])
      return id
    },
    deleteRegistration: async (id) => setState(rs => rs.filter(r => r.id !== id)),
    restoreRegistration: async (record) => {
      setState(rs => (rs.some(r => r.id === record.id) ? rs : [...rs, record]))
      return record.id
    },
  }
}
