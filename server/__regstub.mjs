// Minimal PocketBase stand-in for the registrations table, so the
// delete-then-resurrect sequence can be run for real.
import express from 'express'
const app = express()
app.use(express.json({ limit: '20mb' }))

let rows = []
let n = 1

app.post('/api/collections/_superusers/auth-with-password', (_q, r) =>
  r.json({ token: 'stub', record: { id: 'a' } }))
app.get('/api/collections/:c/records', (_q, r) =>
  r.json({ page: 1, perPage: 500, totalItems: rows.length, totalPages: 1, items: rows }))
app.post('/api/collections/:c/records', (q, r) => {
  const row = { id: `r${n++}`, ...q.body }; rows.push(row); r.json(row)
})
app.patch('/api/collections/:c/records/:id', (q, r) => {
  const row = rows.find(x => x.id === q.params.id)
  if (!row) return r.status(404).json({ message: 'gone' })
  Object.assign(row, q.body); r.json(row)
})
app.delete('/api/collections/:c/records/:id', (q, r) => {
  rows = rows.filter(x => x.id !== q.params.id); r.json({})
})

// Test hooks
app.get('/__ids', (_q, r) => r.json(rows.map(x => x.recordId)))
app.post('/__deleteDirect', (q, r) => {          // what the scripts do
  const gone = q.body.ids || []
  rows = rows.filter(x => !gone.includes(x.recordId))
  r.json({ left: rows.length })
})

app.listen(8391, () => console.log('reg stub on 8391'))
