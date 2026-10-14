// Global state object shared by all modules.
// Row r (0 = top) volume value: (S - r) * 100 / S  ->  100% top ... 5% bottom (S=20).
var state = {
  freqs: [],
  steps: 20,
  seqLen: 5,
  delay: 0,
  vols: { left: [], right: [] },
  playing: null
};
