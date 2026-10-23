// `docswright new site|wiki <dir>` — scaffold a standalone Astro+Starlight project.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the engine package (this file lives in <engine>/src/commands/). */
const engineRoot = fileURLToPath(new URL('../..', import.meta.url));

export type ProjectKind = 'site' | 'wiki';

const templatesDir = fileURLToPath(new URL('../../templates', import.meta.url));

const KIND_DEFAULTS: Record<ProjectKind, { tagline: string; actionText: string; link: string }> = {
  site: { tagline: 'Markdown documentation, aggregated Antora-style.', actionText: 'Browse docs', link: '/docs/current/' },
  wiki: { tagline: 'Markdown wiki, editable in the browser.', actionText: 'Open wiki', link: '/wiki/current/home/' },
};

/** Copy a template tree, substituting __PLACEHOLDER__ tokens in text files. */
function copyTree(from: string, to: string, vars: Record<string, string>): void {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    // npm strips .gitignore from tarballs, so it ships as "gitignore" and is
    // restored here. Without this, scaffolded projects commit build output.
    const dest = path.join(to, entry.name === 'gitignore' ? '.gitignore' : entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyTree(src, dest, vars);
      continue;
    }
    let content = fs.readFileSync(src, 'utf8');
    for (const [key, value] of Object.entries(vars)) content = content.split(key).join(value);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
}

export interface NewOptions {
  kind: ProjectKind;
  dir: string;
  force: boolean;
}

/** Scaffold a project. Returns the absolute target directory. */
export function newProject({ kind, dir, force }: NewOptions): string {
  const target = path.resolve(dir);
  if (fs.existsSync(target)) {
    const entries = fs.readdirSync(target);
    if (entries.length > 0 && !force) {
      throw new Error(`${target} is not empty; pass --force to write into it anyway`);
    }
  }
  fs.mkdirSync(target, { recursive: true });

  const name = path.basename(target);
  const defaults = KIND_DEFAULTS[kind];
  const vars: Record<string, string> = {
    __NAME__: name,
    __PKG_NAME__: name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-'),
    __TAGLINE__: defaults.tagline,
    __ACTION_TEXT__: defaults.actionText,
    __ACTION_LINK__: defaults.link,
  };

  copyTree(path.join(templatesDir, 'base'), target, vars);
  copyTree(path.join(templatesDir, kind), target, vars);

  // Make the project self-sufficient by depending on the engine that generated it.
  // A published install depends on the registry version; a local dev checkout uses
  // file: so uncommitted engine changes are picked up. npx runs from a throwaway
  // cache that gets deleted, so path-based specs there would dangle.
  const enginePkg = JSON.parse(fs.readFileSync(path.join(engineRoot, 'package.json'), 'utf8'));
  const fromRegistry = engineRoot.split(path.sep).includes('node_modules');
  const spec = fromRegistry ? `^${enginePkg.version}` : `file:${engineRoot}`;
  const pkgPath = path.join(target, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies[enginePkg.name] = spec;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  return target;
}
