import { Bell, LogOut } from 'lucide-react'
import { SUBMENUS } from '../data/mockData'
import BrandMark from './BrandMark'

// Top bar for the v7 mockup layout — logo + section-title + submenu
// pills for the active sidebar section, plus the notification /
// sign-out actions on the right.
export default function TopNav({ section, sub, onSubSelect, onLogout }) {
  const subs = SUBMENUS[section] || []
  return (
    <header className="topbar-v7">
      <div className="brandwrap">
        <BrandMark height={22} />
      </div>
      <span className="title">CraniaVerse</span>
      <div className="spacer" />
      <div className="submenu">
        {subs.map(label => (
          <button
            key={label}
            className={'appbtn' + (label === sub ? ' active' : '')}
            onClick={() => onSubSelect(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <button className="icon-btn" title="Notifications"><Bell size={16} /></button>
      <button className="icon-btn" title="Sign out" onClick={onLogout}><LogOut size={16} /></button>
      <div className="avatar">AD</div>
    </header>
  )
}
