// ============================================================
// CraniaVerse — shared data store (backend-connected)
// ------------------------------------------------------------
// Source of truth is the local API (server/), not the browser.
//   GET  /api/registrations   -> load all records
//   POST /api/registrations   -> add a record (via public form at /register)
// Records are polled so registrations from the public form appear
// here automatically. If the API can't be reached, the app still
// renders a single demo (seed) record and shows a status notice.
// ============================================================
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { student as seedStudent, customer as seedCustomer } from './mockData'

// Where the API lives. In dev (when this file is served by Vite on :5173) the
// backend is at localhost:4000. In production the React build is served BY the
// backend on the same origin, so an empty VITE_API_URL means "same origin".
const API_BASE = import.meta.env?.VITE_API_URL ?? ''
const ENDPOINT = `${API_BASE}/api/registrations`
const POLL_MS = 15000

// Records are polled so registrations from the PUBLIC form (/register) appear automatically

export function ageFromDob(dob) {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return ''
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return years > 0 ? years.toFixed(2) : ''
}

// Local fallback record, used only when the API is unreachable so the
// Students/Customers pages still have something to render.
function fallbackRecord() {
  return {
    id: 'seed',
    displayName: `${seedStudent.firstName} ${seedStudent.lastName}`,
    createdAt: 'Seed record (offline)',
    student: seedStudent,
    customer: seedCustomer,
  }
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [records, setRecords] = useState([fallbackRecord()])
  const [selectedId, setSelectedId] = useState('seed')
  const [status, setStatus] = useState('loading') // 'loading' | 'online' | 'offline'
  const [rules, setRules] = useState([
    { id: 'present', reason: 'Present', delta: 1 },
    { id: 'no-shirt', reason: 'No Shirt', delta: -5 },
  ])
  const [staff, setStaff] = useState([])
  const [programs, setProgramsData] = useState([])
  const [programsState, setProgramsStateData] = useState() // undefined until first load
  const programsSaveTimer = useRef(null)
  const programsStateSaveTimer = useRef(null)
  const warnedAutoCash = useRef(false)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId

  const refreshRules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rules`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) setRules(data)
    } catch {}
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length) {
        setRecords(data)
        // keep the current selection if it still exists, else select the newest
        const stillThere = data.some((r) => r.id === selectedRef.current)
        if (!stillThere) setSelectedId(data[data.length - 1].id)
      }
      setStatus('online')
    } catch (e) {
      setStatus('offline')
    }
  }, [])

  const refreshPrograms = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/programs`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) setProgramsData(data)
    } catch {}
  }, [])

  const refreshProgramsState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/programs-state`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      if (!res.ok) return
      const data = await res.json()
      if (data && typeof data === 'object') setProgramsStateData(data)
    } catch {}
  }, [])

  const setPrograms = useCallback((updater) => {
    setProgramsData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      clearTimeout(programsSaveTimer.current)
      programsSaveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/programs`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify(next),
        }).catch(() => {})
      }, 400)
      return next
    })
  }, [])

  const setProgramsState = useCallback((updater) => {
    setProgramsStateData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      clearTimeout(programsStateSaveTimer.current)
      programsStateSaveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}/api/programs-state`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify(next),
        }).catch(() => {})
      }, 400)
      return next
    })
  }, [])

  const refreshStaff = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/staff`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) setStaff(data)
    } catch {}
  }, [])

  // initial load + polling so public-form registrations show up
  useEffect(() => {
    refresh()
    refreshRules()
    refreshStaff()
    refreshPrograms()
    refreshProgramsState()
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [refresh, refreshRules, refreshStaff, refreshPrograms, refreshProgramsState])

  const updateCraniaCash = useCallback((recordId, newAmount) => {
    setRecords(prevRecords => prevRecords.map(r => r.id === recordId ? { ...r, student: { ...r.student, craniaCash: newAmount } } : r))
  }, [])

  const updateStudentField = useCallback((recordId, key, val) => {
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, student: { ...r.student, [key]: val } } : r))
  }, [])

  const updateCustomerField = useCallback((recordId, section, key, val) => {
    setRecords(prev => prev.map(r => r.id === recordId
      ? { ...r, customer: { ...r.customer, [section]: { ...r.customer[section], [key]: val } } }
      : r))
  }, [])

  /* The detail view PUTs a record's programs straight to the API. Without
     this the store's copy stayed stale until the next full refresh, so
     ticking a fee square left the Customers list still showing the old
     Payment. Callers update here as well as on the server. */
  const updatePrograms = useCallback((recordId, programs) => {
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, programs } : r))
  }, [])

  const addCashEntry = useCallback(async (recordId, { delta, reason }) => {
    // Optimistic local update
    setRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r
      const newBalance = (r.student.craniaCash || 0) + delta
      const entry = { ts: new Date().toISOString(), delta, reason: (reason || '—').trim() }
      return {
        ...r,
        cashLog: [...(r.cashLog || []), entry],
        student: { ...r.student, craniaCash: newBalance },
      }
    }))
    try {
      await fetch(`${API_BASE}/api/registrations/${recordId}/cashEntry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ delta, reason }),
      })
    } catch {}
  }, [])

  /* Bring one lesson's automatic entries into line with what that lesson is
     currently worth. Safe to call on every edit — the server adds what is
     missing and withdraws what no longer applies, so calling it twice does
     nothing the second time. The response carries the new balance, which is
     applied locally so the Crania Cash page updates without a refetch. */
  const syncAutoCash = useCallback(async (recordId, key, awards) => {
    try {
      const res = await fetch(`${API_BASE}/api/registrations/${recordId}/autoCash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ key, awards }),
      })
      /* Every failure here used to be silent: marking a register simply
         awarded nothing, with nothing on screen and nothing in the console
         to say why. Report all of them, with the status and the body, and
         keep the last one on window for a one-line check. */
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const detail = `${res.status} ${body.slice(0, 200)}`
        window.__craniaCashLastError = { at: new Date().toISOString(), recordId, key, awards, detail }
        if (!warnedAutoCash.current) {
          warnedAutoCash.current = true
          console.error(
            `[Crania Cash] award failed — POST /api/registrations/${recordId}/autoCash -> ${detail}`
            + (res.status === 404
              ? '\nA 404 means the API predates this route: pm2 restart craniaverse-api'
              : ''),
          )
        }
        return
      }
      const out = await res.json()
      window.__craniaCashLastResult = out
      if (!out || !out.changed) return
      // The log itself is re-read on the next refresh; the balance is what
      // is on screen, so keep that honest immediately.
      setRecords(prev => prev.map(r => r.id === recordId
        ? { ...r, student: { ...r.student, craniaCash: out.balance } }
        : r))
    } catch { /* offline — the next edit reconciles */ }
  }, [])

  const updateRules = useCallback(async (newRules) => {
    setRules(newRules)
    try {
      await fetch(`${API_BASE}/api/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(newRules),
      })
    } catch {}
  }, [])

  const updateStaffField = useCallback(async (staffId, key, val) => {
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, [key]: val } : s))
    try {
      await fetch(`${API_BASE}/api/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ [key]: val }),
      })
    } catch {}
  }, [])

  const addStaff = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ firstName: 'New', lastName: 'Staff' }),
      })
      if (!res.ok) return null
      const rec = await res.json()
      setStaff(prev => [...prev, rec])
      return rec.id
    } catch { return null }
  }, [])

  const deleteStaff = useCallback(async (staffId) => {
    setStaff(prev => prev.filter(s => s.id !== staffId))
    try {
      await fetch(`${API_BASE}/api/staff/${staffId}`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' },
      })
    } catch {}
  }, [])

  const value = useMemo(() => ({
    records,
    selectedId,
    status,
    rules,
    staff,
    updateStaffField,
    addStaff,
    deleteStaff,
    programs,
    setPrograms,
    programsState,
    setProgramsState,
    selected: records.find((r) => r.id === selectedId) || records[0],
    select: (id) => setSelectedId(id),
    refresh,
    updateCraniaCash,
    updateStudentField,
    updateCustomerField,
    addCashEntry,
    syncAutoCash,
    updateRules,
    // Add a registration via the API (used by the public form at /register,
    // and by the "+ Add" buttons on Students/Customers). Returns the new
    // record's id and selects it. Throws if the API fails.
    addRegistration: async (form) => {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg.error || `HTTP ${res.status}`)
      }
      const record = await res.json()
      await refresh()
      if (record && record.id) setSelectedId(record.id)
      return record && record.id
    },
    // Permanently removes a registration (student + linked customer info).
    // Used by the delete actions on Students/Customers.
    deleteRegistration: async (id) => {
      const res = await fetch(`${ENDPOINT}/${id}`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await refresh()
    },
    /* Puts a deleted registration back under its original id, with its
       enrolments and fee history intact. This is what Undo on the Customers
       list calls; addRegistration cannot serve, because it builds a record
       from a flat form and mints a new id. */
    restoreRegistration: async (record) => {
      const res = await fetch(`${ENDPOINT}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(record),
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg.error || `HTTP ${res.status}`)
      }
      await refresh()
      return record.id
    },
    updatePrograms,
  }), [records, selectedId, status, rules, staff, programs, programsState, refresh, updateCraniaCash, updateStudentField, updateCustomerField, updatePrograms, addCashEntry, syncAutoCash, updateRules, updateStaffField, addStaff, deleteStaff, setPrograms, setProgramsState])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within <StoreProvider>')
  return ctx
}
