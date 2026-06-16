import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Vite's proxy runs on the dev server machine, so localhost is correct by default.
  // Override with VITE_BACKEND_URL/BACKEND_URL when testing against another backend.
  const backendUrl = process.env.VITE_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5000';

  return {
    plugins: [react()],
    
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/engines': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/uploads': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/badge-icons': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/school-documents': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/socket.io': {
          target: backendUrl,
          changeOrigin: true,
          ws: true, // Enable WebSocket proxying
        },
      },
    },
    // NEW: Add the optimizeDeps configuration
    // This explicitly tells Vite to find and pre-bundle 'socket.io-client',
    // which resolves the import error.
    optimizeDeps: {
      include: ['socket.io-client'],
    },
  }
})
