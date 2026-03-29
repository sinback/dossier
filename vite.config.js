import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const syncPlugin = {
  name: 'dossier-sync',
  configureServer(server) {
    server.middlewares.use('/api/sync', (req, res) => {
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const formatted = JSON.stringify(JSON.parse(body), null, 2);
          fs.writeFileSync(path.resolve(__dirname, 'dossier-state.json'), formatted);
          res.writeHead(200);
          res.end('ok');
        } catch {
          res.writeHead(500);
          res.end('error');
        }
      });
    });
  },
};

export default defineConfig({
  plugins: [react(), syncPlugin],
  server: {
    port: 3000,
    open: true,
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['warn', 'error'],
    }
  },
})
