#!/usr/bin/env node
// docswright CLI: aggregate content sources, sync into the site, build, serve the wiki.

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, repoRoot } from './config.js';
import { fetchAll, type FetchedVersion } from './fetch.js';
import { syncAll } from './sync.js';
import { buildSite } from './build-site.js';
import { publishWiki } from './publish-ado.js';
import { newProject, type ProjectKind } from './commands/new.js';
import type { DocsWrightConfig } from './types.js';

async function syncFromConfig(config: DocsWrightConfig): Promise<void> {
  const projectRoot = repoRoot();
  const fetched: FetchedVersion[] = await fetchAll(projectRoot, config.components);
  for (const entry of fetched) {
    console.log(`synced ${entry.component.name}/${entry.version.label} <- ${entry.sourceDir}`);
  }
  await syncAll(projectRoot, fetched);
}

const program = new Command();
program
  .name('docswright')
  .description('Aggregate markdown docs from local/git components and serve an editable wiki.')
  .version('0.1.0');

program
  .command('new <kind> <dir>')
  .description('Scaffold a new project: kind is "site" (aggregated docs) or "wiki"')
  .option('--force', 'write into a non-empty directory', false)
  .action((kind: string, dir: string, opts: { force: boolean }) => {
    if (kind !== 'site' && kind !== 'wiki') {
      throw new Error(`unknown kind "${kind}": expected "site" or "wiki"`);
    }
    const target = newProject({ kind: kind as ProjectKind, dir, force: opts.force });
    console.log(`created ${kind} project in ${target}`);
    console.log(`next: cd ${path.relative(process.cwd(), target) || '.'} && npm install && npm run build`);
  });

program
  .command('sync')
  .description('Fetch all component versions and rewrite src/content/docs')
  .action(async () => {
    const config = await loadConfig(repoRoot());
    await syncFromConfig(config);
  });

program
  .command('build')
  .description('Fetch, sync, then run astro build')
  .action(async () => {
    const config = await loadConfig(repoRoot());
    await syncFromConfig(config);
    await buildSite(repoRoot());
  });

program
  .command('wiki')
  .description('Serve the built site plus the wiki editor (builds first if needed)')
  .option('--port <port>', 'port to serve on', (v) => parseInt(v, 10), 4000)
  .action(async (opts: { port: number }) => {
    if (!fs.existsSync(path.join(repoRoot(), 'dist', 'index.html'))) {
      console.log('dist/index.html missing — running full build first');
      const config = await loadConfig(repoRoot());
      await syncFromConfig(config);
      await buildSite(repoRoot());
    }
    // Dynamic import: wiki/ is a sibling subsystem that only exists at runtime.
    const { startServer } = await import('./wiki/server.js');
    const server = startServer(opts.port);
    console.log(`wiki server listening on http://127.0.0.1:${opts.port}`);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => server.close(() => process.exit(0)));
    }
  });

program
  .command('publish')
  .description('Push the local wiki pages to an Azure DevOps project wiki (uses the az CLI login)')
  .requiredOption('--org <url>', 'organization URL, e.g. https://dev.azure.com/yourorg')
  .requiredOption('--project <name>', 'project name')
  .requiredOption('--wiki <name>', 'wiki name (the last URL segment of the wiki UI)')
  .option('--create', 'create the wiki when it does not exist', false)
  .option('--dry-run', 'list the pages that would be pushed', false)
  .action(async (opts: { org: string; project: string; wiki: string; create: boolean; dryRun: boolean }) => {
    const count = await publishWiki({ ...opts, wikiDir: path.join(repoRoot(), 'wiki') });
    console.log(opts.dryRun ? `dry run: ${count} page(s)` : `published ${count} page(s)`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
