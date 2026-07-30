// TEMPORARY harness entry. Delete with pgpreview.html and __pgstoremock.jsx.
import React from 'react'
import { createRoot } from 'react-dom/client'
import Programs from './pages/Programs.jsx'
import './index.css'

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      window.__renderError = (this.state.err && this.state.err.stack) || String(this.state.err)
      return <pre id="boom" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{window.__renderError}</pre>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <div style={{ padding: 20, maxWidth: 1800, margin: '0 auto', background: '#F4F7F8', minHeight: '100vh' }}>
    <Boundary><Programs /></Boundary>
  </div>)
