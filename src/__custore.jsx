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
    meta: { familyId: fam, source: 'Website', consents: { Photo: true, 'Walk Home': true } },
  },
  programs: progs,
})

const OKA1 = G('Amara', 'Okafor', 'Mother', '519-555-0143', 'Physician')
const OKA2 = G('Chidi', 'Okafor', 'Father', '519-555-0144', 'Engineer')
const SHA1 = G('Priya', 'Sharma', 'Mother', '519-555-0177', 'Teacher')
const SHA2 = G('Raj', 'Sharma', 'Father', '519-555-0178', 'Accountant')
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
  // Sorts between Kofi and Zara and carries two programs, so the tall cell
  // sits in the MIDDLE of the family — the case that misaligns naive stacking.
  rec('6', 'F0001', 'Mina', 'Okafor', '6', 'Elmwood PS', OKA1, OKA2, [
    prog('MATH ENRICHMENT - LEVEL 2', 'Active', '289'),
    prog('TEKNOKIDS CODING: JAVASCRIPT/AI', 'Active', '319'),
  ]),
  rec('3', 'F0002', 'Aditi', 'Sharma', '7', 'Centennial PS', SHA1, SHA2, [
    prog('TEKNOKIDS CODING: JAVASCRIPT/AI', 'Active', '319', ALL_PAID),
  ]),
  rec('4', 'F0003', 'Lucas', 'Santos', '9', 'Bluevale CI', SAN1, {}, [
    prog('PRIVATE PIANO LESSONS', 'On Hold', '420'),
  ]),
  // No guardians, no grade, no programs — the empty-cell path.
  rec('5', 'F0004', 'Noah', 'Reyes', '', '', {}, {}, []),
]

const L = new Set()
const setState = (fn) => { STATE = fn(STATE); L.forEach(l => l()) }

export function useStore() {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump(n => n + 1); L.add(l); return () => L.delete(l) }, [])
  return {
    records: STATE,
    programs: [
      { id: 'p1', name: 'MATH ENRICHMENT - LEVEL 2' },
      { id: 'p2', name: 'FLEX ENGLISH - DOUBLE' },
      { id: 'p3', name: 'FLEX MATH - SINGLE' },
    ],
    status: 'online', select: () => {}, refresh: async () => {},
    updateCustomerField: useCallback((id, sec, k, v) => setState(rs => rs.map(r => r.id === id
      ? { ...r, customer: { ...r.customer, [sec]: { ...r.customer[sec], [k]: v } } } : r)), []),
    updateStudentField: useCallback(() => {}, []),
    addRegistration: async () => null,
    deleteRegistration: async (id) => setState(rs => rs.filter(r => r.id !== id)),
  }
}
