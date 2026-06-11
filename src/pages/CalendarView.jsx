import { useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Plus, Menu, CalendarDays } from 'lucide-react'

const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const FILTERS = ['Day School', 'Afterschool', 'Personal']
const FILTER_COLOR = { 'Day School': '#7fc6e0', Afterschool: '#4caf50', Personal: '#e8814a' }

// May 2026 starts on a Friday; build a Monday-first grid
const EVENTS = {
  6: [{ t: 'Day School', l: 'Flex Math 4pm' }],
  8: [{ t: 'Afterschool', l: 'Coding Club' }],
  14: [{ t: 'Personal', l: 'Dentist' }],
  19: [{ t: 'Day School', l: 'Assessment' }, { t: 'Afterschool', l: 'Piano 5pm' }],
  22: [{ t: 'Afterschool', l: 'Gauss Club' }],
  27: [{ t: 'Day School', l: 'Parent mtg' }],
}

export default function CalendarView() {
  const [active, setActive] = useState(FILTERS)
  const toggle = (f) => setActive(a => a.includes(f) ? a.filter(x => x !== f) : [...a, f])

  // first day-of-week for May 1 2026 = Friday => Monday-first offset
  const firstOffset = 4 // Mon..Fri
  const daysInMonth = 31
  const cells = []
  for (let i = 0; i < firstOffset; i++) cells.push({ out: true, n: 27 + i })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ n: d })
  while (cells.length % 7 !== 0) cells.push({ out: true, n: cells.length - daysInMonth - firstOffset + 1 })

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Calendar</h2>
        <div className="head-actions" style={{ gap: 8 }}>
          <span className="small muted" style={{ marginRight: 4 }}>Filter by</span>
          {FILTERS.map(f => (
            <button key={f}
              onClick={() => toggle(f)}
              className="btn"
              style={{
                background: active.includes(f) ? FILTER_COLOR[f] : '#eef1f2',
                color: active.includes(f) ? '#fff' : '#5b6573',
                padding: '8px 14px',
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="cal-toolbar">
          <div className="flex items-center gap8" style={{ gap: 10 }}>
            <CalendarDays size={18} color="#5b9494" />
            <strong style={{ color: '#5b6573' }}>Crania Calendar</strong>
          </div>
          <div className="seg">
            <button className="active">Month</button><button>Week</button><button>Day</button>
          </div>
          <strong style={{ color: '#3a4654' }}>May, 2026</strong>
          <div className="flex items-center gap8" style={{ gap: 6 }}>
            <button className="icon-btn"><ChevronLeft size={18} /></button>
            <button className="icon-btn"><ChevronRight size={18} /></button>
            <button className="btn ghost" style={{ padding: '8px 14px' }}>Today</button>
            <button className="icon-btn"><Search size={18} /></button>
            <button className="icon-btn solid"><Plus size={18} /></button>
            <button className="icon-btn"><Menu size={18} /></button>
          </div>
        </div>

        <div className="cal-grid">
          {DOW.map(d => <div className="dow" key={d}>{d}</div>)}
          {cells.map((c, i) => {
            const evs = (!c.out && EVENTS[c.n]) ? EVENTS[c.n].filter(e => active.includes(e.t)) : []
            return (
              <div className={'cal-cell' + (c.out ? ' out' : '') + (c.n === 19 && !c.out ? ' today' : '')} key={i}>
                <span className="dn">{c.n}</span>
                {evs.map((e, j) => (
                  <div className="cal-event" key={j} style={{ background: FILTER_COLOR[e.t] }}>{e.l}</div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
