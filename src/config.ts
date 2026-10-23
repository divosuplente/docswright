// Loads and validates docswright.config.ts.

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import type { ComponentVersion, DocsWrightComponent, DocsWrightConfig } from './types.js';

/** Project root = nearest ancestor of the working directory with docswright.config.ts.
 * Resolved from cwd only, never from this module's location: a globally installed
 * package must act on the user's project, and must not fall back to its own dir. */
export function repoRoot(): string {
  for (let dir = process.cwd(); ; ) {
    if (fs.existsSync(path.join(dir, 'docswright.config.ts'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `No docswright.config.ts found above ${process.cwd()}. Run this inside a project, ` +
          `or create one with "docswright new site <dir>".`,
      );
    }
    dir = parent;
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

function checkSlug(label: string, what: string): void {
  if (!SLUG_RE.test(label)) {
    throw new Error(`Invalid ${what} "${label}": must be slug-safe (lowercase letters, digits, "-" or "_").`);
  }
}

function checkVersions(comp: DocsWrightComponent, index: number): void {
  const at = `components[${index}] (${comp.name})`;
  if (!Array.isArray(comp.versions) || comp.versions.length === 0) {
    throw new Error(`${at}: "versions" must be a non-empty array.`);
  }
  const seen = new Set<string>();
  for (const v of comp.versions as ComponentVersion[]) {
    if (typeof v.label !== 'string' || v.label.length === 0) {
      throw new Error(`${at}: every version needs a non-empty "label".`);
    }
    checkSlug(v.label, `version label (in ${at})`);
    const key = `${comp.name}/${v.label}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate component/version pair: ${key}.`);
    }
    seen.add(key);
    const src = v.source;
    if (!src || (src.type !== 'local' && src.type !== 'git')) {
      throw new Error(`${at}, version "${v.label}": source must be {type:'local'|'git', ...}.`);
    }
    if (src.type === 'local' && typeof src.path !== 'string') {
      throw new Error(`${at}, version "${v.label}": local source needs a "path".`);
    }
    if (src.type === 'git' && (typeof src.url !== 'string' || src.url.length === 0)) {
      throw new Error(`${at}, version "${v.label}": git source needs a "url".`);
    }
  }
}

/** Load and validate docswright.config.ts; throw readable errors on problems. */
export async function loadConfig(root: string = repoRoot()): Promise<DocsWrightConfig> {
  const file = path.join(root, 'docswright.config.ts');
  if (!fs.existsSync(file)) {
    throw new Error(`docswright.config.ts not found in ${root}`);
  }
  // Cache-bust by mtime so a re-saved config re-imports with fresh content.
  const mtime = fs.statSync(file).mtimeMs;
  const mod = await import(`${pathToFileURL(file).href}?cachebust=${mtime}`);
  const config = (mod.default ?? mod) as DocsWrightConfig;
  if (!config || !Array.isArray(config.components) || config.components.length === 0) {
    throw new Error('docswright.config.ts must default-export an object with a non-empty "components" array.');
  }
  const seenNames = new Set<string>();
  config.components.forEach((comp, i) => {
    if (typeof comp.name !== 'string' || comp.name.length === 0) {
      throw new Error(`components[${i}]: missing "name".`);
    }
    checkSlug(comp.name, 'component name');
    if (seenNames.has(comp.name)) {
      throw new Error(`Duplicate component name: "${comp.name}".`);
    }
    seenNames.add(comp.name);
    checkVersions(comp, i);
  });
  return config;
}
