// Main entry point (script scope). Initializes the global `state` object
// (declared in state.js) and wires all event listeners, then renders.

// Exposed globals from other scripts:
//   presets.js: PRESET_A, PRESET_B, presetFor(mode), parseCustomFrequencies(text)
//   audio.js:   startTone, stopCurrent, toggleCell
//   render.js:  renderChannel, attachListeners, renderCharts, setStatus,
//              copyValues, updateClipDump, saveClipJSON

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Row count for the current ladder: 1 + round(span/step). Never < 1.
function rowCount() {
  return Math.max(1, Math.round((state.dbMax - state.dbMin) / state.dbStep) + 1);
}

// "Library allows" bounds for the dB ladder inputs (Tone.js dbToGain has no
// built-in clamp): quietest meaningful floor and unity-gain ceiling.
var DB_LIB_MIN = -1000;
// Settings lock: once a value is set in the MATRIX selectors (a matrix radio
// change or a cell click), the dB ladder inputs (step/Min/Max) and the
// frequency controls become read-only. Reset unlocks. Changing the settings
// inputs or the frequency mode does NOT lock. Sequence length, delay, and the
// matrices stay operable while locked.
var locked = false;
function lockedControls() {
  var ids = ['dbStepIn', 'dbStepMinus', 'dbStepPlus', 'dbMinIn', 'dbMinMinus',
            'dbMinPlus', 'dbMaxIn', 'dbMaxMinus', 'dbMaxPlus', 'customFreq'];
  var els = ids.map(function (id) { return document.getElementById(id); });
  els = els.concat(Array.prototype.slice.call(document.querySelectorAll('input[name=fm]')));
  els.push(document.getElementById('applyFreq'));
  return els;
}
function setLocked(on) {
  if (locked === on) return;
  locked = on;
  lockedControls().forEach(function (el) { el.disabled = on; });
  if (!on) {
    // Re-apply the custom-mode rule: applyFreq/customFreq are disabled unless
    // the frequency mode is Custom, regardless of the lock state.
    var custom = (currentMode() === 'C');
    document.getElementById('customFreq').disabled = !custom;
    document.getElementById('applyFreq').disabled = !custom;
  }
}

// Apply dir*delta to a numeric input, snap to its step, clamp to min/max.
// Returns the new value.
function clampWrite(input, delta) {
  var min = Number(input.min);
  var max = Number(input.max);
  var step = input.step && input.step !== 'any' ? Number(input.step) : 1;
  var v = Number(input.value);
  if (!isFinite(v)) v = Number(input.valueAsNumber);
  v = clamp(v + delta, min, max);
  v = Math.round((v - min) / step) * step + min;
  v = clamp(v, min, max);
  // Avoid floating-point drift (e.g. 0.30000000000000004)
  v = Math.round(v * 100) / 100;
  input.value = v;
  return v;
}

function currentMode() {
  var els = document.querySelectorAll('input[name=fm]');
  for (var i = 0; i < els.length; i++) {
    if (els[i].checked) return els[i].value;
  }
  return 'A';
}

// Reads `v` from an input, clamps to [lo,hi], writes back, and returns the
// clamped value. No re-render, no +delta.
function syncFromInput(input, lo, hi) {
  var step = input.step && input.step !== 'any' ? Number(input.step) : 1;
  var v = Number(input.value);
  if (!isFinite(v)) v = Number(input.valueAsNumber);
  v = clamp(v, lo, hi);
  v = Math.round((v - lo) / step) * step + lo;
  v = clamp(v, lo, hi);
  v = Math.round(v * 100) / 100;
  input.value = v;
  return v;
}

// ----- frequency handling -----

// A new frequency set means nothing has been tested yet: clear the per-column
// tested flags so every column starts untested (yellow, no selection).
function resetTouched() {
  var n = state.freqs.length;
  state.touched.left = new Array(n).fill(false);
  state.touched.right = new Array(n).fill(false);
}
function applyFrequencies() {
  var mode = currentMode();
  var customFreq = document.getElementById('customFreq');
  var applyBtn = document.getElementById('applyFreq');
  var custom = (mode === 'C');

  var newFreqs;
  if (custom) {
    newFreqs = parseCustomFrequencies(customFreq.value);
    if (!newFreqs) {
      setStatus('invalid frequencies — keep previous set');
      return;
    }
  } else {
    newFreqs = presetFor(mode);
  }
  state.freqs = newFreqs;
  resetTouched();
  stopCurrent();
  renderChannel('left');
  renderChannel('right');
  renderCharts();
  updateClipDump();
}

