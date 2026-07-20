// API-level smoke tests. Hits each /api/* endpoint and checks
// the response is well-formed. Doesn't require a browser, so
// these are the fastest tests in the suite.
//
// Most endpoints require a session cookie — see utils/auth.js.

import { BASE_URL } from './config.js'
import { assert, assertEq, runTest } from './framework.js'
import { authedFetch, authedJson } from './utils/auth.js'

// Public (no auth) fetch helper for endpoints on the allowlist.
async function fetchJson(path, opts = {}) {
  const r = await fetch(`${BASE_URL}${path}`, opts)
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text }
}

export async function runApiTests() {
  return [
    // ---- Public endpoints (no auth needed) ----
    await runTest('GET /api/health returns {ok:true}', async () => {
      const { status, json } = await fetchJson('/api/health')
      assertEq(status, 200, 'status')
      assert(json?.ok === true, `expected ok:true, got ${JSON.stringify(json)}`)
    }),

    await runTest('GET /api/me without cookie returns 401', async () => {
      const { status } = await fetchJson('/api/me')
      assertEq(status, 401, 'status')
    }),

    // ---- Authenticated endpoints ----
    await runTest('GET /api/registrations returns array', async () => {
      const { status, json } = await authedJson('/api/registrations')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
      assert(json.length > 0, 'expected at least one registration')
      assert(json[0]?.id, 'first record should have an id')
    }),

    await runTest('GET /api/staff returns array', async () => {
      const { status, json } = await authedJson('/api/staff')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
      assert(json.length > 0, 'expected at least one staff member')
      assert(json[0]?.firstName !== undefined, 'first record should have firstName')
    }),

    await runTest('GET /api/programs returns array', async () => {
      const { status, json } = await authedJson('/api/programs')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
      assert(json.length > 0, 'expected at least one program')
    }),

    await runTest('GET /api/rules returns array', async () => {
      const { status, json } = await authedJson('/api/rules')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
    }),

    await runTest('GET /api/staff-board returns {lists:[...]}', async () => {
      const { status, json } = await authedJson('/api/staff-board')
      assertEq(status, 200, 'status')
      assert(json && typeof json === 'object', 'expected object response')
      assert(Array.isArray(json.lists), 'expected lists array')
    }),

    await runTest('GET /api/comments/<id> returns object', async () => {
      const { status, json } = await authedJson('/api/comments/seed')
      assertEq(status, 200, 'status')
      assert(json && typeof json === 'object' && !Array.isArray(json), 'expected object response')
    }),

    await runTest('GET /api/inventory returns array', async () => {
      const { status, json } = await authedJson('/api/inventory')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
    }),

    await runTest('GET /api/todo returns {lists, items, checklists}', async () => {
      const { status, json } = await authedJson('/api/todo')
      assertEq(status, 200, 'status')
      assert(json && Array.isArray(json.items), 'expected items array')
      assert(Array.isArray(json.lists), 'expected lists array')
      assert(Array.isArray(json.checklists), 'expected checklists array')
    }),

    await runTest('GET /api/finance returns {invoices, payments, meta}', async () => {
      const { status, json } = await authedJson('/api/finance')
      assertEq(status, 200, 'status')
      assert(json && typeof json === 'object', 'expected object response')
      assert(Array.isArray(json.invoices), 'expected invoices array')
      assert(Array.isArray(json.payments), 'expected payments array')
      assert(json.meta && typeof json.meta.nextInvoiceNumber === 'number',
        `expected meta.nextInvoiceNumber number, got ${JSON.stringify(json.meta)}`)
    }),

    await runTest('GET /api/forms returns array', async () => {
      const { status, json } = await authedJson('/api/forms')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
    }),

    await runTest('GET /api/projects returns {cards, colOrder}', async () => {
      const { status, json } = await authedJson('/api/projects')
      assertEq(status, 200, 'status')
      assert(json && typeof json === 'object', 'expected object response')
      assert(Array.isArray(json.cards), 'expected cards array')
      assert(Array.isArray(json.colOrder), 'expected colOrder array')
    }),

    await runTest('GET /api/it-accounts returns {categories, accounts}', async () => {
      const { status, json } = await authedJson('/api/it-accounts')
      assertEq(status, 200, 'status')
      assert(json && typeof json === 'object', 'expected object response')
      assert(Array.isArray(json.categories), 'expected categories array')
      assert(Array.isArray(json.accounts), 'expected accounts array')
    }),

    await runTest('GET /api/tests/last-run is public and returns a snapshot or 404', async () => {
      // No auth cookie — this route is on the public allowlist so the
      // scheduled agent can poll it without a stored admin password.
      const { status, json } = await fetchJson('/api/tests/last-run')
      assert(status === 200 || status === 404, `expected 200 or 404, got ${status}`)
      if (status === 200) {
        assert(json && typeof json.total === 'number', `expected {total} in snapshot, got ${JSON.stringify(json)}`)
        assert(Array.isArray(json.failures), 'expected failures array in snapshot')
      } else {
        assert(json?.error, 'expected {error} on 404')
      }
    }),

    await runTest('Unknown route returns 404', async () => {
      // Hit it authenticated so a 401 doesn't mask the 404.
      const r = await authedFetch('/api/definitely-not-a-real-route-' + Date.now())
      assertEq(r.status, 404, `expected 404, got ${r.status}`)
    }),
  ]
}
