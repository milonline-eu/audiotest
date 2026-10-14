// Rendering: matrices (renderChannel), line charts (renderCharts),
// status line (setStatus), and the clipboard copy (copyValues).
// All element ids are pinned in index.html and may not change.
// Exposed as globals: renderChannel, attachListeners, renderCharts,
// setStatus, copyValues, updateClipDump, saveClipJSON, localTimestamp,
// rowDbLabel, rowDbValue, targetDbAt, targetShifted.

// Playback ladder in dB: top row (0) = state.dbMax, each row dbStep dB
// quieter (state.dbStep); bottom row (S-1) = dbMax - (S-1)*dbStep.
function rowDbLabel(row) {
  return rowDbValue(row).toFixed(1);
}

// dB value for a row as a number: top row (0) = state.dbMax, each row
// dbStep dB quieter. Bottom row (S-1) = dbMax - (S-1)*dbStep (>= dbMin;
// when dbStep doesn't divide the span, the bottom row sits one step
// above dbMin).
function rowDbValue(row) {
  var S = state.steps;
  if (S <= 1) return state.dbMax;                 // one row = top = max
  return state.dbMax - row * state.dbStep;
}

// The ladder row that plays exactly `db` (within 0.5 dB), or -1 if no row
// does. Used to re-check a stored selection after a ladder change: a value
// that no longer exists on the ladder reverts that column to untested.
function rowForDb(db) {
  var S = state.steps;
  if (!S) return -1;
  for (var r = 0; r < S; r++) {
    if (Math.abs(rowDbValue(r) - db) <= 0.5) return r;
  }
  return -1;
}

// Remove the "untested" (yellow) highlight from every cell of one column.
function clearUntested(ch, col) {
  for (var r = 0; r < state.steps; r++) {
    var el = document.getElementById('rad-' + ch + '-' + col + '-' + r);
    if (el && el.parentElement) el.parentElement.classList.remove('untested');
  }
}

// ---------- status ----------

function setStatus(t) {
  document.getElementById('status').textContent = t;
}

// ---------- matrix rendering ----------

function renderChannel(ch) {
  var container = document.getElementById(ch === 'left' ? 'matrix-L' : 'matrix-R');
  var table = document.createElement('table');

  var thead = table.createTHead();
  var headerRow = thead.appendChild(document.createElement('tr'));
  var corner = headerRow.appendChild(document.createElement('th'));
  corner.className = 'rowlabel';
  corner.textContent = '';
  var freqs = state.freqs;
  for (var c = 0; c < freqs.length; c++) {
    var th = document.createElement('th');
    th.textContent = freqs[c];
    headerRow.appendChild(th);
  }

  var tbody = table.createTBody();
  var S = state.steps;
  for (var r = 0; r < S; r++) {
    var tr = tbody.appendChild(document.createElement('tr'));
    // Row label (left side) — the single place the volume is shown: the
    // playback ladder in dB (state.dbMax top, dbStep dB per row).
    var labelCell = document.createElement('td');
    labelCell.className = 'rowlabel';
    labelCell.textContent = rowDbLabel(r) + ' dB';
    tr.appendChild(labelCell);

    for (var c2 = 0; c2 < freqs.length; c2++) {
      var cell = document.createElement('td');
      cell.className = 'cell';

      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'vol-' + ch + '-' + c2;
      radio.id = 'rad-' + ch + '-' + c2 + '-' + r;
      radio.value = String(rowDbValue(r));
      cell.appendChild(radio);
      tr.appendChild(cell);
    }
  }
  if (container.replaceChildren) {
    container.replaceChildren(table);
  } else {
    container.innerHTML = '';
    container.appendChild(table);
  }

  // No radio is pre-selected. A column is "tested" only after the user picks a
  // value (radio change or cell click); until then its cells are highlighted
  // yellow (untested) and its volume is null. A tested selection is preserved
  // across ladder re-renders: it is kept only while its stored dB still matches
  // a ladder row exactly (within 0.5 dB); otherwise the column reverts to
  // untested. Frequency changes reset the tested flags (resetTouched in
  // main.js), so a new set starts untested.
  var n = freqs.length;
  var prevTouched = Array.isArray(state.touched[ch]) ? state.touched[ch].slice(0, n) : new Array(n).fill(false);
  while (prevTouched.length < n) prevTouched.push(false);
  var prevVols = Array.isArray(state.vols[ch]) ? state.vols[ch].slice(0, n) : new Array(n).fill(null);
  while (prevVols.length < n) prevVols.push(null);

  state.touched[ch] = new Array(n).fill(false);
  state.vols[ch] = new Array(n).fill(null);
  for (var c3 = 0; c3 < n; c3++) {
    if (prevTouched[c3]) {
      // Keep the selection only if its stored dB still exists on the new
      // ladder (within 0.5 dB); otherwise the column reverts to untested.
      var row = rowForDb(prevVols[c3]);
      if (row >= 0) {
        state.vols[ch][c3] = rowDbValue(row);
        state.touched[ch][c3] = true;
        var sel = document.getElementById('rad-' + ch + '-' + c3 + '-' + row);
        if (sel) sel.checked = true;
      }
    }
    if (!state.touched[ch][c3]) {
      // Untested: no radio checked; yellow the column's cells.
      for (var rr = 0; rr < S; rr++) {
        var cellEl = document.getElementById('rad-' + ch + '-' + c3 + '-' + rr);
        if (cellEl && cellEl.parentElement) cellEl.parentElement.classList.add('untested');
      }
    }
  }
}

