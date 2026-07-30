import { createRoot } from 'react-dom/client'
import Projects from './pages/Projects.jsx'
import './index.css'
import SEED from './__projseed.json'
let pj = JSON.parse(JSON.stringify(SEED))
const real = window.fetch.bind(window)
const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (u, o) => {
  const s = String(u)
  if (s.includes('/api/projects/backups')) return json([])
  if (s.includes('/api/projects')) { if (o?.method === 'PUT') { pj = JSON.parse(o.body); return json({ ok: 1 }) } return json(pj) }
  return real(u, o)
}
window.__peek = () => pj
createRoot(document.getElementById('root')).render(<Projects />)
