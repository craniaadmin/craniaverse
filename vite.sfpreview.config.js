import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

function serveHarnessAtRoot() {
  return {
    name: 'serve-harness-at-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url.startsWith('/?')) req.url = '/sfpreview.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveHarnessAtRoot()],
  resolve: { alias: { [path.resolve('src/data/store.jsx')]: path.resolve('src/__sfstore.jsx') } },
})
