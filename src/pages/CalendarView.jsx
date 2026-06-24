import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Repeat, RefreshCw } from 'lucide-react'
import { RRule } from 'rrule'
import { CALENDAR_SEED } from '../data/calendarSeed'

// Three calendar streams the admin views together or in isolation.
// Each has its own palette so events read at a glance.
const CALENDARS = [
  { id: 'dayschool',   label: 'Day School',         color: '#5FA09E' },
  { id: 'afterschool', label: 'Crania Afterschool', color: '#20bab5' },
  // Logo dark-navy — keeps Personal inside the Crania palette while
  // staying clearly distinct from the two teal calendars.
  { id: 'personal',    label: 'Personal',           color: '#20304a' },
]
const CAL_BY_ID = Object.fromEntries(CALENDARS.map(c => [c.id, c]))

const DOW_LONG  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DOW_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// rrule weekday constants in Monday-first order, matching our DOW arrays.
const RRULE_WEEKDAYS = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU]

const FREQ_OPTIONS = [
  { value: 'none',   label: 'Does not repeat' },
  { value: 'DAILY',  label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY',label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Local-time YYYY-MM-DD <-> Date helpers so RRULE expansion stays on the
// admin's clock instead of drifting through UTC.
function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function buildMonth(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDate = new Date(year, month + 1, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7
  const days = []
  for (let i = startDow; i > 0; i--) days.push({ date: new Date(year, month, 1 - i), current: false })
  for (let d = 1; d <= lastDate; d++) days.push({ date: new Date(year, month, d), current: true })
  let trailing = 1
  while (days.length % 7 !== 0) {
    days.push({ date: new Date(year, month + 1, trailing++), current: false })
  }
  return days
}

function eventToRule(ev) {
  if (!ev.recurrence || ev.recurrence.freq === 'none') return null
  const start = parseLocalDate(ev.startDate)
  const opts = {
    freq: RRule[ev.recurrence.freq],
    dtstart: start,
    interval: ev.recurrence.interval || 1,
  }
  if (ev.recurrence.until) opts.until = parseLocalDate(ev.recurrence.until)
  if (ev.recurrence.byweekday?.length) {
    opts.byweekday = ev.recurrence.byweekday.map(i => RRULE_WEEKDAYS[i])
  }
  try { return new RRule(opts) } catch { return null }
}

// Expand all events into a date-keyed map for the visible month range.
function expandEventsForRange(events, rangeStart, rangeEnd) {
  const out = {}
  events.forEach(ev => {
    if (!ev.startDate) return
    const exceptions = new Set(ev.recurrence?.exdates || [])
    const rule = eventToRule(ev)
    if (rule) {
      rule.between(rangeStart, rangeEnd, true).forEach(d => {
        const k = dateKey(d)
        if (exceptions.has(k)) return
        ;(out[k] ||= []).push(ev)
      })
    } else {
      const k = ev.startDate
      const d = parseLocalDate(k)
      if (d >= rangeStart && d <= rangeEnd) {
        ;(out[k] ||= []).push(ev)
      }
    }
  })
  return out
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CalendarView() {
  const today = new Date()
  const [viewDate, setViewDate] = useState(today)
  const [activeCals, setActiveCals] = useState(CALENDARS.map(c => c.id))
  const [events, setEvents] = useState(() => {
    try {
      const raw = localStorage.getItem('crania_calendar_events')
      if (raw === null) return CALENDAR_SEED  // first visit — seed from Crania's published calendar
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : CALENDAR_SEED
    } catch { return CALENDAR_SEED }
  })
  const [editing, setEditing] = useState(null) // event being edited or null
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    localStorage.setItem('crania_calendar_events', JSON.stringify(events))
  }, [events])

  const days = useMemo(() => buildMonth(viewDate.getFullYear(), viewDate.getMonth()), [viewDate])
  const rangeStart = days[0].date
  const rangeEnd = new Date(days[days.length - 1].date); rangeEnd.setHours(23, 59, 59)

  const eventsByDay = useMemo(
    () => expandEventsForRange(events.filter(e => activeCals.includes(e.calendar)), rangeStart, rangeEnd),
    [events, activeCals, rangeStart.getTime(), rangeEnd.getTime()]
  )

  function toggleCal(id) {
    setActiveCals(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id])
  }

  function openNew(date) {
    setEditing({
      id: null,
      title: '',
      calendar: activeCals[0] || 'dayschool',
      startDate: dateKey(date || viewDate),
      time: '',
      lessonNumber: '',
      notes: '',
      recurrence: { freq: 'none', interval: 1, byweekday: [], until: '', exdates: [] },
    })
    setShowForm(true)
  }

  function openEdit(ev) {
    setEditing({ ...ev, recurrence: { ...ev.recurrence } })
    setShowForm(true)
  }

  function saveEvent() {
    if (!editing.title.trim() || !editing.startDate) return
    if (editing.id) {
      setEvents(es => es.map(e => e.id === editing.id ? editing : e))
    } else {
      setEvents(es => [...es, { ...editing, id: `ev_${Date.now()}` }])
    }
    setShowForm(false); setEditing(null)
  }

  function deleteEvent() {
    if (!editing?.id) return
    if (!window.confirm('Delete this event series?')) return
    setEvents(es => es.filter(e => e.id !== editing.id))
    setShowForm(false); setEditing(null)
  }

  function nav(delta) {
    const d = new Date(viewDate)
    d.setMonth(d.getMonth() + delta)
    setViewDate(d)
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Calendar</h2>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => {
            if (window.confirm('Reload Crania\'s default calendar? This replaces all current events.')) {
              setEvents(CALENDAR_SEED)
            }
          }}>
            <RefreshCw size={14} style={{ marginRight: 5, verticalAlign: '-2px' }} />
            Reset to defaults
          </button>
          <button className="btn" onClick={() => openNew(today)}>
            <Plus size={16} style={{ marginRight: 4, verticalAlign: '-3px' }} />
            New Event
          </button>
        </div>
      </div>

      {/* Calendar source tabs — toggleable chips */}
      <div className="cal-tabs">
        {CALENDARS.map(c => {
          const on = activeCals.includes(c.id)
          return (
            <button
              key={c.id}
              className={'cal-tab' + (on ? ' on' : '')}
              onClick={() => toggleCal(c.id)}
              style={{
                background: on ? c.color : '#fff',
                borderColor: c.color,
                color: on ? '#fff' : c.color,
              }}
            >
              <span className="cal-tab-dot" style={{ background: on ? '#fff' : c.color }} />
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Month header */}
      <div className="cal2-toolbar">
        <button className="cal2-nav" onClick={() => nav(-1)} aria-label="Previous month">
          <ChevronLeft size={20} />
        </button>
        <h3 className="cal2-month">{MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}</h3>
        <button className="cal2-nav" onClick={() => nav(1)} aria-label="Next month">
          <ChevronRight size={20} />
        </button>
        <button className="btn ghost" style={{ marginLeft: 8 }} onClick={() => setViewDate(new Date())}>Today</button>
      </div>

      {/* Square-cell month grid */}
      <div className="cal2-grid card">
        {DOW_SHORT.map(d => (
          <div key={d} className="cal2-dow">{d.toUpperCase()}</div>
        ))}
        {days.map(({ date, current }, i) => {
          const k = dateKey(date)
          const isToday = k === dateKey(today)
          const evs = eventsByDay[k] || []
          return (
            <div
              key={i}
              className={'cal2-cell' + (current ? '' : ' out') + (isToday ? ' today' : '')}
              onClick={() => current && openNew(date)}
            >
              <div className="cal2-cell-head">
                <span className="cal2-day-num">{date.getDate()}</span>
                {isToday && <span className="cal2-today-dot" />}
              </div>
              <div className="cal2-events">
                {evs.slice(0, 4).map((ev, j) => {
                  const cal = CAL_BY_ID[ev.calendar]
                  return (
                    <button
                      key={ev.id + j}
                      className="cal2-event"
                      style={{ background: cal?.color || '#888' }}
                      onClick={(e) => { e.stopPropagation(); openEdit(ev) }}
                      title={ev.title}
                    >
                      {ev.time && <span className="cal2-event-time">{ev.time}</span>}
                      <span className="cal2-event-title">{ev.title}</span>
                      {ev.lessonNumber && <span className="cal2-event-lesson">L{ev.lessonNumber}</span>}
                    </button>
                  )
                })}
                {evs.length > 4 && (
                  <span className="cal2-more">+{evs.length - 4} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showForm && editing && (
        <EventForm
          event={editing}
          onChange={setEditing}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

// ─── Event form modal ─────────────────────────────────────────────────────────
function EventForm({ event, onChange, onSave, onDelete, onClose }) {
  const set = (patch) => onChange({ ...event, ...patch })
  const setRec = (patch) => onChange({ ...event, recurrence: { ...event.recurrence, ...patch } })

  function toggleWeekday(i) {
    const cur = event.recurrence.byweekday || []
    setRec({ byweekday: cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i] })
  }

  const isRecurring = event.recurrence.freq !== 'none'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{event.id ? 'Edit Event' : 'New Event'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <label className="form-label">Title</label>
          <input className="form-input" autoFocus
            placeholder="Event title"
            value={event.title}
            onChange={e => set({ title: e.target.value })}
          />

          <div className="form-row-2">
            <div>
              <label className="form-label">Calendar</label>
              <select className="form-input" value={event.calendar} onChange={e => set({ calendar: e.target.value })}>
                {CALENDARS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={event.startDate} onChange={e => set({ startDate: e.target.value })} />
            </div>
          </div>

          <div className="form-row-2">
            <div>
              <label className="form-label">Time (optional)</label>
              <input className="form-input" placeholder="e.g. 4:00 pm" value={event.time} onChange={e => set({ time: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Lesson #</label>
              <input className="form-input" placeholder="e.g. 4" value={event.lessonNumber} onChange={e => set({ lessonNumber: e.target.value })} />
            </div>
          </div>

          <label className="form-label">
            <Repeat size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            Recurrence
          </label>
          <div className="form-row-2">
            <select className="form-input" value={event.recurrence.freq} onChange={e => setRec({ freq: e.target.value })}>
              {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {isRecurring && (
              <input className="form-input" type="number" min="1" max="99"
                value={event.recurrence.interval}
                onChange={e => setRec({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
                placeholder="Every N"
                title="Repeat every N units"
              />
            )}
          </div>

          {event.recurrence.freq === 'WEEKLY' && (
            <>
              <label className="form-label">On days</label>
              <div className="weekday-chips">
                {DOW_SHORT.map((d, i) => {
                  const on = (event.recurrence.byweekday || []).includes(i)
                  return (
                    <button key={d} type="button"
                      className={'weekday-chip' + (on ? ' on' : '')}
                      onClick={() => toggleWeekday(i)}
                    >{d}</button>
                  )
                })}
              </div>
            </>
          )}

          {isRecurring && (
            <>
              <label className="form-label">Ends (optional)</label>
              <input className="form-input" type="date"
                value={event.recurrence.until}
                onChange={e => setRec({ until: e.target.value })}
              />
            </>
          )}

          <label className="form-label">Notes</label>
          <textarea className="form-input" rows="2" value={event.notes} onChange={e => set({ notes: e.target.value })} />
        </div>

        <div className="modal-foot">
          {event.id && (
            <button className="btn ghost" style={{ color: '#c0392b' }} onClick={onDelete}>
              <Trash2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
