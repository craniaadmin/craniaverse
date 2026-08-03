import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
const serveHarnessAtRoot = { name: 'serve-harness-at-root', configureServer(server) {
  server.middlewares.use((req, _res, next) => { if (req.url === '/' || req.url.startsWith('/?')) req.url = '/clpreview.html'; next() }) } }
export default defineConfig({
  plugins: [serveHarnessAtRoot, react()],
  resolve: { alias: [{ find: /^\.\.\/data\/store$/, replacement: path.resolve('src/__clstore.jsx') }] },
  server: { port: 5209, open: false },
})
