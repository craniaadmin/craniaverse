// Calendar page — v1 ported from the client's v18 mockup.
// State persists at GET/PUT /api/calendar. Shape matches
// crania-calendar.json verbatim so exports round-trip.
//
// v1 scope: month view, add/edit/delete events, add/edit/delete
// calendars (with color + visibility toggle), weekly + daily
// recurrence expansion. Skipped for v1 (all fields round-trip as
// data, just no UI yet): Day / Week / Year views, undo/redo,
// CSV export, backup/restore, sidebar Upcoming / To-Dos, scope-
// modal for editing individual occurrences of a recurring event,
// exceptions[] per-occurrence exclusions, drag-drop, monthly/
// yearly recurrence.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Edit2, Trash2 } from 'lucide-react'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

const DOW  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const PALETTE = ['#A6E2F9','#5FA09E','#E0DE85','#2E2516','#20BAB5','#8C9294','#C00000','#FF0000','#FFC000','#FFFF00','#92D050','#00B050','#00B0F0','#0070C0','#002060','#7030A0']
const DEFAULT_CAL_COLOR = '#5FA09E'

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const iso = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}
const parseISO = (s) => {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x }
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// Perceived luminance — decide black-vs-white text on a colored chip.
function textOn(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return '#2E2516'
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 >= 155 ? '#2E2516' : '#ffffff'
}

// ---------- store hook ----------
// `apiPath` lets this same component back a second, fully independent
// event store (see MarketingCalendar.jsx) — different endpoint, no
// data ever shared with the operations Calendar.
function useCalendar(apiPath) {
  const [data, setData]     = useState({ calendars: [], events: [], hidden: {} })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading')
  const saveTimer = useRef(null)
  const latest = useRef(data)
  latest.current = data

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}${apiPath}`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setData({
        calendars: Array.isArray(j.calendars) ? j.calendars : [],
        events:    Array.isArray(j.events)    ? j.events    : [],
        hidden:    j.hidden && typeof j.hidden === 'object' ? j.hidden : {},
      })
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [apiPath])

  useEffect(() => { refresh() }, [refresh])

  const mutate = useCallback((mut) => {
    setData(prev => {
      const next = { calendars: [...prev.calendars], events: [...prev.events], hidden: { ...prev.hidden } }
      mut(next)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(`${API_BASE}${apiPath}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify(latest.current),
        }).catch(() => {})
      }, 350)
      return next
    })
  }, [apiPath])

  return { data, loading, status, mutate }
}

// ---------- Recurrence expansion ----------
// Expand every event into a Map<iso, event[]> covering [rangeStart, rangeEnd].
// Preserves all original fields on each occurrence (mockup-shape safe).
function expandEvents(events, rangeStart, rangeEnd) {
  const out = new Map() // iso -> array
  const push = (dateISO, ev) => {
    if (!out.has(dateISO)) out.set(dateISO, [])
    out.get(dateISO).push(ev)
  }
  const rangeStartTime = rangeStart.getTime()
  const rangeEndTime   = rangeEnd.getTime()

  for (const ev of events) {
    if (!ev.date) continue
    const start = parseISO(ev.date)
    if (!start) continue
    const exceptions = new Set(Array.isArray(ev.exceptions) ? ev.exceptions : [])
    const recur = ev.recur

    if (!recur || !recur.freq) {
      // Non-recurring: emit if in range.
      if (start.getTime() >= rangeStartTime && start.getTime() <= rangeEndTime) {
        push(ev.date, ev)
      }
      continue
    }

    const interval = Math.max(1, Number(recur.interval) || 1)
    const untilD = recur.until ? parseISO(recur.until) : null
    const count  = Number(recur.count) || 0
    let emitted = 0

    const emit = (d) => {
      const dISO = iso(d)
      if (exceptions.has(dISO)) return true // still counts against `count`
      if (d.getTime() >= rangeStartTime && d.getTime() <= rangeEndTime) push(dISO, ev)
      emitted += 1
      return true
    }
    const capReached = () => (count > 0 && emitted >= count) || (untilD && (untilD.getTime() < rangeStartTime))
    // Guard against runaway loops even without a bound.
    const MAX_ITER = 500

    if (recur.freq === 'daily') {
      let d = new Date(start); let n = 0
      while (n < MAX_ITER) {
        if (untilD && d.getTime() > untilD.getTime()) break
        if (count > 0 && emitted >= count) break
        if (d.getTime() > rangeEndTime) break
        emit(d)
        d = addDays(d, interval); n++
      }
    } else if (recur.freq === 'weekly') {
      const days = Array.isArray(recur.days) && recur.days.length
        ? recur.days.map(Number).filter(n => n >= 0 && n <= 6).sort()
        : [start.getDay()]
      // Walk week-by-week starting from the week of `start`.
      let weekStart = startOfWeek(start); let w = 0
      while (w < MAX_ITER) {
        for (const dow of days) {
          const d = addDays(weekStart, dow)
          if (d.getTime() < start.getTime()) continue // don't emit before start date
          if (untilD && d.getTime() > untilD.getTime()) { w = MAX_ITER; break }
          if (count > 0 && emitted >= count) { w = MAX_ITER; break }
          if (d.getTime() > rangeEndTime) { w = MAX_ITER; break }
          emit(d)
        }
        weekStart = addDays(weekStart, 7 * interval); w++
      }
    } else {
      // monthly/yearly aren't handled in v1 — emit the initial date only.
      if (start.getTime() >= rangeStartTime && start.getTime() <= rangeEndTime) push(ev.date, ev)
    }
  }
  return out
}

