// TEMPORARY verification harness — delete after use.
// Mounts each repaired page with fetch stubbed so it goes through
// loading:true -> loading:false, the transition that triggered
// "rendered more hooks than during the previous render" when useHistory
// sat below the `loading` early return.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { StoreProvider } from '../data/store.jsx'

// Superset payload: whichever key a page reads, it gets an array.
const FIXTURE = {
  contacts: [{ id: 'a1', name: 'Acme Supplies', category: 'Vendor/Supplier' }],
  leads: [{ id: 'l1', name: 'Sample Lead', status: 'New' }],
  campaigns: [{ id: 'c1', name: 'Sample Campaign' }],
  items: [], accounts: [], products: [], inventory: [], store: [], data: {},
}

window.fetch = (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase()
  const body = method === 'GET' ? FIXTURE : { ok: true }
  return new Promise(resolve =>
    setTimeout(() => resolve({
      ok: true, status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }), 10))
}

const PAGES = [
  ['Contacts',    () => import('../pages/Contacts.jsx')],
  ['Marketing',   () => import('../pages/Marketing.jsx')],
  ['Leads',       () => import('../pages/Leads.jsx')],
  ['ITAccounts',  () => import('../pages/ITAccounts.jsx')],
  ['CraniaStore', () => import('../pages/CraniaStore.jsx')],
  ['Inventory',   () => import('../pages/Inventory.jsx')],
]

function makeBoundary(onError) {
  return class extends React.Component {
    constructor(p) { super(p); this.state = { err: null } }
    static getDerivedStateFromError(err) { return { err } }
    componentDidCatch(err) { onError(err) }
    render() { return this.state.err ? null : this.props.children }
  }
}

const results = []

for (const [name, load] of PAGES) {
  let caught = null
  try {
    const { default: Page } = await load()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const Boundary = makeBoundary(err => { caught = err })
    const root = createRoot(host)
    root.render(<StoreProvider><Boundary><Page /></Boundary></StoreProvider>)
    // Let the stubbed fetch resolve and force the second render.
    await new Promise(r => setTimeout(r, 400))
    root.unmount()
    host.remove()
  } catch (err) {
    caught = err
  }
  const hookErr = caught && /rendered more hooks|fewer hooks|order of Hooks/i.test(caught.message)
  results.push({ name, ok: !hookErr, message: caught ? caught.message : null })
}

const failures = results.filter(r => !r.ok)
const out = document.createElement('pre')
out.id = 'verify-verdict'
out.textContent = JSON.stringify({
  verdict: failures.length === 0 ? 'ALL_PASS_NO_HOOK_ERRORS' : 'HOOK_ERRORS_REMAIN',
  results,
}, null, 2)
document.body.appendChild(out)
console.log(out.textContent)
