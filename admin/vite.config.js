import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The built panel is served by the backend at /admin (see backend/src/app.js).
// In development, API calls are proxied to the backend on :4000.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
