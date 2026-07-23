import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../data/store'
import { programs as craniaProgramList } from '../data/mockData'
import {
  ATTEND_STYLE, EMPTY_ROW, DEFAULT_ROWS, ACADEMIC_YEARS, currentAcademicYear,
  buildScheduledRows as buildScheduledRowsShared, dedupeProgramTabs, tabKeyOf,
} from '../data/scheduleUtils'
import { useAfterschoolWeeks } from '../data/useAfterschoolWeeks'
import { usernameFor, generatePassword } from '../data/loginUtils'

const PROGRAM_LIST = craniaProgramList.map((p) => p.title)

// ── Shared field components ────────────────────────────────────────────────

function SField({ label, value, variant, readOnly, onChange }) {
  let cls = 'field-val'
  if (variant === 'highlight') cls += ' highlight'
  if (variant === 'danger') cls += ' danger'
  if (variant === 'link') cls = 'field-val link'
  return (
    <div className="field-row" style={{ gridTemplateColumns: '96px 1fr' }}>
      <label>{label}:</label>
      {(readOnly || variant === 'link') ? (
        <div className={cls}>{value || ' '}</div>
      ) : (
        <input
          className={cls}
          value={value || ''}
          onChange={e => onChange && onChange(e.target.value)}
          style={{ width: '100%', fontFamily: 'inherit', fontSize: 'inherit', cursor: 'text', boxSizing: 'border-box' }}
        />
      )}
    </div>
  )
}

// ── Comments section ───────────────────────────────────────────────────────
// ATTEND_STYLE, EMPTY_ROW, DEFAULT_ROWS, ACADEMIC_YEARS, and the whole
// schedule-autopopulation toolkit now live in ../data/scheduleUtils so
// the standalone Attendance / Comments pages build identical rows for
// a given tab — all three surfaces read and write the same
// PocketBase `comments` row, so there is nothing to keep in sync here.

