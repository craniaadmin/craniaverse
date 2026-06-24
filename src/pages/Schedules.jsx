import { useState, useEffect, useMemo } from 'react'
import { Plus, X, Trash2, Settings, Download } from 'lucide-react'

// Half-hour slots from 8:00 AM to 9:00 PM — the standard band for both
// day-school classes and afterschool. Times are stored as "HH:MM".
const SLOTS = (() => {
  const out = []
  for (let h = 8; h < 21; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`)
    out.push(`${String(h).padStart(2, '0')}:30`)
  }
  out.push('21:00')
  return out
})()

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_LONG = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

// Room palette anchored on Crania's brand colors plus a few neutrals so
// rooms still read distinct at a glance even when six or more are defined.
const ROOM_PALETTE = [
  '#5FA09E', '#20bab5', '#A6E2F9', '#7fc6e0', '#e8814a',
  '#cfa84a', '#a07ed1', '#d97a8c', '#6aaa1e', '#4a90b3',
]

const DEFAULT_LOCATIONS = [
  { id: 'loc_boardwalk', name: 'Boardwalk' },
  { id: 'loc_wateast',   name: 'Waterloo East' },
]

// Default rooms map 1:1 to Crania's program categories so the seed import
// from /api/programs has somewhere meaningful to land. Names + colors are
// editable from the Rooms manager — these are just opinionated starters.
const DEFAULT_ROOMS = [
  { id: 'rm_flex',       name: 'FLEX',       color: '#5FA09E' },
  { id: 'rm_enrichment', name: 'Enrichment', color: '#6aaa1e' },
  { id: 'rm_private',    name: 'Private',    color: '#A6E2F9' },
  { id: 'rm_teknokids',  name: 'Teknokids',  color: '#e8814a' },
  { id: 'rm_piano',      name: 'Piano',      color: '#d97a8c' },
  { id: 'rm_contest',    name: 'Contest',    color: '#20bab5' },
  { id: 'rm_camp',       name: 'Camp',       color: '#cfa84a' },
]

// Map program category → seed room id. Drives auto-assignment during import.
const CATEGORY_TO_ROOM = {
  FLEX:        'rm_flex',
  ENRICHMENT:  'rm_enrichment',
  PRIVATE:     'rm_private',
  TEKNOKIDS:   'rm_teknokids',
  PIANO:       'rm_piano',
  CONTEST:     'rm_contest',
  CAMP:        'rm_camp',
}

// Snap a "HH:MM:SS" or "HH:MM" string to the nearest 30-min schedule slot.
function snapToSlot(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  if (isNaN(h)) return null
  const totalMin = h * 60 + (m || 0)
  const slotMin = Math.round(totalMin / 30) * 30
  const hh = String(Math.floor(slotMin / 60)).padStart(2, '0')
  const mm = String(slotMin % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

// Translate program titles into something that fits inside a 30-min cell.
function shortTitle(title = '') {
  return title
    .replace(/ - SINGLE$/i, '').replace(/ - DOUBLE$/i, '').replace(/ - UNLIMITED$/i, '')
    .replace(/ - HALF DAY$/i, '').replace(/ - FULL DAY$/i, '')
    .replace(/^MATH ENRICHMENT - LEVEL (\d)$/i, 'ENRICH L$1')
    .replace(/^PRIVATE LESSONS - 55 MIN$/i, 'PRIVATE')
    .replace(/^PIANO PRIVATE 30MIN - /i, 'PIANO ')
    .replace(/^TEKNOKIDS CODING: /i, 'TK: ')
    .replace(/^TEKNOKIDS /i, 'TK ')
    .replace(/^FLEX KINDERGARTEN$/i, 'FLEX KINDER')
}

function categoryOf(title = '') {
  const t = title.toUpperCase()
  if (t.startsWith('FLEX')) return 'FLEX'
  if (t.startsWith('MATH ENRICHMENT')) return 'ENRICHMENT'
  if (t.startsWith('PRIVATE')) return 'PRIVATE'
  if (t.startsWith('TEKNOKIDS')) return 'TEKNOKIDS'
  if (t.startsWith('PIANO')) return 'PIANO'
  if (t.startsWith('CONTEST')) return 'CONTEST'
  return 'CAMP'
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function slotsBetween(start, end) {
  const si = SLOTS.indexOf(start)
  const ei = SLOTS.indexOf(end)
  if (si < 0 || ei < 0 || ei <= si) return 1
  return ei - si
}

function useLocal(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial }
    catch { return initial }
  })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(v)) }, [key, v])
  return [v, setV]
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Schedules() {
  const [rooms, setRooms]         = useLocal('crania_sched_rooms', DEFAULT_ROOMS)
  const [locations, setLocations] = useLocal('crania_sched_locations', DEFAULT_LOCATIONS)
  const [entries, setEntries]     = useLocal('crania_sched_entries', [])

  // Build schedule entries from the /api/programs feed. Each active
  // offering becomes one entry. Manual edits are preserved by id, so
  // re-importing only adds new offerings — it doesn't clobber notes,
  // teacher tweaks, or drag-drop reassignments.
  function importFromPrograms({ silent = false } = {}) {
    return fetch('/api/programs')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(programs => {
        if (!Array.isArray(programs) || programs.length === 0) {
          if (!silent) alert('No programs returned by /api/programs.')
          return
        }
        const locByName = Object.fromEntries(locations.map(l => [l.name, l.id]))
        const existing = new Map(entries.map(e => [e.id, e]))
        let added = 0

        programs.filter(p => p.active).forEach(prog => {
          const cat = categoryOf(prog.title)
          const roomId = CATEGORY_TO_ROOM[cat] || rooms[0]?.id
          const locId = locByName[prog.location] || locations[0]?.id
          if (!locId) return
          ;(prog.offerings || []).filter(o => o.active).forEach((o, idx) => {
            const start = snapToSlot(o.start)
            const end   = snapToSlot(o.end)
            if (!start || !end || end <= start) return
            const id = `seed_${prog.code || prog.number}_${o.day}_${start}_${idx}`
            if (existing.has(id)) return
            existing.set(id, {
              id,
              title: shortTitle(prog.title),
              teacher: o.teacher || '',
              day: o.day,
              startTime: start,
              endTime: end,
              locationId: locId,
              roomId,
              notes: '',
            })
            added++
          })
        })

        setEntries([...existing.values()])
        if (!silent) alert(`Imported ${added} new class${added === 1 ? '' : 'es'} from Programs.`)
      })
      .catch(err => {
        if (!silent) alert('Could not import programs: ' + err.message)
      })
  }

  // One-time auto-import on first visit when the user has nothing yet.
  // Retries on every visit (silently) until at least one entry exists, so
  // a transient API failure doesn't permanently leave the schedule empty.
  useEffect(() => {
    if (entries.length > 0) return
    importFromPrograms({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [view, setView]           = useState('week') // 'week' | 'month'
  const [focusLoc, setFocusLoc]   = useState(null)   // location id or null for "all"
  const [editing, setEditing]     = useState(null)   // entry being edited or null
  const [showRooms, setShowRooms] = useState(false)
  const [showLocs, setShowLocs]   = useState(false)
  const [filterRoom, setFilterRoom] = useState('all')
  const [filterTeacher, setFilterTeacher] = useState('')

  const visibleLocations = focusLoc
    ? locations.filter(l => l.id === focusLoc)
    : locations

  const filteredEntries = useMemo(() => entries.filter(e => {
    if (filterRoom !== 'all' && e.roomId !== filterRoom) return false
    if (filterTeacher && !(e.teacher || '').toLowerCase().includes(filterTeacher.toLowerCase())) return false
    return true
  }), [entries, filterRoom, filterTeacher])

  const roomById = Object.fromEntries(rooms.map(r => [r.id, r]))
  const locById = Object.fromEntries(locations.map(l => [l.id, l]))

  function newEntry(locId, day, time) {
    setEditing({
      id: null,
      title: '',
      teacher: '',
      day: day || 'Mon',
      startTime: time || '16:00',
      endTime:   time
        ? SLOTS[Math.min(SLOTS.indexOf(time) + 2, SLOTS.length - 1)]
        : '17:00',
      locationId: locId || locations[0]?.id || '',
      roomId: rooms[0]?.id || '',
      notes: '',
    })
  }

  function saveEntry() {
    if (!editing.title.trim()) return
    if (editing.id) {
      setEntries(es => es.map(e => e.id === editing.id ? editing : e))
    } else {
      setEntries(es => [...es, { ...editing, id: `sch_${Date.now()}` }])
    }
    setEditing(null)
  }

  function deleteEntry() {
    if (!editing?.id) return
    if (!window.confirm('Delete this scheduled item?')) return
    setEntries(es => es.filter(e => e.id !== editing.id))
    setEditing(null)
  }

  // Drag handlers — HTML5 native. dataTransfer carries the entry id.
  function onDragStart(e, entryId) {
    e.dataTransfer.setData('text/plain', entryId)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  function onDrop(e, locId, day, time) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    setEntries(es => es.map(en => {
      if (en.id !== id) return en
      const dur = slotsBetween(en.startTime, en.endTime)
      const startIdx = SLOTS.indexOf(time)
      const newEnd = SLOTS[Math.min(startIdx + dur, SLOTS.length - 1)]
      return { ...en, day, startTime: time, endTime: newEnd, locationId: locId }
    }))
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">Schedules</h2>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => setShowRooms(true)}>
            <Settings size={14} style={{ marginRight: 5, verticalAlign: '-2px' }} />
            Rooms
          </button>
          <button className="btn ghost" onClick={() => setShowLocs(true)}>
            <Settings size={14} style={{ marginRight: 5, verticalAlign: '-2px' }} />
            Locations
          </button>
          <button className="btn ghost" onClick={() => importFromPrograms()}>
            <Download size={14} style={{ marginRight: 5, verticalAlign: '-2px' }} />
            Import from Programs
          </button>
          <button className="btn" onClick={() => newEntry()}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            New Class
          </button>
        </div>
      </div>

      {/* Location tabs — "All" + each location. Click one to focus, click again
          (or the All chip) to see them together. */}
      <div className="sch-locs">
        <button
          className={'sch-loc' + (!focusLoc ? ' on' : '')}
          onClick={() => setFocusLoc(null)}
        >All Locations</button>
        {locations.map(l => (
          <button
            key={l.id}
            className={'sch-loc' + (focusLoc === l.id ? ' on' : '')}
            onClick={() => setFocusLoc(focusLoc === l.id ? null : l.id)}
          >{l.name}</button>
        ))}
      </div>

      {/* Filters + view switch */}
      <div className="sch-filters">
        <div className="seg">
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
        </div>
        <select className="form-input" style={{ width: 160 }} value={filterRoom} onChange={e => setFilterRoom(e.target.value)}>
          <option value="all">All rooms</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input className="form-input" style={{ width: 180 }} placeholder="Filter teacher…" value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} />
        <div style={{ flex: 1 }} />
        <div className="sch-room-legend">
          {rooms.map(r => (
            <span key={r.id} className="sch-room-chip" style={{ background: r.color }}>{r.name}</span>
          ))}
        </div>
      </div>

      {/* Schedules — one full grid per visible location, stacked */}
      {view === 'week' && visibleLocations.map(loc => (
        <WeekGrid
          key={loc.id}
          location={loc}
          rooms={rooms}
          roomById={roomById}
          entries={filteredEntries.filter(e => e.locationId === loc.id)}
          onCellNew={(day, time) => newEntry(loc.id, day, time)}
          onEntryEdit={(en) => setEditing({ ...en })}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      ))}

      {view === 'month' && visibleLocations.map(loc => (
        <MonthList
          key={loc.id}
          location={loc}
          roomById={roomById}
          entries={filteredEntries.filter(e => e.locationId === loc.id)}
          onEntryEdit={(en) => setEditing({ ...en })}
        />
      ))}

      {editing && (
        <EntryForm
          entry={editing}
          onChange={setEditing}
          rooms={rooms}
          locations={locations}
          onSave={saveEntry}
          onDelete={deleteEntry}
          onClose={() => setEditing(null)}
        />
      )}

      {showRooms && (
        <RoomsManager rooms={rooms} setRooms={setRooms} onClose={() => setShowRooms(false)} />
      )}
      {showLocs && (
        <LocationsManager locations={locations} setLocations={setLocations} onClose={() => setShowLocs(false)} />
      )}
    </div>
  )
}

// ─── Week grid ────────────────────────────────────────────────────────────────
function WeekGrid({ location, rooms, roomById, entries, onCellNew, onEntryEdit, onDragStart, onDragOver, onDrop }) {
  // Group entries by day -> slot for quick lookup
  const byCell = useMemo(() => {
    const m = {}
    entries.forEach(en => {
      const k = `${en.day}|${en.startTime}`
      ;(m[k] ||= []).push(en)
    })
    return m
  }, [entries])

  return (
    <div className="sch-card card">
      <div className="sch-loc-head">{location.name}</div>
      <div className="sch-grid">
        {/* Header row */}
        <div className="sch-cell sch-head sch-time-head">TIME</div>
        {DAYS.map(d => (
          <div key={d} className="sch-cell sch-head">{d.toUpperCase()}</div>
        ))}

        {/* Body rows: each time slot */}
        {SLOTS.map(t => (
          <Row key={t} t={t}
            byCell={byCell}
            roomById={roomById}
            onCellNew={onCellNew}
            onEntryEdit={onEntryEdit}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            locId={location.id}
          />
        ))}
      </div>
    </div>
  )
}

function Row({ t, byCell, roomById, onCellNew, onEntryEdit, onDragStart, onDragOver, onDrop, locId }) {
  return (
    <>
      <div className="sch-cell sch-time">{fmtTime(t)}</div>
      {DAYS.map(d => {
        const ents = byCell[`${d}|${t}`] || []
        return (
          <div
            key={d}
            className="sch-cell sch-slot"
            onClick={() => ents.length === 0 && onCellNew(d, t)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, locId, d, t)}
          >
            {ents.map(en => {
              const room = roomById[en.roomId]
              const color = room?.color || '#888'
              return (
                <div
                  key={en.id}
                  className="sch-entry"
                  style={{ background: color }}
                  draggable
                  onDragStart={(e) => onDragStart(e, en.id)}
                  onClick={(e) => { e.stopPropagation(); onEntryEdit(en) }}
                  title={`${en.title}${en.teacher ? ' - ' + en.teacher : ''}`}
                >
                  <div className="sch-entry-title">{en.title}</div>
                  {en.teacher && <div className="sch-entry-teacher">- {en.teacher}</div>}
                  <div className="sch-entry-time">{fmtTime(en.startTime)}–{fmtTime(en.endTime)}</div>
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

// ─── Month list view ──────────────────────────────────────────────────────────
function MonthList({ location, roomById, entries, onEntryEdit }) {
  // Group by day, sorted by time
  const byDay = useMemo(() => {
    const m = {}
    DAYS.forEach(d => { m[d] = [] })
    entries.forEach(en => { if (m[en.day]) m[en.day].push(en) })
    DAYS.forEach(d => m[d].sort((a, b) => a.startTime.localeCompare(b.startTime)))
    return m
  }, [entries])

  return (
    <div className="sch-card card">
      <div className="sch-loc-head">{location.name}</div>
      <div className="sch-month">
        {DAYS.map((d, i) => (
          <div key={d} className="sch-month-day">
            <div className="sch-month-day-head">{DAYS_LONG[i]}</div>
            <div className="sch-month-day-body">
              {byDay[d].length === 0 ? (
                <div className="sch-month-empty">No classes</div>
              ) : byDay[d].map(en => {
                const room = roomById[en.roomId]
                const color = room?.color || '#888'
                return (
                  <button key={en.id} className="sch-month-row" onClick={() => onEntryEdit(en)}>
                    <span className="sch-month-time">{fmtTime(en.startTime)}</span>
                    <span className="sch-month-title" style={{ borderLeftColor: color }}>
                      <strong>{en.title}</strong>
                      {en.teacher && <span className="sch-month-teacher"> - {en.teacher}</span>}
                    </span>
                    <span className="sch-month-room" style={{ background: color }}>{room?.name || '—'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Entry form ───────────────────────────────────────────────────────────────
function EntryForm({ entry, onChange, rooms, locations, onSave, onDelete, onClose }) {
  const set = (patch) => onChange({ ...entry, ...patch })
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{entry.id ? 'Edit Class' : 'New Class'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <label className="form-label">Class title</label>
          <input className="form-input" autoFocus value={entry.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Flex Math L4" />

          <label className="form-label">Teacher</label>
          <input className="form-input" value={entry.teacher} onChange={e => set({ teacher: e.target.value })} placeholder="e.g. Tas" />

          <div className="form-row-2">
            <div>
              <label className="form-label">Location</label>
              <select className="form-input" value={entry.locationId} onChange={e => set({ locationId: e.target.value })}>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Room</label>
              <select className="form-input" value={entry.roomId} onChange={e => set({ roomId: e.target.value })}>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div>
              <label className="form-label">Day</label>
              <select className="form-input" value={entry.day} onChange={e => set({ day: e.target.value })}>
                {DAYS.map((d, i) => <option key={d} value={d}>{DAYS_LONG[i]}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Start</label>
              <select className="form-input" value={entry.startTime} onChange={e => set({ startTime: e.target.value })}>
                {SLOTS.slice(0, -1).map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
              </select>
            </div>
          </div>

          <label className="form-label">End</label>
          <select className="form-input" value={entry.endTime} onChange={e => set({ endTime: e.target.value })}>
            {SLOTS.filter(s => s > entry.startTime).map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
          </select>

          <label className="form-label">Notes</label>
          <textarea className="form-input" rows="2" value={entry.notes || ''} onChange={e => set({ notes: e.target.value })} />
        </div>
        <div className="modal-foot">
          {entry.id && (
            <button className="btn ghost" style={{ color: '#c0392b' }} onClick={onDelete}>
              <Trash2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} /> Delete
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

// ─── Rooms manager ────────────────────────────────────────────────────────────
function RoomsManager({ rooms, setRooms, onClose }) {
  function update(id, patch) {
    setRooms(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  function add() {
    setRooms(rs => [...rs, {
      id: `rm_${Date.now()}`,
      name: `Room ${rs.length + 1}`,
      color: ROOM_PALETTE[rs.length % ROOM_PALETTE.length],
    }])
  }
  function remove(id) {
    if (!window.confirm('Remove this room? Existing classes assigned to it will lose their color.')) return
    setRooms(rs => rs.filter(r => r.id !== id))
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h3>Manage Rooms</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {rooms.map(r => (
            <div key={r.id} className="rm-row">
              <input className="form-input" value={r.name} onChange={e => update(r.id, { name: e.target.value })} />
              <div className="rm-swatches">
                {ROOM_PALETTE.map(c => (
                  <button key={c} type="button"
                    className={'rm-swatch' + (r.color === c ? ' on' : '')}
                    style={{ background: c }}
                    onClick={() => update(r.id, { color: c })}
                  />
                ))}
              </div>
              <button className="icon-btn" onClick={() => remove(r.id)} title="Remove"><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="btn ghost" onClick={add} style={{ marginTop: 10 }}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} /> Add room
          </button>
        </div>
        <div className="modal-foot">
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ─── Locations manager ────────────────────────────────────────────────────────
function LocationsManager({ locations, setLocations, onClose }) {
  function update(id, patch) {
    setLocations(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l))
  }
  function add() {
    setLocations(ls => [...ls, { id: `loc_${Date.now()}`, name: 'New Location' }])
  }
  function remove(id) {
    if (!window.confirm('Remove this location? Existing classes here will become unassigned.')) return
    setLocations(ls => ls.filter(l => l.id !== id))
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Manage Locations</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {locations.map(l => (
            <div key={l.id} className="rm-row">
              <input className="form-input" value={l.name} onChange={e => update(l.id, { name: e.target.value })} />
              <button className="icon-btn" onClick={() => remove(l.id)} title="Remove"><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="btn ghost" onClick={add} style={{ marginTop: 10 }}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} /> Add location
          </button>
        </div>
        <div className="modal-foot">
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
