// The action bar every page carries: Undo, Redo, whatever that page
// adds of its own, then Export CSV and the settings gear — in that
// order, so the same control is in the same place on every screen.
//
// Pages differ in what they can offer. A page with no history passes no
// undo handler and the button is disabled with a tooltip saying so,
// rather than being missing on some screens and present on others.
import React, { useEffect, useRef, useState } from 'react'
import { Undo2, Redo2, Download } from 'lucide-react'
import BackupPanel, { BACKUP_CSS } from './BackupPanel'

export const PAGEACTIONS_CSS = BACKUP_CSS + `
.pgacts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px;position:relative}
.pgacts button{background:#fff;border:1px solid #e2ded2;color:#2E2516;padding:6px 12px;
  font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit;
  display:inline-flex;align-items:center;gap:5px}
.pgacts button:hover:not(:disabled){background:#f4f2ea}
.pgacts button:disabled{opacity:.45;cursor:default}
.pgacts .grow{flex:1}
.pgacts .gearbtn{font-size:14px;line-height:1;padding:6px 10px}
/* Pages used to carry a big round "+" in a row of its own above this
   bar. Those rows are gone and the buttons moved in here, so bring them
   down to the size of everything else rather than leaving a 42px circle
   towering over 28px buttons. */
.pgacts .icon-btn{width:auto;height:auto;border-radius:8px;padding:6px 10px;
    background:var(--card-teal,#5FA09E);color:#fff;border:none;display:inline-flex;
    align-items:center;justify-content:center}
.pgacts .icon-btn:hover{background:#4c8987}
.pgacts .icon-btn svg{width:15px;height:15px}
/* Tab groups (Attendance, Comments) moved in whole; keep them tight. */
.pgacts > div{display:inline-flex;align-items:center;gap:6px}
.pgacts .histnote{position:absolute;top:100%;left:0;margin-top:4px;z-index:5;
  background:#E4EFF3;border:1px solid #A6E2F9;border-radius:9px;padding:6px 11px;
  font-size:12.5px;font-weight:600;color:#2E2516;white-space:nowrap}
/* The gear opens one rectangle, not a stack of cards. The container owns
   the border, radius and shadow; Tools and Backups are flat sections
   inside it — same width, divided by a hairline, joined into one shape. */
.pgsettings{position:absolute;right:0;top:100%;z-index:240;width:340px;margin-top:4px;
  background:#fff;border:1px solid #E7EBE7;border-radius:12px;
  box-shadow:0 8px 24px rgba(46,37,22,.18)}
/* Sections carry no card of their own. Leaving them transparent means the
   container's rounded corners show through without needing to clip, which
   would trap anything inside that wants to overflow. */
.pgsettings .pgscard,
.pgsettings > .bkp-card{background:none;border:none;box-shadow:none;border-radius:0;
  padding:12px 14px;margin:0}
.pgsettings > * + *{border-top:1px solid #E7EBE7}
/* One heading treatment behind the gear, so Backups does not announce
   itself in a different colour and size from Tools. */
.pgsettings .pgshead,
.pgsettings .bkp-title{font-size:11.5px;font-weight:700;color:#5FA09E;
  text-transform:uppercase;letter-spacing:.4px;margin-bottom:9px}
/* Full-width rows rather than a row of pills — a menu, not a toolbar. */
.pgsettings .pgsitem{display:flex;align-items:center;gap:8px;width:100%;
  background:#fff;border:1px solid #D5D0C4;border-radius:8px;padding:8px 11px;
  font:inherit;font-size:12.5px;font-weight:600;color:#2E2516;cursor:pointer;
  text-align:left;margin-bottom:7px}
.pgsettings .pgsitem:last-child{margin-bottom:0}
.pgsettings .pgsitem:hover:not(:disabled){background:#F1F3F4;border-color:#5FA09E}
.pgsettings .pgsitem:disabled{opacity:.45;cursor:default}
/* Anything a page drops in as settingsExtra gets the same treatment, so
   a page does not have to know this component's class names. */
.pgsettings .pgscard > button:not(.pgsitem){display:flex;align-items:center;gap:8px;
  width:100%;background:#fff;border:1px solid #D5D0C4;border-radius:8px;padding:8px 11px;
  font:inherit;font-size:12.5px;font-weight:600;color:#2E2516;cursor:pointer;
  text-align:left;margin-bottom:7px}
.pgsettings .pgscard > button:not(.pgsitem):hover{background:#F1F3F4;border-color:#5FA09E}
/* Anything a page drops into settingsExtra that styles itself as a card —
   Programs' "Earlier Backups", say — is flattened to line up with the
   tools above it rather than sitting there as a card within a card. */
.pgsettings .pgscard .bkp-card{background:none;border:none;box-shadow:none;
  border-radius:0;padding:10px 0 0;margin:3px 0 0;border-top:1px solid #E7EBE7}
`