// ---------- Main page ----------
export default function CalendarView() {
  const { data, loading, status, mutate } = useCalendar()
  const [cur, setCur] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [editingEvent, setEditingEvent]       = useState(null) // null | { mode, event, date? }
  const [editingCalendar, setEditingCalendar] = useState(null) // null | { mode, cal }

  const calById = useMemo(
    () => Object.fromEntries(data.calendars.map(c => [c.id, c])),
    [data.calendars],
  )

  // Month grid: first Sun of the month-view, and 42 days (6 weeks).
  const monthGrid = useMemo(() => {
    const firstOfMonth = new Date(cur.getFullYear(), cur.getMonth(), 1)
    const gridStart = startOfWeek(firstOfMonth)
    const days = []
    for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i))
    return { firstOfMonth, gridStart, gridEnd: days[41], days }
  }, [cur])

  const eventsByDay = useMemo(() => {
    const visible = data.events.filter(e => !data.hidden[e.calId])
    return expandEvents(visible, monthGrid.gridStart, monthGrid.gridEnd)
  }, [data.events, data.hidden, monthGrid.gridStart, monthGrid.gridEnd])

  // ----- calendar actions -----
  const toggleCalVisibility = (calId) => {
    mutate(d => {
      d.hidden = { ...d.hidden }
      if (d.hidden[calId]) delete d.hidden[calId]
      else d.hidden[calId] = true
    })
  }
  const saveCalendarForm = (form) => {
    mutate(d => {
      if (editingCalendar.mode === 'new') {
        d.calendars.push({ id: uid(), name: form.name.trim(), color: form.color })
      } else {
        const i = d.calendars.findIndex(c => c.id === editingCalendar.cal.id)
        if (i !== -1) d.calendars[i] = { ...d.calendars[i], name: form.name.trim(), color: form.color }
      }
    })
    setEditingCalendar(null)
  }
  const deleteCalendar = (id) => {
    const cal = calById[id]
    const count = data.events.filter(e => e.calId === id).length
    if (!confirm(`Delete "${cal?.name}" and its ${count} event${count === 1 ? '' : 's'}?`)) return
    mutate(d => {
      d.calendars = d.calendars.filter(c => c.id !== id)
      d.events    = d.events.filter(e => e.calId !== id)
      d.hidden    = { ...d.hidden }; delete d.hidden[id]
    })
  }

  // ----- event actions -----
  const saveEventForm = (form) => {
    mutate(d => {
      if (editingEvent.mode === 'new') {
        d.events.push({ id: uid(), exceptions: [], ...form })
      } else {
        const i = d.events.findIndex(e => e.id === editingEvent.event.id)
        if (i !== -1) d.events[i] = { ...d.events[i], ...form }
      }
    })
    setEditingEvent(null)
  }
  const deleteEvent = (id) => {
    const ev = data.events.find(e => e.id === id)
    if (!confirm(`Delete "${ev?.title || 'this event'}"?`)) return
    mutate(d => { d.events = d.events.filter(e => e.id !== id) })
    setEditingEvent(null)
  }

  if (loading) {
    return (
      <div className="page">
        <h2 className="page-title">Calendar</h2>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  const today = new Date(); today.setHours(0,0,0,0)

  return (
    <div className="page">
      <h2 className="page-title">Calendar</h2>

      {status === 'offline' && (
        <div style={{ background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Working offline — changes will retry when the server is reachable.
        </div>
      )}

      {/* Calendar chips + Add-Calendar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {data.calendars.map(c => (
          <CalendarChip
            key={c.id}
            cal={c}
            visible={!data.hidden[c.id]}
            onToggle={() => toggleCalVisibility(c.id)}
            onEdit={() => setEditingCalendar({ mode: 'edit', cal: c })}
          />
        ))}
        <button
          onClick={() => setEditingCalendar({ mode: 'new', cal: null })}
          style={{
            background: 'var(--brand-light-blue)', color: 'var(--brand-dark-brown)',
            border: 'none', padding: '5px 12px', fontSize: 12, fontWeight: 700,
            borderRadius: 8, cursor: 'pointer',
          }}
        >
          + Add Calendar
        </button>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
        background: '#fff', padding: '10px 14px', borderRadius: 10,
        boxShadow: '0 1px 3px rgba(46,37,22,.15)',
      }}>
        <button className="cal-navbtn" onClick={() => setCur(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          title="Previous month"><ChevronLeft size={18} /></button>
        <button
          onClick={() => setCur(() => { const d = new Date(); d.setHours(0,0,0,0); return d })}
          style={{
            background: 'var(--brand-light-brown)', color: 'var(--brand-dark-brown)',
            border: 'none', padding: '7px 18px', borderRadius: 8, fontWeight: 700,
            fontSize: 14, cursor: 'pointer',
          }}
        >Today</button>
        <button className="cal-navbtn" onClick={() => setCur(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          title="Next month"><ChevronRight size={18} /></button>
        <span style={{ fontSize: 18, fontWeight: 700, marginLeft: 4 }}>
          {MONTHS[cur.getMonth()]} {cur.getFullYear()}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setEditingEvent({ mode: 'new', event: null, date: iso(today) })}
          style={{
            background: 'var(--brand-light-blue)', color: 'var(--brand-dark-brown)',
            border: 'none', padding: '7px 16px', borderRadius: 8, fontWeight: 700,
            fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Plus size={14} /> New Event
        </button>
      </div>

      {/* Month grid */}
      <div style={{
        background: '#fff', borderRadius: 10, overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(46,37,22,.15)',
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
      }}>
        {DOW.map(d => (
          <div key={d} style={{
            background: 'var(--brand-dark-blue)', color: '#fff', textAlign: 'center',
            padding: '6px 0', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.5px',
            borderRight: '1px solid rgba(255,255,255,.25)',
          }}>{d}</div>
        ))}
        {monthGrid.days.map((d, i) => {
          const inMonth = d.getMonth() === cur.getMonth()
          const isToday = sameDay(d, today)
          const dISO = iso(d)
          const evs = eventsByDay.get(dISO) || []
          return (
            <DayCell
              key={i}
              date={d}
              iso={dISO}
              inMonth={inMonth}
              isToday={isToday}
              events={evs}
              calById={calById}
              onNewEvent={() => setEditingEvent({ mode: 'new', event: null, date: dISO })}
              onEditEvent={(ev) => setEditingEvent({ mode: 'edit', event: ev })}
            />
          )
        })}
      </div>

      {editingEvent && (
        <EventModal
          mode={editingEvent.mode}
          initial={editingEvent.event}
          initialDate={editingEvent.date}
          calendars={data.calendars}
          onClose={() => setEditingEvent(null)}
          onSave={saveEventForm}
          onDelete={editingEvent.mode === 'edit' ? () => deleteEvent(editingEvent.event.id) : null}
        />
      )}

      {editingCalendar && (
        <CalendarModal
          mode={editingCalendar.mode}
          initial={editingCalendar.cal}
          onClose={() => setEditingCalendar(null)}
          onSave={saveCalendarForm}
          onDelete={editingCalendar.mode === 'edit' ? () => { deleteCalendar(editingCalendar.cal.id); setEditingCalendar(null) } : null}
        />
      )}
    </div>
  )
}

// ---------- Calendar chip ----------
function CalendarChip({ cal, visible, onToggle, onEdit }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: visible ? 'var(--brand-light-blue)' : '#ece9e0',
      color: 'var(--brand-dark-brown)',
      borderRadius: 6, padding: '4px 4px 4px 9px', fontSize: 12, fontWeight: 600,
    }}>
      <span style={{
        width: 12, height: 12, borderRadius: 3, background: cal.color || DEFAULT_CAL_COLOR,
      }} />
      <span
        onClick={onToggle}
        style={{ cursor: 'pointer', opacity: visible ? 1 : 0.55 }}
        title={visible ? 'Click to hide' : 'Click to show'}
      >
        {cal.name}
      </span>
      <button
        onClick={onEdit}
        title="Edit calendar"
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 2,
          color: '#6b6455', display: 'inline-flex', alignItems: 'center',
        }}
      >
        <Edit2 size={12} />
      </button>
    </span>
  )
}