// Load settings from a settings JSON (a file, or the pasted/edited text in
// the clipDump textarea) into state, the settings inputs, the frequency set,
// the matrices, and the charts. Invalid text -> a status message, nothing
// applied. Values that do not sit on the reconstructed ladder revert to
// untested (handled by renderChannel's rowForDb snapping).
function loadClipJSON(text) {
  var data;
  try { data = JSON.parse(text); }
  catch (e) { setStatus('load failed — not valid JSON'); return; }
  if (!data || typeof data !== 'object') { setStatus('load failed — not valid JSON'); return; }

  var dbStep = Number(data.dbStep);
  var dbMin = Number(data.dbMin);
  var dbMax = Number(data.dbMax);
  var seqLen = Number(data.sequenceLengthSec);
  var delay = Number(data.delayBetweenBeepsSec);

  var chans = data.channels || {};
  var left = Array.isArray(chans.left) ? chans.left : null;
  var right = Array.isArray(chans.right) ? chans.right : null;
  var ref = (left && left.length) ? left : right;
  if (!ref || !ref.length) { setStatus('load failed — no channels in JSON'); return; }

  var newFreqs = [];
  for (var i = 0; i < ref.length; i++) {
    var f = Number(ref[i] && ref[i].freqHz);
    if (!isFinite(f)) { setStatus('load failed — bad freqHz'); return; }
    newFreqs.push(f);
  }

  setLocked(false);
  stopCurrent();

  dbStep = isFinite(dbStep) ? clamp(dbStep, 0.1, 10) : state.dbStep;
  dbMin = isFinite(dbMin) ? clamp(dbMin, DB_LIB_MIN, 0) : state.dbMin;
  dbMax = isFinite(dbMax) ? clamp(dbMax, DB_LIB_MIN, 0) : state.dbMax;
  if (dbMin > dbMax) { var tmp = dbMin; dbMin = dbMax; dbMax = tmp; }
  state.dbStep = dbStep; state.dbMin = dbMin; state.dbMax = dbMax;
  state.steps = rowCount();
  document.getElementById('dbStepIn').value = dbStep;
  document.getElementById('dbMinIn').value = dbMin;
  document.getElementById('dbMaxIn').value = dbMax;

  seqLen = isFinite(seqLen) ? clamp(seqLen, 0.5, 60) : state.seqLen;
  delay = isFinite(delay) ? clamp(delay, 0, 30) : state.delay;
  state.seqLen = seqLen; state.delay = delay;
  document.getElementById('lenIn').value = seqLen;
  document.getElementById('delayIn').value = delay;

  // Frequencies -> Custom mode with the loaded list in the field.
  state.freqs = newFreqs.slice();
  var customRadio = document.querySelector('input[name=fm][value=C]');
  if (customRadio) customRadio.checked = true;
  document.getElementById('customFreq').value = newFreqs.join(', ');

  // Per-channel volumes + tested flags (raw dB; renderChannel snaps onto the
  // ladder and reverts non-ladder values to untested).
  ['left', 'right'].forEach(function (ch) {
    var arr = (ch === 'left' ? left : right) || [];
    var vols = new Array(newFreqs.length).fill(null);
    var touched = new Array(newFreqs.length).fill(false);
    for (var j = 0; j < newFreqs.length; j++) {
      var v = (arr[j] && arr[j].volumeDb != null) ? Number(arr[j].volumeDb) : null;
      if (v !== null && isFinite(v)) { vols[j] = v; touched[j] = true; }
    }
    state.vols[ch] = vols;
    state.touched[ch] = touched;
  });

  renderChannel('left');
  renderChannel('right');
  renderCharts();
  updateClipDump();

  var anyTouched = state.touched.left.some(Boolean) || state.touched.right.some(Boolean);
  setLocked(anyTouched);
  if (!anyTouched) {
    // Loaded into Custom mode with nothing selected: the setLocked(false)
    // unlock branch above ran while the mode radio still pointed at the old
    // mode, so re-enable the custom controls here.
    document.getElementById('customFreq').disabled = false;
    document.getElementById('applyFreq').disabled = false;
  }
  setStatus('loaded ' + newFreqs.length + ' frequencies');
}

