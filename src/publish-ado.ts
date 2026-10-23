// Publishes the local wiki markdown pages to an Azure DevOps project wiki.
// Auth comes from the az CLI (`az account get-access-token`); no extension needed.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const API = 'api-version=7.0';
/** Azure DevOps first-party app ID, the resource az CLI mints tokens for. */
const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';

export interface PublishOptions {
  /** e.g. https://dev.azure.com/yourorg (or any on-prem collection URL) */
  org: string;
  project: string;
  wiki: string;
  create: boolean;
  dryRun: boolean;
  /** Absolute path to the wiki source directory. */
  wikiDir: string;
}

/** Relative, posix-style page paths without the .md extension, sorted. */
export function listWikiPages(wikiDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(path.relative(wikiDir, full).split(path.sep).join('/').replace(/\.md$/, ''));
      }
    }
  };
  walk(wikiDir);
  return out.sort();
}

function token(): string {
  const res = spawnSync(
    'az',
    ['account', 'get-access-token', '--resource', ADO_RESOURCE, '--query', 'accessToken', '-o', 'tsv'],
    { encoding: 'utf8' },
  );
  if (res.error) throw new Error(`az CLI not found: ${res.error.message}. Install it and run "az login".`);
  if (res.status !== 0) {
    throw new Error(`az is not logged in (${(res.stderr ?? '').trim().split('\n')[0] || 'no details'}). Run "az login".`);
  }
  return res.stdout.trim();
}

async function call(
  method: string,
  url: string,
  auth: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${auth}`, ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
}

const enc = encodeURIComponent;

/** Push every wiki/*.md page. Returns the number of pages written. */
export async function publishWiki(opts: PublishOptions): Promise<number> {
  const base = opts.org.replace(/\/+$/, '');
  const project = enc(opts.project);
  const wiki = enc(opts.wiki);
  const pages = listWikiPages(opts.wikiDir);

  if (opts.dryRun) {
    console.log(`dry run: ${pages.length} pages -> ${base}/${opts.project}/${opts.wiki}`);
    for (const p of pages) console.log(`  PUT ${p}`);
    return pages.length;
  }

  const auth = token();

  // 1. Does the wiki exist?
  let status = (await call('GET', `${base}/${project}/_apis/wiki/wikis/${wiki}?${API}`, auth)).status;
  if (status === 401 || status === 403) throw new Error(`not authorized for ${base}/${opts.project} (HTTP ${status}); run "az login" for the right tenant`);
  if (status === 404) {
    if (!opts.create) throw new Error(`wiki "${opts.wiki}" not found in ${opts.project}; pass --create to make it`);
    const proj = await call('GET', `${base}/_apis/projects/${project}?${API}`, auth);
    if (proj.status !== 200) throw new Error(`project "${opts.project}" not found (HTTP ${proj.status})`);
    const projectId = JSON.parse(proj.text).id;
    const made = await call('POST', `${base}/${project}/_apis/wiki/wikis?${API}`, auth, {
      name: opts.wiki,
      projectId,
      type: 'projectWiki',
    });
    if (made.status !== 200 && made.status !== 201) {
      throw new Error(`could not create wiki "${opts.wiki}" (HTTP ${made.status}): ${made.text.slice(0, 300)}`);
    }
    console.log(`created wiki ${opts.wiki}`);
  } else if (status !== 200) {
    throw new Error(`wiki lookup failed (HTTP ${status})`);
  }

  // 2. Create or update each page. If-Match:* makes PUT an upsert.
  let written = 0;
  for (const page of pages) {
    const content = fs.readFileSync(path.join(opts.wikiDir, `${page}.md`), 'utf8');
    const put = await call(
      'PUT',
      `${base}/${project}/_apis/wiki/wikis/${wiki}/pages?path=${enc(page)}&${API}`,
      auth,
      { content },
      { 'If-Match': '*' },
    );
    if (put.status !== 200 && put.status !== 201) {
      throw new Error(`page "${page}" failed (HTTP ${put.status}): ${put.text.slice(0, 300)}`);
    }
    written++;
    console.log(`pushed ${page}`);
  }
  return written;
}
