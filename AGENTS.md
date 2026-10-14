# AGENTS.md

## Purpose

The Audio Tone Matrix is a single-page web app that plays left/right sine tones from a frequency×volume-step button matrix. Each channel has a matrix where columns are frequencies and rows are volume steps (100% at top, 5% at bottom). Each cell contains a radio button (sets that frequency's volume for that channel) and a tone button (plays that frequency at that volume for the configured sequence length with inter-beep delay). Two canvas charts show the volume per frequency for each channel. A status line shows `idle` or `playing freq=XHz vol=Y% ch=left|right`. A clipboard copy button writes all current (channel, frequency, volume) values.

## Files

| File | Description |
|------|-------------|
| `index.html` | The only app file. Contains all HTML markup. CSS is in `css/styles.css`. JS is in `js/` (multiple files loaded in order). |
| `css/styles.css` | All styles. |
| `js/state.js` | Declares the global `state` object (`freqs`, `steps`, `seqLen`, `delay`, `vols`, `playing`). |
| `js/presets.js` | Frequency preset arrays (`PRESET_A`, `PRESET_B`) and the `parseCustomFrequencies(text)` helper. |
| `js/audio.js` | Playback engine: `startTone()`, `stopCurrent()`, `toggleBtn()`, `rowVolLabelFromPct()`. |
| `js/render.js` | Rendering: `renderChannel(ch)`, `renderCharts()`, `setStatus()`, `copyValues()`, `updateClipDump()`, `defaultRowFor50()`, `rowVolLabelFromPct()`. |
| `js/main.js` | Event wiring and initialization. |
| `README.md` | User-facing quick-start. |
| `AGENTS.md` | This file — agent-facing project guide. |
| `lib/Tone.js` | External audio library (Tone.js v15.1.22) loaded before the app JS. |
## Architecture

- **Single-page app**: all functionality is on `index.html`; CSS is external (`css/styles.css`); JS is split into 5 files loaded in order: `state.js`, `presets.js`, `audio.js`, `render.js`, `main.js`.
- **`state` object** (global, declared in `state.js`):
  - `freqs: number[]` — current frequency list in Hz (low→high).
  - `steps: number` — number of volume steps (1–50).
  - `seqLen: number` — total sequence length in seconds (0.5–60).
  - `delay: number` — inter-beep delay in seconds (0–30).
  - `vols: { left: number[], right: number[] }` — current volume percentage per frequency per channel.
  - `playing: {ch, col, btnEl, src, timerId, endTimer} | null` — current playing tone; `src` is the Tone.js chain `{osc, gain, pan, stop()}` (or null).
- **Tone.js (external, `lib/Tone.js` v15.1.22)**: playback uses Tone.js instead of raw Web Audio.
  - Tones are built as `Tone.Oscillator(freq, 'sine') → Tone.Gain(vol) → Tone.Panner(pan) → Tone.getDestination()`.
  - `Tone.Panner` value `−1` = fully left, `+1` = fully right; set per `ch` in `makeSource(freq, vol, ch, dur)`.
  - `startTone` awaits `Tone.start()` (the context-running promise) before building the chain so `Tone.context.currentTime` is accurate when scheduling `osc.stop(t + dur)`.
  - `stopCurrent()` calls `stop()` on the stored chain and `dispose()`s the nodes.
- **Layout** (HTML in `index.html`, CSS in `css/styles.css`):
  - `#channels` is a CSS grid of two columns; each `.channel` has its chart (`#chartL`/`#chartR`) above its matrix (`#matrix-L`/`#matrix-R`).
  - `#status` is a `<div>` with `position: fixed; bottom: 0` so it is always visible while scrolling.
- **Rendering functions** (in `js/render.js`):
  - `renderChannel(ch)` — builds the HTML table for the left or right matrix. Each cell (`.cell`) holds a visible radio + a `.tone` button; the cell shows **no** volume text — the percentage is shown only by the row label in the leftmost column. Called on frequency/steps change. Resets all radios to unselected, then checks the 50% radio per frequency column.
  - `renderCharts()` — draws both canvas charts: a `#555` line + red × markers, `#999` axes/gridlines, and x-axis frequency labels rotated 45° so long lists never overlap. Called on radio change, on re-render, and on debounced window resize.
  - `setStatus(t)` — sets the status line text.
  - `copyValues()` — copies the current settings as pretty-printed **JSON** to the clipboard, then updates `#clipDump`.
  - `updateClipDump()` — populates `#clipDump` with the first 15 lines (truncated with `…`).
  - `rowVolLabelFromPct(S, row)` — returns the volume label string for a given step count and row.
  - `defaultRowFor50(S)` — returns the row index that represents 50% volume.
- **Playback functions** (in `js/audio.js`):
  - `startTone(ch, col, btn, volPct, rowVolLabel)` — starts playing a tone. If a tone is already playing, `stopCurrent()` is called first.
  - `stopCurrent()` — stops the current tone, clears timers, removes the active class, resets `state.playing` to null, sets status to `idle`.
  - `toggleBtn(btn)` — if `btn === state.playing.btnEl`, calls `stopCurrent()`; otherwise calls `startTone()`.
  - `rowVolLabelFromPct(S, row)` — returns the volume label string for a given step count and row.

## How to extend

- **Add a new frequency preset**: declare a new const array in `js/presets.js` next to `PRESET_A`/`PRESET_B`, add it to the `PRESETS` object, then reference it in the frequency-mode radio handler in `js/main.js`.
- **Change chart marker or colors**: edit the `drawChart()` function in `js/render.js`. The current colors are: axes/grid `#999`, data line `#555`, markers `#d63333`.
- **Add new UI elements**: any new UI must be rendered by the three main rendering functions (`renderChannel`, `renderCharts`, `setStatus`/`updateClipDump`) so that re-renders (triggered by frequency or steps changes) stay in sync.

## Testing

No automated test suite exists. Verification is manual:

1. Open `index.html` in a modern browser.
2. Verify: two matrices (15 columns × 20 rows), two charts, status line shows `idle`, `#clipDump` is empty.
3. Click a tone button — verify status changes to `playing freq=XHz vol=Y% ch=Z`, button turns active (red), then returns to idle after `seqLen` seconds.
4. Click a second tone button while the first is playing — verify the first stops (exclusive) and the second starts.
5. Click the active button again — verify it stops immediately.
6. Press Escape — verify the current tone stops.
7. Change a radio button — verify the chart updates.
8. Click "Copy values" — verify the clipboard contains pretty-printed JSON with keys `steps`, `sequenceLengthSec`, `delayBetweenBeepsSec`, and a `channels.left`/`channels.right` array of `{"freqHz":N,"volumePct":V}` objects.
9. Toggle between Preset A (15 tones), Preset B (19 tones), and Custom frequencies — verify the matrices and charts update.
10. Use the steppers to change steps, sequence length, and delay — verify the input values and behavior update correctly.

## Conventions

- Vanilla JS only — no build step, no CDNs. One external audio library, `lib/Tone.js` (Tone.js v15.1.22), is loaded from `index.html` before the app scripts.
- All user-facing element IDs are pinned in `index.html` and must not change:
  - Numeric inputs: `stepsIn`, `lenIn`, `delayIn`
  - Steppers: `stepsInMinus`/`stepsInPlus`, `lenInMinus`/`lenInPlus`, `delayInMinus`/`delayInPlus`
  - Frequency mode: `fm` radio group, `customFreq`, `applyFreq`
  - Matrices: `matrix-L`, `matrix-R`
  - Charts: `chartL`, `chartR`
  - Status: `status`
  - Clipboard: `copyBtn`, `clipDump`
- Radio `name` format: `vol-{ch}-{col}` where `ch` is `left` or `right` and `col` is the frequency index.
- Radio `id` format: `rad-{ch}-{col}-{row}`.
- Tone button `data-*` attributes: `data-ch`, `data-col`, `data-row`.
- Clipboard/`#clipDump` format: pretty-printed JSON (2-space indent) with keys `steps`, `sequenceLengthSec`, `delayBetweenBeepsSec`, and `channels` = `{left:[{freqHz,volumePct}...], right:[...]}` (freqs low→high, built from `state.freqs`/`state.vols`).
- Volume row r (0 = top) value: `(S - r) * 100 / S` → 100% top … 5% bottom (S=20).
