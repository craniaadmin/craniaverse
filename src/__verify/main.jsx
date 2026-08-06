// TEMPORARY verification harness — delete after use.
// Mounts the real Contacts page with fetch stubbed, so the component goes
// through loading:true -> loading:false exactly as it does in the app.
// That transition is what triggered "rendered more hooks than during the
// previous render" when useHistory sat below the `loading` early return.
import React from 'react'
import { createRoot } from 'react-dom/client'

const FIXTURE = {
  contacts: [
    { id: 'a1', name: 'Acme Supplies', category: 'Vendor/Supplier', contactPerson: 'Dana Reed', email: 'dana@acme.test', phone: '555-0100' },
    { id: 'b2', name: 'Northside Partner School', category: 'Partner School', contactPerson: 'Sam Ito', email: 'sam@northside.test', phone: '555-0111' },
  ],
}

// Answer every request the page makes, a tick later so `loading` is true first.
window.fetch = (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase()
  const body = method === 'GET' ? FIXTURE : { ok: true }
  return new Promise(resolve =>
    setTimeout(() => resolve({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }), 10))
}

const errors = []
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) { errors.push(err); console.error('[VERIFY] component threw:', err.message) }
  render() {
    if (this.state.err) return <pre id="verify-result">FAIL: {this.state.err.message}</pre>
    return this.props.children
  }
}

const { default: Contacts } = await import('../pages/Contacts.jsx')

createRoot(document.getElementById('root')).render(
  <Boundary><Contacts /></Boundary>
)

// Give the fetch + re-render time to land, then report.
setTimeout(() => {
  const el = document.createElement('div')
  el.id = 'verify-verdict'
  el.textContent = errors.length === 0
    ? 'VERIFY_PASS: Contacts rendered through loading->loaded with no hook error'
    : `VERIFY_FAIL: ${errors.map(e => e.message).join(' | ')}`
  document.body.appendChild(el)
  console.log(el.textContent)
}, 600)
