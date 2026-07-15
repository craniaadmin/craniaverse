// Small shared UI primitives used by the four finance pages
// (Invoices / Payments / Receipts / Accounting). Kept here so the
// page files stay focused on their own logic.
import { X } from 'lucide-react'
import { STATUS_STYLE } from '../data/finance'

export function PageShell({ children }) {
  return <div className="page">{children}</div>
}

export function Loading({ label = 'Loading…' }) {
  return (
    <>
      <div className="page-head"><h2 className="page-title">{label}</h2></div>
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>{label}</div>
    </>
  )
}

export function OfflineBanner() {
  return (
    <div style={{
      background: '#fffbf0', border: '1px solid #f4d67a', color: '#8a6a00',
      padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
    }}>
      Working offline — changes will retry when the server is reachable.
    </div>
  )
}

export function SummaryStrip({ cells }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
      {cells.map(({ label, value, color }) => (
        <div key={label} style={{
          background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
          padding: '14px 18px', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--ink)' }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export function Th({ children, align = 'left', style = {} }) {
  return (
    <th style={{
      fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700,
      textAlign: align, padding: '12px 14px', ...style,
    }}>{children}</th>
  )
}

export function Td({ children, align = 'left', style = {}, colSpan }) {
  return (
    <td colSpan={colSpan} style={{
      padding: '11px 14px', fontSize: 13, color: 'var(--ink)',
      textAlign: align, verticalAlign: 'middle', ...style,
    }}>{children}</td>
  )
}

export function IconButton({ children, onClick, title, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--line)' : 'var(--ink-soft)', padding: 5, marginLeft: 2,
      }}>{children}</button>
  )
}

export function StatusPill({ s }) {
  const st = STATUS_STYLE[s] || STATUS_STYLE.sent
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
      background: st.bg, color: st.fg, fontSize: 11, fontWeight: 700,
      letterSpacing: '.4px', textTransform: 'uppercase',
    }}>{st.label}</span>
  )
}

export function Modal({ title, onClose, children, width = 720 }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,25,40,.45)',
      display: 'grid', placeItems: 'center', zIndex: 200, padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#fff', borderRadius: 16, width, maxWidth: '100%',
        boxShadow: '0 20px 60px rgba(15,25,40,.2)', overflow: 'hidden',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          background: 'var(--header-blue)', padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 700 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--ink-soft)' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '22px 24px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}

export function ModalFooter({ onClose, onSave, saveLabel = 'Save', canSave = true }) {
  return (
    <div style={{ marginTop: 22, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn" onClick={onSave} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.45 }}>
        {saveLabel}
      </button>
    </div>
  )
}

export function FieldLabel({ children }) {
  return (
    <label style={{
      display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)',
      marginBottom: 6, letterSpacing: '.4px', textTransform: 'uppercase',
    }}>{children}</label>
  )
}

export function Field({ label, children }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>
}
