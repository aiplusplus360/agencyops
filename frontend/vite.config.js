import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Where the dev server proxies API and Socket.IO traffic.
//
// Locally the API runs on the same host, so localhost is correct. Under
// docker-compose it runs in a sibling container reachable at http://api:4000 —
// set API_PROXY_TARGET there. Hardcoding localhost would send every request
// into the web container itself.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});
