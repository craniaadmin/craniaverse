// The programme-colour card behind a page's settings gear, plus the swatch
// picker it uses. Shared by Customers and Students: both tint their
// programme pills by type, and both write to the same catColors the
// Programs page keeps, so a change on one shows up everywhere.
import React, { useState } from 'react'
import { TINTS, DEFAULT_CAT_COLOR } from '../data/programCategories'

export const CATCOLORS_CSS = `
.catcolors-row{display:flex;align-items:center;gap:9px;padding:4px 0}
.catcolors-name{flex:1;min-width:0;font-size:12px;font-weight:600;color:#2E2516;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.catcolors-dot{width:22px;height:22px;border-radius:50%;flex:none;border:2px solid #fff;
    box-shadow:0 0 0 1px #d8d3c6;cursor:pointer;padding:0}
.catcolors-pop{position:fixed;z-index:301;background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:10px;display:flex;gap:7px;flex-wrap:wrap;width:172px}
.catcolors-pop .sw{width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid #fff;
    box-shadow:0 0 0 1px #d8d3c6}
`

function SwatchPop({ x, y, current, onPick, onClose }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={onClose} />
      <div className="catcolors-pop" style={{ left: Math.min(x, window.innerWidth - 190), top: y }}>
        {TINTS.concat(['#2E2516', '#FFFFFF', DEFAULT_CAT_COLOR]).map(c => (
          <div key={c} className="sw" style={{
            background: c,
            outline: String(current || '').toLowerCase() === c.toLowerCase() ? '2px solid #2E2516' : undefined,
          }} title={c} onClick={e => { e.stopPropagation(); onPick(c) }} />
        ))}
      </div>
    </>
  )
}

export function ColorDot({ color, onPick }) {
  const [pos, setPos] = useState(null)
  return (
    <>
      <button type="button" className="catcolors-dot" title="Click to change colour"
        style={{ background: color || DEFAULT_CAT_COLOR }}
        onClick={e => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          setPos({ x: r.left, y: r.bottom + 6 })
        }} />
      {pos && <SwatchPop x={pos.x} y={pos.y} current={color}
        onPick={c => { onPick(c); setPos(null) }} onClose={() => setPos(null)} />}
    </>
  )
}

/* `categories` is [{ cat, n }] — the types actually in use, with how many
   enrolments each covers, so the list is worth reading. */
export default function CategoryColors({ categories, tintFor, onCatColor }) {
  return (
    <div className="bkp-card">
      <div className="bkp-title">Programme Colours</div>
      <div className="bkp-hint">
        Programme pills are tinted by type. These are the same colours the
        Programs page uses, so a change here shows up there too.
      </div>
      {categories.length === 0 ? (
        <div className="bkp-meta">No programme types in use yet.</div>
      ) : categories.map(({ cat, n }) => (
        <div key={cat} className="catcolors-row">
          <ColorDot color={tintFor(cat)} onPick={c => onCatColor(cat, c)} />
          <span className="catcolors-name">{cat}</span>
          <span className="bkp-count">{n}</span>
        </div>
      ))}
    </div>
  )
}
