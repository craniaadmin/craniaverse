/* THROWAWAY verification harness — deleted before the turn ends. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StoreProvider } from './data/store'
import ToDo from './pages/ToDo'

const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } })
window.fetch = async (input) => {
  const raw = typeof input === 'string' ? input : String(input?.url || input)
  const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  if (path.includes('/backups')) return json([])
  if (path === '/api/todo') return json({
    lists: [{ id: 'L1', name: 'Today' }, { id: 'L2', name: 'This week' }],
    items: [
      { id: 't1', listId: 'L1', text: 'Call the Gauss coordinator', done: false, priority: 'high' },
      { id: 't2', listId: 'L1', text: 'Order contest booklets', done: false, priority: 'medium' },
      { id: 't3', listId: 'L2', text: 'Draft the September newsletter', done: false, priority: 'low' },
    ],
    checklists: [],
  })
  if (path === '/api/registrations') return json([])
  if (path === '/api/programs') return json([])
  if (path === '/api/programs-state') return json({})
  if (path === '/api/comments') return json({})
  if (path === '/api/rules') return json([])
  if (path === '/api/staff') return json([])
  if (path === '/api/calendar') return json({ calendars: [], events: [] })
  if (path === '/api/contacts') return json({ contacts: [] })
  if (path === '/api/finance') return json({ invoices: [], payments: [], meta: {} })
  return json({}, 404)
}

createRoot(document.getElementById('root')).render(
  <StoreProvider>
    <div className="app"><main className="app-main">
      <ToDo onNavigate={() => {}} />
    </main></div>
  </StoreProvider>,
)
