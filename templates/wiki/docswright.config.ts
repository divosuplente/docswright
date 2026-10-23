// Wiki flavour: the local markdown pages are the source of truth and are
// editable in the browser at /_admin/, then publishable to Azure DevOps.
export default {
  siteTitle: '__NAME__',
  components: [
    {
      name: 'wiki',
      title: 'Wiki',
      versions: [{ label: 'current', source: { type: 'local', path: 'wiki' } }],
    },
  ],
};
