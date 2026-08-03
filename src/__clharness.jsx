import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ClassLists from './pages/ClassLists.jsx'
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) return <pre id="harness-error" style={{ whiteSpace: 'pre-wrap', color: '#a12626' }}>{String((this.state.err && this.state.err.message) || this.state.err)}</pre>
    return this.props.children
  }
}
createRoot(document.getElementById('root')).render(
  <div style={{ padding: 20, background: '#F4F7F8', minHeight: '100vh' }}>
    <Boundary><ClassLists onNavigate={(t, id) => { window.__nav = [t, id] }} /></Boundary>
  </div>)
