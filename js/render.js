// Rendering: matrices (renderChannel), line charts (renderCharts),
// status line (setStatus), and the clipboard copy (copyValues).
// All element ids are pinned in index.html and may not change.
// Exposed as globals: renderChannel, attachListeners, renderCharts,
// setStatus, copyValues, updateClipDump, saveClipJSON, localTimestamp,
// rowDbLabel, rowDbValue, defaultMidRow.

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

// Row nearest the ladder midpoint (dbMax+dbMin)/2; exact for the defaults
// (-50.0 dB at row 10 of 31). Clamped into [0, S-1].
function defaultMidRow() {
  var S = state.steps;
  if (S <= 1) return 0;
  var mid = (state.dbMax + state.dbMin) / 2;
  var r = Math.round((state.dbMax - mid) / state.dbStep);
  return Math.max(0, Math.min(S - 1, r));
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

  // Default: select the ladder-midpoint row radio per frequency.
  var defRow = defaultMidRow();
  state.vols[ch] = new Array(freqs.length).fill(0);
  for (var c3 = 0; c3 < freqs.length; c3++) {
    state.vols[ch][c3] = rowDbValue(defRow);
    var radio50 = document.getElementById('rad-' + ch + '-' + c3 + '-' + defRow);
    if (radio50) radio50.checked = true;
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
      // Auto-select the radio in this cell so it always reflects the
      // (channel, frequency, row) that the cell plays.
      if (!cellRadio.checked) {
        cellRadio.checked = true;
        state.vols[m[1]][Number(m[2])] = Number(cellRadio.value);
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
  var canvas = document.getElementById(ch === 'left' ? 'chartL' : 'chartR');
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
    : new Array(labels.length).fill(0);
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
      (vols && vols.length === state.freqs.length) ? vols.slice() : new Array(state.freqs.length).fill(0);
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
        volumeDb: state.vols[ch] ? state.vols[ch][i] : rowDbValue(defaultMidRow())
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
