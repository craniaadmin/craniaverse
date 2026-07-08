import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, X, Mail, Download } from 'lucide-react'

const API_BASE = import.meta.env?.VITE_API_URL || ''

const money = (n) =>
  '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const parseRate = (rate) => {
  if (rate == null) return 0
  const m = String(rate).replace(/[^\d.]/g, '')
  return Number(m) || 0
}

// Registration year label helpers: "26_27" <-> "2026–27"
const yearToLabel = (y) => {
  if (!y) return ''
  if (/^\d{2}_\d{2}$/.test(y)) return `20${y.slice(0, 2)}–${y.slice(3)}`
  if (/^\d{4}-\d{2}$/.test(y)) return y.replace('-', '–')
  return y
}
// Default registration/material fees. Editable in the UI.
const DEFAULT_REG_FEE = 79
const DEFAULT_MAT_FEE = 59

const MONTH_ORDER = ['sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug']
const MONTH_LABEL = { sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec', jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug' }
const MONTH_LONG  = { sep: 'September', oct: 'October', nov: 'November', dec: 'December', jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August' }
// Academic months (payment window). Sep-Jun. Jul/Aug are dashed.
const ACADEMIC = new Set(['sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun'])
// Cross-year: sep-dec belong to the first year (2026), jan-aug to the second (2027)
const CAL_YEAR = (yy) => (y) => (['sep', 'oct', 'nov', 'dec'].includes(y) ? yy : yy + 1)

// ---------- Year config ----------
// A timeline is a flat list of week-cells. Each cell is either a
// lesson (numbered 1..N), a break (with a label rendered below the
// strip), or a gap (unlabelled grey box, e.g. summer padding at the
// ends of the year).
//
// Only the sequence and the month tag of each cell matters — nothing
// depends on real calendar dates. That keeps the math simple while
// the strip still renders month-grouped.
const YEAR_CONFIGS = {
  '26_27': {
    label: '2026–27',
    startCalYear: 2026,
    weeksPerYear: 35,
    // 35 total weeks: sep 2, oct 3+Thanksgiving+1, nov 4, dec 2+Christmas,
    // jan +Christmas+3, feb 2+Family Day+2, mar 3+March Break+1, apr 4,
    // may 4+Victoria Day, jun 5.
    timeline: [
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
    ],
  },
}

// ---------- Fee math ----------
// weekly rate is derived so that a full academic month averages
// exactly `monthly`. With Sep-Jun = 10 months across 35 weeks that's
// weeksPerMonth = 3.5, and weeklyRate = monthly / 3.5.
function computeSchedule(cfg, monthly, firstLesson, regFee, matFee) {
  const timeline = cfg.timeline
  const weeksPerYear = cfg.weeksPerYear
  const academicMonthCount = MONTH_ORDER.filter(m => ACADEMIC.has(m)).length // 10
  const weeklyRate = monthly * academicMonthCount / weeksPerYear
  const scheduledWeeks = Math.max(0, weeksPerYear - (firstLesson - 1))

  // Scheduled weeks per academic month for this student = lesson cells
  // in that month with n >= firstLesson.
  const perMonthWeeks = {}
  MONTH_ORDER.forEach(m => (perMonthWeeks[m] = 0))
  for (const cell of timeline) {
    if (cell.kind === 'lesson' && cell.n >= firstLesson) perMonthWeeks[cell.month] += 1
  }

  // Also track total lesson weeks per month regardless of student — used
  // to decide "full month" vs "prorated" for the display.
  const totalMonthWeeks = {}
  MONTH_ORDER.forEach(m => (totalMonthWeeks[m] = 0))
  for (const cell of timeline) {
    if (cell.kind === 'lesson') totalMonthWeeks[cell.month] += 1
  }

  // Find first academic month with any scheduled weeks for this
  // student → that's the first paid month (potentially prorated).
  const monthsInOrder = MONTH_ORDER.filter(m => ACADEMIC.has(m))
  const firstPaidMonth = monthsInOrder.find(m => perMonthWeeks[m] > 0) || null

  let tuition = 0
  const installments = MONTH_ORDER.map(m => {
    if (!ACADEMIC.has(m) || perMonthWeeks[m] === 0) {
      return { month: m, kind: 'skip', amount: 0 }
    }
    const isPartial = perMonthWeeks[m] < totalMonthWeeks[m]
    if (isPartial) {
      const amount = weeklyRate * perMonthWeeks[m]
      tuition += amount
      return { month: m, kind: 'prorated', amount, weeks: perMonthWeeks[m] }
    }
    tuition += monthly
    return { month: m, kind: 'full', amount: monthly }
  })

  const total = tuition + regFee + matFee
  return {
    weeksPerYear, scheduledWeeks, weeklyRate,
    monthly, tuition, regFee, matFee, total,
    installments, firstPaidMonth,
  }
}

// ---------- Component ----------
export default function FeeSchedule() {
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState('')
  const [programKey, setProgramKey] = useState('')
  const [yearKey, setYearKey] = useState('26_27')
  const [firstLesson, setFirstLesson] = useState(7)
  const [monthly, setMonthly] = useState(299)
  const [regFee, setRegFee] = useState(DEFAULT_REG_FEE)
  const [matFee, setMatFee] = useState(DEFAULT_MAT_FEE)

  useEffect(() => {
    fetch(`${API_BASE}/api/registrations`)
      .then(r => r.json()).then(d => setRegs(Array.isArray(d) ? d : []))
      .catch(err => console.error('Failed to load registrations:', err))
      .finally(() => setLoading(false))
  }, [])

  const selectedReg = regs.find(r => r.id === studentId)

  // Years available for this student — union of program years + a
  // guaranteed 26_27 entry so the demo year is always pickable.
  const availableYears = useMemo(() => {
    const set = new Set(['26_27'])
    ;(selectedReg?.programs || []).forEach(p => p.year && set.add(p.year))
    return [...set].sort()
  }, [selectedReg])

  // Programs for the selected student + year.
  const programsForStudent = useMemo(() => {
    if (!selectedReg) return []
    return (selectedReg.programs || []).filter(p => p.year === yearKey)
  }, [selectedReg, yearKey])

  const selectedProgram = programsForStudent.find(p => p.program === programKey)

  // When the student changes: auto-select their newest year and first program.
  useEffect(() => {
    if (!selectedReg) return
    const years = (selectedReg.programs || []).map(p => p.year).filter(Boolean)
    const newest = years.sort().pop() || '26_27'
    setYearKey(newest)
  }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When the (student, year) combo changes: auto-pick first program +
  // pull monthly installment from its rate field.
  useEffect(() => {
    if (programsForStudent.length === 0) { setProgramKey(''); return }
    const p = programsForStudent[0]
    setProgramKey(p.program)
  }, [studentId, yearKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedProgram) return
    const parsed = parseRate(selectedProgram.rate)
    if (parsed > 0) setMonthly(parsed)
  }, [selectedProgram])

  const yearCfg = YEAR_CONFIGS[yearKey] || YEAR_CONFIGS['26_27']
  const schedule = useMemo(
    () => computeSchedule(yearCfg, monthly, firstLesson, regFee, matFee),
    [yearCfg, monthly, firstLesson, regFee, matFee],
  )

  const printPdf = () => window.print()
  const emailParent = () => {
    if (!selectedReg) return
    const parentEmail =
      selectedReg.customer?.guardian1?.Email ||
      selectedReg.customer?.guardian1?.email ||
      selectedReg.customer?.guardian2?.Email || ''
    const studentName = selectedReg.displayName || 'your child'
    const yr = yearCfg.label
    const lines = [
      `Hello,`, ``,
      `Here is the tuition schedule for ${studentName} — ${programKey} (${yr}).`, ``,
      `First Lesson: Week ${firstLesson}`,
      `Scheduled Weeks: ${schedule.scheduledWeeks} of ${schedule.weeksPerYear}`,
      `Tuition: ${money(schedule.tuition)}`,
      `Registration Fee: ${money(schedule.regFee)}`,
      `Material Fee: ${money(schedule.matFee)}`,
      `Total: ${money(schedule.total)}`, ``,
      `Monthly Installments:`,
      ...schedule.installments.map(i => {
        const monthLabel = `${MONTH_LONG[i.month]} ${CAL_YEAR(yearCfg.startCalYear)(i.month)}`
        if (i.kind === 'skip') return `  ${monthLabel} — —`
        if (i.kind === 'prorated') return `  ${monthLabel} · Prorated — ${money(i.amount)}`
        return `  ${monthLabel} — ${money(i.amount)}`
      }),
      ``,
      `Thanks,`,
      `Crania Schools`,
    ]
    const subject = `Tuition Schedule — ${studentName} ${yr}`
    const body = encodeURIComponent(lines.join('\n'))
    const to = encodeURIComponent(parentEmail)
    window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${body}`, '_blank')
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-head"><h2 className="page-title">Tuition Schedule</h2></div>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="page fs-root">
      <style>{CSS}</style>

      {/* Header */}
      <div className="fs-head no-print">
        <h2 className="fs-title">Tuition Schedule</h2>
        <div className="fs-head-actions">
          <button className="fs-btn-outline" onClick={emailParent} disabled={!selectedReg}>
            <Mail size={15} /> Email To Parent
          </button>
          <button className="fs-btn-outline" onClick={printPdf}>
            <Download size={15} /> Download PDF
          </button>
        </div>
      </div>

      {/* Pickers */}
      <div className="fs-pickers no-print">
        <StudentPicker regs={regs} value={studentId} onChange={setStudentId} />
        <SelectField value={programKey} onChange={setProgramKey} placeholder="Choose program…" disabled={!selectedReg}>
          {programsForStudent.map(p => (
            <option key={p.program} value={p.program}>{p.program}</option>
          ))}
        </SelectField>
        <SelectField value={yearKey} onChange={setYearKey}>
          {availableYears.map(y => (
            <option key={y} value={y}>{yearToLabel(y)}</option>
          ))}
        </SelectField>
      </div>

      {/* Calendar strip label row */}
      <div className="fs-strip-labels no-print">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          {schedule.weeksPerYear}-Weeks Per Year
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          Tuition Covers {schedule.weeksPerYear} Weeks · Late Starts are Pro-Rated
        </div>
      </div>

      {/* Calendar strip */}
      <CalendarStrip cfg={yearCfg} firstLesson={firstLesson} onWeekClick={setFirstLesson} />

      {/* Bottom grid: left column + monthly installments */}
      <div className="fs-grid">
        <div className="fs-left">
          <EditableRow label="First Lesson">
            <input
              type="number" min="1" max={schedule.weeksPerYear}
              value={firstLesson}
              onChange={e => setFirstLesson(Math.max(1, Math.min(schedule.weeksPerYear, Number(e.target.value) || 1)))}
              className="fs-num"
            />
          </EditableRow>
          <EditableRow label="Monthly Installment">
            <input
              type="number" min="0" step="0.01"
              value={monthly}
              onChange={e => setMonthly(Number(e.target.value) || 0)}
              className="fs-num" style={{ textAlign: 'right' }}
            />
          </EditableRow>
          <div className="fs-cal-note no-print">See Calendar For Scheduled Lesson Dates</div>
          <ReadRow label="Scheduled Weeks" value={schedule.scheduledWeeks} />
          <ReadRow label="Tuition" value={money(schedule.tuition)} />
          <EditableRow label="Registration Fee" gold>
            <input
              type="number" min="0" step="0.01"
              value={regFee}
              onChange={e => setRegFee(Number(e.target.value) || 0)}
              className="fs-num fs-num-gold" style={{ textAlign: 'right' }}
            />
          </EditableRow>
          <EditableRow label="Material Fee" gold>
            <input
              type="number" min="0" step="0.01"
              value={matFee}
              onChange={e => setMatFee(Number(e.target.value) || 0)}
              className="fs-num fs-num-gold" style={{ textAlign: 'right' }}
            />
          </EditableRow>
          <div className="fs-total">
            <span>Total</span><span>{money(schedule.total)}</span>
          </div>
        </div>

        <InstallmentsCard schedule={schedule} yearCfg={yearCfg} />
      </div>

      {/* Print-only header — matches the sample PDF */}
      <div className="print-only fs-print-block">
        <div className="fs-print-head">
          <div className="fs-print-logo">crania</div>
          <div className="fs-print-title">
            <div>Tuition Schedule</div>
            <div className="fs-print-year">{yearCfg.label}</div>
          </div>
        </div>
        <hr />
        <div className="fs-print-sub">
          <b>{selectedReg?.displayName || ''}</b> — {programKey}
          <span style={{ float: 'right' }}>
            First Week: {firstLesson} &nbsp;·&nbsp; Scheduled Weeks: {schedule.scheduledWeeks}
          </span>
        </div>
      </div>

      {selectedReg && (
        <div className="fs-selected-block no-print">
          {/* nothing extra — pickers show it */}
        </div>
      )}
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
        <select className="fs-select-raw" value="" onChange={e => onChange(e.target.value)}>
          <option value="">Choose student…</option>
          {regs.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
        </select>
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
  // Group consecutive cells by month for the top month labels.
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

  // Break labels: rendered below the strip, positioned at the break cell's index.
  const breaks = cells
    .map((c, i) => (c.kind === 'break' && c.label ? { i, label: c.label } : null))
    .filter(Boolean)

  return (
    <div className="fs-cal-wrap">
      {/* Month row */}
      <div className="fs-month-row">
        {groups.map((g, i) => (
          <div key={i} className="fs-month-label" style={{ flex: g.cells.length }}>
            {MONTH_LABEL[g.month]}
          </div>
        ))}
      </div>

      {/* Cells */}
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

      {/* Break labels */}
      <div className="fs-break-labels" style={{ position: 'relative', height: 20 }}>
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
  const calYear = CAL_YEAR(yearCfg.startCalYear)
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
.fs-root{--fs-teal:#5FA09E;--fs-blue:#B6DEF0;--fs-gold:#DEDA75;--fs-ink:#1f2733;--fs-line:#e2e5e8;
  color:var(--fs-ink);}

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

.fs-cal-wrap{margin-bottom:28px;}
.fs-month-row{display:flex;gap:2px;font-size:11px;color:var(--fs-ink);font-weight:400;margin-bottom:4px;}
.fs-month-label{padding-left:2px;}
.fs-cells{display:flex;gap:4px;}
.fs-cell{flex:1;min-width:0;height:26px;border-radius:5px;border:none;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0;}
.fs-cell-gap{background:#d9dee2;}
.fs-cell-lesson{background:var(--fs-teal);color:#fff;cursor:pointer;transition:filter .15s;}
.fs-cell-lesson:hover{filter:brightness(1.1);}
.fs-cell-past{background:#c9d8d8;color:#fff;}
.fs-break-labels{display:flex;position:relative;margin-top:2px;}
.fs-break-label{position:absolute;font-size:11px;color:var(--fs-ink);white-space:nowrap;transform:translateX(-40%);}

.fs-grid{display:grid;grid-template-columns:minmax(320px,410px) 1fr;gap:24px;align-items:start;}

.fs-left{display:flex;flex-direction:column;gap:10px;}
.fs-row{display:flex;align-items:center;justify-content:space-between;background:var(--fs-blue);border-radius:8px;padding:14px 20px;font-size:14px;font-weight:700;color:var(--fs-ink);}
.fs-row-gold{background:var(--fs-gold);}
.fs-row-label{}
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
.fs-inst-month{}
.fs-inst-prorated{font-weight:600;color:var(--fs-ink);}
.fs-inst-amt{font-weight:700;}

/* ---- print styles ---- */
.print-only{display:none;}
@media print {
  @page { size: letter portrait; margin: 20mm 18mm; }
  body { background:#fff !important; }
  .topbar, .no-print { display:none !important; }
  .page { padding: 0 !important; }
  .fs-grid { display:block; }
  .fs-inst-grid { grid-template-columns:1fr; padding:8px 10px; }
  .fs-inst-row { margin:3px 0; }
  .fs-strip-labels, .fs-cal-note { display:none; }
  .fs-cal-wrap { margin-bottom:20px; }
  .print-only { display:block; margin-bottom:20px; }
  .fs-print-head { display:flex; align-items:flex-start; justify-content:space-between; }
  .fs-print-logo { font-family:var(--serif); font-size:22px; color:var(--fs-teal); font-weight:700; }
  .fs-print-title { text-align:right; }
  .fs-print-title > div:first-child { font-size:28px; font-weight:700; }
  .fs-print-year { font-size:14px; color:#5a6470; margin-top:2px; }
  .fs-print-sub { font-size:14px; margin-top:10px; }
  hr { border:none; border-top:2px solid var(--fs-teal); margin:8px 0; }
  .fs-left { display:block; }
  .fs-row, .fs-total, .fs-inst-row { break-inside:avoid; page-break-inside:avoid; }
}
`
