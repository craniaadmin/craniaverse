// Stub PocketBase that behaves like a real install: a built-in `users`
// AUTH collection that rejects our recordId/payload writes, plus the
// generic collections we create ourselves. Reproduces the deployment
// failure and proves the fix.
import express from 'express'
import crypto from 'crypto'

const app = express()
app.use(express.json())

const generic = new Map()          // name -> rows
let nextId = 1
const rowsFor = (n) => { if (!generic.has(n)) generic.set(n, []); return generic.get(n) }

app.post('/api/collections/_superusers/auth-with-password', (_q, res) =>
  res.json({ token: 'stub.' + crypto.randomBytes(8).toString('hex'), record: { id: 'admin' } }))

// The built-in auth collection: needs email + password, rejects extras.
const authGuard = (body) => {
  if (!body?.email) return { email: { code: 'validation_required', message: 'Missing required value.' } }
  if (!body?.password) return { password: { code: 'validation_required', message: 'Missing required value.' } }
  return null
}

app.get('/api/collections/users/records', (_q, res) =>
  res.json({ page: 1, perPage: 500, totalItems: 0, totalPages: 1, items: [] }))

app.post('/api/collections/users/records', (req, res) => {
  const bad = authGuard(req.body)
  if (bad) return res.status(400).json({ status: 400, message: 'Failed to create record.', data: bad })
  res.json({ id: `u${nextId++}`, ...req.body })
})

app.get('/api/collections/:name/records', (req, res) => {
  const rows = rowsFor(req.params.name)
  res.json({ page: 1, perPage: 500, totalItems: rows.length, totalPages: 1, items: rows })
})
app.post('/api/collections/:name/records', (req, res) => {
  const r = { id: `rec${nextId++}`, ...req.body }
  rowsFor(req.params.name).push(r); res.json(r)
})
app.patch('/api/collections/:name/records/:id', (req, res) => {
  const r = rowsFor(req.params.name).find(x => x.id === req.params.id)
  if (!r) return res.status(404).json({ message: 'not found' })
  Object.assign(r, req.body); res.json(r)
})
app.delete('/api/collections/:name/records/:id', (req, res) => {
  generic.set(req.params.name, rowsFor(req.params.name).filter(x => x.id !== req.params.id))
  res.json({})
})

app.get('/__dump/:name', (req, res) => res.json(rowsFor(req.params.name).map(r => r.payload)))

app.listen(8390, () => console.log('pb stub on 8390'))
