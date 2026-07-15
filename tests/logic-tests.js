// Cross-endpoint workflow tests. These validate that the full
// PocketBase round-trip works: POST → record persists in GET →
// DELETE removes it cleanly. Each test cleans up after itself
// so re-running doesn't accumulate junk records.

import { assert, runTest } from './framework.js'
import { authedFetch } from './utils/auth.js'

// Authed HTTP helper — everything below /api/health goes through
// authRequired middleware.
async function http(method, path, body) {
  const r = await authedFetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text }
}

// POST /api/registrations is on the public allowlist so the booth
// kiosk works; sending a body directly is fine (no cookie required),
// but we still use `http()` so the cookie carries in test-run order.

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

    await runTest('Finance round-trip: PUT invoice+payment → GET → PUT cleanup', async () => {
      const before = await http('GET', '/api/finance')
      assert(before.status === 200, `GET status ${before.status}`)
      const original = before.json
      assert(original && Array.isArray(original.invoices), 'expected finance payload with invoices array')

      // Add one temp invoice + one temp payment tied to it.
      const tag = `logic-test-${Date.now()}`
      const invId = `inv_${tag}`
      const payId = `pay_${tag}`
      const patched = {
        invoices: [
          ...original.invoices,
          {
            id: invId, number: `TEST-${tag}`, date: '2026-01-01', dueDate: '2026-01-31',
            customerName: 'PB Test Customer', customerEmail: `${tag}@test.invalid`,
            studentName: 'PB Test Student', program: 'PB Test Program',
            lineItems: [{ id: 'li1', desc: 'Test line', qty: 1, unitPrice: 100 }],
            total: 100, status: 'sent', notes: '',
          },
        ],
        payments: [
          ...original.payments,
          {
            id: payId, receiptNumber: `RT-${tag}`, date: '2026-01-05',
            invoiceId: invId, customerName: 'PB Test Customer',
            amount: 60, method: 'Cash', reference: '', note: '',
          },
        ],
        meta: original.meta,
      }
      const put = await http('PUT', '/api/finance', patched)
      assert(put.status === 200, `PUT status ${put.status}: ${put.text?.slice(0, 200)}`)

      try {
        const after = await http('GET', '/api/finance')
        assert(after.status === 200, `GET after status ${after.status}`)
        const inv = after.json.invoices.find(i => i.id === invId)
        const pay = after.json.payments.find(p => p.id === payId)
        assert(inv, `expected invoice ${invId} in payload`)
        assert(pay, `expected payment ${payId} in payload`)
        assert(inv.total === 100, `invoice total expected 100, got ${inv.total}`)
        assert(pay.invoiceId === invId, `payment.invoiceId expected ${invId}, got ${pay.invoiceId}`)
      } finally {
        // Restore the original payload — always, even if assertions above failed.
        await http('PUT', '/api/finance', original).catch(() => {})
      }

      const restored = await http('GET', '/api/finance')
      assert(!restored.json.invoices.some(i => i.id === invId), 'invoice should be gone after restore')
      assert(!restored.json.payments.some(p => p.id === payId), 'payment should be gone after restore')
    }),

    await runTest('Inventory round-trip: POST → GET → PUT → DELETE', async () => {
      const tag = `logic-inv-${Date.now()}`
      const created = await http('POST', '/api/inventory', {
        category: 'TEST',
        name: `Widget ${tag}`,
        size: null,
        qty: 3,
        price: 9.99,
      })
      assert(created.status === 201 || created.status === 200,
        `POST expected 200/201, got ${created.status}`)
      const id = created.json?.id
      assert(id, `POST response missing id: ${JSON.stringify(created.json).slice(0, 200)}`)

      try {
        const list = await http('GET', '/api/inventory')
        assert(Array.isArray(list.json) && list.json.some(i => i.id === id),
          `expected inventory item ${id} in GET`)

        const updated = await http('PUT', `/api/inventory/${id}`, { qty: 5 })
        assert(updated.status === 200, `PUT status ${updated.status}`)

        const list2 = await http('GET', '/api/inventory')
        const row = list2.json.find(i => i.id === id)
        assert(row && row.qty === 5, `expected qty=5 after PUT, got ${row?.qty}`)
      } finally {
        await http('DELETE', `/api/inventory/${id}`).catch(() => {})
      }
    }),
  ]
}
