// Locates the running docswright engine's entry script, so a project (which does not
// vendor the engine) can be rebuilt by the same binary that serves it.
import { fileURLToPath } from 'node:url';

/** Absolute path to bin/docswright.mjs of the engine that is currently running. */
export function engineEntry(): string {
  return fileURLToPath(new URL('../bin/docswright.mjs', import.meta.url));
}
