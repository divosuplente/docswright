// Site flavour: aggregates external markdown docs (Antora-style components).
export default {
  siteTitle: '__NAME__',
  components: [
    {
      name: 'docs',
      title: 'Docs',
      versions: [{ label: 'current', source: { type: 'local', path: 'docs' } }],
    },
  ],
};
