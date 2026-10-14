// Global state object shared by all modules.
// Volume is the dB ladder only: top row (0) = state.dbMax, each row
// dbStep dB quieter. state.steps is the derived row count
// (round((dbMax - dbMin) / dbStep) + 1), recomputed on every ladder change.
var state = {
  freqs: [],
  steps: 0, // derived row count; recomputed from the dB ladder, never user-set
  seqLen: 2,
  delay: 0.1,
  dbStep: 2, // dB difference between adjacent rows (input range 0.1-10)
  dbMin: -80, // dB of the BOTTOM row (quietest / most negative)
  dbMax: -20, // dB of the TOP row (loudest / least negative)
  vols: { left: [], right: [] },
  playing: null
};
