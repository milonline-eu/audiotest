// Frequency presets and parsing helpers.
// To add a new preset: declare a const array next to PRESET_A / PRESET_B,
// then reference it in the frequency-mode radio handler in main.js.
var PRESET_A = [
  125, 250, 500, 630, 800, 1000, 1250, 1600, 2000, 2500,
  3150, 4000, 5000, 6300, 8000
];
var PRESET_B = [
  125, 160, 200, 250, 315, 400, 500, 630, 800, 1000,
  1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000
];
var PRESETS = { A: PRESET_A, B: PRESET_B };

// Returns a copy of the preset for a mode, or null if unknown.
function presetFor(mode) {
  return PRESETS[mode] ? PRESETS[mode].slice() : null;
}

// Parse custom frequency text: split on commas/whitespace, keep positive
// numbers, drop invalid tokens, dedupe, sort ascending.
// Returns null when fewer than 2 valid tokens.
function parseCustomFrequencies(text) {
  var tokens = String(text || '').split(/[\s,]+/).filter(Boolean);
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var n = Number(tokens[i]);
    if (!isFinite(n) || n <= 0) continue;
    if (out.indexOf(n) === -1) out.push(n);
  }
  if (out.length < 2) return null;
  out.sort(function (a, b) { return a - b; });
  return out;
}