// Attach delegated listeners ONCE (called by main.js after build).
// Radio change: update state.vols, charts, clipDump, engage the lock.
// Cell click: play the cell's (channel, frequency, row); engage the lock.
function attachListeners() {
  var radioPattern = /^rad-(left|right)-(\d+)-\d+$/;
  ['matrix-L', 'matrix-R'].forEach(function (id) {
    var container = document.getElementById(id);
    container.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.type !== 'radio') return;
      var m = radioPattern.exec(t.id);
      if (!m) return;
      var chName = m[1];
      var col = Number(m[2]);
      state.vols[chName][col] = Number(t.value);
      state.touched[chName][col] = true;
      clearUntested(chName, col);
      setLocked(true);
      renderCharts();
      updateClipDump();
    });
    container.addEventListener('click', function (e) {
      var cell = e.target && e.target.closest ? e.target.closest('td.cell') : null;
      if (!cell) return;
      var cellRadio = cell.querySelector('input[type=radio]');
      if (!cellRadio) return;
      var m = radioPattern.exec(cellRadio.id);
      if (!m) return;
      // Mark this column tested and clear the "untested" highlight, then
      // auto-select the radio so it reflects the (channel, frequency, row)
      // the cell plays.
      var colIdx = Number(m[2]);
      state.touched[m[1]][colIdx] = true;
      clearUntested(m[1], colIdx);
      if (!cellRadio.checked) {
        cellRadio.checked = true;
        state.vols[m[1]][colIdx] = Number(cellRadio.value);
        renderCharts();
        updateClipDump();
      }
      setLocked(true);
      toggleCell(cell);
    });
  });
}

// ---------- charts ----------

// Charts are rendered with Chart.js (lib/chart.js.min.js). Each channel gets a
// full-width Line chart: x = frequencies (by index), y = volume in dB,
// a gray line with red "x" (cross) markers. The instances are kept in
// window.__chartL / window.__chartR so that renderCharts() can update the
// same canvas rather than destroying/recreating it on every change.

var _chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { display: false }
  },
  scales: {
    x: {
      title: { display: true, text: 'Frequency (Hz)', font: { size: 11 } },
      ticks: { autoSkip: false, maxRotation: 45, font: { size: 9 } }
    },
    y: {
      title: { display: true, text: 'Volume (dB)', font: { size: 11 } },
      ticks: { font: { size: 11 } }
    }
  }
};

// Scale the x-axis (frequency) tick font to the current plot width so the Hz
// labels shrink when the window gets narrower instead of overlapping.
function _fitXTickFont(ch) {
  var freqs = state.freqs || [];
  if (!freqs.length) return 9;
  var canvas = document.getElementById(ch === 'left' ? 'chartL' : (ch === 'right' ? 'chartR' : 'chartBoth'));
  var usable = (canvas ? canvas.clientWidth : window.innerWidth) - 75;
  if (usable < 40) usable = 40;
  var slot = usable / freqs.length;
  var maxChars = 2;
  freqs.forEach(function (f) {
    var len = String(f).length;
    if (len > maxChars) maxChars = len;
  });
  var fs = (slot - 4) / (0.55 * maxChars);
  fs = Math.max(6, Math.min(12, fs));
  return Math.round(fs * 10) / 10;
}

function _makeChart(canvasId, ch, vols) {
  var labels = state.freqs.slice();
  var data = (vols && vols.length === labels.length)
    ? vols.slice()
    : new Array(labels.length).fill(null);
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: ch.charAt(0).toUpperCase() + ch.slice(1),
          data: data,
          borderColor: '#555',
          backgroundColor: 'rgba(85, 85, 85, 0.0)',
          pointStyle: 'cross',
          pointColor: '#d63333',
          pointBackgroundColor: '#d63333',
          pointRadius: 5,
          pointHoverRadius: 5,
          tension: 0.5
        }
      ]
    },
    options: _chartOptions
  });
}

