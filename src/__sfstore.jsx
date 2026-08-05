// Harness shim for the Staff Information page: a real store shape backed by
// an in-memory array, so add / duplicate / delete / undo all run for real
// without a server.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

const SEED = [
  {
    id: 'staff-a', staffId: 'E0001', firstName: 'Amara', lastName: 'Boateng',
    role: 'Teacher', phoneMobile: '519-555-0111', email: 'amara@x.test',
    startDate: '2023-09-05', active: true, sin: '111 222 333',
    documents: { 'Current Resume': true, 'Vulnerable Sector Check': true,
      'First Aid Certificate (if certified/requested)': true,
      'Transcript (if in school within the past year)': true,
      'Sample of Work (if requested)': true, 'Tax Forms (Federal & Provincial)': true,
      'Direct Deposit Form': true, 'Signed Contract': true },
  },
  {
    id: 'staff-b', staffId: 'E0002', firstName: 'Declan', lastName: 'Ó Riain',
    role: 'Instructor', phone: '519-555-0122', email: 'declan@x.test',
    startDate: '2025-01-12', active: true, sin: '444 555 666',
    documents: { 'Current Resume': true },            // paperwork outstanding
  },
  {
    id: 'staff-c', staffId: '', firstName: 'Mei', lastName: '',   // no ID, one name
    role: 'Assistant', email: 'mei@x.test',
    startDate: '2099-03-01', active: true,             // starts in the future
  },
  {
    id: 'staff-d', staffId: 'E0007', firstName: 'Ruth', lastName: 'Adeyemi',
    role: 'Teacher', phoneHome: '519-555-0144', email: 'ruth@x.test',
    startDate: '2019-04-02', active: false,            // inactive
    documents: {},
  },
]

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [staff, setStaff] = useState(() => JSON.parse(JSON.stringify(SEED)))

  const updateStaffField = useCallback((id, key, val) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, [key]: val } : s))
  }, [])

  const addStaff = useCallback(async (seed = {}) => {
    const id = seed.id || `staff-${Math.random().toString(36).slice(2, 8)}`
    const rec = {
      firstName: '', lastName: '', role: 'Teacher', email: '', startDate: '',
      active: true, documents: {}, ...seed, id,
    }
    setStaff(prev => [...prev.filter(s => s.id !== id), rec])
    return id
  }, [])

  const deleteStaff = useCallback(async (id) => {
    setStaff(prev => prev.filter(s => s.id !== id))
  }, [])

  const refreshStaff = useCallback(async () => {}, [])

  const value = useMemo(() => ({
    staff, refreshStaff, updateStaffField, addStaff, deleteStaff,
    programs: [], records: [], status: 'online',
  }), [staff, refreshStaff, updateStaffField, addStaff, deleteStaff])

  if (typeof window !== 'undefined') window.__sf = value
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() { return useContext(Ctx) }
