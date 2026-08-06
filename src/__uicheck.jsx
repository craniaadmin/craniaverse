/* THROWAWAY verification harness — deleted before the turn ends. */
import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PageActions, { PAGEACTIONS_CSS } from './components/PageActions'

const BACKUPS = [{
  id: 'b1', label: '2026-08-06, 11:45:29 a.m.', count: 1,
  created: '2026-08-06T11:45:29Z',
}]
const json = (v) => new Response(JSON.stringify(v),
  { status: 200, headers: { 'Content-Type': 'application/json' } })

window.fetch = async (input) => {
  const p = String(input?.url || input)
  if (p.includes('/backups')) return json(BACKUPS)
  return json({})
}

function Harness() {
  useEffect(() => {
    const t = setTimeout(() => {
      if (!document.querySelector('.pgsettings')) {
        document.querySelector('.pgacts .gearbtn')?.click()
      }
    }, 60)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="app">
      <main className="app-main" style={{ padding: 24, minHeight: 520 }}>
        <style>{PAGEACTIONS_CSS}</style>
        <PageActions
          onUndo={() => {}} onRedo={() => {}} undoLabel="an edit" redoLabel="an edit"
          csvName="check" csvColumns={[{ key: 'a', label: 'A' }]} csvRows={[{ a: 1 }]}
          backupBase="customers"
          backupHint="Snapshots of every calendar event and calendar (last 14 kept)."
          onRestored={() => {}}
          settingsExtra={close => (
            <button onClick={() => close()}>{'🖼'} Year Image</button>
          )}
        />
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Harness />)