function drawChart(canvasId, ch) {
  var vols = state.vols[ch];
  var existing = (ch === 'left') ? window.__chartL : window.__chartR;
  var fs = _fitXTickFont(ch);
  if (existing && existing.options.scales.x.ticks) {
    existing.options.scales.x.ticks.font = { size: fs, color: '#333' };
  }
  if (existing) {
    existing.data.labels = state.freqs.slice();
    existing.data.datasets[0].data =
      (vols && vols.length === state.freqs.length) ? vols.slice() : new Array(state.freqs.length).fill(null);
    existing.update();
    return;
  }
  var c = _makeChart(canvasId, ch, vols);
  if (c.options.scales.x.ticks) {
    c.options.scales.x.ticks.font = { size: fs, color: '#333' };
  }
  c.update();
  if (ch === 'left') { window.__chartL = c; } else { window.__chartR = c; }
}



function renderCharts() {
  drawChart('chartL', 'left');
  drawChart('chartR', 'right');
  drawCombined();
}

// ---------- combined chart (left + right + target shape) ----------

// Target frequency shape: a reference dB level per frequency (valley shape).
// The BOTTOM (most negative) end is the best hearing: at 1500–3000 Hz the
// ear is most sensitive, so it sits lowest on the chart; the 125/8000 Hz
// ends sit highest (least negative). The absolute levels are arbitrary —
// only the ~20 dB dip in the middle matters, because the combined chart
// resamples this shape (log-spaced in Hz) onto the current frequency list
// and shifts it vertically so its average matches the average of the
// tested left/right values (no shift when nothing is tested yet).
var TARGET_SHAPE = [
  [125, 0], [250, -5], [500, -5], [1000, -10], [1500, -20],
  [2000, -20], [3000, -20], [4000, -10], [6000, -5], [8000, 0]
];

// Log-frequency interpolation of the target shape at `f` Hz. Outside the
// 125..8000 Hz span the nearest endpoint value is used (plateau).
function targetDbAt(f) {
  var n = TARGET_SHAPE.length;
  if (f <= TARGET_SHAPE[0][0]) return TARGET_SHAPE[0][1];
  if (f >= TARGET_SHAPE[n - 1][0]) return TARGET_SHAPE[n - 1][1];
  for (var i = 0; i < n - 1; i++) {
    var f0 = TARGET_SHAPE[i][0], f1 = TARGET_SHAPE[i + 1][0];
    if (f >= f0 && f <= f1) {
      var d0 = TARGET_SHAPE[i][1], d1 = TARGET_SHAPE[i + 1][1];
      return d0 + Math.log(f / f0) / Math.log(f1 / f0) * (d1 - d0);
    }
  }
  return TARGET_SHAPE[n - 1][1];
}

// Average of all tested (non-null) left and right values; null if none.
function _avgBoth() {
  var s = 0, n = 0;
  ['left', 'right'].forEach(function (ch) {
    var vols = state.vols[ch];
    if (!vols) return;
    for (var i = 0; i < vols.length; i++) {
      var v = vols[i];
      if (v !== null && isFinite(v)) { s += v; n++; }
    }
  });
  return n ? s / n : null;
}

// The target shape resampled onto the current frequency list, shifted so its
// average matches the average of the tested left/right values.
function targetShifted() {
  var shape = state.freqs.map(function (f) { return targetDbAt(f); });
  var avgBoth = _avgBoth();
  if (avgBoth === null || !shape.length) return shape;
  var s = 0;
  for (var i = 0; i < shape.length; i++) s += shape[i];
  var off = avgBoth - s / shape.length;
  return shape.map(function (v) { return v + off; });
}

var _combinedOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top', labels: { font: { size: 11 } } },
    tooltip: { display: false }
  },
  scales: {
    x: {
      title: { display: true, text: 'Frequency (Hz)', font: { size: 11 } },
      ticks: { autoSkip: false, maxRotation: 45, font: { size: 9 } }
    },
    y: {
      title: { display: true, text: 'Volume (dB)', font: { size: 11 } },
      ticks: { font: { size: 11 } }
    }
  }
};

function _makeCombinedChart() {
  return new Chart(document.getElementById('chartBoth'), {
    type: 'line',
    data: {
      labels: state.freqs.slice(),
      datasets: [
        {
          label: 'Left', data: [],
          borderColor: '#3366cc', backgroundColor: 'rgba(0,0,0,0)',
          pointStyle: 'cross', pointColor: '#3366cc', pointBackgroundColor: '#3366cc',
          pointRadius: 4, pointHoverRadius: 4, tension: 0.5
        },
        {
          label: 'Right', data: [],
          borderColor: '#d63333', backgroundColor: 'rgba(0,0,0,0)',
          pointStyle: 'cross', pointColor: '#d63333', pointBackgroundColor: '#d63333',
          pointRadius: 4, pointHoverRadius: 4, tension: 0.5
        },
        {
          label: 'Target', data: [],
          borderColor: '#000', backgroundColor: 'rgba(0,0,0,0)',
          borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0, tension: 0.5
        }
      ]
    },
    options: _combinedOptions
  });
}

