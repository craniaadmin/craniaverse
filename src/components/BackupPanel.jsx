// The backups card behind a page's settings gear: list, back up now,
// restore. Shared rather than copied — Customers and Emergency Contacts
// both show it against the same registrations data, and two copies of a
// restore button is exactly the kind of pair that drifts apart.
//
// Restoring replaces data wholesale, so it always confirms first, and the
// server writes a "Before restore" snapshot before it does anything.
import React, { useEffect, useState } from 'react'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }

export const BACKUP_CSS = `
.bkp-card{background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.18);padding:13px 15px}
.bkp-card + .bkp-card{margin-top:10px}
.bkp-title{font-size:12.5px;font-weight:700;color:#5FA09E;text-transform:uppercase;
    letter-spacing:.4px;margin-bottom:6px}
.bkp-hint{font-size:11.5px;color:#6B6455;line-height:1.45;margin-bottom:8px}
.bkp-meta{font-size:11.5px;color:#2E2516;font-weight:600;margin-bottom:9px}
.bkp-err{font-size:11.5px;color:#C0392B;margin-top:8px;line-height:1.4}
.bkp-row{display:flex;gap:8px}
.bkp-btn{background:#F1F3F4;border:1px solid #D5D0C4;border-radius:8px;padding:6px 11px;
    font:inherit;font-size:12px;font-weight:600;color:#2E2516;cursor:pointer}
.bkp-btn:hover:not(:disabled){border-color:#5FA09E}
.bkp-btn:disabled{opacity:.45;cursor:default}
.bkp-list{margin-top:9px;border-top:1px solid #E7EBE7;padding-top:8px;max-height:220px;overflow:auto}
.bkp-item{display:flex;align-items:center;gap:8px;padding:5px 0}
.bkp-label{flex:1;min-width:0;font-size:11.5px;color:#2E2516;display:flex;flex-direction:column;line-height:1.3}
.bkp-count{font-size:10.5px;color:#9A948A;font-weight:600}
`

/* `base` is the API prefix, e.g. "customers" for /api/customers/backups.
   `confirm` is the host page's dialog — passed in so the card matches the
   page it sits on rather than falling back to window.confirm. */
export default function BackupPanel({
  base = 'customers',
  title = 'Backups',
  hint = 'Snapshots of every registration, saved to the database (last 14 kept).',
  confirm,
  onRestored,
}) {
  const [backups, setBackups] = useState(null)
  const [busy, setBusy] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [err, setErr] = useState('')

  const load = () => fetch(`${API_BASE}/api/${base}/backups`, { headers: HEADERS })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(rows => setBackups(Array.isArray(rows) ? rows : []))
    .catch(() => setBackups([]))

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const backupNow = async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`${API_BASE}/api/${base}/backup`, {
        method: 'POST', headers: HEADERS,
        body: JSON.stringify({ label: new Date().toLocaleString() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch {
      /* `base` is either a page name ("customers" -> customers_backups)
         or the shared "snapshots/<collection>" route, so name the right
         missing collection rather than gluing _backups onto both. */
      setErr(`Backup failed — the ${base.startsWith('snapshots/') ? 'snapshots' : base + '_backups'}`
        + ' collection may be missing (run pb-setup.js).')
    }
    setBusy(false)
  }

  const doRestore = async (b) => {
    const when = b.label || new Date(b.created).toLocaleString()
    const ask = confirm || (async (msg) => window.confirm(msg))
    const ok = await ask(
      `Replace every registration with the snapshot from ${when}`
      + ` (${b.count} record${b.count === 1 ? '' : 's'})?`
      + ' A snapshot of the current data is saved first.',
      { title: 'Restore Backup' })
    if (!ok) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`${API_BASE}/api/${base}/restore/${b.id}`, { method: 'POST', headers: HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRestoreOpen(false)
      onRestored && await onRestored()
    } catch {
      setErr('Restore failed — nothing was changed.')
    }
    setBusy(false)
  }

  const last = backups && backups[0]
  const lastLine = last
    ? `Last backup: ${last.label || new Date(last.created).toLocaleString()} (${last.count} records)`
    : backups === null ? 'Loading…' : 'No backups yet'

  return (
    <div className="bkp-card">
      <div className="bkp-title">{title}</div>
      <div className="bkp-hint">{hint}</div>
      <div className="bkp-meta">{lastLine}</div>
      <div className="bkp-row">
        <button type="button" className="bkp-btn" disabled={busy} onClick={backupNow}>
          {busy ? 'Working…' : 'Back Up Now'}
        </button>
        <button type="button" className="bkp-btn" disabled={busy || !(backups && backups.length)}
          onClick={() => setRestoreOpen(v => !v)}>
          Restore{restoreOpen ? ' ▾' : '…'}
        </button>
      </div>
      {err && <div className="bkp-err">{err}</div>}
      {restoreOpen && backups && (
        <div className="bkp-list">
          {backups.map(b => (
            <div key={b.id} className="bkp-item">
              <span className="bkp-label">
                {b.label || new Date(b.created).toLocaleString()}
                <span className="bkp-count">{b.count} records</span>
              </span>
              <button type="button" className="bkp-btn" disabled={busy} onClick={() => doRestore(b)}>
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
