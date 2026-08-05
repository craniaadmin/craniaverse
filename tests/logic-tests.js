// Cross-endpoint workflow tests. These validate that the full
// PocketBase round-trip works: POST → record persists in GET →
// DELETE removes it cleanly. Each test cleans up after itself
// so re-running doesn't accumulate junk records.

import { assert, assertEq, runTest } from './framework.js'
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
      // Self-healing sweep: delete ANY leftover PB-Test records from
      // earlier runs before we start, so a single failed cleanup can
      // never accumulate junk in the live Students/Customers lists.
      // Records are matched on the fixed 'PB-Test' first name the test
      // always uses, so real families are never touched.
      const before = await http('GET', '/api/registrations')
      if (Array.isArray(before.json)) {
        const stale = before.json.filter(r =>
          String(r.student?.firstName || '').trim() === 'PB-Test')
        for (const r of stale) {
          await http('DELETE', `/api/registrations/${r.id}`).catch(() => {})
        }
      }

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

    await runTest('Projects round-trip: PUT temp card → GET → restore', async () => {
      const before = await http('GET', '/api/projects')
      assert(before.status === 200, `GET status ${before.status}`)
      const original = before.json
      assert(original && Array.isArray(original.cards), 'expected projects payload with cards array')

      const tag = `logic-proj-${Date.now()}`
      const cardId = `card_${tag}`
      const patched = {
        ...original,
        cards: [
          ...original.cards,
          {
            id: cardId, col: 'todo', project: 'PB Test', task: tag, who: '',
            due: '', comments: [], color: '#5FA09E', days: [], dayDate: '',
            tags: [], goals: [], created: new Date().toISOString(),
            archived: false, archivedFrom: '', archivedAt: '',
          },
        ],
      }
      const put = await http('PUT', '/api/projects', patched)
      assert(put.status === 200, `PUT status ${put.status}: ${put.text?.slice(0, 200)}`)

      try {
        const after = await http('GET', '/api/projects')
        assert(after.status === 200, `GET after status ${after.status}`)
        const card = after.json.cards.find(c => c.id === cardId)
        assert(card, `expected card ${cardId} in payload`)
        assert(card.task === tag, `task mismatch: expected ${tag}, got ${card.task}`)
      } finally {
        // Restore the original payload — always, even if assertions above failed.
        await http('PUT', '/api/projects', original).catch(() => {})
      }

      const restored = await http('GET', '/api/projects')
      assert(!restored.json.cards.some(c => c.id === cardId), 'card should be gone after restore')
    }),

    await runTest('IT accounts round-trip: PUT temp account encrypts+decrypts pass', async () => {
      const before = await http('GET', '/api/it-accounts')
      assert(before.status === 200, `GET status ${before.status}`)
      const original = before.json
      assert(original && Array.isArray(original.accounts), 'expected it-accounts payload with accounts array')

      const tag = `logic-it-${Date.now()}`
      const acctId = `acct_${tag}`
      const secret = `S3cret!${tag}`
      const catId = original.categories?.[0]?.id || ''
      const patched = {
        categories: original.categories,
        accounts: [
          ...original.accounts,
          { id: acctId, catId, name: `PB Test ${tag}`, url: '', user: 'pb-test', pass: secret, notes: '', color: '#EEF3F6' },
        ],
      }
      const put = await http('PUT', '/api/it-accounts', patched)
      assert(put.status === 200, `PUT status ${put.status}: ${put.text?.slice(0, 200)}`)

      try {
        const after = await http('GET', '/api/it-accounts')
        assert(after.status === 200, `GET after status ${after.status}`)
        const acct = after.json.accounts.find(a => a.id === acctId)
        assert(acct, `expected account ${acctId} in payload`)
        // Round-trip through pb.js's AES-256-GCM encrypt-at-rest layer —
        // the API should hand back cleartext, never the enc:v1:... blob.
        assert(acct.pass === secret, `pass should decrypt back to original: expected ${secret}, got ${acct.pass}`)
        assert(!String(acct.pass).startsWith('enc:v1:'), 'pass should not be returned as ciphertext')
      } finally {
        // Restore the original payload — always, even if assertions above failed.
        await http('PUT', '/api/it-accounts', original).catch(() => {})
      }

      const restored = await http('GET', '/api/it-accounts')
      assert(!restored.json.accounts.some(a => a.id === acctId), 'account should be gone after restore')
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

    /* Pure logic, no server: which registrations count as one family.
       Siblings each get their own registration carrying a copy of the
       guardians' details, and this decides whether two of them are the same
       household. It regressed once — two students with the same parents were
       split into separate families with separate references, because one
       record had the guardian's email and the other did not. */
    await runTest('Family grouping: siblings group despite uneven guardian details', async () => {
      const { buildFamilyIndex } = await import('../src/data/family.js')

      const G = (first, last, email) => ({
        'First Name': first, 'Last Name': last, ...(email ? { Email: email } : {}),
      })
      const rec = (id, g1, g2 = {}, familyId) => ({
        id, student: { firstName: id },
        customer: { guardian1: g1, guardian2: g2, meta: familyId ? { familyId } : {} },
      })
      // Groups as a sorted, stable string so the comparison reads plainly.
      const shape = (records) => {
        const idx = buildFamilyIndex(records)
        const m = new Map()
        for (const r of records) {
          const k = idx.get(r.id)
          if (!m.has(k)) m.set(k, [])
          m.get(k).push(r.id)
        }
        return [...m.values()].map(g => g.sort().join('+')).sort().join(' | ')
      }
      const check = (label, records, expected) =>
        assertEq(shape(records), expected, label)

      check('same guardian 1 groups the siblings',
        [rec('a', G('Ada', 'Test', 'ada@x.com')), rec('b', G('Ada', 'Test', 'ada@x.com'))], 'a+b')

      check('one sibling has the guardian email, the other does not',
        [rec('one', G('Ada', 'Test', 'ada@x.com')), rec('two', G('Ada', 'Test'))], 'one+two')

      check('case and spacing differences do not split a family',
        [rec('a', G('Ada', 'Test', 'Ada@X.com')), rec('b', G(' ada ', '  test ', 'ada@x.com'))], 'a+b')

      check('matching is transitive across email and name',
        [rec('a', G('Ada', 'Test', 'ada@x.com')), rec('b', G('Ada', 'Test', 'ada@x.com')),
          rec('c', G('Ada', 'Test'))], 'a+b+c')

      // The other direction matters just as much: do not merge households.
      check('same guardian name but different emails stays two families',
        [rec('a', G('John', 'Smith', 'j1@x.com')), rec('b', G('John', 'Smith', 'j2@x.com'))], 'a | b')

      check('unrelated families stay apart',
        [rec('a', G('Ada', 'Test', 'ada@x.com')), rec('b', G('Bob', 'Other', 'bob@x.com'))], 'a | b')

      check('different guardian surnames are different families',
        [rec('a', G('Pat', 'Studentone', 'pat1@x.com')), rec('b', G('Pat', 'Studenttwo', 'pat2@x.com'))], 'a | b')

      check('blank records do not collapse into one fake family',
        [rec('a', {}), rec('b', {})], 'a | b')

      /* Guardian 2 is not consulted. Pooling both slots merged two unrelated
         children whose records shared one address between different fields. */
      check('a match in the guardian 2 slot does not join two families',
        [rec('a', G('Tas', 'Karim', 'tas@x.com')),
          rec('b', G('Other', 'Parent', 'other@x.com'), G('Tas', 'Karim', 'tas@x.com'))], 'a | b')

      check('one guardian-less record does not join a named family',
        [rec('a', G('Tas', 'Karim', 'tas@x.com')), rec('b', {})], 'a | b')

      /* The stored reference is an output of this grouping, never an input —
         otherwise a wrong merge stamps one reference on both records and
         that reference becomes the evidence keeping them merged. */
      check('a shared stored reference does not force unrelated records together',
        [rec('a', G('Tas', 'Karim', 'tas@x.com'), {}, 'F0003'),
          rec('b', G('Different', 'Parent', 'diff@x.com'), {}, 'F0003')], 'a | b')
    }),
    /* Pure logic, no server: automatic Crania Cash. Every case here is a
       bug that shipped — awards were computed from the change to a field
       rather than from the state of the lesson, so marking a register twice
       paid twice and correcting a mistake never gave the point back. */
    await runTest('Crania Cash: automatic awards follow the lesson, not the click', async () => {
      const { awardsForRow, rowKeyOf, fieldCanTrigger, reconcileAutoCash } =
        await import('../src/data/autoCash.js')

      const RULES = [
        { id: 'present',  reason: 'Present',  delta: 1,  when: { field: 'attendance', value: 'P' } },
        { id: 'no-shirt', reason: 'No Shirt', delta: -5, when: { field: 'uniform', value: 'No' } },
        { id: 'late',     reason: 'Late',     delta: -1, when: { field: 'attendance', value: 'L' } },
        { id: 'manual',   reason: 'Contest winner', delta: 20, when: null },
      ]
      // What the server route does with the result.
      const apply = (state, key, row, rules = RULES) => {
        const out = reconcileAutoCash(state.log, key, awardsForRow(rules, row))
        return { log: out.log, balance: state.balance + out.delta }
      }

      const KEY = rowKeyOf('26_27|FLEX MATH', { lessonNo: 3 }, 2)
      const KEY2 = rowKeyOf('26_27|FLEX MATH', { lessonNo: 4 }, 3)
      let s = { log: [{ delta: 20, reason: 'Contest winner' }], balance: 20 }

      s = apply(s, KEY, { attendance: 'P' })
      assertEq(s.balance, 21, 'marking P awards once')
      s = apply(s, KEY, { attendance: 'P' })
      assertEq(s.balance, 21, 're-marking P must not award twice')
      s = apply(s, KEY, { attendance: 'A' })
      assertEq(s.balance, 20, 'correcting P to A must take the point back')
      s = apply(s, KEY, { attendance: 'P' })
      assertEq(s.balance, 21, 'P then A then P is still just +1')
      s = apply(s, KEY, { attendance: 'P', uniform: 'No' })
      assertEq(s.balance, 16, 'two rules on one lesson both apply')
      s = apply(s, KEY, { attendance: 'P', uniform: 'Yes' })
      assertEq(s.balance, 21, 'fixing one mark refunds only that rule')
      s = apply(s, KEY, { attendance: 'L' })
      assertEq(s.balance, 19, 'a rule on Late fires — impossible before')
      assertEq(s.log.filter(e => !e.auto).length, 1, 'manual entries are never touched')
      s = apply(s, KEY2, { attendance: 'P' })
      assertEq(s.balance, 20, 'a different lesson awards separately')
      s = apply(s, KEY, { attendance: '' })
      assertEq(s.balance, 21, 'clearing the mark withdraws the award')

      let t = apply({ log: [], balance: 0 }, KEY, { attendance: 'P' })
      t = apply(t, KEY, { attendance: 'P' }, [{ ...RULES[0], delta: 5 }])
      assertEq(t.balance, 5, 'raising a rule re-issues rather than stacking')
      assertEq(t.log.length, 1, 'and leaves one entry, not two')

      assertEq(awardsForRow([], { attendance: 'P' }).length, 0,
        'with no rules nothing fires — there is no hardcoded fallback')
      assertEq(awardsForRow([RULES[3]], { attendance: 'P' }).length, 0,
        'a rule with no trigger never fires by itself')
      assertEq(fieldCanTrigger(RULES, 'performance'), false, 'untriggered fields are skipped')
      assertEq(fieldCanTrigger(RULES, 'attendance'), true, 'triggered fields are watched')
    }),
  ]
}