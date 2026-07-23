import fs from 'fs'
import * as m from './src/data/scheduleUtils.js'

const cal = JSON.parse(fs.readFileSync('server/data/calendar-seed.json', 'utf8'))
const afterschool = cal.calendars.find(c => /afterschool/i.test(c.name))
const weekDates = m.weekDatesFromCalendarEvents(cal.events, afterschool.id)
console.log('Week 1:', weekDates[1], '| Week 14 (post winter break):', weekDates[14], '| Week 35:', weekDates[35])

const prog = { schedule: 'Wed 5:00 pm', year: '26_27' }
const rows = m.buildScheduledRows(prog, [], weekDates)
console.log('Total rows:', rows.length)
console.log('First 3:', rows.slice(0,3).map(r => r.lessonNo+' '+r.day+' '+r.date))
console.log('Around winter break (lessons 13-15):', rows.slice(12,15).map(r => r.lessonNo+' '+r.day+' '+r.date))
console.log('Last 3:', rows.slice(-3).map(r => r.lessonNo+' '+r.day+' '+r.date))
console.log('currentAcademicYear():', m.currentAcademicYear())
