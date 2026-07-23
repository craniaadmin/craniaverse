import * as m from './src/data/scheduleUtils.js'
const programs = [
  { year: '26_27', program: 'FLEX MATH - DOUBLE' },
  { year: '26_27', program: 'FLEX MATH - DOUBLE' },
  { year: '26_27', program: 'CHESS CLUB' },
]
console.log('input:', programs.length, 'output:', m.dedupeProgramTabs(programs).map(p => p.program))
