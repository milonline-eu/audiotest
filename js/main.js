// Main entry point (script scope). Initializes the global `state` object
// (declared in state.js) and wires all event listeners, then renders.

// Exposed globals from other scripts:
//   presets.js: PRESET_A, PRESET_B, presetFor(mode), parseCustomFrequencies(text)
//   audio.js:   startTone, stopCurrent, toggleBtn, rowVolLabelFromPct
//   render.js:  renderChannel, attachListeners, renderCharts, setStatus,
//              copyValues, updateClipDump, defaultRowFor50, rowVolLabelFromPct

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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
  stopCurrent();
  renderChannel('left');
  renderChannel('right');
  renderCharts();
  updateClipDump();
}

// ----- stepper + input handlers -----

// stepsIn: re-render; stopCurrent (playing tone's row no longer exists).
function onStepsChange() {
  var stepsIn = document.getElementById('stepsIn');
  var v = syncFromInput(stepsIn, 1, 50);
  state.steps = Math.max(1, Math.min(50, Math.round(v)));
  stopCurrent();
  renderChannel('left');
  renderChannel('right');
  renderCharts();
  updateClipDump();
}
function onStepsStepper(dir) {
  var stepsIn = document.getElementById('stepsIn');
  var delta = dir > 0 ? 1 : -1;
  clampWrite(stepsIn, delta);
  onStepsChange();
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

// ----- wiring -----

function wire() {
  var stepsIn = document.getElementById('stepsIn');
  var lenIn = document.getElementById('lenIn');
  var delayIn = document.getElementById('delayIn');
  var customFreq = document.getElementById('customFreq');
  var applyBtn = document.getElementById('applyFreq');
  var copyBtn = document.getElementById('copyBtn');

  // steppers
  document.getElementById('stepsInMinus').addEventListener('click', function () { onStepsStepper(-1); });
  document.getElementById('stepsInPlus').addEventListener('click', function () { onStepsStepper(1); });
  document.getElementById('lenInMinus').addEventListener('click', function () { onLenStepper(-1); });
  document.getElementById('lenInPlus').addEventListener('click', function () { onLenStepper(1); });
  document.getElementById('delayInMinus').addEventListener('click', function () { onDelayStepper(-1); });
  document.getElementById('delayInPlus').addEventListener('click', function () { onDelayStepper(1); });

  // stepsIn
  stepsIn.addEventListener('change', onStepsChange);
  stepsIn.addEventListener('keyup', function (e) { if (e.key === 'Enter') onStepsChange(); });
  stepsIn.addEventListener('input', function () {
    var raw = Number(stepsIn.value);
    if (isFinite(raw)) state.steps = clamp(Math.round(raw), 1, 50);
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

  // Escape stops the current tone
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') stopCurrent();
  });

  // Matrix listeners (attach once; renderChannel does not re-add them).
  attachListeners();
}

// ----- startup -----

function startup() {
  state.steps = 20;
  state.seqLen = 5;
  state.delay = 0.2;
  state.freqs = presetFor('A');
  renderChannel('left');
  renderChannel('right');
  renderCharts();
  setStatus('idle');
  document.getElementById('clipDump').textContent = '';
  document.getElementById('applyFreq').disabled = true; // Preset A active
  wire();

  // Window resize -> debounced chart redraw
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderCharts, 150);
  });
}

document.addEventListener('DOMContentLoaded', startup);
