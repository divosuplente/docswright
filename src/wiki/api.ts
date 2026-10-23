// /_admin/api sub-app for the wiki editor: page CRUD + single-flight astro rebuild.
import { Hono, type Context } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { repoRoot } from '../config.js';
import { engineEntry } from '../engine.js';

const root = repoRoot();
const wikiRoot = path.join(root, 'wiki');

const api = new Hono();

// Path safety: relative, forward slashes, no ''/'.'/'..', no absolute, no NUL/backslash.
// Appends '.md' if missing. Spaces and unicode allowed (AzDO-style page names).
function cleanPath(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const p = input.trim();
  if (!p) return null;
  if (/[\\\0]/.test(p)) return null;
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null; // absolute
  for (const seg of p.split('/')) {
    if (!seg || seg === '.' || seg === '..') return null;
  }
  const rel = p.endsWith('.md') ? p : p + '.md';
  const full = path.resolve(wikiRoot, rel); // paranoid containment
  const root = wikiRoot + path.sep;
  if (full !== wikiRoot && !full.startsWith(root)) return null;
  return rel;
}

function joinWiki(rel: string): string {
  return path.join(wikiRoot, rel);
}

// --- single-flight rebuild: at most one sync+build; requests while running
// --- mark pending and trigger exactly one rerun afterwards.
const buildState: {
  running: boolean;
  pending: boolean;
  lastStatus: 'idle' | 'ok' | 'error';
  lastError?: string;
} = { running: false, pending: false, lastStatus: 'idle' };

function runRebuild(): void {
  buildState.running = true;
  // Full pipeline: sync (wiki file → content collection) then astro build.
  // Run the engine binary, not a project-local one: the project may not contain
  // the engine, and `docswright build` must operate on the project cwd.
  const child = spawn(process.execPath, [engineEntry(), 'build'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-4000); // keep tail
  });
  let settled = false;
  const finish = (err?: string): void => {
    if (settled) return;
    settled = true;
    buildState.running = false;
    if (err === undefined) {
      buildState.lastStatus = 'ok';
      buildState.lastError = undefined;
    } else {
      buildState.lastStatus = 'error';
      buildState.lastError = err.slice(-2000);
    }
    if (buildState.pending) {
      buildState.pending = false;
      runRebuild();
    }
  };
  child.on('error', (e: Error) => finish(e.message));
  child.on('close', (code: number | null) =>
    finish(code === 0 ? undefined : `build exited ${code}\n${stderr.slice(-2000)}`),
  );
}

function enqueueRebuild(): void {
  buildState.pending = true;
  if (!buildState.running) runRebuild();
}

type Body = { path?: unknown; content?: unknown; from?: unknown; to?: unknown };

async function jsonBody(c: Context): Promise<Body | null> {
  try {
    const v: unknown = await c.req.json();
    return typeof v === 'object' && v !== null ? (v as Body) : null;
  } catch {
    return null;
  }
}

// GET /tree → all .md pages under wiki/, sorted, relative, forward-slash.
api.get('/tree', (c) => {
  const pages: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md'))
        pages.push(path.relative(wikiRoot, full).split(path.sep).join('/'));
    }
  };
  walk(wikiRoot);
  pages.sort();
  return c.json({ pages });
});

// GET /pages?path=… → { path, content } | 400 invalid | 404 missing
api.get('/pages', (c) => {
  const rel = cleanPath(c.req.query('path'));
  if (!rel) return c.json({ error: 'invalid path' }, 400);
  const full = joinWiki(rel);
  if (!fs.existsSync(full)) return c.json({ error: 'not found' }, 404);
  return c.json({ path: rel, content: fs.readFileSync(full, 'utf8') });
});

// POST /pages {path, content} → 201 create (400 invalid, 409 exists)
api.post('/pages', async (c) => {
  const body = await jsonBody(c);
  const rel = cleanPath(body?.path);
  if (!rel) return c.json({ error: 'invalid path' }, 400);
  if (typeof body?.content !== 'string')
    return c.json({ error: 'content must be a string' }, 400);
  const full = joinWiki(rel);
  if (fs.existsSync(full)) return c.json({ error: 'page exists' }, 409);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body.content);
  enqueueRebuild();
  return c.json({ path: rel }, 201);
});

// PUT /pages {path, content} → 200 overwrite (400 invalid, 404 missing)
api.put('/pages', async (c) => {
  const body = await jsonBody(c);
  const rel = cleanPath(body?.path);
  if (!rel) return c.json({ error: 'invalid path' }, 400);
  if (typeof body?.content !== 'string')
    return c.json({ error: 'content must be a string' }, 400);
  const full = joinWiki(rel);
  if (!fs.existsSync(full)) return c.json({ error: 'not found' }, 404);
  fs.writeFileSync(full, body.content);
  enqueueRebuild();
  return c.json({ path: rel });
});

// POST /pages/move {from, to} → 200 rename (400 invalid, 404 source, 409 dest)
api.post('/pages/move', async (c) => {
  const body = await jsonBody(c);
  const from = cleanPath(body?.from);
  const to = cleanPath(body?.to);
  if (!from || !to) return c.json({ error: 'invalid path' }, 400);
  const a = joinWiki(from);
  const b = joinWiki(to);
  if (!fs.existsSync(a) || !fs.statSync(a).isFile())
    return c.json({ error: 'source not found' }, 404);
  if (fs.existsSync(b)) return c.json({ error: 'destination exists' }, 409);
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.renameSync(a, b);
  enqueueRebuild();
  return c.json({ from, to });
});

// DELETE /pages?path=… → 204 (400 invalid, 404 missing)
api.delete('/pages', (c) => {
  const rel = cleanPath(c.req.query('path'));
  if (!rel) return c.json({ error: 'invalid path' }, 400);
  const full = joinWiki(rel);
  if (!fs.existsSync(full)) return c.json({ error: 'not found' }, 404);
  fs.unlinkSync(full);
  enqueueRebuild();
  return new Response(null, { status: 204 });
});

// GET /rebuild → { running, lastStatus, lastError? }
api.get('/rebuild', (c) =>
  c.json({
    running: buildState.running,
    lastStatus: buildState.lastStatus,
    ...(buildState.lastError !== undefined ? { lastError: buildState.lastError } : {}),
  }),
);

// POST /rebuild → 202, enqueue (single-flight: one rerun if already running)
api.post('/rebuild', (c) => {
  enqueueRebuild();
  return new Response(null, { status: 202 });
});

export default api;
