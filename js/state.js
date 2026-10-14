// Global state object shared by all modules.
// Row r (0 = top) volume value: (S - r) * 100 / S  ->  100% top ... 5% bottom (S=20).
// Playback dB ladder spans state.dbMax (top row) to state.dbMin (bottom row),
// linear in dB across state.steps rows.
var state = {
  freqs: [],
  steps: 20,
  seqLen: 5,
  delay: 0,
  dbMin: -80, // dB of the BOTTOM row (quietest / most negative)
  dbMax: -20, // dB of the TOP row (loudest / least negative)
  vols: { left: [], right: [] },
  playing: null
};
