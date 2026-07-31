import './__ctsetup.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Contests from './pages/Contests.jsx'
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) return <pre id="harness-error" style={{ whiteSpace: 'pre-wrap', color: '#a12626' }}>{String((this.state.err && this.state.err.stack) || this.state.err)}</pre>
    return this.props.children
  }
}
createRoot(document.getElementById('root')).render(
  <div style={{ background: '#F4F7F8', minHeight: '100vh' }}><Boundary><Contests onNavigate={() => {}} /></Boundary></div>)
