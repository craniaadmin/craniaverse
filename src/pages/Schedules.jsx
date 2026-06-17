import { useState, useEffect } from 'react'

// ─── Schedule constants ───────────────────────────────────────────────────────
const JS_TO_PROG = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const CATEGORY_COLORS = {
  FLEX: '#00a0d6', ENRICHMENT: '#6aaa1e', PRIVATE: '#7a44cc',
  TEKNOKIDS: '#cc7800', PIANO: '#cc1a1a', CONTEST: '#5FA09E', CAMP: '#20bab5',
}

function categoryOf(title) {
  const t = title.toUpperCase()
  if (t.startsWith('FLEX')) return 'FLEX'
  if (t.startsWith('MATH ENRICHMENT')) return 'ENRICHMENT'
  if (t.startsWith('PRIVATE')) return 'PRIVATE'
  if (t.startsWith('TEKNOKIDS')) return 'TEKNOKIDS'
  if (t.startsWith('PIANO')) return 'PIANO'
  if (t.startsWith('CONTEST')) return 'CONTEST'
  return 'CAMP'
}

function displayName(title) {
  return title
    .replace(/ - SINGLE$/i, '').replace(/ - DOUBLE$/i, '').replace(/ - UNLIMITED$/i, '')
    .replace(/ - HALF DAY$/i, '').replace(/ - FULL DAY$/i, '')
    .replace(/^MATH ENRICHMENT - LEVEL (\d)$/i, 'ENRICHMENT L$1')
    .replace(/^PRIVATE LESSONS - 55 MIN$/i, 'PRIVATE LESSONS')
    .replace(/^PIANO PRIVATE 30MIN - /i, 'PIANO ')
    .replace(/^TEKNOKIDS CODING: /i, 'TK CODING: ')
    .replace(/^TEKNOKIDS /i, 'TK ')
    .replace(/^FLEX KINDERGARTEN$/i, 'FLEX KINDER')
}

