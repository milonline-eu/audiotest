// Playback engine (script scope; uses the global `state` object).
// Uses the external Tone.js library (loaded from lib/Tone.js). Every tone is a
// sine Oscillator routed through a Gain and a Tone.Panner. Panner value -1 =
// hard left, +1 = hard right, matching the channel of the clicked cell.
//
// Sequence: L = state.seqLen total window, D = state.delay.
//   D = 0  -> one oscillator for the full L seconds (continuous).
//   D > 0  -> blips: tone ON for D s, OFF for D s (50 % duty), a fresh
//             oscillator per blip. The window still ends at L, so the last
//             blip is truncated there.
//
// Exposed as globals: startTone, stopCurrent, toggleCell.

function toneReady() {
  return typeof window.Tone !== 'undefined';
}

// Creates and starts a source chain:
//   Oscillator(freq, 'sine') -> Gain(vol) -> Panner(ch) -> destination.
// Auto-stops the oscillator after `dur` s if dur > 0. Returns an object whose
// .stop() halts and releases the nodes.
function makeSource(freq, vol, ch, dur) {
  var osc = new Tone.Oscillator(freq, 'sine');
  var gain = new Tone.Gain(vol);
  var pan = new Tone.Panner(ch === 'left' ? -1 : 1);
  osc.connect(gain);
  gain.connect(pan);
  pan.connect(Tone.getDestination());
  var t = Tone.context.currentTime;
  osc.start(t);
  if (dur > 0) {
    osc.stop(t + dur);
  }
  function stop() {
    try { if (osc.state !== 'stopped') osc.stop(); } catch (e) {}
    try { osc.dispose(); } catch (e) {}
    try { gain.dispose(); } catch (e) {}
    try { pan.dispose(); } catch (e) {}
  }
  return { osc: osc, gain: gain, pan: pan, stop: stop };
}

// Stops the current tone: clears both timers, stops + disposes the source
// nodes, removes the active class, resets state, status -> "idle".
function stopCurrent() {
  if (!state.playing) { setStatus('idle'); return; }
  var p = state.playing;
  if (p.timerId != null) { clearTimeout(p.timerId); p.timerId = null; }
  if (p.endTimer != null) { clearTimeout(p.endTimer); p.endTimer = null; }
  if (p.countdownId != null) { clearInterval(p.countdownId); p.countdownId = null; }
  if (p.src) {
    try { p.src.stop(); } catch (e) {}
    p.src = null;
  }
  if (p.cellEl) p.cellEl.classList.remove('active');
  state.playing = null;
  setStatus('idle');
}


function startTone(ch, col, cellEl, rowDbStr) {
  if (state.playing) stopCurrent();

  var freq = state.freqs[col];
  // Gain from the dB ladder: the row plays at rowDbValue(row) dB
  // (dbMax top, dbStep dB per row), gain 10^(db/20).
  var rowMatch = /^rad-(left|right)-\d+-(\d+)$/.exec(cellEl.querySelector('input[type=radio]').id);
  var row = rowMatch ? Number(rowMatch[2]) : 0;
  var vol = Math.pow(10, rowDbValue(row) / 20);
  var L = Math.max(0, state.seqLen);
  var D = Math.max(0, state.delay);
  if (L <= 0 || !freq) { return; }
  if (!toneReady()) {
    // Tone.js absent: feedback only, auto-stop so the button can be toggled off.
    setTimeout(stopCurrent, Math.max(50, L * 1000));
    return;
  }

  // Record the playing tone up front so the UI reflects "playing" even while
  // the audio context is still resuming.
  var P = {
    ch: ch, col: col, cellEl: cellEl,
    freqHz: freq, chLabel: ch,
    src: null, timerId: null, endTimer: null,
    startedAt: Date.now(), duration: L * 1000,
    countdownId: null
  };
  state.playing = P;
  cellEl.classList.add('active');

  // Start a 100 ms countdown timer that updates the status line with the
  // remaining time to the nearest 0.1 s.
  P.countdownId = setInterval(function () {
    var elapsed = Date.now() - P.startedAt;
    var remainingMs = Math.max(0, P.duration - elapsed);
    var remainingSec = remainingMs / 1000;
    var statusText = 'playing freq=' + freq + 'Hz vol=' + rowDbStr +
      ' dB ch=' + ch + ' remaining: ' + remainingSec.toFixed(1) + 's';
    if (P.cellEl === cellEl) {
      setStatus(statusText);
    }
    if (remainingMs <= 0) {
      // End of window. Let the existing timer/endTimer drive the real stop;
      // stop the countdown here so we don't write "remaining: 0.0s" after.
      clearInterval(P.countdownId);
      P.countdownId = null;
      setStatus('idle');
    }
  }, 100);
  setStatus('playing freq=' + freq + 'Hz vol=' + rowDbStr + ' dB ch=' + ch + ' remaining: ' + L.toFixed(1) + 's');

  // Build the oscillator graph AFTER the Tone.js context has resumed. While a
  // newly-created context is "suspended", ctx.currentTime is frozen at ~0, so
  // any osc.stop(currentTime + dur) computed now would stop the tone
  // immediately. Chaining on Tone.start() (which resolves when state="running")
  // keeps the scheduled stop times accurate.
  var ready = (typeof window.Tone.start === 'function') ? window.Tone.start().catch(function() {}) : Promise.resolve();
  ready.then(function () {
    // Guard: the tone may have been stopped in the meantime (exclusive click,
    // Escape, ladder change, or a new startTone). Do nothing.
    if (state.playing !== P) { return; }
    try {
      if (D <= 0) {
        // Continuous tone: one oscillator, hard stop at L s.
        P.src = makeSource(freq, vol, ch, L);
        P.timerId = setTimeout(stopCurrent, L * 1000);
        P.endTimer = P.timerId;
        return;
      }
      // Blip pattern: ON for D s, OFF for D s, fresh oscillator per blip.
      function spawnBlip() {
        if (!state.playing || state.playing !== P) return;
        // Release the previous blip's nodes before building the next.
        if (P.src) { try { P.src.stop(); } catch (e) {} }
        P.src = makeSource(freq, vol, ch, D);
        P.timerId = setTimeout(spawnBlip, 2 * D * 1000);
      }
      P.endTimer = setTimeout(function () {
        if (P.endTimer === null) return;
        clearTimeout(P.endTimer);
        P.endTimer = null;
        stopCurrent();
      }, L * 1000);
      spawnBlip();
    } catch (e) {
      // Source creation failed after the context existed: still auto-stop.
      setTimeout(stopCurrent, Math.max(50, L * 1000));
    }
  }, function () {
    // Context unavailable: feedback only, auto-stop.
    if (state.playing === P) {
      setTimeout(stopCurrent, Math.max(50, L * 1000));
    }
  });
}

// Toggle: click the cell of the active tone to stop; any other cell plays
// its (channel, frequency, row) at that row's dB gain.
function toggleCell(cell) {
  if (state.playing && state.playing.cellEl === cell) {
    stopCurrent();
    return;
  }
  var radio = cell.querySelector('input[type=radio]');
  if (!radio) return;
  var m = /^rad-(left|right)-(\d+)-(\d+)$/.exec(radio.id);
  if (!m) return;
  startTone(m[1], Number(m[2]), cell, rowDbLabel(Number(m[3])));
}

// Expose to globals.
window.startTone = startTone;
window.stopCurrent = stopCurrent;
window.toggleCell = toggleCell;
