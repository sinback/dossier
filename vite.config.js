import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
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

// Telemetry endpoint: stores the latest stroke telemetry for inspection.
let latestTelemetry = null;

const telemetryPlugin = {
  name: 'dossier-telemetry',
  configureServer(server) {
    server.middlewares.use('/api/telemetry', (req, res) => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(latestTelemetry ?? []));
        return;
      }
      if (req.method === 'DELETE') {
        latestTelemetry = null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            latestTelemetry = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, strokes: latestTelemetry.length }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }
      res.writeHead(405);
      res.end();
    });
  },
};

const outlinePlugin = {
  name: 'dossier-outlines',
  configureServer(server) {
    server.middlewares.use('/api/outlines', async (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      const letter = url.searchParams.get('letter');
      if (!letter) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing ?letter= parameter' }));
        return;
      }
      const overridesRaw = url.searchParams.get('overrides');
      let overrides = {};
      if (overridesRaw) {
        try { overrides = JSON.parse(overridesRaw); }
        catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid overrides JSON' }));
          return;
        }
      }
      try {
        // Use Vite's ssrLoadModule to import the glyph module server-side
        const mod = await server.ssrLoadModule('/src/styles/matlackGlyphs.js');
        const outlines = mod.exportGlyphOutlines(letter, overrides);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ letter, overrides, outlines }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  },
};

const reviewPlugin = {
  name: 'dossier-review',
  configureServer(server) {
    server.middlewares.use('/api/review', (req, res) => {
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const letter = data.letter || 'unknown';
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `matlack-review-${letter}-${ts}.json`;
          const filepath = path.resolve(__dirname, 'reviews', filename);
          fs.mkdirSync(path.resolve(__dirname, 'reviews'), { recursive: true });
          fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, file: filename }));
        } catch {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to save' }));
        }
      });
    });
  },
};

// POST /api/open { path: 'relative/or/absolute/path' } — opens the given file
// in GIMP. Restricted to files inside the project root (best-effort sandbox;
// not production, just convenient).
const openInGimpPlugin = {
  name: 'dossier-open-gimp',
  configureServer(server) {
    server.middlewares.use('/api/open', (req, res) => {
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { path: filePath } = JSON.parse(body);
          if (!filePath) { res.writeHead(400); res.end('path required'); return; }
          // Resolve and confirm it's inside the project root.
          const projectRoot = path.resolve(__dirname);
          const abs = path.resolve(projectRoot, filePath);
          if (!abs.startsWith(projectRoot + path.sep)) {
            res.writeHead(400); res.end('path outside project'); return;
          }
          if (!fs.existsSync(abs)) {
            res.writeHead(404); res.end('file not found'); return;
          }
          // Detach so GIMP keeps running if the dev server restarts.
          const child = spawn('gimp', [abs], { detached: true, stdio: 'ignore' });
          child.unref();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, opened: abs }));
        } catch (err) {
          res.writeHead(500);
          res.end('error: ' + err.message);
        }
      });
    });
  },
};

// GET /api/contexts — walks matlack-declaration/reference/context/*/**.png and
// returns [{dir, png, hasAnchors, viewBoxW, viewBoxH}] grouped by dir.
// viewBoxW/viewBoxH come from the PNG IHDR if available (fallback 0,0).
const contextsPlugin = {
  name: 'dossier-contexts',
  configureServer(server) {
    server.middlewares.use('/api/contexts', (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      try {
        const contextRoot = path.resolve(__dirname, 'matlack-declaration/reference/context');
        const results = [];
        const dirs = fs.readdirSync(contextRoot);
        for (const dir of dirs) {
          const dirPath = path.join(contextRoot, dir);
          let stat;
          try { stat = fs.statSync(dirPath); } catch { continue; }
          if (!stat.isDirectory()) continue;
          const files = fs.readdirSync(dirPath);
          const pngs = files.filter(f => f.endsWith('.png')).sort();
          for (const png of pngs) {
            const pngPath = path.join(dirPath, png);
            const base = png.replace(/\.png$/, '');
            const anchorsPath = path.join(dirPath, base + '_anchors.json');
            const hasAnchors = fs.existsSync(anchorsPath);
            // Read PNG dimensions from IHDR (bytes 16-23).
            let viewBoxW = 0, viewBoxH = 0;
            try {
              const buf = Buffer.alloc(24);
              const fd = fs.openSync(pngPath, 'r');
              fs.readSync(fd, buf, 0, 24, 0);
              fs.closeSync(fd);
              viewBoxW = buf.readUInt32BE(16);
              viewBoxH = buf.readUInt32BE(20);
            } catch { /* ignore */ }
            results.push({
              dir,
              png,
              relativePath: `matlack-declaration/reference/context/${dir}/${png}`,
              hasAnchors,
              viewBoxW,
              viewBoxH,
            });
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  },
};

// GET  /api/anchors?path=... — read anchors JSON for a context PNG.
// POST /api/anchors          — {path, label, x, y} — upsert into NN_anchors.json.
const anchorsPlugin = {
  name: 'dossier-anchors',
  configureServer(server) {
    server.middlewares.use('/api/anchors', (req, res) => {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET') {
        const relPath = url.searchParams.get('path');
        if (!relPath) { res.writeHead(400); res.end('path required'); return; }
        try {
          const projectRoot = path.resolve(__dirname);
          const abs = path.resolve(projectRoot, relPath);
          if (!abs.startsWith(projectRoot + path.sep)) { res.writeHead(400); res.end('path outside project'); return; }
          const base = abs.replace(/\.png$/, '');
          const anchorsFile = base + '_anchors.json';
          if (!fs.existsSync(anchorsFile)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ labels: {} }));
            return;
          }
          const data = fs.readFileSync(anchorsFile, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        } catch (err) {
          res.writeHead(500); res.end(err.message);
        }
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { path: relPath, label, x, y } = JSON.parse(body);
            if (!relPath || !label) { res.writeHead(400); res.end('path and label required'); return; }
            const projectRoot = path.resolve(__dirname);
            const abs = path.resolve(projectRoot, relPath);
            if (!abs.startsWith(projectRoot + path.sep)) { res.writeHead(400); res.end('path outside project'); return; }
            const base = abs.replace(/\.png$/, '');
            const anchorsFile = base + '_anchors.json';
            let data = { labels: {} };
            if (fs.existsSync(anchorsFile)) {
              try { data = JSON.parse(fs.readFileSync(anchorsFile, 'utf8')); } catch { data = { labels: {} }; }
            }
            if (!data.labels) data.labels = {};
            data.labels[label] = { x: +parseFloat(x).toFixed(4), y: +parseFloat(y).toFixed(4) };
            fs.writeFileSync(anchorsFile, JSON.stringify(data, null, 2));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, label, file: anchorsFile }));
          } catch (err) {
            res.writeHead(500); res.end(err.message);
          }
        });
        return;
      }

      res.writeHead(405); res.end();
    });
  },
};

export default defineConfig({
  plugins: [react(), syncPlugin, drawPlugin, telemetryPlugin, outlinePlugin, reviewPlugin, openInGimpPlugin, contextsPlugin, anchorsPlugin],
  server: {
    port: 3000,
    open: true,
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['warn', 'error'],
    }
  },
})
