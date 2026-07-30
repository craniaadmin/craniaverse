import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^\.\.\/data\/store$/, replacement: path.resolve('src/__clstore.jsx') }] },
  server: { port: 5195, open: false },
})
