// Tuition maths — shared by Financial → Tuition Schedules and by the fee
// panel on Customers, so a parent is quoted the same figure wherever it is
// read from.
//
// The year is ten billable months holding thirty-five lessons, modelled as
// a flat 3.5 lessons per month. That is deliberately NOT the real break
// calendar: a uniform month is what the Customers template bills on, and
// the two only diverge for a student starting mid-year — which is exactly
// when an invoice must not be ambiguous. Starting at lesson 5 lands in
// October and bills 3 of that month's 3.5 lessons, rather than skipping
// September and charging October in full.
//
// Discount is either a percentage off the monthly rate, or a flat amount
// taken off the first billed month only.

export const MONTH_KEYS = ['REG', 'MAT', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL']

// The single letter shown above each payment square.
export const MONTH_LETTER = {
  REG: 'REG', MAT: 'MAT', AUG: 'A', SEP: 'S', OCT: 'O', NOV: 'N', DEC: 'D',
  JAN: 'J', FEB: 'F', MAR: 'M', APR: 'A', MAY: 'M', JUN: 'J', JUL: 'J',
}

// The ten billed months, in order, as they map onto the squares above.
export const INSTALLMENT_MONTHS = ['September', 'October', 'November', 'December',
  'January', 'February', 'March', 'April', 'May', 'June']

export const TOTAL_LESSONS = 35
export const BILLED_MONTHS = 10
const LESSONS_PER_MONTH = TOTAL_LESSONS / BILLED_MONTHS   // 3.5

export const SCHEDULE_UNITS = ['One-Time', 'Monthly', 'Every 3 Months']

const num = (v, fallback = 0) => {
  if (v === '' || v == null) return fallback
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

/* Everything derivable about one program's money. `program` is a
   registration's program entry: { schedule, months{}, feeCalc{} }. */
export function feeEngine(program) {
  const pr = program || {}
  const fc = pr.feeCalc || { firstLesson: 1, monthlyFee: 0, regFee: 0, matFee: 0, discount: 0, discountType: '%' }
  const unit = pr.schedule || 'Monthly'
  const first = Math.min(TOTAL_LESSONS, Math.max(1, num(fc.firstLesson, 1)))
  const feeIn = num(fc.monthlyFee)
  const disc = Math.max(0, num(fc.discount))
  const regFee = num(fc.regFee)
  const matFee = num(fc.matFee)

  // A percentage cuts the rate every month; a flat amount comes off month one.
  const monthly = fc.discountType === '$' ? feeIn : feeIn * (1 - Math.min(100, disc) / 100)
  const firstDisc = fc.discountType === '$' ? disc : 0

  const lessons = TOTAL_LESSONS - first + 1
  const mIdx = Math.min(BILLED_MONTHS - 1, Math.floor((first - 1) / LESSONS_PER_MONTH))
  const lessonsFirstMonth = (mIdx + 1) * LESSONS_PER_MONTH - (first - 1)

  const monthAmt = (k) => k < mIdx
    ? 0
    : (k === mIdx
      ? Math.max(0, monthly * lessonsFirstMonth / LESSONS_PER_MONTH - firstDisc)
      : monthly)

  let lessonFees = 0
  for (let k = 0; k < BILLED_MONTHS; k++) lessonFees += monthAmt(k)
  const total = lessonFees + regFee + matFee

  /* What actually falls due in month k. One-Time puts the whole year on the
     first billed month; Every 3 Months rolls each quarter onto its opener. */
  const monthFee = (k) => {
    if (k < mIdx) return null
    if (unit === 'One-Time') return k === mIdx ? lessonFees : 0
    if (unit === 'Every 3 Months') {
      const t = Math.floor(k / 3) * 3
      const bill = Math.max(t, mIdx)
      if (k !== bill) return 0
      let sum = 0
      for (let q = Math.max(t, mIdx); q <= Math.min(t + 2, BILLED_MONTHS - 1); q++) sum += monthAmt(q)
      return sum
    }
    return monthAmt(k)
  }

  let lastInstallment = 0
  for (let k = BILLED_MONTHS - 1; k >= mIdx; k--) {
    const v = monthFee(k)
    if (v && v > 0) { lastInstallment = v; break }
  }
  const upfront = lastInstallment + regFee + matFee

  /* What a ticked square is worth. REG/MAT are their own fees; the twelve
     month squares run Aug–Jul and the ten installments sit inside them, so
     August and July are always zero. */
  const amountFor = (key) => {
    if (key === 'REG') return regFee
    if (key === 'MAT') return matFee
    const j = MONTH_KEYS.indexOf(key) - 3
    if (j < 0 || j >= BILLED_MONTHS) return 0
    const v = monthFee(j)
    return v && v > 0 ? v : 0
  }

  let paid = 0
  for (const k of MONTH_KEYS) if (pr.months && pr.months[k]) paid += amountFor(k)

  const installments = INSTALLMENT_MONTHS.map((label, k) => ({
    label, month: MONTH_KEYS[k + 3], amount: monthFee(k), skipped: k < mIdx,
  }))

  return {
    unit, first, feeIn, monthly, lessons, mIdx, lessonsFirstMonth,
    regFee, matFee, lessonFees, total, upfront, lastInstallment,
    monthFee, amountFor, paid, installments,
  }
}

/* Keep the stored totals in step with the calculator — the list view reads
   `fee`/`paid`/`payment` directly rather than recomputing per row. */
export function syncProgramMoney(program) {
  const e = feeEngine(program)
  program.fee = Math.round(e.total * 100) / 100
  program.paid = Math.round(e.paid * 100) / 100
  program.payment = (program.fee > 0 && program.paid >= program.fee - 0.005)
    ? 'Paid'
    : (program.paid > 0 ? 'Partial' : 'Unpaid')
  return program
}

export const money = (n) =>
  '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* Run the engine over a registration's program entry.

   Two shape differences from the template. Our payment squares are keyed
   lowercase and hold four states — paid / pending / overdue / empty —
   rather than a boolean, and only `paid` is money actually received.
   And `schedule` on our entries is already the class time ("Mon 4:30 pm"),
   so the billing cadence lives on `billing`. */
/* What a program costs when nobody has opened the calculator on it yet.
   Most live enrolments have no feeCalc — they were created by the public
   form, which records a rate and nothing else — so treating "no feeCalc" as
   "no money" made every one of them read as unpriced. The template does the
   same defaulting, seeding the monthly fee from the price the program is
   sold at. */
export function feeCalcFor(entry) {
  if (entry && entry.feeCalc) return entry.feeCalc
  const from = (entry && (entry.rate ?? entry.fee)) || ''
  const n = Number(String(from).replace(/[^\d.]/g, ''))
  return {
    firstLesson: 1,
    monthlyFee: Number.isFinite(n) ? n : 0,
    regFee: 79, matFee: 59, discount: 0, discountType: '%',
  }
}

export function engineForEntry(entry) {
  const fees = (entry && entry.fees) || {}
  const months = {}
  for (const k of MONTH_KEYS) {
    if (String(fees[k.toLowerCase()] || '').toLowerCase() === 'paid') months[k] = true
  }
  return feeEngine({
    schedule: (entry && entry.billing) || 'Monthly',
    months,
    feeCalc: feeCalcFor(entry),
  })
}

/* Paid / Partial / Unpaid from the money, which is the template's rule:
   compare what has been received against the total. Deciding it from the
   squares alone — "every square that is not empty says paid" — called a
   program Paid as soon as the first box was ticked. */
export function paymentStateOf(entry) {
  const e = engineForEntry(entry)
  if (e.total <= 0) return e.paid > 0 ? 'Partial' : 'Unpaid'
  if (e.paid >= e.total - 0.005) return 'Paid'
  return e.paid > 0 ? 'Partial' : 'Unpaid'
}

/* The same job as syncProgramMoney, for our entry shape — lowercase
   four-state `fees` and a separate `billing` cadence. Call it on every write
   to a program so `fee`, `paid` and `payment` stay in step with the ticked
   squares; the Customers list reads them rather than recomputing per row.

   Returns a new object; it does not mutate what it is given. */
export function syncEntryMoney(entry) {
  const e = engineForEntry(entry)
  const fee = Math.round(e.total * 100) / 100
  const paid = Math.round(e.paid * 100) / 100
  return {
    ...entry,
    fee,
    paid,
    payment: fee > 0 && paid >= fee - 0.005 ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid'),
  }
}

/* Total still owed across a set of registrations. Cancelled enrolments are
   not money anyone expects to collect, so they are left out. */
export function outstandingFor(records) {
  let owed = 0
  for (const r of (records || [])) {
    if (r.id === 'seed') continue
    for (const entry of (r.programs || [])) {
      if (String(entry.status || '').toLowerCase() === 'cancelled') continue
      // No feeCalc is not "no money" — feeCalcFor prices it from the rate.
      const e = engineForEntry(entry)
      owed += Math.max(0, e.total - e.paid)
    }
  }
  return owed
}
