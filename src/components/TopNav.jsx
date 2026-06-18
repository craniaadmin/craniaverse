import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Bell, LogOut } from 'lucide-react'
import { NAV } from '../data/mockData'
import BrandMark from './BrandMark'

export default function TopNav({ current, onNavigate, onLogout }) {
  const [open, setOpen] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // Build the public form URL from whichever origin the admin is on; in dev
  // (Vite on :5173) we override via VITE_API_URL. Defaults to same origin.
  const API_BASE = import.meta.env?.VITE_API_URL ?? ''

  // A few nav items open public-facing pages in a new tab instead of routing in-app.
  const EXTERNAL_PAGES = {
    'Staff Information Form': `${API_BASE}/staff-form`,
  }

  const go = (page) => {
    const ext = EXTERNAL_PAGES[page]
    if (ext) { window.open(ext, '_blank'); setOpen(null); return }
    onNavigate(page); setOpen(null)
  }

  return (
    <header className="topbar" ref={ref}>
      <div className="brand">
        <BrandMark height={58} />
      </div>

      <nav className="nav">
        {NAV.map((group, i) => {
          const single = group.items.length === 1
          const active = group.items.includes(current)
          return (
            <div className="nav-item" key={group.label}>
              <button
                className={'nav-btn' + (active ? ' active' : '')}
                onClick={() => single ? go(group.items[0]) : setOpen(open === i ? null : i)}
              >
                {group.label}
                {!single && <ChevronDown size={15} strokeWidth={2.5} />}
              </button>
              {!single && open === i && (
                <div className="dropdown">
                  {group.items.map((it) => (
                    <button key={it} onClick={() => go(it)}>{it}</button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="topbar-right">
        <button className="icon-btn" title="Notifications"><Bell size={20} /></button>
        <button className="icon-btn" title="Sign out" onClick={onLogout}><LogOut size={19} /></button>
        <div className="avatar">AD</div>
      </div>
    </header>
  )
}
