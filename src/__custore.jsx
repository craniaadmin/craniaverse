import { useState, useEffect, useCallback } from 'react'
const G = (f, l) => ({ 'First Name': f, 'Last Name': l, 'Email': (f + '@x.test').toLowerCase() })
const prog = (name, rate, feeCalc) => ({ program: name, active: true, status: 'Active', year: '26_27',
  billing: 'Monthly', rate, rateUnit: '/wk', fees: {}, schedule: 'Mon 6:30 pm, Thu 4:30 pm', ...(feeCalc ? { feeCalc } : {}) })
let STATE = [{
  id: '1', createdAt: '2026-06-01', displayName: 'Zara Okafor',
  student: { firstName: 'Zara', lastName: 'Okafor', grade: '4', school: 'Elmwood PS' },
  customer: { student: {}, guardian1: G('Amara', 'Okafor'), guardian2: G('Chidi', 'Okafor'), emergency: {}, meta: {} },
  programs: [prog('MATH ENRICHMENT - LEVEL 2', '$289'), prog('FLEX ENGLISH - DOUBLE', '$299')],
}]
const L = new Set(); const setState = (fn) => { STATE = fn(STATE); L.forEach(l => l()) }
export function useStore() {
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump(n => n + 1); L.add(l); return () => L.delete(l) }, [])
  return { records: STATE, programs: [], status: 'online', select: () => {}, refresh: async () => {},
    updateCustomerField: useCallback((id, sec, k, v) => setState(rs => rs.map(r => r.id === id
      ? { ...r, customer: { ...r.customer, [sec]: { ...r.customer[sec], [k]: v } } } : r)), []),
    updateStudentField: useCallback(() => {}, []),
    addRegistration: async () => null, deleteRegistration: async () => {} }
}
