#!/usr/bin/env node
// Launcher for the `docswright` CLI. Runs the TypeScript sources through tsx's
// programmatic API because they use `.js` specifiers resolved to `.ts` files.
import { tsImport } from 'tsx/esm/api';

await tsImport('../src/cli.ts', import.meta.url);
