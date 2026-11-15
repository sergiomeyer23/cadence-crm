import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const apiUrl = process.env.API_URL ?? 'http://localhost:3333';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Mesmo domínio para a web e a API: o cookie de sessão funciona sem CORS.
    proxy: { '/api': apiUrl, '/admin': apiUrl },
  },
});
