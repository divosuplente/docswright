// Wiki admin server: static dist/ for non-/_admin paths, /_admin/ → editor.html,
// /_admin/api/* → the editor API sub-app.
import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import api from './api.js';
import { repoRoot } from '../config.js';

const root = repoRoot();
const editorPath = fileURLToPath(new URL('./editor.html', import.meta.url));
const dist = path.join(root, 'dist');
const distPrefix = dist + path.sep;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/docswright; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const app = new Hono();
app.route('/_admin/api', api);

// GET /_admin/ (or /_admin) → editor.html, read from disk per request.
const editorPage = (c: Context) => {
  if (!fs.existsSync(editorPath)) return c.text('404 Not Found', 404);
  return c.body(fs.readFileSync(editorPath), 200, {
    'content-type': 'text/html; charset=utf-8',
  });
};
app.get('/_admin', editorPage);
app.get('/_admin/', editorPage);


// Everything else → static file from dist/, or docswright-text 404.
app.all('*', (c) => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(new URL(c.req.url).pathname);
  } catch {
    return c.text('404 Not Found', 404);
  }
  if (decoded.includes('\0')) return c.text('404 Not Found', 404);
  const rel = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  const base = rel === '' ? path.join(dist, 'index.html') : path.resolve(dist, rel);
  if (base !== dist && !base.startsWith(distPrefix))
    return c.text('404 Not Found', 404); // traversal
  let file = base;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(base);
  } catch {
    return c.text('404 Not Found', 404);
  }
  if (stat.isDirectory()) {
    file = path.join(base, 'index.html'); // directory → index.html
    try {
      stat = fs.statSync(file);
    } catch {
      return c.text('404 Not Found', 404);
    }
  }
  if (!stat.isFile()) return c.text('404 Not Found', 404);
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  return c.body(fs.readFileSync(file), 200, { 'content-type': type });
});

export function startServer(port: number) {
  return serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
}
