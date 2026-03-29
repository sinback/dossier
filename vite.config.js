import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { DrawCommand } from './src/api/schema.js'

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

// In-memory list of active SSE response objects.
// Each connected PaperCanvasPanel holds one open connection here.
let sseClients = [];

const drawPlugin = {
  name: 'dossier-draw',
  configureServer(server) {

    // GET /api/draw/stream — SSE endpoint. Client holds this open forever.
    server.middlewares.use('/api/draw/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      sseClients.push(res);
      req.on('close', () => {
        sseClients = sseClients.filter(c => c !== res);
      });
    });

    // POST /api/draw — validate and broadcast a draw command.
    // DELETE /api/draw — broadcast a clear command.
    server.middlewares.use('/api/draw', (req, res) => {
      if (req.method === 'DELETE') {
        const payload = `data: ${JSON.stringify({ type: 'clear' })}\n\n`;
        for (const client of sseClients) client.write(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, clients: sseClients.length }));
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        // Parse JSON
        let raw;
        try {
          raw = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        // Validate against schema
        const result = DrawCommand.safeParse(raw);
        if (!result.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error.flatten() }));
          return;
        }

        // Broadcast validated+coerced command to all connected panels
        const payload = `data: ${JSON.stringify(result.data)}\n\n`;
        for (const client of sseClients) {
          client.write(payload);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, clients: sseClients.length }));
      });
    });
  },
};

export default defineConfig({
  plugins: [react(), syncPlugin, drawPlugin],
  server: {
    port: 3000,
    open: true,
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['warn', 'error'],
    }
  },
})
