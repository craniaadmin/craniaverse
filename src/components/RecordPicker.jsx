import { RefreshCw } from 'lucide-react'
import { useStore } from '../data/store'

// Record selector + live connection status. Selecting a chip updates the
// shared store, so the same child stays selected when you move between the
// Students and Customers pages. The Refresh button re-pulls from the API
// (records also auto-refresh every 15s, so public registrations appear).
export default function RecordPicker() {
  const { records, selectedId, select, status, refresh } = useStore()

  const dot = status === 'online' ? '#3aa55a' : status === 'offline' ? '#d92020' : '#c9a227'
  const label = status === 'online' ? 'Connected' : status === 'offline' ? 'API offline' : 'Connecting\u2026'

  return (
    <div className="record-picker">
      <span className="record-picker-label">Records:</span>
      {records.map((r) => (
        <button
          key={r.id}
          className={'record-chip' + (r.id === selectedId ? ' active' : '')}
          onClick={() => select(r.id)}
          title={r.createdAt}
        >
          {r.displayName}
        </button>
      ))}
      <button className="record-refresh" onClick={refresh} title="Refresh from server">
        <RefreshCw size={14} /> Refresh
      </button>
      <span className="record-status" title={label}>
        <span className="record-status-dot" style={{ background: dot }} />
        {label}
      </span>
    </div>
  )
}
