// Cross-endpoint workflow tests. These validate that the full
// PocketBase round-trip works: POST → record persists in GET →
// DELETE removes it cleanly. Each test cleans up after itself
// so re-running doesn't accumulate junk records.

import { BASE_URL } from './config.js'
import { assert, runTest } from './framework.js'

async function http(method, path, body) {
  const url = `${BASE_URL}${path}`
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text }
}

export async function runLogicTests() {
  return [
    await runTest('Registration round-trip: POST → GET → DELETE', async () => {
      const tag = `test-${Date.now()}`
      const created = await http('POST', '/api/registrations', {
        studentFirstName:  'PB-Test',
        studentLastName:   tag,
        studentEmail:      `${tag}@test.invalid`,
        studentDob:        '2010-01-01',
      })
      assert(created.status === 200 || created.status === 201,
        `POST expected 200/201, got ${created.status}: ${created.text?.slice(0, 200)}`)
      const newId = created.json?.id || created.json?.[0]?.id
      assert(newId, `POST response missing id: ${JSON.stringify(created.json).slice(0, 200)}`)

      try {
        const list = await http('GET', '/api/registrations')
        assert(list.status === 200, `GET expected 200, got ${list.status}`)
        const found = Array.isArray(list.json) && list.json.find(r => r.id === newId)
        assert(found, `expected to find newly-created record ${newId} in GET /api/registrations`)
        assert(
          (found.student?.lastName || '').toLowerCase() === tag.toLowerCase(),
          `lastName mismatch: expected ${tag}, got ${found.student?.lastName}`,
        )
      } finally {
        // Always attempt cleanup, even if assertions above failed.
        await http('DELETE', `/api/registrations/${newId}`).catch(() => {})
      }

      const after = await http('GET', '/api/registrations')
      const stillThere = Array.isArray(after.json) && after.json.find(r => r.id === newId)
      assert(!stillThere, `record ${newId} should be gone after DELETE`)
    }),

    await runTest('Cash entry persists and updates balance', async () => {
      const list = await http('GET', '/api/registrations')
      assert(list.status === 200, `GET status ${list.status}`)
      const target = Array.isArray(list.json) && list.json.find(r => r.id === 'seed')
      if (!target) {
        // Skip cleanly — no seed record to operate on
        return
      }
      const before = target.student?.craniaCash || 0
      const r = await http('POST', '/api/registrations/seed/cashEntry', {
        delta: 1, reason: 'pb-test increment',
      })
      assert(r.status === 200, `cashEntry status ${r.status}: ${r.text?.slice(0, 200)}`)
      assert(r.json?.balance === before + 1, `expected balance ${before + 1}, got ${r.json?.balance}`)

      // Undo so the test is idempotent across runs.
      await http('POST', '/api/registrations/seed/cashEntry', {
        delta: -1, reason: 'pb-test undo',
      }).catch(() => {})
    }),

    await runTest('Programs endpoint returns expected shape', async () => {
      const r = await http('GET', '/api/programs')
      assert(r.status === 200, `status ${r.status}`)
      assert(Array.isArray(r.json) && r.json.length > 0, 'expected non-empty programs array')
      const sample = r.json[0]
      assert(sample.title || sample.code || sample.number,
        `first program should have title/code/number, got keys: ${Object.keys(sample || {}).join(',')}`)
    }),
  ]
}
