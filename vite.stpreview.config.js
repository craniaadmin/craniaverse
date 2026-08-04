import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
const root = { name:'root', configureServer(s){ s.middlewares.use((q,_r,n)=>{ if(q.url==='/'||q.url.startsWith('/?')) q.url='/stpreview.html'; n() }) } }
export default defineConfig({ plugins:[root, react()],
  resolve:{ alias:[{ find:/^\.\.\/data\/store$/, replacement: path.resolve('src/__ststore.jsx') }] },
  server:{ port:5222, open:false } })
