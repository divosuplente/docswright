// Runs the Astro build for the generated site.

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { repoRoot } from './config.js';

/** Run `astro build` (from the project's node_modules) with cwd = project root.
 * Rejects with an actionable message when the project has not installed deps. */
export function buildSite(root: string = repoRoot()): Promise<void> {
  const astroBin = path.join(root, 'node_modules', '.bin', 'astro');
  if (!fs.existsSync(astroBin)) {
    return Promise.reject(
      new Error(
        `astro is not installed in ${root}. Run "npm install" there first ` +
          `(the project must own its Astro/Starlight versions; the engine's copy is not used).`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(astroBin, ['build'], { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`astro build failed with exit code ${code}`));
    });
  });
}
