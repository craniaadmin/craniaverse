import './__ctsetup.js'
import React, { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Contests from './pages/Contests.jsx'
import Programs from './pages/Programs.jsx'

// Mirrors App.jsx's navigate(target, recordId) + pendingRecordId contract.
function Shell() {
  const [page, setPage] = useState('Contests')
  const [pendingRecordId, setPendingRecordId] = useState(null)
  const navigate = useCallback((target, recordId = null) => {
    setPage(target); setPendingRecordId(recordId)
  }, [])
  const clear = useCallback(() => setPendingRecordId(null), [])
  window.__page = page
  return (
    <div>
      <div style={{ padding: 6, background: '#ddd', fontSize: 12 }}>
        <button id="go-contests" onClick={() => navigate('Contests')}>Contests</button>
        <button id="go-programs" onClick={() => navigate('Programs')}>Programs</button>
        <span id="cur-page"> page={page} pending={String(pendingRecordId)}</span>
      </div>
      {page === 'Contests'
        ? <Contests onNavigate={navigate} />
        : <Programs initialProgramId={pendingRecordId} onConsumeInitialProgram={clear} />}
    </div>
  )
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) return <pre id="harness-error" style={{ whiteSpace: 'pre-wrap', color: '#a12626' }}>{String((this.state.err && this.state.err.stack) || this.state.err)}</pre>
    return this.props.children
  }
}
createRoot(document.getElementById('root')).render(
  <div style={{ background: '#F4F7F8', minHeight: '100vh' }}><Boundary><Shell /></Boundary></div>)
