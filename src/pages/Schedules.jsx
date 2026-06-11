import { Filter, ChevronLeft, ChevronRight, Search, Plus } from 'lucide-react'
import { scheduleData } from '../data/mockData'

const DOW = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

function LocationGrid({ name, days }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="loc-tab">{name}</div>
      <div className="sched-grid">
        {DOW.map(d => <div className="col-head" key={d}>{d}</div>)}
        {days.map((events, i) => (
          <div className="sched-cell" key={i}>
            {events.map((e, j) => (
              <div className="sched-ev" key={j} style={{ background: e.color }}>{e.label}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Schedules() {
  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Schedules</h2>
        <button className="icon-btn"><Filter size={22} fill="#111418" /></button>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="cal-toolbar" style={{ borderBottom: 'none', padding: '4px 4px 14px' }}>
          <strong style={{ color: '#5b6573' }}>Teaching Schedule — CALENDAR</strong>
          <div className="seg">
            <button className="active">Month</button><button>Week</button><button>Day</button>
          </div>
          <strong style={{ color: '#3a4654' }}>June, 2025</strong>
          <div className="flex items-center" style={{ gap: 6 }}>
            <button className="icon-btn"><ChevronLeft size={18} /></button>
            <button className="icon-btn"><ChevronRight size={18} /></button>
            <button className="btn ghost" style={{ padding: '8px 14px' }}>Today</button>
            <button className="icon-btn"><Search size={18} /></button>
            <button className="icon-btn solid"><Plus size={18} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 18 }}>
          {scheduleData.locations.map(loc => (
            <LocationGrid key={loc} name={loc} days={scheduleData[loc]} />
          ))}
        </div>
      </div>
    </div>
  )
}
