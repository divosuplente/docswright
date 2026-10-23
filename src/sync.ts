// Rewrites src/content/docs/<component>/<version>/ from fetched source trees,
// ensuring every markdown file has a `title` frontmatter key.

import path from 'node:path';
import fs from 'node:fs';
import { type FetchedVersion } from './fetch.js';
type Entry = FetchedVersion;

const SKIP = ['node_modules', '.git'];

function firstH1(markdown: string): string | undefined {
  const match = markdown.match(/^#[ \t]+(.+?)\s*$/m);
  return match ? match[1].trim() : undefined;
}

/**
 * Ensure a `title:` key in frontmatter. Preserves an existing frontmatter
 * block (and its key order) unless it lacks `title`, in which case the title
 * is inserted as the first key. Files without frontmatter get a new block.
 */
export function ensureTitle(markdown: string, filePath: string): string {
  const fallback = path.basename(filePath, path.extname(filePath));
  const title = firstH1(markdown) ?? fallback;
  const body = stripLeadingH1(markdown, title);

  const lines = body.split('\n');
  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    if (close > 1) {
      if (lines.slice(1, close).some((l) => /^title\s*:/.test(l))) return body;
      const block = lines.slice(0, close);
      const rest = lines.slice(close);
      block.splice(1, 0, `title: ${title}`);
      return [...block, ...rest].join('\n');
    }
  }
  return `---\ntitle: ${title}\n---\n${body === '' ? '' : body}`;
}

/** Remove the leading `# Title` line: Starlight renders the title from frontmatter. */
function stripLeadingH1(markdown: string, title: string): string {
  const lines = markdown.split('\n');
  let start = 0;
  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    if (close > 1) start = close + 1;
  }
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    if (lines[i].trim() === `# ${title}`) {
      lines.splice(i, 1);
      if (lines[i] === '') lines.splice(i, 1);
    }
    break;
  }
  return lines.join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Copy one source tree into src/content/docs/<component>/<version>/ (cleared first). */
export function syncVersion(root: string, { component, version, sourceDir }: Entry): void {
  const dest = path.join(root, 'src', 'content', 'docs', component.name, version.label);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const file of walk(sourceDir)) {
    const rel = path.relative(sourceDir, file);
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let content = fs.readFileSync(file);
    if (file.endsWith('.md')) {
      content = Buffer.from(ensureTitle(content.toString('utf8'), rel));
    }
    fs.writeFileSync(target, content);
  }
}

/** Default site landing page, written when src/content/docs/index.md is missing
 * so a wiped docs directory self-heals on the next sync. */
const DEFAULT_LANDING = `---
title: docswright
template: splash
hero:
  tagline: Markdown docs aggregated Antora-style, with a browser-editable wiki.
  actions:
    - text: Wiki Home
      link: /wiki/current/home/
      icon: document
---

## Edit in the browser

Open \`/_admin/\` to create, edit, rename and delete wiki pages. Every save
rebuilds the site in the background.
`;

/** Sync every component/version of the config, then ensure the landing page. */
export async function syncAll(root: string, sourceDirs: Entry[]): Promise<void> {
  for (const entry of sourceDirs) syncVersion(root, entry);
  syncLanding(root);
}

/** Create the default landing page when missing; never overwrites a custom one. */
function syncLanding(root: string): void {
  const landing = path.join(root, 'src', 'content', 'docs', 'index.md');
  if (fs.existsSync(landing)) return;
  fs.mkdirSync(path.dirname(landing), { recursive: true });
  fs.writeFileSync(landing, DEFAULT_LANDING);
}