/* Turns rows of plain objects into a CSV the way a spreadsheet expects
   it: quotes anything containing a comma, quote or newline, and CRLF
   line endings so Excel does not run the whole file onto one line. */
export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.map(c => esc(c.label ?? c.key)).join(',')]
  for (const r of rows) {
    lines.push(columns.map(c => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','))
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Settings({ collection, base, hint, confirm, onRestored, onClose, onExport, canExport, children }) {
  const ref = useRef(null)
  /* A page either names a shared snapshots collection or its own older
     route ("customers", "staff"). Both resolve to the same panel in the
     same place, so the gear reads the same on every page rather than the
     older ones showing their backups folded in among the tools. */
  const backupBase = base || (collection ? `snapshots/${collection}` : null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])
  return (
    <div className="pgsettings" ref={ref} onMouseDown={e => e.stopPropagation()}>
      {/* Export and the page's own occasional controls live in here now.
          They were in the bar, where they sat beside Undo and Redo and
          made every page look like it had five equally important
          actions. Undo and Redo are the ones reached often; the rest are
          a few times a term. */}
      <div className="pgscard">
        <div className="pgshead">Tools</div>
        <button className="pgsitem" disabled={!canExport} onClick={onExport}
          title={canExport ? 'Download what is on this page as a CSV file'
            : 'Nothing on this page to export yet'}>
          <Download size={13} /> Export CSV
        </button>
        {/* A page can pass a function instead of a node to get the closer.
            Anything that opens something of its own — the column chooser
            especially — has to shut this panel on the way, or it opens
            underneath it: the chooser is a fixed-position popover at a
            lower z-index than this one, so it would be there and invisible. */}
        {typeof children === 'function' ? children(onClose) : children}
      </div>
      {collection && (
        <BackupPanel base={`snapshots/${collection}`} hint={hint}
          onRestored={async () => { if (onRestored) await onRestored(); onClose() }} />
      )}
    </div>
  )
}

export default function PageActions({
  onUndo, onRedo, undoLabel, redoLabel, histBusy, histNote,
  csvName, csvColumns, csvRows,
  backupCollection, backupHint, onRestored,
  settingsExtra, children,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const canExport = Boolean(csvName && csvColumns?.length)

  return (
    <div className="pgacts">
      <button disabled={!onUndo || !undoLabel || histBusy}
        title={undoLabel ? `Undo: ${undoLabel}  (Ctrl+Z)`
          : onUndo ? 'Nothing to undo' : 'This page does not track changes yet'}
        onClick={onUndo}><Undo2 size={13} /> Undo</button>

      <button disabled={!onRedo || !redoLabel || histBusy}
        title={redoLabel ? `Redo: ${redoLabel}  (Ctrl+Y)`
          : onRedo ? 'Nothing to redo' : 'This page does not track changes yet'}
        onClick={onRedo}><Redo2 size={13} /></button>

      {/* Page-specific controls that are used often enough to earn a
          place in the bar. The occasional ones go under the gear via
          settingsExtra. */}
      {children}

      <span className="grow" />

      <button className="gearbtn" title="Export, backups and settings"
        onClick={() => setSettingsOpen(v => !v)}>⚙</button>

      {settingsOpen && (
        <Settings collection={backupCollection} hint={backupHint}
          onRestored={onRestored} onClose={() => setSettingsOpen(false)}
          canExport={canExport}
          onExport={() => {
            if (!canExport) return
            downloadCsv(csvName, csvColumns,
              typeof csvRows === 'function' ? csvRows() : (csvRows || []))
            setSettingsOpen(false)
          }}>
          {settingsExtra}
        </Settings>
      )}

      {histNote && <div className="histnote" role="status">{histNote}</div>}
    </div>
  )
}
