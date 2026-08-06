// A stub speaking just enough PocketBase for set-account.js to run
// against, so the script can be tested before it touches real logins.
import express from 'express'
import crypto from 'crypto'

const app = express()
app.use(express.json())

let rows = []          // { id, recordId, payload }
let nextId = 1

export function reset(users) {
  rows = users.map(u => ({ id: `rec${nextId++}`, recordId: String(u.id), payload: u }))
}

app.post('/api/collections/_superusers/auth-with-password', (_q, res) =>
  res.json({ token: 'stub.' + crypto.randomBytes(8).toString('hex'), record: { id: 'admin' } }))

app.get('/api/collections/users/records', (_q, res) =>
  res.json({ page: 1, perPage: 500, totalItems: rows.length, totalPages: 1, items: rows }))

app.patch('/api/collections/users/records/:id', (req, res) => {
  const r = rows.find(x => x.id === req.params.id)
  if (!r) return res.status(404).json({ message: 'not found' })
  Object.assign(r, req.body)
  res.json(r)
})

app.post('/api/collections/users/records', (req, res) => {
  const r = { id: `rec${nextId++}`, ...req.body }
  rows.push(r); res.json(r)
})

app.delete('/api/collections/users/records/:id', (req, res) => {
  rows = rows.filter(x => x.id !== req.params.id)
  res.json({})
})

app.get('/__dump', (_q, res) => res.json(rows.map(r => r.payload)))
app.post('/__reset', (req, res) => { reset(req.body); res.json({ ok: true, n: rows.length }) })

app.listen(8390, () => console.log('pb stub on 8390'))
