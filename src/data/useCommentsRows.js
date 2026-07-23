// Shared data hook for the standalone Attendance and Comments pages.
// There is no separate storage for attendance/comments — both pages
// (and the Comments tab at the bottom of a student's own page) read
// and write the exact same PocketBase `comments` collection, one row
// per (studentId, "year|program") tab. Editing a cell here PUTs back
// through the same endpoint the student page uses, so the two stay in
// sync automatically — there's only one copy of the data.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store'
import { buildScheduledRows, tabKeyOf } from './scheduleUtils'
import { useAfterschoolWeeks } from './useAfterschoolWeeks'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'ngrok-skip-browser-warning': 'true' }

export function useCommentsRows() {
  const { records, programs: allPrograms, status: storeStatus } = useStore()
  const { weekDates, loading: weeksLoading } = useAfterschoolWeeks()
  const [bulk, setBulk] = useState(null) // null until the initial GET /api/comments resolves
  const [loading, setLoading] = useState(true)
  const [fetchStatus, setFetchStatus] = useState('loading') // 'loading' | 'online' | 'offline'
  const [rowsByTab, setRowsByTab] = useState({}) // `${studentId}::${tabKey}` -> rows[]
  const saveTimers = useRef({})

  useEffect(() => {
    fetch(`${API_BASE}/api/comments`, { headers: HEADERS })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => { setBulk(data || {}); setFetchStatus('online') })
      .catch(() => setFetchStatus('offline'))
      .finally(() => setLoading(false))
  }, [])

  const realRecords = useMemo(() => records.filter(r => r.id !== 'seed'), [records])

  // Populate rowsByTab for every (student, program) tab once the bulk
  // fetch, the store's records/programs, AND the real calendar week
  // dates are all available. Waiting on weekDates matters: if we
  // autopopulated a never-touched tab before the calendar loaded,
  // we'd cache flat-cadence (wrong) dates permanently, since this
  // effect never overwrites a composite that's already loaded.
  // Additive only — so a later store poll (every 15s) can pick up
  // newly-added students without clobbering edits made in the
  // meantime.
  useEffect(() => {
    if (bulk == null || weeksLoading || realRecords.length === 0) return
    setRowsByTab(prev => {
      let changed = false
      const next = { ...prev }
      for (const rec of realRecords) {
        for (const prog of rec.programs || []) {
          if (!prog.program) continue
          const key = tabKeyOf(prog)
          const composite = `${rec.id}::${key}`
          if (next[composite]) continue
          const saved = bulk[rec.id]?.[key]
          next[composite] = (saved && saved.length) ? saved : buildScheduledRows(prog, allPrograms, weekDates)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [bulk, weeksLoading, weekDates, realRecords, allPrograms])

  const persist = useCallback((studentId, tabKey, rows) => {
    const composite = `${studentId}::${tabKey}`
    clearTimeout(saveTimers.current[composite])
    saveTimers.current[composite] = setTimeout(() => {
      fetch(`${API_BASE}/api/comments/${studentId}/${encodeURIComponent(tabKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(rows),
      }).catch(() => {})
    }, 500)
  }, [])

  // Patch one field on one row. Debounced-saves the whole tab's row
  // array, same as the Student detail page's Comments tab does.
  const updateRow = useCallback((studentId, tabKey, rowIdx, field, value) => {
    const composite = `${studentId}::${tabKey}`
    setRowsByTab(prev => {
      const current = prev[composite] || []
      const nextRows = current.map((row, i) => i === rowIdx ? { ...row, [field]: value } : row)
      persist(studentId, tabKey, nextRows)
      return { ...prev, [composite]: nextRows }
    })
  }, [persist])

  // Patch multiple fields on one row at once (used by the Comments
  // page's edit modal, which saves several text fields together).
  const updateRowFields = useCallback((studentId, tabKey, rowIdx, patch) => {
    const composite = `${studentId}::${tabKey}`
    setRowsByTab(prev => {
      const current = prev[composite] || []
      const nextRows = current.map((row, i) => i === rowIdx ? { ...row, ...patch } : row)
      persist(studentId, tabKey, nextRows)
      return { ...prev, [composite]: nextRows }
    })
  }, [persist])

  // Flatten into one entry per lesson row, joined with student +
  // program info, for the pages to filter/search/render.
  const flatRows = useMemo(() => {
    const out = []
    for (const rec of realRecords) {
      const studentName = `${rec.student?.firstName || ''} ${rec.student?.lastName || ''}`.trim() || '—'
      for (const prog of rec.programs || []) {
        if (!prog.program) continue
        const key = tabKeyOf(prog)
        const composite = `${rec.id}::${key}`
        const rows = rowsByTab[composite] || []
        rows.forEach((row, rowIdx) => {
          out.push({
            studentId: rec.id, studentName, program: prog.program, year: prog.year,
            tabKey: key, rowIdx, row,
          })
        })
      }
    }
    return out
  }, [realRecords, rowsByTab])

  return {
    flatRows, updateRow, updateRowFields,
    loading, status: fetchStatus === 'offline' ? 'offline' : storeStatus,
    studentCount: realRecords.length,
  }
}
