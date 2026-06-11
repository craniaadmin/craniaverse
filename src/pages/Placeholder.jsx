import { Construction } from 'lucide-react'

export default function Placeholder({ title }) {
  return (
    <div className="page">
      <h2 className="page-title">{title}</h2>
      <div className="card" style={{ padding: 48, display: 'grid', placeItems: 'center', gap: 14, textAlign: 'center' }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--header-blue-soft)', display: 'grid', placeItems: 'center' }}>
          <Construction size={32} color="#2c7a7b" />
        </div>
        <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontWeight: 400 }}>{title}</h3>
        <p className="muted" style={{ maxWidth: 420, margin: 0 }}>
          This module is part of the CraniaVerse layout and is ready to be wired up to your data.
        </p>
      </div>
    </div>
  )
}
