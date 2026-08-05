// The two popovers every list page uses: the column show/hide menu and the
// right-click row menu. Presentational only — no page logic lives here.
import React, { useEffect, useRef } from 'react'

export const TABLECHROME_CSS = `
.tc-pop{position:fixed;z-index:220;background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:8px 12px 10px;min-width:190px;max-height:360px;
    overflow:auto;color:#2E2516;font-family:inherit}
.tc-pop .h{font-size:11px;font-weight:700;color:#6B6455;text-transform:uppercase;
    letter-spacing:.4px;margin:2px 0 7px}
.tc-pop label{display:flex;align-items:center;gap:7px;padding:4px 0;font-size:12.5px;cursor:pointer}
.tc-pop label.locked{opacity:.5;cursor:default}
.tc-pop input{width:13px;height:13px;accent-color:#5FA09E;cursor:pointer;margin:0}
.tc-pop .row{display:flex;gap:8px;margin-top:9px;border-top:1px solid #E7EBE7;padding-top:8px}
.tc-pop .row button{flex:1;background:#F1F3F4;border:1px solid #D5D0C4;border-radius:7px;padding:5px 8px;
    font:inherit;font-size:11.5px;font-weight:600;color:#2E2516;cursor:pointer}
.tc-menu{position:fixed;z-index:230;background:#fff;border:1px solid #E7EBE7;border-radius:10px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:5px;min-width:200px}
.tc-menu button{display:block;width:100%;text-align:left;background:none;border:none;
    padding:9px 12px;font:inherit;font-size:12.5px;color:#2E2516;cursor:pointer;border-radius:7px}
.tc-menu button:hover{background:#E4EFF3}
.tc-menu button.danger{color:#C0392B}
`

/* Anchored under the button that opened it, and nudged left if that would
   put it off the right edge. */
export const ColsPop = React.forwardRef(function ColsPop(
  { rect, cols, hiddenCols, lockedKey, onToggle, onAll, onNone }, ref,
) {
  const style = {
    top: Math.min(rect.bottom + 6, window.innerHeight - 380),
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 210)),
  }
  return (
    <div className="tc-pop" ref={ref} style={style}>
      <div className="h">Show Columns</div>
      {cols.map(c => {
        const locked = c.k === lockedKey
        return (
          <label key={c.k} className={locked ? 'locked' : ''}
            title={locked ? 'This column names the row, so it always shows' : ''}>
            <input type="checkbox" disabled={locked} checked={locked || !hiddenCols[c.k]}
              onChange={e => onToggle(c.k, e.target.checked)} />
            {c.l}
          </label>
        )
      })}
      <div className="row">
        <button type="button" onClick={onAll}>Show All</button>
        <button type="button" onClick={onNone}>Hide All</button>
      </div>
    </div>
  )
})

export function CtxMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const style = {
    top: Math.min(y, window.innerHeight - 20 - items.length * 38),
    left: Math.min(x, window.innerWidth - 210),
  }
  return (
    <div className="tc-menu" ref={ref} style={style}>
      {items.map((it, i) => (
        <button key={i} className={it.danger ? 'danger' : ''}
          onClick={() => { it.on(); onClose() }}>{it.label}</button>
      ))}
    </div>
  )
}
