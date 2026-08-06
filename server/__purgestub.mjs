import express from 'express'
const app = express(); app.use(express.json({ limit:'40mb' }))
const col = { registrations: [], comments: [], customers_backups: [], snapshots: [] }
let n = 1
app.post('/api/collections/_superusers/auth-with-password', (_q,r)=>r.json({token:'t',record:{id:'a'}}))
app.get('/api/collections/:c/records', (q,r)=>{
  const rows = col[q.params.c]; if(!rows) return r.status(404).json({message:'no collection'})
  r.json({ page:1, perPage:500, totalItems:rows.length, totalPages:1, items:rows })
})
app.post('/api/collections/:c/records', (q,r)=>{ const row={id:`x${n++}`,...q.body}; col[q.params.c].push(row); r.json(row) })
app.patch('/api/collections/:c/records/:id', (q,r)=>{
  const row=col[q.params.c].find(x=>x.id===q.params.id); if(!row) return r.status(404).json({message:'gone'})
  Object.assign(row,q.body); r.json(row)
})
app.delete('/api/collections/:c/records/:id', (q,r)=>{ col[q.params.c]=col[q.params.c].filter(x=>x.id!==q.params.id); r.json({}) })
app.post('/__seed', (q,r)=>{ Object.assign(col, q.body); r.json({ok:true}) })
app.get('/__state', (_q,r)=>r.json({
  live: col.registrations.map(x=>x.payload?.customer?.meta?.studentId || ('(no id) '+x.payload?.student?.firstName)),
  comments: col.comments.length,
  inCustomersBackups: col.customers_backups.map(b=>b.payload.length),
  inSnapshots: col.snapshots.map(b=>b.payload.length),
}))
app.listen(8393, ()=>console.log('stub on 8393'))
