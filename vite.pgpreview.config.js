// TEMPORARY harness config for checking the Programs page layout without auth.
// Delete with pgpreview.html, src/__pgharness.jsx and src/__pgstoremock.jsx.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^\.\.\/data\/store$/, replacement: path.resolve('src/__pgstoremock.jsx') },
    ],
  },
  server: { port: 5199, open: false },
})
