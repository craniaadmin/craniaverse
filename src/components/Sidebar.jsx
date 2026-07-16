import { SECTIONS } from '../data/mockData'

export default function Sidebar({ section, onSelect }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-nav">
        {SECTIONS.map((s, i) => {
          if (s.divider) return <hr key={`d${i}`} className="sidebar-divider" />
          const active = s.id === section
          return (
            <button
              key={s.id}
              className={'sidebar-item' + (active ? ' active' : '')}
              onClick={() => onSelect(s.id)}
            >
              {s.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
