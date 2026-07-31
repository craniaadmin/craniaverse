import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/* TEMPORARY harness config. The preview pane will only open the server root,
   so serve the harness page there instead of the real app's index.html. */
const serveHarnessAtRoot = {
  name: 'serve-harness-at-root',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/' || req.url.startsWith('/?')) req.url = '/clpreview.html'
      next()
    })
  },
}

export default defineConfig({
  plugins: [serveHarnessAtRoot, react()],
  resolve: { alias: [{ find: /^\.\.\/data\/store$/, replacement: path.resolve('src/__clstore.jsx') }] },
  server: { port: 5195, open: false },
})
