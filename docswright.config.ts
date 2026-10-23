import { defineConfig } from './src/types.js';

// The "playbook" equivalent: components aggregate content from local dirs
// or git sources, each with one or more versions.
export default defineConfig({
  siteTitle: 'docswright Docs',
  components: [
    {
      name: 'demo-docs',
      title: 'Demo Docs',
      versions: [{ label: 'current', source: { type: 'local', path: 'demo-docs' } }],
    },
    {
      name: 'wiki',
      title: 'Wiki',
      versions: [{ label: 'current', source: { type: 'local', path: 'wiki' } }],
    },
    // Git source example:
    // {
    //   name: 'other-docs',
    //   versions: [{
    //     label: 'v1.0',
    //     source: { type: 'git', url: 'https://host/repo.git', ref: 'v1.0', dir: 'docs' },
    //   }],
    // },
  ],
});
