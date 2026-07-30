// TEMPORARY harness config. Delete with the harness files.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^\.\.\/data\/store$/, replacement: path.resolve('src/__pgstoremock.jsx') }] },
  server: { port: 5199, open: false },
})
