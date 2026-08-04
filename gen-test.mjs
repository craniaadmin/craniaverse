import fs from 'fs'
import { generateFeeSchedulePdf } from './server/pdf-fee-schedule.js'
const inst = ['sep','oct','nov','dec','jan','feb','mar','apr','may','jun']
  .map(mo => ({ month: mo, kind: 'full', amount: 199 }))
const buf = await generateFeeSchedulePdf({
  studentName: 'Test Studentone', programName: 'FLEX MATH - SINGLE',
  yearLabel: '2026–27', yearStart: 2026, weeksPerYear: 35,
  firstLesson: 1, scheduledWeeks: 35,
  tuition: 1990, regFee: 79, matFee: 59, total: 2128,
  installments: inst,
})
fs.writeFileSync('scratch-fee.pdf', buf)
console.log('bytes', buf.length)
