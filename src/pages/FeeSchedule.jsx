import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { ChevronDown, X, Mail, Download } from 'lucide-react'
 import { feeEngine, TOTAL_LESSONS, BILLED_MONTHS } from '../data/fees'
import PageActions from '../components/PageActions'

const API_BASE = import.meta.env?.VITE_API_URL || ''

const money = (n) =>
  '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const parseNum = (v, fallback = 0) => {
  if (v === '' || v == null) return fallback
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : fallback
}
const parseRate = (rate) => parseNum(rate, 0)

// "26_27" <-> "2026–27"
const yearToLabel = (y) => {
  if (!y) return ''
  if (/^\d{2}_\d{2}$/.test(y)) return `20${y.slice(0, 2)}–${y.slice(3)}`
  if (/^\d{4}-\d{2}$/.test(y)) return y.replace('-', '–')
  return y
}
const yearToStart = (y) => {
  if (/^\d{2}_\d{2}$/.test(y)) return 2000 + Number(y.slice(0, 2))
  if (/^\d{4}-\d{2}$/.test(y)) return Number(y.slice(0, 4))
  return new Date().getFullYear()
}

const DEFAULT_REG_FEE = 79
const DEFAULT_MAT_FEE = 59

const MONTH_ORDER = ['sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug']
const MONTH_LABEL = { sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec', jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug' }
const MONTH_LONG  = { sep: 'September', oct: 'October', nov: 'November', dec: 'December', jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August' }
const ACADEMIC = new Set(['sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun'])
const calYearFn = (yy) => (m) => (['sep', 'oct', 'nov', 'dec'].includes(m) ? yy : yy + 1)

// ---------- Year timeline (35 weeks + 5 breaks) ----------
// Same academic-week layout regardless of calendar year — only the
// display year label + calendar year on installments differ.
const STANDARD_TIMELINE = [
  { kind: 'gap',    month: 'sep' }, { kind: 'gap', month: 'sep' },
  { kind: 'lesson', n: 1, month: 'sep' }, { kind: 'lesson', n: 2, month: 'sep' }, { kind: 'lesson', n: 3, month: 'sep' }, { kind: 'lesson', n: 4, month: 'sep' },
  { kind: 'gap',    month: 'oct' },
  { kind: 'lesson', n: 5, month: 'oct' }, { kind: 'lesson', n: 6, month: 'oct' }, { kind: 'lesson', n: 7, month: 'oct' },
  { kind: 'break',  month: 'oct', label: 'Thanksgiving' },
  { kind: 'lesson', n: 8, month: 'oct' }, { kind: 'lesson', n: 9, month: 'oct' }, { kind: 'lesson', n: 10, month: 'oct' }, { kind: 'lesson', n: 11, month: 'nov' },
  { kind: 'lesson', n: 12, month: 'dec' }, { kind: 'lesson', n: 13, month: 'dec' }, { kind: 'lesson', n: 14, month: 'dec' },
  { kind: 'break',  month: 'dec', label: 'Christmas Break' },
  { kind: 'break',  month: 'jan' },
  { kind: 'lesson', n: 15, month: 'jan' }, { kind: 'lesson', n: 16, month: 'jan' }, { kind: 'lesson', n: 17, month: 'jan' }, { kind: 'lesson', n: 18, month: 'feb' }, { kind: 'lesson', n: 19, month: 'feb' }, { kind: 'lesson', n: 20, month: 'feb' },
  { kind: 'break',  month: 'feb', label: 'Family Day' },
  { kind: 'lesson', n: 21, month: 'feb' },
  { kind: 'break',  month: 'mar' }, { kind: 'break', month: 'mar', label: 'March Break' },
  { kind: 'lesson', n: 22, month: 'mar' }, { kind: 'lesson', n: 23, month: 'mar' }, { kind: 'lesson', n: 24, month: 'mar' }, { kind: 'lesson', n: 25, month: 'apr' }, { kind: 'lesson', n: 26, month: 'apr' }, { kind: 'lesson', n: 27, month: 'apr' }, { kind: 'lesson', n: 28, month: 'apr' },
  { kind: 'break',  month: 'may', label: 'Victoria Day' },
  { kind: 'lesson', n: 29, month: 'may' }, { kind: 'lesson', n: 30, month: 'may' }, { kind: 'lesson', n: 31, month: 'may' }, { kind: 'lesson', n: 32, month: 'jun' }, { kind: 'lesson', n: 33, month: 'jun' }, { kind: 'lesson', n: 34, month: 'jun' }, { kind: 'lesson', n: 35, month: 'jun' },
  { kind: 'gap',    month: 'jun' },
]

const buildYearCfg = (yearKey) => ({
  key: yearKey,
  label: yearToLabel(yearKey),
  startCalYear: yearToStart(yearKey),
  weeksPerYear: 35,
  timeline: STANDARD_TIMELINE,
})

const AVAILABLE_YEARS = ['22_23', '23_24', '24_25', '25_26', '26_27', '27_28', '28_29']

// ---------- Fee math ----------
/* Billing comes from the shared engine so this page and the fee panel on
   Customers quote the same figure. It bills ten uniform months of 3.5
   lessons rather than the real break calendar below — the calendar strip
   still shows when lessons actually fall, and is how you pick a starting
   week, but a mid-year start is charged by the uniform month. The two
   models only ever disagreed for a late start, and disagreeing about an
   invoice is worse than either rule.

   The return shape is unchanged so InstallmentsCard needs no edits. */
function computeSchedule(cfg, monthly, firstLesson, regFee, matFee, discount = 0, discountType = '%') {
  const e = feeEngine({
    schedule: 'Monthly',
    months: {},
    feeCalc: { firstLesson, monthlyFee: monthly, regFee, matFee, discount, discountType },
  })

  const installments = MONTH_ORDER.map(m => {
    if (!ACADEMIC.has(m)) return { month: m, kind: 'skip', amount: 0 }
    const k = MONTH_ORDER.indexOf(m) // sep = 0 … jun = 9
    if (k < e.mIdx) return { month: m, kind: 'skip', amount: 0 }
    const amount = e.monthFee(k) || 0
    const prorated = k === e.mIdx && e.lessonsFirstMonth < TOTAL_LESSONS / BILLED_MONTHS
    return { month: m, kind: prorated ? 'prorated' : 'full', amount }
  })

  return {
    weeksPerYear: cfg.weeksPerYear,
    scheduledWeeks: e.lessons,
    weeklyRate: e.monthly / (TOTAL_LESSONS / BILLED_MONTHS),
    monthly: e.monthly,
    tuition: e.lessonFees,
    regFee: e.regFee,
    matFee: e.matFee,
    total: e.total,
    installments,
  }
}

// ---------- Component ----------
export default function FeeSchedule() {
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)

  // Selection
  const [studentId, setStudentId] = useState('')
  const [programKey, setProgramKey] = useState('')
  const [yearKey, setYearKey] = useState('26_27')

  // Editable numbers. Kept as strings while typing (so the field can
  // be blank) and coerced to numbers only when computing / persisting.
  const [firstLessonStr, setFirstLessonStr] = useState('1')
  const [monthlyStr, setMonthlyStr] = useState('289')
  const [regFeeStr, setRegFeeStr] = useState(String(DEFAULT_REG_FEE))
  const [matFeeStr, setMatFeeStr] = useState(String(DEFAULT_MAT_FEE))

  // Async status
  const [pdfBusy, setPdfBusy] = useState(false)

  const loadRegs = useCallback(() => (
    fetch(`${API_BASE}/api/registrations`)
      .then(r => r.json()).then(d => setRegs(Array.isArray(d) ? d : []))
      .catch(err => console.error('Failed to load registrations:', err))
      .finally(() => setLoading(false))
  ), [])

  useEffect(() => { loadRegs() }, [loadRegs])

  const selectedReg = regs.find(r => r.id === studentId)

  const programsForStudent = useMemo(() => {
    if (!selectedReg) return []
    return (selectedReg.programs || []).filter(p => p.year === yearKey)
  }, [selectedReg, yearKey])

  const selectedProgram = programsForStudent.find(p => p.program === programKey)

  // On student change: pick the newest year they have (or default 26_27).
  useEffect(() => {
    if (!selectedReg) return
    const years = (selectedReg.programs || []).map(p => p.year).filter(Boolean)
    const newest = [...years].sort().pop() || '26_27'
    setYearKey(newest)
  }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // On (student, year) change: auto-pick the first program.
  useEffect(() => {
    if (programsForStudent.length === 0) { setProgramKey(''); return }
    setProgramKey(programsForStudent[0].program)
  }, [studentId, yearKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // On program change: hydrate firstLesson + monthly from the saved
  // entry, or fall back to the program's advertised rate.
  useEffect(() => {
    if (!selectedProgram) return
    const savedFL = selectedProgram.firstLesson
    setFirstLessonStr(savedFL != null && savedFL !== '' ? String(savedFL) : '1')

    const savedMonthly = selectedProgram.monthlyInstallment
    if (savedMonthly != null && savedMonthly !== '') {
      setMonthlyStr(String(savedMonthly))
    } else {
      const advertised = parseRate(selectedProgram.rate)
      setMonthlyStr(advertised > 0 ? String(advertised) : '289')
    }
    setRegFeeStr(String(selectedProgram.registrationFee ?? DEFAULT_REG_FEE))
    setMatFeeStr(String(selectedProgram.materialFee ?? DEFAULT_MAT_FEE))
  }, [selectedReg?.id, yearKey, programKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Numeric coercions for math.
  const firstLesson = Math.max(1, Math.min(35, parseNum(firstLessonStr, 1)))
  const monthly = parseNum(monthlyStr, 0)
  const regFee  = parseNum(regFeeStr, 0)
  const matFee  = parseNum(matFeeStr, 0)

  const yearCfg = useMemo(() => buildYearCfg(yearKey), [yearKey])
  const schedule = useMemo(
    () => computeSchedule(yearCfg, monthly, firstLesson, regFee, matFee),
    [yearCfg, monthly, firstLesson, regFee, matFee],
  )

  // ---- Persistence: save firstLesson / monthly / fees per program ----
  // Debounced write of the FULL programs[] array back via
  // PUT /api/registrations/:id/programs (existing endpoint).
  const saveTimer = useRef(null)
  const suppressSaveRef = useRef(true) // skip the initial hydrate
  useEffect(() => {
    if (!selectedReg || !selectedProgram) return
    if (suppressSaveRef.current) { suppressSaveRef.current = false; return }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const nextPrograms = (selectedReg.programs || []).map(p => {
        if (p.year === yearKey && p.program === programKey) {
          return {
            ...p,
            firstLesson,
            monthlyInstallment: monthly,
            registrationFee: regFee,
            materialFee: matFee,
          }
        }
        return p
      })
      fetch(`${API_BASE}/api/registrations/${selectedReg.id}/programs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPrograms),
      })
        .then(r => { if (!r.ok) throw new Error('save failed') })
        .then(() => {
          // Update local regs cache so refresh isn't needed
          setRegs(prev => prev.map(r => r.id === selectedReg.id ? { ...r, programs: nextPrograms } : r))
        })
        .catch(err => console.error('Failed to save program tuition:', err))
    }, 500)
    return () => clearTimeout(saveTimer.current)
  }, [firstLesson, monthly, regFee, matFee, selectedReg?.id, programKey, yearKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the suppress flag whenever the (student, program, year) tuple
  // changes so the very next hydrate doesn't trigger a save.
  useEffect(() => { suppressSaveRef.current = true }, [selectedReg?.id, programKey, yearKey])

  // ---- Build the payload used by the server PDF renderer ----
  const buildPdfPayload = () => ({
    studentName: selectedReg?.displayName || 'Student',
    programName: programKey || '',
    yearLabel: yearCfg.label,
    yearStart: yearCfg.startCalYear,
    weeksPerYear: schedule.weeksPerYear,
    firstLesson,
    scheduledWeeks: schedule.scheduledWeeks,
    timeline: yearCfg.timeline,
    tuition: schedule.tuition,
    regFee: schedule.regFee,
    matFee: schedule.matFee,
    total: schedule.total,
    installments: schedule.installments,
    filename: `Tuition-${(selectedReg?.displayName || 'student').replace(/[^\w]+/g, '-')}-${yearCfg.label}.pdf`,
  })

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/fee-schedule/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPdfPayload()),
      })
      if (!res.ok) throw new Error('PDF request failed: ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildPdfPayload().filename
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      console.error(err)
      alert('Failed to generate PDF: ' + err.message)
    } finally { setPdfBusy(false) }
  }

  // "Email To Parent" — mailto: can't attach files, so we download the
  // PDF and then open the mail client with the parent's address, subject,
  // and a body pre-filled with the schedule summary + a reminder to
  // attach the just-downloaded PDF.
  const emailParent = async () => {
    if (!selectedReg) return
    const parentEmail =
      selectedReg.customer?.guardian1?.Email ||
      selectedReg.customer?.guardian1?.email ||
      selectedReg.customer?.guardian2?.Email ||
      selectedReg.customer?.guardian2?.email || ''
    if (!parentEmail) {
      alert('No parent email on file for this student.')
      return
    }

    // 1) Download the PDF first so the user can attach it.
    const payload = buildPdfPayload()
    let downloaded = false
    try {
      const res = await fetch(`${API_BASE}/api/fee-schedule/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('PDF request failed: ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = payload.filename
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      downloaded = true
    } catch (err) {
      console.error('PDF generation failed:', err)
      alert('Could not generate the PDF: ' + err.message + '\n\nThe email will still open, but you\'ll need to generate the PDF separately.')
    }

    // 2) Open the mail client with a body summarising the schedule.
    const studentName = selectedReg.displayName || 'your child'
    const bodyLines = [
      'Hi,',
      '',
      `Please find attached the tuition schedule for ${studentName} — ${programKey} (${yearCfg.label}).`,
      '',
      `First Lesson: Week ${firstLesson}`,
      `Scheduled Weeks: ${schedule.scheduledWeeks} of ${schedule.weeksPerYear}`,
      `Tuition: ${money(schedule.tuition)}`,
      `Registration Fee: ${money(schedule.regFee)}`,
      `Material Fee: ${money(schedule.matFee)}`,
      `Total: ${money(schedule.total)}`,
      '',
      'Thanks,',
      'Crania Schools',
    ]
    const subject = `Tuition Schedule — ${studentName} (${yearCfg.label})`
    const href = `mailto:${encodeURIComponent(parentEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\r\n'))}`
    window.location.href = href
  }

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page fs-root">
      <style>{CSS}</style>

      <div className="fs-head">
        <h2 className="fs-title">Tuition Schedule</h2>
      </div>

      <PageActions
        csvName={selectedReg && programKey
          ? `crania-tuition-${(selectedReg.displayName || 'student').replace(/[^\w]+/g, '-')}-${yearCfg.label}`
          : undefined}
        csvColumns={[
          { key: 'student', label: 'Student' },
          { key: 'program', label: 'Program' },
          { key: 'year', label: 'Year' },
          { key: 'line', label: 'Line' },
          { key: 'type', label: 'Type' },
          { key: 'amount', label: 'Amount' },
        ]}
        csvRows={() => {
          const ctx = {
            student: selectedReg?.displayName || '',
            program: programKey || '',
            year: yearCfg.label,
          }
          const calYear = calYearFn(yearCfg.startCalYear)
          const rows = schedule.installments.map(i => ({
            ...ctx,
            line: `${MONTH_LONG[i.month]} ${calYear(i.month)}`,
            type: i.kind === 'skip' ? 'Not billed' : i.kind === 'prorated' ? 'Prorated' : 'Full',
            amount: i.kind === 'skip' ? 0 : i.amount,
          }))
          rows.push({ ...ctx, line: 'Scheduled weeks', type: 'Summary', amount: schedule.scheduledWeeks })
          rows.push({ ...ctx, line: 'Tuition', type: 'Summary', amount: schedule.tuition })
          rows.push({ ...ctx, line: 'Registration fee', type: 'Summary', amount: schedule.regFee })
          rows.push({ ...ctx, line: 'Material fee', type: 'Summary', amount: schedule.matFee })
          rows.push({ ...ctx, line: 'Total', type: 'Summary', amount: schedule.total })
          return rows
        }}
        backupCollection="registrations"
        backupHint="Snapshots of the registrations these tuition figures are saved on (last 14 kept)."
        onRestored={loadRegs}
      >
        <button onClick={emailParent} disabled={!selectedReg} title="Email this schedule to the parent on file">
          <Mail size={13} /> Email To Parent
        </button>
        <button onClick={downloadPdf} disabled={pdfBusy} title="Download this schedule as a PDF">
          <Download size={13} /> {pdfBusy ? 'Generating…' : 'Download PDF'}
        </button>
      </PageActions>

      <div className="fs-pickers">
        <StudentPicker regs={regs} value={studentId} onChange={setStudentId} />
        <SelectField value={programKey} onChange={setProgramKey}
          placeholder={selectedReg ? 'Choose program…' : 'Pick a student first'}
          disabled={!selectedReg || programsForStudent.length === 0}>
          {programsForStudent.map(p => (
            <option key={p.program} value={p.program}>{p.program}</option>
          ))}
        </SelectField>
        <SelectField value={yearKey} onChange={setYearKey}>
          {AVAILABLE_YEARS.map(y => (
            <option key={y} value={y}>{yearToLabel(y)}</option>
          ))}
        </SelectField>
      </div>

      <div className="fs-strip-labels">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink, #2E2516)' }}>
          {schedule.weeksPerYear}-Weeks Per Year
        </div>
        <div style={{ fontSize: 13, color: '#5a6470' }}>
          Tuition Covers {schedule.weeksPerYear} Weeks · Late Starts are Pro-Rated
        </div>
      </div>

      <CalendarStrip cfg={yearCfg} firstLesson={firstLesson}
        onWeekClick={(n) => setFirstLessonStr(String(n))} />

      <div className="fs-grid">
        <div className="fs-left">
          <EditableRow label="First Lesson">
            <input
              type="text" inputMode="numeric"
              value={firstLessonStr}
              onChange={e => setFirstLessonStr(e.target.value.replace(/[^\d]/g, ''))}
              onBlur={e => {
                const n = parseNum(e.target.value, 1)
                setFirstLessonStr(String(Math.max(1, Math.min(35, n))))
              }}
              className="fs-num"
              placeholder="1"
            />
          </EditableRow>
          <EditableRow label="Monthly Installment">
            <input
              type="text" inputMode="decimal"
              value={monthlyStr}
              onChange={e => setMonthlyStr(e.target.value.replace(/[^\d.]/g, ''))}
              className="fs-num" style={{ textAlign: 'right' }}
              placeholder="0"
            />
          </EditableRow>
          <div className="fs-cal-note">See Calendar For Scheduled Lesson Dates</div>
          <ReadRow label="Scheduled Weeks" value={schedule.scheduledWeeks} />
          <ReadRow label="Tuition" value={money(schedule.tuition)} />
          <EditableRow label="Registration Fee" gold>
            <input
              type="text" inputMode="decimal"
              value={regFeeStr}
              onChange={e => setRegFeeStr(e.target.value.replace(/[^\d.]/g, ''))}
              className="fs-num fs-num-gold" style={{ textAlign: 'right' }}
              placeholder="0"
            />
          </EditableRow>
          <EditableRow label="Material Fee" gold>
            <input
              type="text" inputMode="decimal"
              value={matFeeStr}
              onChange={e => setMatFeeStr(e.target.value.replace(/[^\d.]/g, ''))}
              className="fs-num fs-num-gold" style={{ textAlign: 'right' }}
              placeholder="0"
            />
          </EditableRow>
          <div className="fs-total">
            <span>Total</span><span>{money(schedule.total)}</span>
          </div>
        </div>

        <InstallmentsCard schedule={schedule} yearCfg={yearCfg} />
      </div>
    </div>
  )
}

// ---------- Subcomponents ----------
function StudentPicker({ regs, value, onChange }) {
  const selected = regs.find(r => r.id === value)
  return (
    <div className="fs-picker">
      {selected ? (
        <>
          <span className="fs-picker-val">{selected.displayName}</span>
          <button className="fs-picker-x" title="Clear" onClick={() => onChange('')}><X size={13} /></button>
        </>
      ) : (
        <>
          <select className="fs-select-raw" value="" onChange={e => onChange(e.target.value)}>
            <option value="">Choose student…</option>
            {regs.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
          </select>
          <ChevronDown size={16} className="fs-picker-caret" />
        </>
      )}
    </div>
  )
}

function SelectField({ value, onChange, children, placeholder, disabled }) {
  return (
    <div className="fs-picker">
      <select className="fs-select-raw" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown size={16} className="fs-picker-caret" />
    </div>
  )
}

function CalendarStrip({ cfg, firstLesson, onWeekClick }) {
  const cells = cfg.timeline
  const groups = []
  let current = null
  cells.forEach((cell, i) => {
    if (!current || current.month !== cell.month) {
      current = { month: cell.month, start: i, cells: [cell] }
      groups.push(current)
    } else {
      current.cells.push(cell)
    }
  })
  const breaks = cells
    .map((c, i) => (c.kind === 'break' && c.label ? { i, label: c.label } : null))
    .filter(Boolean)

  return (
    <div className="fs-cal-wrap">
      <div className="fs-month-row">
        {groups.map((g, i) => (
          <div key={i} className="fs-month-label" style={{ flex: g.cells.length }}>
            {MONTH_LABEL[g.month]}
          </div>
        ))}
      </div>

      <div className="fs-cells">
        {cells.map((c, i) => {
          if (c.kind === 'lesson') {
            const isBeforeStart = c.n < firstLesson
            return (
              <button
                key={i}
                className={'fs-cell fs-cell-lesson' + (isBeforeStart ? ' fs-cell-past' : '')}
                title={`Week ${c.n} — click to set as first lesson`}
                onClick={() => onWeekClick(c.n)}
              >{c.n}</button>
            )
          }
          return <div key={i} className="fs-cell fs-cell-gap" />
        })}
      </div>

      <div className="fs-break-labels">
        {breaks.map((b, i) => (
          <div
            key={i}
            className="fs-break-label"
            style={{ left: `${(b.i / cells.length) * 100}%`, width: `${(1 / cells.length) * 100}%` }}
          >{b.label}</div>
        ))}
      </div>
    </div>
  )
}

function InstallmentsCard({ schedule, yearCfg }) {
  const calYear = calYearFn(yearCfg.startCalYear)
  return (
    <div className="fs-inst-card">
      <div className="fs-inst-head">Monthly Installments</div>
      <div className="fs-inst-grid">
        {schedule.installments.map((i, idx) => {
          const label = `${MONTH_LONG[i.month]} ${calYear(i.month)}`
          const isSkip = i.kind === 'skip'
          const isProrated = i.kind === 'prorated'
          return (
            <div key={idx} className={'fs-inst-row' + (isSkip ? ' fs-inst-skip' : '')}>
              <span className="fs-inst-month">
                {label}
                {isProrated && <span className="fs-inst-prorated"> · Prorated</span>}
              </span>
              <span className="fs-inst-amt">{isSkip ? '—' : money(i.amount)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EditableRow({ label, gold, children }) {
  return (
    <div className={'fs-row' + (gold ? ' fs-row-gold' : '')}>
      <span className="fs-row-label">{label}</span>
      <span className="fs-row-val">{children}</span>
    </div>
  )
}
function ReadRow({ label, value }) {
  return (
    <div className="fs-row">
      <span className="fs-row-label">{label}</span>
      <span className="fs-row-val fs-row-read">{value}</span>
    </div>
  )
}

// ---------- CSS ----------
const CSS = `
.fs-root{--fs-teal:#5FA09E;--fs-blue:#B6DEF0;--fs-gold:#DEDA75;--fs-ink:#2E2516;--fs-line:#e2e5e8;color:var(--fs-ink);}
.fs-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:14px;}
.fs-title{font-family:var(--serif);font-size:34px;font-weight:400;color:var(--fs-ink);margin:0;line-height:1;}
.fs-head-actions{display:flex;gap:10px;flex-wrap:wrap;}
.fs-btn-outline{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1.5px solid var(--fs-teal);color:var(--fs-teal);border-radius:8px;padding:9px 16px;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;}
.fs-btn-outline:hover{background:var(--fs-teal);color:#fff;}
.fs-btn-outline:disabled{opacity:.5;cursor:not-allowed;background:#fff;color:var(--fs-teal);}

.fs-pickers{display:grid;grid-template-columns:minmax(180px,220px) minmax(220px,1fr) minmax(140px,180px);gap:12px;margin-bottom:20px;}
.fs-picker{position:relative;background:#fff;border:1px solid #d5d0c4;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:6px;font-size:14px;}
.fs-picker-val{flex:1;color:var(--fs-ink);}
.fs-picker-x{background:none;border:none;cursor:pointer;color:#8a8f96;padding:0;display:grid;place-items:center;}
.fs-picker-x:hover{color:#c62828;}
.fs-picker-caret{position:absolute;right:12px;pointer-events:none;color:#8a8f96;}
.fs-select-raw{flex:1;border:none;outline:none;font:inherit;font-size:14px;color:var(--fs-ink);background:transparent;appearance:none;padding-right:22px;cursor:pointer;}
.fs-select-raw:disabled{color:#a3a8ad;cursor:not-allowed;}

.fs-strip-labels{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;}

.fs-cal-wrap{margin-bottom:36px;}
.fs-month-row{display:flex;gap:2px;font-size:11px;color:var(--fs-ink);font-weight:400;margin-bottom:4px;}
.fs-month-label{padding-left:2px;}
.fs-cells{display:flex;gap:4px;}
.fs-cell{flex:1;min-width:0;height:26px;border-radius:5px;border:none;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0;}
.fs-cell-gap{background:#d9dee2;}
.fs-cell-lesson{background:var(--fs-teal);color:#fff;cursor:pointer;transition:filter .15s;}
.fs-cell-lesson:hover{filter:brightness(1.1);}
.fs-cell-past{background:#c9d8d8;color:#fff;}
.fs-break-labels{position:relative;height:22px;margin-top:4px;}
.fs-break-label{position:absolute;font-size:11px;color:var(--fs-ink);white-space:nowrap;transform:translateX(-40%);}

.fs-grid{display:grid;grid-template-columns:minmax(320px,410px) 1fr;gap:24px;align-items:start;}
.fs-left{display:flex;flex-direction:column;gap:10px;}
.fs-row{display:flex;align-items:center;justify-content:space-between;background:var(--fs-blue);border-radius:8px;padding:14px 20px;font-size:14px;font-weight:700;color:var(--fs-ink);}
.fs-row-gold{background:var(--fs-gold);}
.fs-row-val{display:flex;align-items:center;font-weight:700;}
.fs-row-read{padding:2px 4px;}
.fs-num{width:110px;padding:6px 10px;border:1px solid #cfd6da;border-radius:6px;background:#fff;font:inherit;font-size:14px;font-weight:700;text-align:center;color:var(--fs-ink);}
.fs-num-gold{background:#fff;}
.fs-cal-note{color:var(--fs-teal);font-weight:700;font-size:13px;margin:6px 0 4px;}
.fs-total{display:flex;justify-content:space-between;background:var(--fs-teal);color:#fff;border-radius:8px;padding:16px 20px;font-size:16px;font-weight:800;}

.fs-inst-card{background:#fff;border-radius:12px;border:1px solid var(--fs-line);overflow:hidden;box-shadow:0 1px 3px rgba(20,30,45,.06);}
.fs-inst-head{background:var(--fs-teal);color:#fff;padding:14px 20px;font-weight:700;font-size:15px;}
.fs-inst-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:14px 12px;}
.fs-inst-row{display:flex;align-items:center;justify-content:space-between;background:var(--fs-blue);border-radius:6px;padding:10px 16px;margin:4px 6px;font-size:13.5px;font-weight:700;color:var(--fs-ink);}
.fs-inst-skip{background:#eef1f3;color:#98a1a8;font-weight:600;}
.fs-inst-prorated{font-weight:600;color:var(--fs-ink);}
.fs-inst-amt{font-weight:700;}
`
