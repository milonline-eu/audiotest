// Rendering: matrices (renderChannel), line charts (renderCharts),
// status line (setStatus), and the clipboard copy (copyValues).
// All element ids are pinned in index.html and may not change.
// Exposed as globals: renderChannel, attachListeners, renderCharts,
// setStatus, copyValues, updateClipDump, rowVolLabelFromPct, rowDbLabel,
// rowDbValue, rowDbFromPct, defaultRowFor50.

function rowVolLabelFromPct(S, row) {
  var pct = (S - row) * 100 / S;
  return pct.toFixed(1).replace(/\.0$/, '');
}

// Playback ladder in dB: top row (0) = state.dbMax, bottom row (S-1) =
// state.dbMin, linear in dB across state.steps rows. The display-only %
// labels (rowVolLabelFromPct) keep the legacy linear values.
function rowDbLabel(row) {
  return rowDbValue(row).toFixed(1);
}

// dB value for a row as a number (state.dbMax for the top row,
// state.dbMin for the bottom row, linear in dB between them).
function rowDbValue(row) {
  var S = state.steps;
  if (S <= 1) return state.dbMax;                 // one row = top = max
  return state.dbMax + row * ((state.dbMin - state.dbMax) / (S - 1));
}

// dB value for a stored percentage: invert pct -> row, then row -> dB.
function rowDbFromPct(pct, S) {
  var row = Math.round(S - (Number(pct) * S) / 100);
  return rowDbValue(row);
}

// 50% (default) mapped to the nearest row index for S rows.
function defaultRowFor50(S) {
  var r = Math.round(S / 2);
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
    th.textContent = freqs[c] + 'Hz';
    headerRow.appendChild(th);
  }

  var tbody = table.createTBody();
  var S = state.steps;
  for (var r = 0; r < S; r++) {
    var tr = tbody.appendChild(document.createElement('tr'));
    // Row label (left side) — the single place the volume is shown: legacy
    // linear % plus the playback ladder in dB (state.dbMax top ... state.dbMin bottom).
    var labelCell = document.createElement('td');
    labelCell.className = 'rowlabel';
    var lbl = rowVolLabelFromPct(S, r);
    labelCell.textContent = lbl + '%';
    var dbDiv = document.createElement('div');
    dbDiv.className = 'rowlabel-db';
    dbDiv.textContent = rowDbLabel(r) + ' dB';
    labelCell.appendChild(dbDiv);
    tr.appendChild(labelCell);

    for (var c2 = 0; c2 < freqs.length; c2++) {
      var cell = document.createElement('td');
      cell.className = 'cell';

      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'vol-' + ch + '-' + c2;
      radio.id = 'rad-' + ch + '-' + c2 + '-' + r;
      radio.value = lbl;
      cell.appendChild(radio);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tone';
      btn.dataset.ch = ch;
      btn.dataset.col = c2;
      btn.dataset.row = r;
      btn.setAttribute('aria-label', ch + ' ' + freqs[c2] + 'Hz');
      cell.appendChild(btn);
      tr.appendChild(cell);
    }
  }
  if (container.replaceChildren) {
    container.replaceChildren(table);
  } else {
    container.innerHTML = '';
    container.appendChild(table);
  }

  // Default: select the 50% row radio per frequency.
  var defRow = defaultRowFor50(S);
  state.vols[ch] = new Array(freqs.length).fill(0);
  for (var c3 = 0; c3 < freqs.length; c3++) {
    state.vols[ch][c3] = Number(rowVolLabelFromPct(S, defRow));
    var radio50 = document.getElementById('rad-' + ch + '-' + c3 + '-' + defRow);
    if (radio50) radio50.checked = true;
  }
}

// Attach delegated listeners ONCE (called by main.js after build).
// Radio change: update state.vols, charts, clipDump.
// Button click: toggle tone (delegate on each matrix container).
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
      renderCharts();
      updateClipDump();
    });
    container.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button.tone') : null;
      if (!btn) return;
      // Auto-select the radio selector in this cell so it always reflects the
      // (channel, frequency, volume-step) that the button plays.
      var cell = btn.parentElement;
      var cellRadio = cell ? cell.querySelector('input[type=radio]') : null;
      if (cellRadio && !cellRadio.checked) {
        cellRadio.checked = true;
        state.vols[btn.dataset.ch][Number(btn.dataset.col)] = Number(cellRadio.value);
        renderCharts();
        updateClipDump();
      }
      toggleBtn(btn);
    });
  });
}

// ---------- charts ----------

// Charts are rendered with Chart.js (lib/chart.js.min.js). Each channel gets a
// full-width Line chart: x = frequencies (by index), y = volume % (0-100),
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
      min: 0,
      max: 100,
      title: { display: true, text: 'Volume (%)', font: { size: 11 } },
      ticks: { stepSize: 25, font: { size: 11 } }
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
    var len = (String(f) + 'Hz').length;
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
// the global sequence parameters. Shape:
//   {
//     "steps": N,
//     "sequenceLengthSec": L,
//     "delayBetweenBeepsSec": D,
//     "channels": {
//       "left":  [{ "freqHz": N, "volumePct": V, "volumeDb": D }, ...],
//       "right": [{ "freqHz": N, "volumePct": V, "volumeDb": D }, ...]
//     }
//   }
function buildClipJSON() {
  var freqs = state.freqs.slice();
  function block(ch) {
    var rows = [];
    for (var i = 0; i < freqs.length; i++) {
      var v = state.vols[ch] ? state.vols[ch][i] : 50;
      rows.push({
        freqHz: Number(freqs[i]),
        volumePct: Number(v),
        volumeDb: rowDbFromPct(v, state.steps)
      });
    }
    return rows;
  }
  return {
    steps: Number(state.steps),
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
    document.getElementById('clipDump').textContent = 'clipboard failed';
  });
}

function updateClipDump() {
  var data = buildClipJSON();
  var text;
  try { text = JSON.stringify(data, null, 2); }
  catch (e) { text = JSON.stringify(data); }
  var lines = text.split('\n');
  var out = lines.slice(0, 15).join('\n');
  if (lines.length > 15) out += '\n\u2026';
  document.getElementById('clipDump').textContent = out;
}


window.renderChannel = renderChannel;
window.attachListeners = attachListeners;
window.renderCharts = renderCharts;
window.setStatus = setStatus;
window.copyValues = copyValues;
window.updateClipDump = updateClipDump;
window.rowVolLabelFromPct = rowVolLabelFromPct;
window.rowDbLabel = rowDbLabel;
window.rowDbValue = rowDbValue;
window.rowDbFromPct = rowDbFromPct;
window.defaultRowFor50 = defaultRowFor50;
