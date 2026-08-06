/* THROWAWAY verification harness — deleted before the turn ends. */
import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AccountMenu, { ACCOUNT_CSS } from './components/AccountMenu'

const ME = { id: 'u1', email: 'anah.mirak@gmail.com', name: 'Claude Code', role: 'admin', active: true, lastLoginAt: '2026-08-06T09:00:00Z', initials: 'CC' }
const USERS = [
  { id: 'u3', email: 'tas.kim@craniaschools.com', name: 'Tas Kim', role: 'readonly', active: false, lastLoginAt: '', initials: 'TK' },
  ME,
  { id: 'u2', email: 'rob.stone@craniaschools.com', name: 'Rob Stone', role: 'staff', active: true, lastLoginAt: '2026-08-04T09:00:00Z', initials: 'RS' },
]
const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } })
window.__calls = []
window.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' ? input : String(input?.url || input)
  const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  const method = (init.method || 'GET').toUpperCase()
  let body = null
  try { body = init.body ? JSON.parse(init.body) : null } catch { body = init.body }
  if (method !== 'GET') window.__calls.push({ method, path, body })
  if (path === '/api/users' && method === 'GET') return json(USERS)
  const m = path.match(/^\/api\/users\/([^/]+)$/)
  if (m && method === 'PUT') { const u = USERS.find(x => x.id === m[1]); Object.assign(u, body); return json(u) }
  if (m && method === 'DELETE') return json({ ok: true })
  if (/^\/api\/users\/[^/]+\/password$/.test(path)) return json({ ok: true })
  return json({}, 404)
}

function Harness() {
  useEffect(() => {
    const t = setTimeout(() => {
      document.querySelector('.acct .avatar')?.click()
      setTimeout(() => {
        const b = [...document.querySelectorAll('.acct button')].find(x => /Accounts and access/i.test(x.textContent || ''))
        b?.click()
      }, 150)
    }, 150)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="app">
      <style>{ACCOUNT_CSS}</style>
      {/* a sidebar sample so its contrast can be measured */}
      <div className="app-shell">
        <nav className="sidebar">
          <div className="sidebar-nav">
            <button className="sidebar-item">Students</button>
            <button className="sidebar-item active">Staff</button>
            <hr className="sidebar-divider" />
            <button className="sidebar-item">Finance</button>
          </div>
        </nav>
        <main className="app-main" style={{ padding: 24, minHeight: 600 }}>
          <AccountMenu user={ME} onLogout={() => {}} />
        </main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')).render(<Harness />)
