import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
const root = { name:'root', configureServer(s){ s.middlewares.use((q,_r,n)=>{ if(q.url==='/'||q.url.startsWith('/?')) q.url='/cmpreview.html'; n() }) } }
export default defineConfig({ plugins:[root, react()],
  resolve:{ alias:[
    // the page imports ../data/store; useCommentsRows imports ./store
    { find:/^\.\.\/data\/store$/, replacement: path.resolve('src/__cmstore.jsx') },
    { find:/^\.\/store$/,         replacement: path.resolve('src/__cmstore.jsx') },
  ] },
  server:{ port:5223, open:false } })
