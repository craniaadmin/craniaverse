// API-level smoke tests. Hits each /api/* endpoint and checks
// the response is well-formed. Doesn't require a browser, so
// these are the fastest tests in the suite.

import { BASE_URL } from './config.js'
import { assert, assertEq, runTest } from './framework.js'

async function fetchJson(path, opts = {}) {
  const url = `${BASE_URL}${path}`
  const r = await fetch(url, opts)
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text }
}

export async function runApiTests() {
  return [
    await runTest('GET /api/health returns {ok:true}', async () => {
      const { status, json } = await fetchJson('/api/health')
      assertEq(status, 200, 'status')
      assert(json?.ok === true, `expected ok:true, got ${JSON.stringify(json)}`)
    }),

    await runTest('GET /api/registrations returns array', async () => {
      const { status, json } = await fetchJson('/api/registrations')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
      assert(json.length > 0, 'expected at least one registration')
      assert(json[0]?.id, 'first record should have an id')
    }),

    await runTest('GET /api/staff returns array', async () => {
      const { status, json } = await fetchJson('/api/staff')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
      assert(json.length > 0, 'expected at least one staff member')
      assert(json[0]?.firstName !== undefined, 'first record should have firstName')
    }),

    await runTest('GET /api/programs returns array', async () => {
      const { status, json } = await fetchJson('/api/programs')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
      assert(json.length > 0, 'expected at least one program')
    }),

    await runTest('GET /api/rules returns array', async () => {
      const { status, json } = await fetchJson('/api/rules')
      assertEq(status, 200, 'status')
      assert(Array.isArray(json), 'expected array response')
    }),

    await runTest('GET /api/staff-board returns {lists:[...]}', async () => {
      const { status, json } = await fetchJson('/api/staff-board')
      assertEq(status, 200, 'status')
      assert(json && typeof json === 'object', 'expected object response')
      assert(Array.isArray(json.lists), 'expected lists array')
    }),

    await runTest('GET /api/comments/<id> returns object', async () => {
      const { status, json } = await fetchJson('/api/comments/seed')
      assertEq(status, 200, 'status')
      assert(json && typeof json === 'object' && !Array.isArray(json), 'expected object response')
    }),

    await runTest('Unknown route returns 404', async () => {
      const { status } = await fetchJson('/api/definitely-not-a-real-route-' + Date.now())
      assert(status === 404, `expected 404, got ${status}`)
    }),
  ]
}