function fmtTime(t) {
  if (!t || !String(t).includes(':')) return t || '—'
  const [h, m] = String(t).split(':')
  const hour = parseInt(h, 10)
  if (isNaN(hour)) return t || '—'
  const ampm = hour >= 12 ? 'pm' : 'am'
  const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${h12}:${m} ${ampm}`
}

function buildGrid(programs) {
  const grid = {}
  programs.filter(p => p.active).forEach(prog => {
    const label = displayName(prog.title)
    const color = CATEGORY_COLORS[categoryOf(prog.title)] || '#555'
    ;(prog.offerings || []).filter(o => o.active).forEach(o => {
      if (!grid[o.start]) grid[o.start] = {}
      if (!grid[o.start][o.day]) grid[o.start][o.day] = new Map()
      if (!grid[o.start][o.day].has(label)) grid[o.start][o.day].set(label, color)
    })
  })
  return grid
}

// ─── Calendar constants ───────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DOW_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DOW_LONG  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const PRESET_EVENT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DFE6E9', '#A29BFE', '#FD79A8', '#FDCB6E', '#6C5CE7',
]

const BUILTIN_EVENTS = {
  '2025-08-04': [{ label: 'Civic Holiday', type: 'holiday' }],
  '2025-09-01': [{ label: 'Labour Day', type: 'holiday' }],
  '2025-09-02': [{ label: 'Public Elementary PD Day', type: 'info' }],
  '2025-09-03': [{ label: 'First Day of Public School', type: 'info' }],
  '2025-09-04': [{ label: 'First Day of Day School', type: 'info' }],
  '2025-09-08': [{ label: 'First Day of Afterschool', type: 'info' }],
  '2025-09-30': [{ label: 'Truth & Reconciliation Day', type: 'holiday' }],
  '2025-10-02': [{ label: 'CMS CLMC Math Contest', type: 'contest' }],
  '2025-10-10': [{ label: 'Public Elementary PD Day', type: 'info' }],
  '2025-10-11': [{ label: 'Holiday', type: 'holiday' }],
  '2025-10-13': [{ label: 'Thanksgiving Day', type: 'holiday' }],
  '2025-10-14': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2025-10-15': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2025-10-16': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2025-10-30': [{ label: 'CMS COMC Math Contest', type: 'contest' }],
  '2025-11-05': [{ label: 'AMC 10/12 A', type: 'contest' }],
  '2025-11-12': [{ label: 'UW CEMC BCC+CIMC', type: 'contest' }],
  '2025-11-13': [{ label: 'AMC 10/12 B', type: 'contest' }],
  '2025-11-17': [{ label: 'UW CEMC BCC + PD Day', type: 'contest' }],
  '2025-11-20': [{ label: 'CMS CJMC Contest', type: 'contest' }],
  '2025-12-06': [{ label: 'Christmas Piano Recital 6pm', type: 'event' }],
  '2025-12-22': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-23': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-24': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-25': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-26': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-27': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-28': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-29': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-30': [{ label: 'Christmas Break', type: 'holiday' }],
  '2025-12-31': [{ label: 'Christmas Break', type: 'holiday' }],
  '2026-01-01': [{ label: 'Christmas Break', type: 'holiday' }],
  '2026-01-02': [{ label: 'Christmas Break', type: 'holiday' }],
  '2026-01-03': [{ label: 'Christmas Break', type: 'holiday' }],
  '2026-01-16': [{ label: 'PD Day', type: 'info' }],
  '2026-01-22': [{ label: 'AMC 8 Contest', type: 'contest' }],
  '2026-02-05': [{ label: 'AIME I', type: 'contest' }],
  '2026-02-11': [{ label: 'AIME II (tentative)', type: 'contest' }],
  '2026-02-14': [{ label: 'Holiday', type: 'holiday' }],
  '2026-02-16': [{ label: 'Family Day', type: 'holiday' }],
  '2026-02-17': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2026-02-18': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2026-02-19': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2026-02-25': [{ label: 'UW CEMC PCF Contest', type: 'contest' }],
  '2026-03-16': [{ label: 'March Break', type: 'holiday' }],
  '2026-03-17': [{ label: 'March Break', type: 'holiday' }],
  '2026-03-18': [{ label: 'March Break', type: 'holiday' }],
  '2026-03-19': [{ label: 'March Break', type: 'holiday' }],
  '2026-03-20': [{ label: 'March Break', type: 'holiday' }],
  '2026-03-21': [{ label: 'March Break / USAMO', type: 'holiday' }],
  '2026-03-22': [{ label: 'USAJMO Contest', type: 'contest' }],
  '2026-04-01': [{ label: 'UW CEMC FGH Math Contest', type: 'contest' }],
  '2026-04-03': [{ label: 'Good Friday', type: 'holiday' }],
  '2026-04-06': [{ label: 'Easter Monday', type: 'holiday' }],
  '2026-04-24': [{ label: 'Public Elementary PD Day', type: 'info' }],
  '2026-05-13': [{ label: 'UW CEMC Gauss Contest', type: 'contest' }],
  '2026-05-16': [{ label: 'Holiday', type: 'holiday' }],
  '2026-05-18': [{ label: 'Victoria Day', type: 'holiday' }],
  '2026-05-19': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2026-05-20': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2026-05-21': [{ label: 'Afterschool Holiday', type: 'holiday' }],
  '2026-05-29': [{ label: 'Public Elementary PD Day', type: 'info' }],
  '2026-06-06': [{ label: 'Spring Piano Recital 6pm', type: 'event' }],
  '2026-06-19': [{ label: 'Last Day of Day School', type: 'info' }],
  '2026-06-20': [{ label: 'Last Day of Afterschool', type: 'info' }],
  '2026-06-25': [{ label: 'Last Day of Public School', type: 'info' }],
  '2026-07-06': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-07': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-08': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-09': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-10': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-13': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-14': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-15': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-16': [{ label: 'Summer Camp', type: 'camp' }],
  '2026-07-17': [{ label: 'Summer Camp', type: 'camp' }],
}

const EV = {
  holiday: { color: '#c0392b', light: '#fdecea' },
  contest: { color: '#5FA09E', light: '#edf6f6' },
  event:   { color: '#cc7800', light: '#fdf5e6' },
  info:    { color: '#6b7a8d', light: '#f4f5f7' },
  camp:    { color: '#20bab5', light: '#e8fafa' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dateKey(d) {
  if (!d || isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonday(d) {
  const nd = new Date(d)
  const dow = (nd.getDay() + 6) % 7
  nd.setDate(nd.getDate() - dow)
  nd.setHours(0, 0, 0, 0)
  return nd
}

function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDate = new Date(year, month + 1, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7

  const days = []
  for (let i = startDow; i > 0; i--) days.push({ date: new Date(year, month, 1 - i), current: false })
  for (let d = 1; d <= lastDate; d++) days.push({ date: new Date(year, month, d), current: true })
  const rem = (7 - (days.length % 7)) % 7
  for (let i = 1; i <= rem; i++) days.push({ date: new Date(year, month + 1, i), current: false })

  const weeks = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

const NAV_BTN = {
  background: 'none', border: '1px solid var(--line)', borderRadius: 6,
  padding: '5px 13px', cursor: 'pointer', fontSize: 17,
  color: '#5FA09E', fontWeight: 700, lineHeight: 1,
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Schedules() {
  const today = new Date()
  const todayKey = dateKey(today)

  const [view, setView] = useState('month')
  const [viewDate, setViewDate] = useState(new Date(today))
  const [location, setLocation] = useState('Boardwalk')
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [customEvents, setCustomEvents] = useState(() => {
    const saved = localStorage.getItem('crania_custom_events')
    try {
      return saved ? JSON.parse(saved) : []
    } catch (e) {
      console.error('Failed to load custom events:', e)
      return []
    }
  })
  const [showEventForm, setShowEventForm] = useState(false)
  const [formDate, setFormDate] = useState(dateKey(today))
  const [formLabel, setFormLabel] = useState('')
  const [formColor, setFormColor] = useState(PRESET_EVENT_COLORS[0])
  const [formCategory, setFormCategory] = useState('event')
  const [formLocation, setFormLocation] = useState('Boardwalk')
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    localStorage.setItem('crania_custom_events', JSON.stringify(customEvents))
  }, [customEvents])

  useEffect(() => {
    fetch('/api/programs')
      .then(r => r.json())
      .then(data => { setPrograms(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function prev() {
    setViewDate(d => {
      const nd = new Date(d)
      if (view === 'month') nd.setMonth(nd.getMonth() - 1)
      else nd.setDate(nd.getDate() - (view === 'week' ? 7 : 1))
      return nd
    })
  }
  function next() {
    setViewDate(d => {
      const nd = new Date(d)
      if (view === 'month') nd.setMonth(nd.getMonth() + 1)
      else nd.setDate(nd.getDate() + (view === 'week' ? 7 : 1))
      return nd
    })
  }

  function addEvent() {
    if (!formLabel.trim() || !formDate) return
    setCustomEvents([...customEvents, { id: Date.now(), date: formDate, label: formLabel, color: formColor, category: formCategory, location: formLocation }])
    setFormLabel('')
    setFormDate(dateKey(today))
    setFormCategory('event')
    setFormLocation('Boardwalk')
    setShowEventForm(false)
  }

  function deleteEvent(id) {
    if (!window.confirm('Delete this event?')) return
    setCustomEvents(customEvents.filter(e => e.id !== id))
    setSelectedEvent(null)
  }

  function getAllEvents(date, filterLocation = null) {
    const key = dateKey(date)
    if (!key) return []
    const builtin = BUILTIN_EVENTS[key] || []
    const custom = customEvents
      .filter(e => e.date === key && (!filterLocation || e.location === filterLocation))
      .map(e => ({ label: e.label, type: 'custom', color: e.color, category: e.category, id: e.id }))
    return [...builtin, ...custom]
  }

  // Derived values
  const filtered = programs.filter(p => p.location === location)
  const grid = buildGrid(filtered)
  const times = Object.keys(grid).sort()

  const weeks = buildCalendar(viewDate.getFullYear(), viewDate.getMonth())
  const monday = getMonday(viewDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime())
    d.setDate(d.getDate() + i)
    return d
  })

  const dayProgDay = JS_TO_PROG[viewDate.getDay()]
  const dayTimes = times.filter(t => grid[t]?.[dayProgDay])
  const dayEvents = getAllEvents(viewDate, location)

  // Navigation labels
  const navLabel = (() => {
    if (view === 'month') return `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`
    if (view === 'week') {
      const sun = weekDays[6]
      const m1 = MONTH_NAMES[weekDays[0].getMonth()].slice(0, 3)
      const m2 = MONTH_NAMES[sun.getMonth()].slice(0, 3)
      return weekDays[0].getMonth() !== sun.getMonth()
        ? `${m1} ${weekDays[0].getDate()} – ${m2} ${sun.getDate()}, ${weekDays[0].getFullYear()}`
        : `${m1} ${weekDays[0].getDate()} – ${sun.getDate()}, ${weekDays[0].getFullYear()}`
    }
    return `${DOW_LONG[(viewDate.getDay() + 6) % 7]}, ${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getDate()}`
  })()

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Calendar</h2>
      </div>

      {/* ── Location Selector (Top) ── */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f7f9', borderRadius: 8, border: '2px solid #5FA09E' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5FA09E', marginBottom: 8, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Location</div>
        <div className="seg" style={{ background: '#fff' }}>
          {['Boardwalk', 'Waterloo East'].map(loc => (
            <button key={loc} className={location === loc ? 'active' : ''} onClick={() => setLocation(loc)} style={{ fontSize: 16, fontWeight: 700, padding: '10px 18px' }}>{loc}</button>
          ))}
        </div>
      </div>

      {/* ── Top control bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        {/* Left: nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prev} style={NAV_BTN}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#2E2516', minWidth: 200, textAlign: 'center' }}>{navLabel}</span>
          <button onClick={next} style={NAV_BTN}>›</button>
          <button onClick={() => setViewDate(new Date(today))} style={{ ...NAV_BTN, fontSize: 12, padding: '5px 12px' }}>Today</button>
        </div>
        {/* Right: controls */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg">
            {['month', 'week', 'day'].map(v => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => { setShowEventForm(!showEventForm); setFormDate(dateKey(viewDate)); setFormLocation(location) }} style={{ ...NAV_BTN, fontSize: 13, padding: '5px 14px' }}>
            {showEventForm ? 'Done' : '+Event'}
          </button>
        </div>
      </div>

      {/* ── Event Form ── */}
      {showEventForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16, background: '#f9fafb', borderLeft: `4px solid ${formColor}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'start' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#5b6573', display: 'block', marginBottom: 6 }}>Date</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#5b6573', display: 'block', marginBottom: 6 }}>Title</label>
              <input type="text" placeholder="Event name" value={formLabel} onChange={e => setFormLabel(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#5b6573', display: 'block', marginBottom: 6 }}>Category</label>
              <select value={formCategory} onChange={e => setFormCategory(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 4 }}>
                <option value="event">Event</option>
                <option value="reminder">Reminder</option>
                <option value="deadline">Deadline</option>
                <option value="closure">Closure</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#5b6573', display: 'block', marginBottom: 6 }}>Location</label>
              <select value={formLocation} onChange={e => setFormLocation(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 4 }}>
                <option value="Boardwalk">Boardwalk</option>
                <option value="Waterloo East">Waterloo East</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#5b6573', display: 'block', marginBottom: 6 }}>Color</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRESET_EVENT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    style={{
                      width: 36, height: 36, borderRadius: 6,
                      background: c, border: formColor === c ? '3px solid #333' : '2px solid #ddd',
                      cursor: 'pointer', padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={addEvent}
              style={{
                padding: '8px 16px', background: '#5FA09E', color: '#fff',
                border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 13,
                cursor: 'pointer', alignSelf: 'flex-end',
              }}
            >
              Add Event
            </button>
          </div>
        </div>
      )}

      {/* ── Event Detail Modal ── */}
      {selectedEvent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 16
        }}>
          <div className="card" style={{ maxWidth: 400, width: '100%', padding: 20, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: 12, marginBottom: 16 }}>
              <span style={{ width: 16, height: 16, background: selectedEvent.color, borderRadius: 3, flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700, color: '#2E2516' }}>
                  {selectedEvent.label}
                </h3>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                  <div><strong>Date:</strong> {new Date(selectedEvent.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                  <div><strong>Location:</strong> {selectedEvent.location}</div>
                  <div><strong>Category:</strong> {selectedEvent.category}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  padding: '8px 14px', background: '#f0f0f0', color: '#666', border: 'none',
                  borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600
                }}
              >
                Close
              </button>
              <button
                onClick={() => deleteEvent(selectedEvent.id)}
                style={{
                  padding: '8px 14px', background: '#ff4444', color: '#fff', border: 'none',
                  borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600
                }}
              >
                Delete Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {view === 'month' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#A6E2F9' }}>
                {DOW_SHORT.map(d => (
                  <th key={d} style={{ padding: '8px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#2E2516', width: '14.28%', borderBottom: '2px solid #5FA09E' }}>
                    {d.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map(({ date, current }, di) => {
                    const key = dateKey(date)
                    const evs = getAllEvents(date, location)
                    const isToday = key === todayKey
                    const hasHoliday = current && evs.some(e => e.type === 'holiday')
                    return (
                      <td key={di}
                        onClick={() => { if (current) { setViewDate(new Date(date)); setView('day') } }}
                        style={{
                          border: '1px solid var(--line)', verticalAlign: 'top',
                          cursor: current ? 'pointer' : 'default',
                          background: isToday ? '#e8f6f6' : hasHoliday ? '#fdf4f4' : current ? '#fff' : '#fafbfb',
                          outline: isToday ? '2px solid #5FA09E' : 'none',
                          outlineOffset: '-2px',
                        }}>
                        <div style={{ minHeight: 72, padding: '6px 8px' }}>
                          <div style={{
                            fontSize: 13, fontWeight: isToday ? 800 : 500,
                            color: !current ? '#c8cfd8' : isToday ? '#5FA09E' : '#3a4654',
                            marginBottom: evs.length ? 4 : 0,
                          }}>
                            {date.getDate()}
                          </div>
                          {current && evs.map((ev, ei) => {
                            const style = ev.type === 'custom'
                              ? { background: ev.color, color: '#fff', borderLeft: `3px solid ${ev.color}` }
                              : { background: EV[ev.type].light, color: EV[ev.type].color, borderLeft: `3px solid ${EV[ev.type].color}` }
                            return (
                              <div key={ei} style={{
                                fontSize: 10, fontWeight: 600, ...style,
                                borderRadius: '0 3px 3px 0',
                                padding: '2px 5px', marginBottom: 2, lineHeight: 1.35,
                                position: 'relative',
                                cursor: ev.type === 'custom' ? 'pointer' : 'default',
                              }}
                                onClick={() => {
                                  if (ev.type === 'custom') {
                                    const evt = customEvents.find(e => e.id === ev.id)
                                    if (evt) setSelectedEvent(evt)
                                  }
                                }}
                                title={ev.type === 'custom' ? 'Click to view details' : ''}
                              >
                                {ev.label}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '0 16px' }}>
            {Object.entries(EV).map(([type, { color }]) => (
              <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5b6573' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── WEEK VIEW ── */}
      {view === 'week' && (
        <div>
          <div className="card" style={{ overflowX: 'auto', marginBottom: 14 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={{ width: 76, padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#5b6573', borderBottom: '2px solid #A6E2F9', background: '#fafbfb' }}>
                    TIME
                  </th>
                  {weekDays.map((day, i) => {
                    const key = dateKey(day)
                    const evs = getAllEvents(day, location)
                    const isToday = key === todayKey
                    const hasHoliday = evs.some(e => e.type === 'holiday')
                    return (
                      <th key={i}
                        onClick={() => { setViewDate(new Date(day)); setView('day') }}
                        style={{
                          padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
                          borderBottom: '2px solid #A6E2F9', borderLeft: '1px solid var(--line)',
                          background: isToday ? '#e8f6f6' : hasHoliday ? '#fdf4f4' : '#fafbfb',
                          minWidth: 100,
                        }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', marginBottom: 2, letterSpacing: '0.5px' }}>
                          {DOW_SHORT[i].toUpperCase()}
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: isToday ? '#5FA09E' : '#3a4654', marginBottom: evs.length ? 4 : 0 }}>
                          {day.getDate()}
                        </div>
                        {evs.map((ev, ei) => {
                          const style = ev.type === 'custom'
                            ? { color: '#fff', background: ev.color, borderLeft: `2px solid ${ev.color}` }
                            : { color: EV[ev.type].color, background: EV[ev.type].light, borderLeft: `2px solid ${EV[ev.type].color}` }
                          return (
                            <div key={ei} style={{
                              fontSize: 9, fontWeight: 600, ...style,
                              borderRadius: '0 2px 2px 0',
                              padding: '1px 4px', marginBottom: 1, lineHeight: 1.3,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110,
                              cursor: ev.type === 'custom' ? 'pointer' : 'default',
                            }}
                              onClick={() => {
                                if (ev.type === 'custom') {
                                  const evt = customEvents.find(e => e.id === ev.id)
                                  if (evt) setSelectedEvent(evt)
                                }
                              }}
                              title={ev.type === 'custom' ? 'Click to view details' : ''}
                            >{ev.label}</div>
                          )
                        })}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {times.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>
                      No active programs for this location.
                    </td>
                  </tr>
                ) : times.map((time, ti) => (
                  <tr key={time} style={{ background: ti % 2 === 0 ? '#fff' : '#fafbfb' }}>
                    <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#5b6573', whiteSpace: 'nowrap', verticalAlign: 'top', borderBottom: '1px solid var(--line)' }}>
                      {fmtTime(time)}
                    </td>
                    {weekDays.map((day, i) => {
                      const progDay = JS_TO_PROG[day.getDay()]
                      const entries = grid[time]?.[progDay]
                      const isToday = dateKey(day) === todayKey
                      return (
                        <td key={i} style={{
                          padding: '7px 9px', verticalAlign: 'top',
                          borderBottom: '1px solid var(--line)', borderLeft: '1px solid var(--line)',
                          background: isToday ? '#f2fafa' : undefined,
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {entries
                              ? [...entries.entries()].map(([label, color]) => (
                                  <span key={label} style={{
                                    background: color, color: '#fff', borderRadius: 4,
                                    padding: '3px 7px', fontSize: 11, fontWeight: 700,
                                    lineHeight: 1.3, display: 'inline-block',
                                  }}>{label}</span>
                                ))
                              : <span style={{ color: '#ddd', fontSize: 12 }}>—</span>
                            }
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '0 16px' }}>
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5b6573', fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── DAY VIEW ── */}
      {view === 'day' && (
        <div>
          {/* Event badges */}
          {dayEvents.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {dayEvents.map((ev, i) => {
                const style = ev.type === 'custom'
                  ? { color: ev.color, borderColor: ev.color, background: ev.color + '15' }
                  : { color: EV[ev.type].color, borderColor: EV[ev.type].color, background: EV[ev.type].light }
                return (
                  <span key={i} style={{
                    fontSize: 12, fontWeight: 600, ...style,
                    border: `1px solid`, borderRadius: 4, padding: '4px 12px',
                    cursor: ev.type === 'custom' ? 'pointer' : 'default',
                  }}
                    onClick={() => {
                      if (ev.type === 'custom') {
                        const evt = customEvents.find(e => e.id === ev.id)
                        if (evt) setSelectedEvent(evt)
                      }
                    }}
                    title={ev.type === 'custom' ? 'Click to view details' : ''}
                  >
                    {ev.label}
                  </span>
                )
              })}
            </div>
          )}

          <div className="card">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>
            ) : dayTimes.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#888', fontSize: 14 }}>
                No classes scheduled for this day.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafbfb' }}>
                    <th style={{ width: 110, padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#5b6573', borderBottom: '1px solid var(--line)' }}>TIME</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#5b6573', borderBottom: '1px solid var(--line)', borderLeft: '1px solid var(--line)' }}>CLASSES</th>
                  </tr>
                </thead>
                <tbody>
                  {dayTimes.map((time, i) => {
                    const entries = grid[time][dayProgDay]
                    return (
                      <tr key={time} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfb' }}>
                        <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#3a4654', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
                          {fmtTime(time)}
                        </td>
                        <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', borderLeft: '1px solid var(--line)' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[...entries.entries()].map(([label, color]) => (
                              <span key={label} style={{
                                background: color, color: '#fff', borderRadius: 4,
                                padding: '5px 12px', fontSize: 13, fontWeight: 700,
                                lineHeight: 1.3, display: 'inline-block',
                              }}>{label}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '0 16px' }}>
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#5b6573', fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
