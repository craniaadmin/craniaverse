import fs from 'fs'
import { generateFeeSchedulePdf } from './server/pdf-fee-schedule.js'
// A late start: September skipped, October pro-rated.
const months = ['sep','oct','nov','dec','jan','feb','mar','apr','may','jun']
const inst = months.map((mo, k) => k === 0
  ? { month: mo, kind: 'skip', amount: 0 }
  : { month: mo, kind: k === 1 ? 'prorated' : 'full', amount: k === 1 ? 231.43 : 270 })
const buf = await generateFeeSchedulePdf({
  studentName: 'Mina Okafor', programName: 'TEKNOKIDS CODING: JAVASCRIPT/AI',
  yearLabel: '2026–27', yearStart: 2026, weeksPerYear: 35,
  firstLesson: 5, scheduledWeeks: 31,
  tuition: 2391.43, regFee: 79, matFee: 59, total: 2529.43,
  installments: inst,
})
fs.writeFileSync('scratch-fee.pdf', buf)
console.log('bytes', buf.length)
