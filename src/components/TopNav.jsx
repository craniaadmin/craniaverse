import { Bell } from 'lucide-react'
import { SUBMENUS } from '../data/mockData'
import BrandMark from './BrandMark'
import AccountMenu from './AccountMenu'

// Top bar for the v7 mockup layout — logo + the name of the page you are
// on + submenu pills for the active sidebar section, plus the
// notification / sign-out actions on the right.
//
// The page name lives here rather than as a heading on each page: it was
// the same word twice on every screen, and the second one pushed the
// actual content down. "CraniaVerse" is not repeated as text either —
// the logo already says it.
export default function TopNav({ section, sub, onSubSelect, onLogout, user }) {
  const subs = SUBMENUS[section] || []
  return (
    <header className="topbar-v7">
      <div className="brandwrap">
        <BrandMark height={34} />
      </div>
      {sub && <span className="title"><span className="sep">—</span>{sub}</span>}
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
      {/* Sign out lives under the avatar with the rest of the account
          items. A second one out here, one click from anything, was the
          only unguarded destructive control in the bar. */}
      <AccountMenu user={user} onLogout={onLogout} />
    </header>
  )
}
