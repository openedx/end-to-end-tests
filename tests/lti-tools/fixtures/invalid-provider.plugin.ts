/** Not a provider: its features are a list, and one of them is unknown. */
export default {
  name: 'invalid-fixture',
  features: ['claims', 'teleport'],
  openSession: () => Promise.resolve(undefined),
};
