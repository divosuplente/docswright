// Fetches each component/version into a local, usable source directory.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { DocsWrightComponent, ComponentVersion } from './types.js';

const CACHE = '.docswright/cache';

export interface FetchedVersion {
  component: DocsWrightComponent;
  version: ComponentVersion;
  sourceDir: string;
}


function git(args: string[], what: string): void {
  const res = spawnSync('git', args, { encoding: 'utf8' });
  if (res.error) throw new Error(`${what}: failed to run git (${res.error.message})`);
  if (res.status !== 0) {
    const stderr = (res.stderr ?? '').trim();
    throw new Error(`${what}: git ${args.join(' ')} failed${stderr ? `: ${stderr.split('\n').slice(-3).join(' ')}` : ''}`);
  }
}

/**
 * Fetch one version's content. Returns the absolute directory to sync from:
 * local sources resolve to the configured path; git sources to .docswright/cache/<component>/<version>[/<dir>].
 * Throws a readable Error naming the component and version on any failure.
 */
export function fetchVersion(root: string, component: DocsWrightComponent, version: ComponentVersion): string {
  const what = `${component.name}/${version.label}`;
  const source = version.source;

  if (source.type === 'local') {
    const dir = path.resolve(root, source.path);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error(`${what}: local source path does not exist: ${dir}`);
    }
    return dir;
  }

  // git source
  const ref = source.ref;
  const cacheDir = path.join(root, CACHE, component.name, version.label);

  if (fs.existsSync(cacheDir)) {
    git(['-C', cacheDir, 'fetch', '--depth', '1', 'origin', ref ?? 'HEAD'], what);
    git(['-C', cacheDir, 'reset', '--hard', 'FETCH_HEAD'], what);
  } else {
    fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
    try {
      const args = ['clone', '--depth', '1'];
      if (ref) args.push('--branch', ref);
      args.push(source.url, cacheDir);
      git(args, what);
    } catch (err) {
      // Never leave a partial cache dir behind (nor an empty parent).
      fs.rmSync(cacheDir, { recursive: true, force: true });
      const parent = path.dirname(cacheDir);
      if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
      throw err;
    }
  }

  const target = source.dir ? path.join(cacheDir, source.dir) : cacheDir;
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`${what}: git dir does not exist in clone: ${source.dir ?? '(repo root)'}`);
  }
  return target;
}

/** Fetch every component/version; returns { component, version, sourceDir } entries. */
export async function fetchAll(root: string, components: DocsWrightComponent[]): Promise<FetchedVersion[]> {
  const out: FetchedVersion[] = [];
  for (const component of components) {
    for (const version of component.versions) {
      out.push({ component, version, sourceDir: fetchVersion(root, component, version) });
    }
  }
  return out;
}