// ---------- Day cell ----------
function DayCell({ date, iso: dISO, inMonth, isToday, events, calById, onNewEvent, onEditEvent }) {
  const shown = events.slice(0, 3)
  const overflow = events.length - shown.length
  return (
    <div
      onClick={onNewEvent}
      style={{
        borderRight: '1px solid #eee', borderBottom: '1px solid #eee',
        padding: 4, minHeight: 100, cursor: 'pointer',
        background: isToday ? '#eefaff' : (inMonth ? '#fff' : '#fafaf7'),
        color: inMonth ? 'inherit' : '#b8b2a2', overflow: 'hidden',
      }}
    >
      <div style={{
        fontSize: 12, fontWeight: 700, marginBottom: 2,
        ...(isToday ? {
          background: 'var(--brand-dark-blue)', color: '#fff', borderRadius: '50%',
          width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        } : {}),
      }}>
        {date.getDate()}
      </div>
      {shown.map((ev, i) => {
        const color = ev.color || calById[ev.calId]?.color || DEFAULT_CAL_COLOR
        return (
          <div
            key={`${ev.id}-${dISO}-${i}`}
            onClick={(e) => { e.stopPropagation(); onEditEvent(ev) }}
            title={ev.title + (ev.allDay ? '' : ` (${ev.start}–${ev.end})`)}
            style={{
              fontSize: 11, borderRadius: 4, padding: '1px 5px', marginBottom: 2,
              background: color, color: textOn(color),
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              cursor: 'pointer',
            }}
          >
            {!ev.allDay && ev.start && <span style={{ opacity: .8, marginRight: 4 }}>{ev.start}</span>}
            {ev.title}
          </div>
        )
      })}
      {overflow > 0 && (
        <div style={{ fontSize: 10, color: '#8a8474', fontWeight: 600 }}>+{overflow} more</div>
      )}
    </div>
  )
}

