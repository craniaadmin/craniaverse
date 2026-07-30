// TEMPORARY harness config. Delete with calpreview.html and src/__calharness.jsx.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], server: { port: 5198, open: false } })
