// Sessions last 3 hours. Rather than dropping someone mid-sentence at
// the three-hour mark, this warns two minutes out and offers to carry
// on; if nobody answers it saves whatever is outstanding and then
// signs out.
//
// Most editing already writes 400ms after the last keystroke, so there
// is rarely anything pending. The flush is for the case that is not
// rare enough to ignore: someone typing at the moment it expires.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { flushAll } from '../data/pendingSaves'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const WARN_MS = 2 * 60 * 1000

export const SESSION_CSS = `
.sessov{position:fixed;inset:0;background:rgba(46,37,22,.45);z-index:900;
  display:flex;align-items:center;justify-content:center;padding:20px}
.sessmodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(46,37,22,.34);
  padding:20px 22px;width:100%;max-width:420px;color:#2E2516}
.sessmodal h2{margin:0 0 8px;font-size:16px;display:flex;align-items:center;gap:8px}
.sessmodal p{font-size:13px;color:#6B6455;line-height:1.55;margin:0 0 6px}
.sessmodal .count{font-size:30px;font-weight:700;font-variant-numeric:tabular-nums;
  color:#C0392B;margin:10px 0 4px}
.sessmodal .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.sessmodal .acts button{border-radius:8px;padding:9px 16px;font:inherit;font-size:13px;
  font-weight:700;cursor:pointer;border:none}
.sessmodal .acts .go{background:#5FA09E;color:#fff}
.sessmodal .acts .out{background:#F1F3F4;border:1px solid #D5D0C4;color:#2E2516}
`

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function SessionTimer({ expiresAt, onExtend, onExpire }) {
  const [left, setLeft] = useState(() => (expiresAt || 0) - Date.now())
  const [saving, setSaving] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => { firedRef.current = false }, [expiresAt])

  /* Driven by wall-clock time rather than by counting ticks: a laptop
     that sleeps stops firing timers, and a session that quietly
     outlived its expiry because the machine was shut is exactly the
     thing a timeout is meant to prevent. */
  useEffect(() => {
    if (!expiresAt) return undefined
    const tick = () => setLeft(expiresAt - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const signOutNow = useCallback(async () => {
    if (firedRef.current) return
    firedRef.current = true
    setSaving(true)
    try {
      await flushAll()
      // Debounced writers fire 400ms after the last keystroke; give the
      // slowest of them room to land before the session goes.
      await new Promise(r => setTimeout(r, 700))
    } finally {
      setSaving(false)
      onExpire()
    }
  }, [onExpire])

  useEffect(() => {
    if (!expiresAt) return
    if (left <= 0 && !firedRef.current) signOutNow()
  }, [left, expiresAt, signOutNow])

  const extend = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/session/extend`, {
        method: 'POST', credentials: 'include',
      })
      if (!res.ok) { signOutNow(); return }
      const body = await res.json()
      onExtend(body.expiresAt)
    } catch {
      // Losing the network is not a reason to throw away unsaved work.
      onExtend(Date.now() + WARN_MS)
    }
  }

  if (!expiresAt || left > WARN_MS) return null

  return (
    <div className="sessov">
      <div className="sessmodal">
        <h2><Clock size={17} /> Still there?</h2>
        <p>
          You are signed out automatically after 3 hours. Anything you have typed is
          saved before that happens.
        </p>
        <div className="count">{saving ? 'Saving…' : mmss(left)}</div>
        <p>{saving ? 'Saving your work, then signing out.' : 'until you are signed out.'}</p>
        <div className="acts">
          <button className="out" onClick={signOutNow} disabled={saving}>Sign out now</button>
          <button className="go" onClick={extend} disabled={saving}>Stay signed in</button>
        </div>
      </div>
    </div>
  )
}