function drawCombined() {
  var freqs = state.freqs;
  function vals(ch) {
    var vols = state.vols[ch];
    return (vols && vols.length === freqs.length)
      ? vols.slice() : new Array(freqs.length).fill(null);
  }
  var left = vals('left'), right = vals('right'), target = targetShifted();
  var fs = _fitXTickFont('both');

  var existing = window.__chartBoth;
  if (existing) {
    existing.data.labels = freqs.slice();
    existing.data.datasets[0].data = left;
    existing.data.datasets[1].data = right;
    existing.data.datasets[2].data = target;
    existing.options.scales.x.ticks.font = { size: fs, color: '#333' };
    existing.update();
    return;
  }
  var c = _makeCombinedChart();
  c.data.datasets[0].data = left;
  c.data.datasets[1].data = right;
  c.data.datasets[2].data = target;
  c.options.scales.x.ticks.font = { size: fs, color: '#333' };
  c.update();
  window.__chartBoth = c;
}

// ---------- clipboard (JSON) ----------

// Builds a JSON document of all (channel, frequency, volume) settings, plus
// the global ladder and sequence parameters and capture timestamps. Shape:
//   {
//     "timestamp": "YYYY-MM-DDTHH:MM:SS.sssZ",       (ISO 8601, UTC)
//     "localTimestamp": "YYYY-MM-DDTHH:MM:SS.sss",   (same moment, local time)
//     "dbStep": N,
//     "dbMin": N,
//     "dbMax": N,
//     "sequenceLengthSec": L,
//     "delayBetweenBeepsSec": D,
//     "channels": {
//       "left":  [{ "freqHz": N, "volumeDb": D }, ...],
//       "right": [{ "freqHz": N, "volumeDb": D }, ...]
//     }
//   }
// The row count is not included: it is derivable from dbStep/dbMin/dbMax.
//
// ISO-like local-time string (YYYY-MM-DDTHH:MM:SS.sss, no zone suffix).
function localTimestamp(d) {
  d = d || new Date();
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  var ms = '' + d.getMilliseconds();
  while (ms.length < 3) ms = '0' + ms;
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
    'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) +
    '.' + ms;
}
function buildClipJSON() {
  var freqs = state.freqs.slice();
  function block(ch) {
    var rows = [];
    for (var i = 0; i < freqs.length; i++) {
      rows.push({
        freqHz: Number(freqs[i]),
        volumeDb: state.vols[ch] ? state.vols[ch][i] : null
      });
    }
    return rows;
  }
  var now = new Date();
  return {
    timestamp: now.toISOString(),
    localTimestamp: localTimestamp(now),
    dbStep: Number(state.dbStep),
    dbMin: Number(state.dbMin),
    dbMax: Number(state.dbMax),
    sequenceLengthSec: Number(state.seqLen),
    delayBetweenBeepsSec: Number(state.delay),
    channels: {
      left: block('left'),
      right: block('right')
    }
  };
}

function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }
  var ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
  return new Promise(function (resolve) { resolve(true); });
}

function copyValues() {
  var data = buildClipJSON();
  var text;
  try { text = JSON.stringify(data, null, 2); }
  catch (e) { text = JSON.stringify(data); }
  copyText(text).then(function () {
    updateClipDump();
  }).catch(function () {
    document.getElementById('clipDump').value = 'clipboard failed';
  });
}

function updateClipDump() {
  var data = buildClipJSON();
  var text;
  try { text = JSON.stringify(data, null, 2); }
  catch (e) { text = JSON.stringify(data); }
  document.getElementById('clipDump').value = text;
}
// Save the current JSON settings as a file download, named with the capture
// time in LOCAL time, e.g. zero-db-hero-2026-10-14T14-47-22-022.json.
function saveClipJSON() {
  var data = buildClipJSON();
  var text;
  try { text = JSON.stringify(data, null, 2); }
  catch (e) { text = JSON.stringify(data); }
  var blob = new Blob([text], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.download = 'zero-db-hero-' + data.localTimestamp.replace(/:/g, '-') + '.json';
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  updateClipDump();
}


window.renderChannel = renderChannel;
window.attachListeners = attachListeners;
window.renderCharts = renderCharts;
window.setStatus = setStatus;
window.copyValues = copyValues;
window.updateClipDump = updateClipDump;
window.saveClipJSON = saveClipJSON;
window.rowDbLabel = rowDbLabel;
window.localTimestamp = localTimestamp;
window.targetDbAt = targetDbAt;
window.targetShifted = targetShifted;