// ---------- Event modal ----------
function EventModal({ mode, initial, initialDate, calendars, onClose, onSave, onDelete }) {
  const [title, setTitle]   = useState(initial?.title || '')
  const [calId, setCalId]   = useState(initial?.calId || (calendars[0]?.id || ''))
  const [date, setDate]     = useState(initial?.date || initialDate || iso(new Date()))
  const [allDay, setAllDay] = useState(initial?.allDay ?? true)
  const [start, setStart]   = useState(initial?.start || '09:00')
  const [end, setEnd]       = useState(initial?.end || '10:00')
  const [notes, setNotes]   = useState(initial?.notes || '')
  const [color, setColor]   = useState(initial?.color || '')

  const [freq, setFreq]         = useState(initial?.recur?.freq || 'none')
  const [interval, setInterval] = useState(initial?.recur?.interval || 1)
  const [until, setUntil]       = useState(initial?.recur?.until || '')
  const [rcount, setRcount]     = useState(initial?.recur?.count || 0)
  const [rdays, setRdays]       = useState(new Set(initial?.recur?.days || []))

  const toggleDay = (n) => {
    setRdays(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })
  }

  const handleSave = () => {
    if (!title.trim()) { alert('Please enter a title.'); return }
    if (!calId)        { alert('Please choose a calendar.'); return }
    if (!date)         { alert('Please choose a date.'); return }
    const recur = freq === 'none' ? null : {
      freq,
      interval: Math.max(1, Number(interval) || 1),
      until: until || '',
      count: Math.max(0, Number(rcount) || 0),
      ...(freq === 'weekly' ? { days: [...rdays].sort() } : {}),
    }
    onSave({
      calId, title: title.trim(), date,
      allDay: !!allDay,
      start: allDay ? '' : start,
      end:   allDay ? '' : end,
      notes: notes.trim(),
      color: color || '',
      recur,
    })
  }

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Event' : 'New Event'}</h2>

        <div className="kb-field">
          <label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" autoFocus />
        </div>

        <div className="kb-field">
          <label>Calendar</label>
          <select value={calId} onChange={e => setCalId(e.target.value)}>
            {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="kb-field">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> All Day
        </label>

        {!allDay && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="kb-field" style={{ flex: 1 }}>
              <label>Start</label>
              <input type="time" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="kb-field" style={{ flex: 1 }}>
              <label>End</label>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
        )}

        <div className="kb-field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="kb-field">
          <label>Repeat</label>
          <select value={freq} onChange={e => setFreq(e.target.value)}>
            <option value="none">Does Not Repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {freq !== 'none' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="kb-field" style={{ flex: 1 }}>
                <label>Every</label>
                <input type="number" min="1" value={interval} onChange={e => setInterval(e.target.value)} />
              </div>
              <div className="kb-field" style={{ flex: 1.4 }}>
                <label>Until (optional)</label>
                <input type="date" value={until} onChange={e => setUntil(e.target.value)} />
              </div>
              <div className="kb-field" style={{ flex: 1 }}>
                <label>Or count</label>
                <input type="number" min="0" value={rcount} onChange={e => setRcount(e.target.value)}
                  placeholder="0 = ignore" />
              </div>
            </div>

            {freq === 'weekly' && (
              <div className="kb-field">
                <label>On Days</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    [0, 'S'], [1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'],
                  ].map(([n, l]) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleDay(n)}
                      style={{
                        width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd',
                        background: rdays.has(n) ? 'var(--brand-dark-blue)' : '#fff',
                        color: rdays.has(n) ? '#fff' : '#8a8474',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >{l}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="kb-field">
          <label>Event Colour (optional — overrides calendar colour)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setColor('')}
              style={{
                border: '2px solid ' + (!color ? 'var(--brand-dark-brown)' : '#fff'),
                boxShadow: '0 0 0 1px #d8d3c6',
                padding: '2px 8px', borderRadius: 14, fontSize: 11, cursor: 'pointer',
                background: '#fff', color: '#8a8474',
              }}
            >use calendar</button>
            {PALETTE.map(c => (
              <span
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                  background: c, border: '2px solid #fff',
                  boxShadow: '0 0 0 ' + (color === c ? '2px var(--brand-dark-brown)' : '1px #d8d3c6'),
                }}
              />
            ))}
          </div>
        </div>

        <div className="kb-actions">
          {onDelete && <button className="del" onClick={onDelete}>Delete</button>}
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Calendar modal ----------
function CalendarModal({ mode, initial, onClose, onSave, onDelete }) {
  const [name, setName]   = useState(initial?.name || '')
  const [color, setColor] = useState(initial?.color || DEFAULT_CAL_COLOR)

  return (
    <div className="kb-modal-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="kb-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h2>{mode === 'edit' ? 'Edit Calendar' : 'Add Calendar'}</h2>

        <div className="kb-field">
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" autoFocus />
        </div>

        <div className="kb-field">
          <label>Colour</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PALETTE.map(c => (
              <span
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                  background: c, border: '2px solid #fff',
                  boxShadow: '0 0 0 ' + (color === c ? '2px var(--brand-dark-brown)' : '1px #d8d3c6'),
                }}
              />
            ))}
          </div>
        </div>

        <div className="kb-actions">
          {onDelete && <button className="del" onClick={onDelete}>Delete</button>}
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="save" onClick={() => name.trim() && onSave({ name, color })}>Save</button>
        </div>
      </div>
    </div>
  )
}
