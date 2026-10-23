// Shared contract for docswright.config.ts — the "playbook" equivalent.

export type ContentSource =
  | { type: 'local'; path: string }
  | { type: 'git'; url: string; ref?: string; dir?: string };

export interface ComponentVersion {
  /** Version label used in URLs and sidebar, e.g. "current". */
  label: string;
  source: ContentSource;
}

export interface DocsWrightComponent {
  /** Slug-safe name, used as output directory under src/content/docs. */
  name: string;
  title?: string;
  versions: ComponentVersion[];
}

export interface DocsWrightConfig {
  siteTitle?: string;
  components: DocsWrightComponent[];
}

export function defineConfig(config: DocsWrightConfig): DocsWrightConfig {
  return config;
}
