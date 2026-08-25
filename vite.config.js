import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The API's port lives in server/.env so the server and this proxy cannot
  // drift apart. The empty prefix loads plain (non-VITE_) keys too.
  const { PORT = '3000' } = loadEnv(mode, path.resolve('server'), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${PORT}`,
          changeOrigin: true,
        },
      },
    },
  }
})