function CommentsSection({ studentId, initialPrograms }) {
  const { rules, addCashEntry, programs: allPrograms } = useStore()
  const { weekDates } = useAfterschoolWeeks()
  // Dedupe here so a registration that ended up with the same
  // (year, program) tab listed twice — e.g. a double-submit when
  // adding a program — only ever shows ONE tab. Both entries would
  // read/write the identical PocketBase comments row anyway (same
  // tabKeyOf()), so showing two tabs was always cosmetic duplication,
  // not two independent records.
  const [programs, setPrograms] = useState(() => dedupeProgramTabs(initialPrograms))

  // Build the autopopulated rows for a tab (used when no saved comments exist yet).
  // Default count = sessions/period × 35 weeks. Caller can override (e.g. for "+ Add row").
  // `weekDates` comes from the live Calendar's Afterschool "Week N" markers so
  // lesson dates land on real instructional weeks (breaks correctly skipped)
  // instead of a flat 7-day guess.
  const buildScheduledRows = useCallback((prog, count) =>
    buildScheduledRowsShared(prog, allPrograms, weekDates, count), [allPrograms, weekDates])
  const [activeTab, setActiveTab] = useState(0)
  const [rows, setRows] = useState({})
  const [saveStatus, setSaveStatus] = useState({})
  const [addingTab, setAddingTab] = useState(false)
  const [newTab, setNewTab] = useState({ year: currentAcademicYear(), program: '' })
  const saveTimer = useRef({})
  const programsRef = useRef(programs)
  const rowsRef = useRef(rows)
  const studentIdRef = useRef(studentId)
  const API_BASE = import.meta.env?.VITE_API_URL || ''
  const HEADERS = { 'ngrok-skip-browser-warning': 'true' }

  useEffect(() => { programsRef.current = programs }, [programs])
  useEffect(() => { rowsRef.current = rows }, [rows])

  const flushPending = useCallback((sid) => {
    Object.keys(saveTimer.current).forEach((tabIdx) => {
      if (!saveTimer.current[tabIdx]) return
      clearTimeout(saveTimer.current[tabIdx])
      saveTimer.current[tabIdx] = null
      const prog = programsRef.current[tabIdx]
      const pendingRows = rowsRef.current[tabIdx]
      if (!prog || !pendingRows) return
      const key = `${prog.year}|${prog.program}`
      fetch(`${API_BASE}/api/comments/${sid}/${encodeURIComponent(key)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify(pendingRows),
      }).catch(() => {})
    })
  }, [API_BASE])

  useEffect(() => {
    if (!studentId) return
    flushPending(studentIdRef.current)
    studentIdRef.current = studentId
    const dedupedPrograms = dedupeProgramTabs(initialPrograms)
    setPrograms(dedupedPrograms)
    programsRef.current = dedupedPrograms
    setActiveTab(0)
    setSaveStatus({})
    setRows({})
    rowsRef.current = {}
    fetch(`${API_BASE}/api/comments/${studentId}`, { headers: HEADERS })
      .then((r) => r.json())
      .then((data) => {
        const loaded = {}
        // Index against the SAME deduped array used for the rendered
        // tabs (dedupedPrograms), not the raw initialPrograms prop —
        // otherwise tab index i here could point at a different
        // program than tab index i on screen once duplicates are
        // collapsed.
        dedupedPrograms.forEach((p, i) => {
          const key = tabKeyOf(p)
          // Autopopulate day+date columns from registered schedule if no saved comments exist
          loaded[i] = data[key] || buildScheduledRows(p)
        })
        setRows(loaded)
        rowsRef.current = loaded
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, API_BASE])

  const persistTab = useCallback((tabIdx, updatedRows) => {
    if (!studentId) return
    const prog = programsRef.current[tabIdx]
    if (!prog) return
    const key = `${prog.year}|${prog.program}`
    setSaveStatus((s) => ({ ...s, [tabIdx]: 'saving' }))
    fetch(`${API_BASE}/api/comments/${studentId}/${encodeURIComponent(key)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...HEADERS },
      body: JSON.stringify(updatedRows),
    })
      .then((r) => r.ok ? setSaveStatus((s) => ({ ...s, [tabIdx]: 'saved' })) : Promise.reject())
      .catch(() => setSaveStatus((s) => ({ ...s, [tabIdx]: 'error' })))
  }, [studentId, API_BASE])

  const tabRows = rows[activeTab] || DEFAULT_ROWS()

  const addRow = () => {
    setRows((r) => {
      const cur = r[activeTab] || []
      const prog = programsRef.current[activeTab]
      // Regenerate enough rows to cover the new total, then take just the new one
      // so its day/date follows the schedule pattern from the existing rows.
      const generated = buildScheduledRows(prog, cur.length + 1)
      const newRow = generated[cur.length] || EMPTY_ROW(cur.length + 1)
      const next = [...cur, newRow]
      const updated = { ...r, [activeTab]: next }
      rowsRef.current = updated
      clearTimeout(saveTimer.current[activeTab])
      saveTimer.current[activeTab] = setTimeout(() => persistTab(activeTab, next), 800)
      return updated
    })
  }

  const findRule = (matchers, fallbackDelta) => {
    const lc = (s) => String(s || '').toLowerCase()
    const found = rules.find(r => matchers.some(m => lc(r.id) === m || lc(r.reason) === m))
    return found || { delta: fallbackDelta, reason: matchers[0] }
  }

  const update = (rowIdx, field, value) => {
    const currentRows = rowsRef.current[activeTab] || []
    const prevRow = currentRows[rowIdx] || {}
    const prevVal = prevRow[field] || ''
    if (prevVal === value) return // no-op: avoids spurious fires from re-selecting the same value
    const next = currentRows.map((row, i) => i === rowIdx ? { ...row, [field]: value } : row)
    const updated = { ...rowsRef.current, [activeTab]: next }
    rowsRef.current = updated
    setRows(updated)
    clearTimeout(saveTimer.current[activeTab])
    saveTimer.current[activeTab] = setTimeout(() => persistTab(activeTab, next), 800)

    // Auto-apply Crania Cash rules when transitioning into a triggering state
    if (studentId) {
      if (field === 'attendance' && value === 'P') {
        const rule = findRule(['present'], 1)
        addCashEntry(studentId, { delta: rule.delta, reason: `${rule.reason || 'Present'} (auto · lesson ${prevRow.lessonNo || rowIdx + 1})` })
      }
      if (field === 'uniform' && value === 'No') {
        const rule = findRule(['no-shirt', 'no shirt'], -5)
        addCashEntry(studentId, { delta: rule.delta, reason: `${rule.reason || 'No Shirt'} (auto · lesson ${prevRow.lessonNo || rowIdx + 1})` })
      }
    }
  }

  const addProgram = () => {
    if (!newTab.program) return
    const newProg = { year: newTab.year, program: newTab.program }
    // Guard against creating a second tab that's a duplicate of one
    // already there — both would read/write the identical PocketBase
    // comments row (same tabKeyOf()), producing two tabs that
    // silently mirror each other's edits instead of one real tab.
    const dupIdx = programs.findIndex((p) => tabKeyOf(p) === tabKeyOf(newProg))
    if (dupIdx !== -1) {
      setActiveTab(dupIdx)
      setAddingTab(false)
      setNewTab({ year: currentAcademicYear(), program: '' })
      alert(`${newProg.program} (${newProg.year}) already has a tab for this student — switched to it instead of creating a duplicate.`)
      return
    }
    const next = [...programs, newProg]
    programsRef.current = next
    setPrograms(next)
    // No schedule on manually added tabs → falls back to empty rows
    setRows((r) => ({ ...r, [next.length - 1]: buildScheduledRows(newProg) }))
    setActiveTab(next.length - 1)
    setAddingTab(false)
    setNewTab({ year: currentAcademicYear(), program: '' })
    fetch(`${API_BASE}/api/registrations/${studentId}/programs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...HEADERS },
      body: JSON.stringify(next),
    }).catch(() => {})
  }

  const COLS = [
    { key: 'lessonNo', label: 'LESSON #', width: 52, readOnly: true },
    { key: 'day', label: 'DAY', width: 52 },
    { key: 'date', label: 'DATE', width: 120, type: 'date' },
    { key: 'attendance', label: 'ATTENDANCE', width: 90, type: 'attendance' },
    { key: 'uniform', label: 'UNIFORM', width: 90, type: 'uniform' },
    { key: 'lessonPlan', label: 'LESSON PLAN', width: 180 },
    { key: 'homeworkCompleted', label: 'HOMEWORK COMPLETED', width: 130 },
    { key: 'performance', label: 'PERFORMANCE', width: 160 },
    { key: 'behaviour', label: 'BEHAVIOUR', width: 140 },
    { key: 'homeworkAssigned', label: 'HOMEWORK ASSIGNED', width: 120 },
    { key: 'parentComm', label: 'PARENT COMMUNICATION', width: 140 },
    { key: 'teacher', label: 'TEACHER', width: 90 },
  ]

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ background: '#1a1a1a', color: '#fff', fontWeight: 700, fontSize: 18, textAlign: 'center', padding: '14px 0', borderRadius: '8px 8px 0 0' }}>
        Comments
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '10px 8px 0', background: '#f5f5f5', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {programs.map((p, i) => (
          <button key={i} onClick={() => setActiveTab(i)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', borderRadius: '6px 6px 0 0',
            background: activeTab === i ? '#fff' : '#ddd', color: activeTab === i ? '#1a1a1a' : '#555',
            boxShadow: activeTab === i ? '0 -2px 4px rgba(0,0,0,0.08)' : 'none',
          }}>
            <div style={{ fontSize: 10, color: '#888' }}>
              {p.year}
              {activeTab === i && saveStatus[i] === 'saving' && ' · saving…'}
              {activeTab === i && saveStatus[i] === 'saved' && ' · saved'}
              {activeTab === i && saveStatus[i] === 'error' && ' · save failed'}
            </div>
            {p.program}
          </button>
        ))}
        {addingTab ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px', background: '#fff', borderRadius: '6px 6px 0 0', border: '1px dashed #aaa', borderBottom: 'none' }}>
            <select value={newTab.year} onChange={(e) => setNewTab((t) => ({ ...t, year: e.target.value }))}
              style={{ fontSize: 11, border: '1px solid #ccc', borderRadius: 4, padding: '2px 6px' }}>
              {ACADEMIC_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={newTab.program} onChange={(e) => setNewTab((t) => ({ ...t, program: e.target.value }))}
              style={{ fontSize: 11, border: '1px solid #ccc', borderRadius: 4, padding: '2px 6px', minWidth: 200 }}>
              <option value="">— select program —</option>
              {PROGRAM_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={addProgram} style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer', background: '#2c7a7b', color: '#fff', border: 'none', borderRadius: 4 }}>Add</button>
            <button onClick={() => setAddingTab(false)} style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer', background: 'none', border: '1px solid #ccc', borderRadius: 4 }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setAddingTab(true)} title="Add program tab"
            style={{ padding: '4px 10px', fontSize: 18, fontWeight: 700, cursor: 'pointer', border: '1px dashed #aaa', borderBottom: 'none', borderRadius: '6px 6px 0 0', background: '#eee', color: '#555' }}>+</button>
        )}
      </div>
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #ddd', borderTop: 'none' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              {COLS.map((c) => (
                <th key={c.key} style={{ padding: '6px 8px', border: '1px solid #ddd', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap', minWidth: c.width, textAlign: 'center' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabRows.map((row, ri) => (
              <tr key={ri}>
                {COLS.map((c) => {
                  const val = row[c.key] ?? ''
                  const attendStyle = c.type === 'attendance' ? (ATTEND_STYLE[val.toUpperCase()] || {}) : {}
                  return (
                    <td key={c.key} style={{ border: '1px solid #ddd', padding: 2, verticalAlign: 'middle', textAlign: 'center', ...attendStyle }}>
                      {c.readOnly ? (
                        <div style={{ padding: '4px 2px', fontWeight: 600 }}>{val}</div>
                      ) : c.type === 'date' ? (
                        <input type="date" value={val} onChange={(e) => update(ri, c.key, e.target.value)}
                          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 12, background: 'transparent', padding: '2px 4px', width: '100%', cursor: 'pointer' }} />
                      ) : c.type === 'uniform' ? (
                        <select value={val} onChange={(e) => update(ri, c.key, e.target.value)}
                          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 12, background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'center' }}>
                          <option value=""></option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                          <option value="Borrowed">Borrowed</option>
                        </select>
                      ) : c.type === 'attendance' ? (
                        <select value={val} onChange={(e) => update(ri, c.key, e.target.value)}
                          style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'center', ...attendStyle }}>
                          <option value=""></option>
                          <option value="P">P</option>
                          <option value="L">L</option>
                          <option value="A">A</option>
                        </select>
                      ) : (
                        <textarea value={val} onChange={(e) => update(ri, c.key, e.target.value)}
                          style={{ width: '100%', minWidth: c.width - 4, border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 12, background: 'transparent', padding: '2px 4px', minHeight: 40, textAlign: 'left' }}
                          rows={Math.max(2, val.split('\n').length)} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 12px', background: '#fff', border: '1px solid #ddd', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
        <button onClick={addRow} style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #555', background: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

// ── Student list view ──────────────────────────────────────────────────────

function StudentList({ onSelect, onAdd, onDelete }) {
  const { records } = useStore()
  const [search, setSearch] = useState('')

  const filtered = records
    .filter(r => {
      const name = `${r.student.firstName} ${r.student.lastName}`.toLowerCase()
      return name.includes(search.toLowerCase())
    })
    .sort((a, b) => {
      const opts = { sensitivity: 'base' }
      const first = (a.student.firstName || '').localeCompare(b.student.firstName || '', undefined, opts)
      return first !== 0 ? first : (a.student.lastName || '').localeCompare(b.student.lastName || '', undefined, opts)
    })

  const getLogin = (r) => usernameFor(r.student.firstName, r.student.lastName) || '—'

  const getClasses = (r) =>
    Array.from(new Set((r.programs || []).map(p => p.program).filter(Boolean))).join(', ') || '—'

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h2 className="page-title" style={{ marginBottom: 0 }}>Students</h2>
        <button
          onClick={onAdd}
          style={{
            background: 'var(--logo-teal)', color: '#fff', border: 'none',
            padding: '7px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >+ Add Student</button>
      </div>

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--logo-teal)', borderRadius: '10px 10px 0 0', padding: '14px 20px', marginTop: 14,
      }}>
        <svg width="18" height="18" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search students…"
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: 14, color: '#fff', fontFamily: 'inherit', letterSpacing: '.2px',
          }}
        />
        <style>{`input::placeholder { color: rgba(255,255,255,0.6); }`}</style>
      </div>

      {/* Table */}
      <div style={{ border: '2px solid var(--logo-teal)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: '#fff' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.6fr 1.2fr 0.8fr 2fr 40px',
          background: '#3d8e90', padding: '11px 20px',
          borderBottom: '1px solid rgba(255,255,255,.15)',
        }}>
          {['Name', 'Login', 'Grade', 'Medical', 'Crania Cash', 'Classes', ''].map(h => (
            <div key={h} style={{ color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: '.2px' }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, fontStyle: 'italic' }}>
            No students found.
          </div>
        ) : (
          filtered.map((r, i) => (
            <div key={r.id} onClick={() => onSelect(r.id)} style={{
              display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.6fr 1.2fr 0.8fr 2fr 40px',
              padding: '13px 20px', alignItems: 'center',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
              background: i % 2 === 0 ? '#fff' : '#fafbfb',
              cursor: 'pointer',
            }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.student.firstName} {r.student.lastName}</div>
              <div style={{ fontSize: 13, color: 'var(--logo-teal)' }}>{getLogin(r)}</div>
              <div style={{ fontSize: 13 }}>{r.student.grade || '—'}</div>
              <div style={{ fontSize: 12, fontWeight: r.student.medical ? 600 : 400, color: r.student.medical ? '#c62828' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.student.medical || '—'}
              </div>
              <div style={{ fontSize: 13 }}>{r.student.craniaCash ?? '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getClasses(r)}
              </div>
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(r) }}
                  title="Delete student"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4 }}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Student detail view ────────────────────────────────────────────────────

function StudentDetail({ recordId, onBack, onNavigate, onDelete }) {
  const { records, updateStudentField } = useStore()
  const API_BASE = import.meta.env?.VITE_API_URL || ''
  const record = records.find(r => r.id === recordId) || records[0]
  const s = record.student
  const [studentFields, setStudentFields] = useState(s)
  const [notes, setNotes] = useState(s.notes.join('\n'))
  const [generatedPw, setGeneratedPw] = useState(null)
  const [copied, setCopied] = useState(false)
  const saveTimer = useRef(null)

  const handleGenerate = () => {
    const pw = generatePassword(studentFields.firstName, studentFields.lastName)
    setGeneratedPw(pw)
    setCopied(false)
  }

  const handleCopy = () => {
    if (!generatedPw) return
    navigator.clipboard.writeText(generatedPw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const updateField = (key, val) => {
    const updated = { ...studentFields, [key]: val }
    setStudentFields(updated)
    updateStudentField(record.id, key, val)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/api/registrations/${record.id}/student`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ [key]: val }),
      }).catch(() => {})
    }, 600)
  }

  useEffect(() => {
    setStudentFields(s)
    setNotes(s.notes.join('\n'))
    setGeneratedPw(null)
    setCopied(false)
  }, [recordId])

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      {/* Back button */}
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--logo-teal)', fontWeight: 700, fontSize: 14,
        marginBottom: 12, padding: 0,
      }}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        All Students
      </button>

      <div className="page-head" style={{ marginBottom: 20 }}>
        <h2 className="page-title" style={{ marginBottom: 0, marginTop: 0 }}>
          {studentFields.firstName} {studentFields.lastName}
        </h2>
        <button
          onClick={() => onDelete(record)}
          style={{
            background: 'transparent', color: '#c62828', border: '1px solid #c62828',
            padding: '6px 12px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
          }}
        >Delete Student</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 1.1fr 1fr 0.7fr', gap: 20 }}>
        {/* Student info */}
        <div>
          <div className="panel-teal-head">Student</div>
          <SField label="First Name" value={studentFields.firstName} onChange={v => updateField('firstName', v)} />
          <SField label="Last Name" value={studentFields.lastName} onChange={v => updateField('lastName', v)} />
          <SField label="Gender" value={studentFields.gender} onChange={v => updateField('gender', v)} />
          <SField label="DOB" value={studentFields.dob} onChange={v => updateField('dob', v)} />
          <SField label="Current Age" value={studentFields.age} readOnly />
          <SField label="Email" value={studentFields.email} variant="highlight" onChange={v => updateField('email', v)} />
          <SField label="Current Grade" value={studentFields.grade} onChange={v => updateField('grade', v)} />
          <SField label="School" value={studentFields.school} onChange={v => updateField('school', v)} />
          <SField label="Report Card" value="link" variant="link" />
          <SField label="Medical Conditions" value={studentFields.medical} variant={studentFields.medical ? 'danger' : undefined} onChange={v => updateField('medical', v)} />
        </div>

        {/* Notes */}
        <div>
          <div className="panel-teal-head">NOTES</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              width: '100%', minHeight: 360, padding: '16px 18px', borderRadius: 16,
              background: '#eef0f1', border: 'none', fontFamily: 'inherit', fontSize: 14,
              color: '#3a4654', resize: 'vertical', outline: 'none',
            }}
          />
        </div>

        {/* Assessments */}
        <div>
          <div className="panel-teal-head">Assessments</div>
          {studentFields.assessments.length === 0 && (
            <div className="muted small" style={{ padding: '4px 2px' }}>No assessments yet.</div>
          )}
          {studentFields.assessments.map((a, i) => (
            <div key={i} className="field-row" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
              <div className="field-val" style={{ fontWeight: 700, fontSize: 12 }}>{a.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
                <div className="field-val small">{a.date}</div>
                <div className="field-val" style={{ fontWeight: 700 }}>{a.score}</div>
              </div>
            </div>
          ))}
          <div className="red-text small mt8" style={{ cursor: 'pointer' }}>Link to files:</div>
        </div>

        {/* Login */}
        <div>
          <div className="panel-teal-head">Login</div>
          <div className="field-row">
            <label>Username:</label>
            <div className="field-val">
              {usernameFor(studentFields.firstName, studentFields.lastName) || '—'}
            </div>
          </div>
          <div className="field-row">
            <label>Password:</label>
            {generatedPw ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="field-val" style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>{generatedPw}</div>
                <button className="btn ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={handleCopy}>
                  {copied ? '✓' : 'copy'}
                </button>
              </div>
            ) : (
              <button className="btn ghost red-text" style={{ background: '#f3eded' }} onClick={handleGenerate}>generate</button>
            )}
          </div>
        </div>

        {/* Crania Cash */}
        <div>
          <div className="panel-teal-head">Crania Cash</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 46, fontWeight: 800, color: '#2c7a7b', cursor: 'pointer' }}
              onClick={() => onNavigate('Crania Cash')}>
              {studentFields.craniaCash}
            </div>
            <div className="red-text small" style={{ cursor: 'pointer', marginTop: 6 }}
              onClick={() => onNavigate('Crania Cash')}>Manage</div>
          </div>
        </div>
      </div>

      <CommentsSection studentId={record.id} initialPrograms={record.programs || []} />
    </div>
  )
}