// Load from a file picked by the Load button.
function loadFromFile(file) {
  var reader = new FileReader();
  reader.onload = function () { loadClipJSON(String(reader.result)); };
  reader.onerror = function () { setStatus('load failed — could not read file'); };
  reader.readAsText(file);
}

// ----- stepper + input handlers -----

// dbStepIn: recompute row count, re-render; stopCurrent (playing tone's row
// may no longer exist).
function onDbStepChange() {
  var dbStepIn = document.getElementById('dbStepIn');
  state.dbStep = syncFromInput(dbStepIn, 0.1, 10);
  state.steps = rowCount();
  stopCurrent();
  renderChannel('left');
  renderChannel('right');
  renderCharts();
  updateClipDump();
}
function onDbStepStepper(dir) {
  clampWrite(document.getElementById('dbStepIn'), dir * 0.5);
  onDbStepChange();
}
// lenIn: immediate only, no re-render.
function onLenChange() {
  var lenIn = document.getElementById('lenIn');
  state.seqLen = syncFromInput(lenIn, 0.5, 60);
}
function onLenStepper(dir) {
  var lenIn = document.getElementById('lenIn');
  clampWrite(lenIn, dir * 0.5);
  onLenChange();
}
// delayIn: immediate only, no re-render.
function onDelayChange() {
  var delayIn = document.getElementById('delayIn');
  state.delay = syncFromInput(delayIn, 0, 30);
}
function onDelayStepper(dir) {
  var delayIn = document.getElementById('delayIn');
  clampWrite(delayIn, dir * 0.1);
  onDelayChange();
}
// dbMinIn / dbMaxIn: re-render + stopCurrent (a playing tone's row dB changes
// when the range changes). Cross-clamp keeps dbMin <= dbMax.
function onDbMinChange() {
  var dbMinIn = document.getElementById('dbMinIn');
  var dbMaxIn = document.getElementById('dbMaxIn');
  var hi = Number(dbMaxIn.value); if (!isFinite(hi)) hi = state.dbMax;
  var v = syncFromInput(dbMinIn, DB_LIB_MIN, hi);   // cross-clamp so dbMin <= dbMax
  state.dbMin = v;
  state.steps = rowCount();
  stopCurrent();
  renderChannel('left');
  renderChannel('right');
  renderCharts();
  updateClipDump();
}
function onDbMaxChange() {
  var dbMaxIn = document.getElementById('dbMaxIn');
  var dbMinIn = document.getElementById('dbMinIn');
  var lo = Number(dbMinIn.value); if (!isFinite(lo)) lo = state.dbMin;
  var v = syncFromInput(dbMaxIn, lo, DB_LIB_MAX);   // cross-clamp so dbMax >= dbMin
  state.dbMax = v;
  state.steps = rowCount();
  stopCurrent();
  renderChannel('left');
  renderChannel('right');
  renderCharts();
  updateClipDump();
}
function onDbMinStepper(dir) {
  clampWrite(document.getElementById('dbMinIn'), dir * 1);
  onDbMinChange();
}
function onDbMaxStepper(dir) {
  clampWrite(document.getElementById('dbMaxIn'), dir * 1);
  onDbMaxChange();
}

// ----- wiring -----

