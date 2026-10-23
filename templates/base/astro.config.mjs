import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

// Content is written by `docswright sync` into src/content/docs/<component>/<version>/.
export default defineConfig({
  site: 'http://localhost:4000',
  integrations: [starlight({ title: '__NAME__' }), sitemap()],
});
