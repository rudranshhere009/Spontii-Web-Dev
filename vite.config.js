import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': env.API_PROXY_TARGET || 'http://localhost:3001',
    },
  },
  }
})