function wire() {
  var dbStepIn = document.getElementById('dbStepIn');
  var lenIn = document.getElementById('lenIn');
  var delayIn = document.getElementById('delayIn');
  var customFreq = document.getElementById('customFreq');
  var applyBtn = document.getElementById('applyFreq');
  var copyBtn = document.getElementById('copyBtn');

  // steppers
  document.getElementById('dbStepMinus').addEventListener('click', function () { onDbStepStepper(-1); });
  document.getElementById('dbStepPlus').addEventListener('click', function () { onDbStepStepper(1); });
  document.getElementById('lenInMinus').addEventListener('click', function () { onLenStepper(-1); });
  document.getElementById('lenInPlus').addEventListener('click', function () { onLenStepper(1); });
  document.getElementById('delayInMinus').addEventListener('click', function () { onDelayStepper(-1); });
  document.getElementById('delayInPlus').addEventListener('click', function () { onDelayStepper(1); });
  document.getElementById('dbMinMinus').addEventListener('click', function () { onDbMinStepper(-1); });
  document.getElementById('dbMinPlus').addEventListener('click', function () { onDbMinStepper(1); });
  document.getElementById('dbMaxMinus').addEventListener('click', function () { onDbMaxStepper(-1); });
  document.getElementById('dbMaxPlus').addEventListener('click', function () { onDbMaxStepper(1); });

  // dbStepIn
  dbStepIn.addEventListener('change', onDbStepChange);
  dbStepIn.addEventListener('keyup', function (e) { if (e.key === 'Enter') onDbStepChange(); });
  dbStepIn.addEventListener('input', function () {
    var raw = Number(dbStepIn.value);
    if (isFinite(raw)) state.dbStep = clamp(raw, 0.1, 10);
  });

  // lenIn
  lenIn.addEventListener('change', onLenChange);
  lenIn.addEventListener('keyup', function (e) { if (e.key === 'Enter') onLenChange(); });
  lenIn.addEventListener('input', function () {
    var raw = Number(lenIn.value);
    if (isFinite(raw)) state.seqLen = clamp(raw, 0.5, 60);
  });

  // delayIn
  delayIn.addEventListener('change', onDelayChange);
  delayIn.addEventListener('keyup', function (e) { if (e.key === 'Enter') onDelayChange(); });
  delayIn.addEventListener('input', function () {
    var raw = Number(delayIn.value);
    if (isFinite(raw)) state.delay = clamp(raw, 0, 30);
  });

  var dbMinIn = document.getElementById('dbMinIn');
  var dbMaxIn = document.getElementById('dbMaxIn');

  // dbMinIn
  dbMinIn.addEventListener('change', onDbMinChange);
  dbMinIn.addEventListener('keyup', function (e) { if (e.key === 'Enter') onDbMinChange(); });
  dbMinIn.addEventListener('input', function () {
    var raw = Number(dbMinIn.value);
    if (isFinite(raw)) state.dbMin = clamp(raw, DB_LIB_MIN, 0);
  });

  // dbMaxIn
  dbMaxIn.addEventListener('change', onDbMaxChange);
  dbMaxIn.addEventListener('keyup', function (e) { if (e.key === 'Enter') onDbMaxChange(); });
  dbMaxIn.addEventListener('input', function () {
    var raw = Number(dbMaxIn.value);
    if (isFinite(raw)) state.dbMax = clamp(raw, -1000, 0);
  });

  // freq mode radios
  document.querySelectorAll('input[name=fm]').forEach(function (r) {
    r.addEventListener('change', function () {
      var custom = (r.value === 'C');
      customFreq.disabled = !custom;
      applyBtn.disabled = !custom;
      // For A/B: apply the preset immediately. For Custom: apply what was typed.
      applyFrequencies();
    });
  });

  // Apply frequencies button + Enter in customFreq
  applyBtn.addEventListener('click', applyFrequencies);
  customFreq.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); applyFrequencies(); }
  });

  // Copy button
  copyBtn.addEventListener('click', copyValues);
  document.getElementById('resetBtn').addEventListener('click', function () { setLocked(false); });
  document.getElementById('saveBtn').addEventListener('click', saveClipJSON);

  // Escape stops the current tone
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') stopCurrent();
  });


  // Load: pick a settings JSON file, or paste/edit JSON into the clipDump
  // textarea — both drive the same loadClipJSON() path.
  var loadBtn = document.getElementById('loadBtn');
  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  loadBtn.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) loadFromFile(fileInput.files[0]);
    fileInput.value = ''; // allow re-selecting the same file
  });
  var clipDump = document.getElementById('clipDump');
  clipDump.addEventListener('change', function () { loadClipJSON(clipDump.value); });
  clipDump.addEventListener('paste', function () {
    setTimeout(function () { loadClipJSON(clipDump.value); }, 0);
  });
  // Matrix listeners (attach once; renderChannel does not re-add them).
  attachListeners();
}

// ----- startup -----

function startup() {
  state.dbStep = 2;
  state.seqLen = 1;
  state.delay = 0.1;
  state.dbMin = -80;
  state.dbMax = -20;
  state.steps = rowCount();
  state.freqs = presetFor('B');
  renderChannel('left');
  renderChannel('right');
  renderCharts();
  setStatus('idle');
  document.getElementById('clipDump').value = '';
  document.getElementById('applyFreq').disabled = true; // Preset B active
  wire();

  // Window resize -> debounced chart redraw
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderCharts, 150);
  });
}

document.addEventListener('DOMContentLoaded', startup);
