// The right-click row menu every list page uses. Presentational only — no
// page logic lives here.
//
// The column show/hide menu used to live here too, as a fixed-position
// popover anchored to its button. It is now ColumnsMenu in PageActions,
// which opens inside the settings panel instead of as a second floating
// layer over it.
import React, { useEffect, useRef } from 'react'

export const TABLECHROME_CSS = `
.tc-menu{position:fixed;z-index:230;background:#fff;border:1px solid #E7EBE7;border-radius:10px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:5px;min-width:200px}
.tc-menu button{display:block;width:100%;text-align:left;background:none;border:none;
    padding:9px 12px;font:inherit;font-size:12.5px;color:#2E2516;cursor:pointer;border-radius:7px}
.tc-menu button:hover{background:#E4EFF3}
.tc-menu button.danger{color:#C0392B}
`

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
