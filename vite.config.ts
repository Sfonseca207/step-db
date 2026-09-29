import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API = 'http://localhost:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false, xfwd: true },
      '/mcp': { target: API, changeOrigin: false, xfwd: true },
      '/health': { target: API, changeOrigin: false },
      '/ws': { target: API, ws: true, changeOrigin: false },
    },
  },
})
