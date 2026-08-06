import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const root = { name:'root', configureServer(s){ s.middlewares.use((q,_r,n)=>{ if(q.url==='/'||q.url.startsWith('/?')) q.url='/navpreview.html'; n() }) } }
export default defineConfig({ plugins:[root, react()], server:{ port:5229, open:false } })
