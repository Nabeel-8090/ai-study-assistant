import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Match the backend CORS origin instead of silently switching to port 5174.
  server: { port: 5173, strictPort: true },
})