// ── Root: switches between list and detail ─────────────────────────────────

export default function Students({ onNavigate, initialRecordId, onConsumeInitialRecord }) {
  const { select, addRegistration, deleteRegistration } = useStore()
  const [detailId, setDetailId] = useState(null)

  const handleSelect = (id) => {
    select(id)
    setDetailId(id)
  }

  // Opened via onNavigate('Students', recordId) from another page (e.g.
  // Emergency Contacts) — jump straight to that student's detail view.
  useEffect(() => {
    if (initialRecordId) {
      handleSelect(initialRecordId)
      onConsumeInitialRecord && onConsumeInitialRecord()
    }
  }, [initialRecordId])

  const handleAdd = async () => {
    try {
      const id = await addRegistration({ studentFirstName: 'New', studentLastName: 'Student', forceNew: true })
      if (id) setDetailId(id)
    } catch (err) {
      alert('Could not add student: ' + err.message)
    }
  }

  const handleDelete = async (record) => {
    const name = `${record.student?.firstName || ''} ${record.student?.lastName || ''}`.trim() || 'this student'
    if (!confirm(`Delete ${name}? This also removes their linked customer/guardian info. This can't be undone.`)) return
    try {
      await deleteRegistration(record.id)
      if (detailId === record.id) setDetailId(null)
    } catch (err) {
      alert('Could not delete: ' + err.message)
    }
  }

  if (detailId) {
    return <StudentDetail recordId={detailId} onBack={() => setDetailId(null)} onNavigate={onNavigate}
      onDelete={handleDelete} />
  }

  return <StudentList onSelect={handleSelect} onAdd={handleAdd} onDelete={handleDelete} />
}
