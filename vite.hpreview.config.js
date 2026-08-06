// THROWAWAY verification harness config — deleted before commit.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'harness-entry',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const [p] = (req.url || '/').split('?')
          if (p === '/' || p === '/index.html') {
            req.url = '/__hpreview.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')
          }
          next()
        })
      },
    },
  ],
  server: { port: 5199, open: false },
})
