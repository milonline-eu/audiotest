# AGENTS.md

## Purpose

Zero dB Hero is a single-page web app that plays left/right sine tones from a frequency×dB-step matrix. Each channel has a matrix where columns are frequencies (bare numbers, no `Hz` suffix) and rows are the dB ladder: the top row plays at **Max dB** (default −20) and each row is **dB step** (default 2 dB) quieter. The row count is derived, not set: `round((dbMax − dbMin) / dbStep) + 1` → 31 rows with the defaults (−20.0 dB top … −80.0 dB bottom). Each cell holds a **radio only** (sets that frequency's row for that channel); clicking the cell plays that (channel, frequency, row) at that row's dB gain for the configured sequence length with inter-beep delay, and the cell is highlighted while the tone plays. Two canvas charts show the dB volume per frequency for each channel (y-axis in dB, auto-scaled). A status line shows `idle` or `playing freq=XHz vol=Y dB ch=left|right remaining: Zs`. A clipboard copy button writes all current (channel, frequency, volume) values (with a capture timestamp) as dB-only JSON to the scrollable text area; a save button downloads that JSON as a `.json` file.

**Settings lock**: once any value has been set in the **matrix selectors** (a matrix radio change or a cell click), the **dB step / Min dB / Max dB inputs (incl. their −/+ steppers) and the frequency controls become disabled**. Changing settings inputs or the frequency mode does **not** lock — only matrix selection locks. The footer **Reset** button re-enables them. Sequence length, delay, and the matrices stay operable while locked. Reset only re-enables controls — it restores no values and stops no playing tone.

**Volume model** — a single dB ladder, no percent:
- Row r (0 = top) plays at `dbMax − r * dbStep` dB (`rowDbValue(r)`). Top row = `state.dbMax`, each row `state.dbStep` dB quieter; bottom row (S−1) = `dbMax − (S−1)·dbStep` (≥ `dbMin`; when `dbStep` doesn't divide the span, the bottom row sits one step above `dbMin`). Gain = `10^(db/20)` — the actual gain the audio engine applies.
- `dbStep` is user-set via the **dB step** input (0.1–10, default 2); `dbMin`/`dbMax` via the Min dB / Max dB inputs (library bounds −1000…0 dB, cross-clamped so `dbMin ≤ dbMax`). The row count `state.steps` is derived: `round((dbMax − dbMin) / dbStep) + 1`, recomputed whenever any of the three changes.
- Shown in the single-line row label (`−20.0 dB` …), the status line (`vol=Y dB`), the chart y-axis (dB), and `volumeDb` in the clipboard JSON.

## Files

| File | Description |
|------|-------------|
| `index.html` | The only app file. Contains all HTML markup. CSS is in `css/styles.css`. JS is in `js/` (multiple files loaded in order). |
| `css/styles.css` | All styles. |
| `js/state.js` | Declares the global `state` object (`freqs`, `steps` (derived), `seqLen`, `delay`, `dbStep`, `dbMin`, `dbMax`, `vols`, `playing`). |
| `js/presets.js` | Frequency preset arrays (`PRESET_A`, `PRESET_B`) and the `parseCustomFrequencies(text)` helper. |
| `js/audio.js` | Playback engine: `startTone()`, `stopCurrent()`, `toggleCell()`. Gain comes from the dB ladder (`10^(rowDbValue(row)/20)`). |
| `js/render.js` | Rendering: `renderChannel(ch)`, `renderCharts()`, `setStatus()`, `copyValues()`, `updateClipDump()`, `saveClipJSON()`, `defaultMidRow()`, `rowDbLabel()`, `rowDbValue()`. |
| `js/main.js` | Event wiring and initialization, incl. `rowCount()` (derived row count) and `setLocked()` (settings lock). |
| `README.md` | User-facing quick-start. |
| `AGENTS.md` | This file — agent-facing project guide. |
| `lib/Tone.js` | External audio library (Tone.js v15.1.22) loaded before the app JS. |

## Architecture

- **Single-page app**: all functionality is on `index.html`; CSS is external (`css/styles.css`); JS is split into 5 files loaded in order: `state.js`, `presets.js`, `audio.js`, `render.js`, `main.js`.
- **`state` object** (global, declared in `state.js`):
  - `freqs: number[]` — current frequency list in Hz (low→high).
  - `steps: number` — derived row count; recomputed from `dbStep`/`dbMin`/`dbMax` via `rowCount()`, never user-set.
  - `seqLen: number` — total sequence length in seconds (0.5–60); default 1.
  - `delay: number` — inter-beep delay in seconds (0–30); default 0.1.
  - `dbStep: number` — dB difference between adjacent rows (0.1–10); default 2.
  - `dbMin: number` — dB of the BOTTOM row (quietest / most negative); default −80.
  - `dbMax: number` — dB of the TOP row (loudest / least negative); default −20.
  - `vols: { left: number[], right: number[] }` — current volume **in dB** per frequency per channel (the row's `rowDbValue`).
  - `playing: {ch, col, cellEl, src, timerId, endTimer} | null` — current playing tone; `cellEl` is the highlighted `td.cell`; `src` is the Tone.js chain `{osc, gain, pan, stop()}` (or null).
- **Tone.js (external, `lib/Tone.js` v15.1.22)**: playback uses Tone.js instead of raw Web Audio.
  - Tones are built as `Tone.Oscillator(freq, 'sine') → Tone.Gain(vol) → Tone.Panner(pan) → Tone.getDestination()`. `vol` is the dB-ladder gain `10^(rowDbValue(row)/20)`.
  - `Tone.Panner` value `−1` = fully left, `+1` = fully right; set per `ch` in `makeSource(freq, vol, ch, dur)`.
  - `startTone` awaits `Tone.start()` (the context-running promise) before building the chain so `Tone.context.currentTime` is accurate when scheduling `osc.stop(t + dur)`.
  - `stopCurrent()` calls `stop()` on the stored chain and `dispose()`s the nodes.
- **Layout** (HTML in `index.html`, CSS in `css/styles.css`):
  - `#channels` is a CSS grid of two columns; each `.channel` has its chart (`#chartL`/`#chartR`) above its matrix (`#matrix-L`/`#matrix-R`).
  - `#status` is a `<div>` with `position: fixed; bottom: 0` so it is always visible while scrolling.
  - Matrix cells are compact (sized to their radio: ~20×20 px) and frequency column headers are vertical (`writing-mode: vertical-rl`) so 4-digit values fit in the narrow columns.
- **Rendering functions** (in `js/render.js`):
  - `renderChannel(ch)` — builds the HTML table for the left or right matrix. Column headers are **bare frequency numbers** (no `Hz` suffix). Each cell (`.cell`) holds **only a radio** (`value` = the row's dB string); clicking the cell plays (delegated `click` in `attachListeners`). The row label in the leftmost column is a single dB line (e.g. `−50.0 dB`) — the only volume text in the matrix. Called on frequency/ladder change. Resets all radios to unselected, then checks the midpoint-row radio per frequency column.
  - `renderCharts()` — draws both canvas charts: a `#555` line + red × markers, `#999` axes/gridlines, and x-axis frequency labels rotated 45° so long lists never overlap. Y-axis is **dB, auto-scaled to the data** (no fixed min/max/stepSize). Called on radio change, on re-render, and on debounced window resize.
  - `setStatus(t)` — sets the status line text.
  - `copyValues()` — copies the current settings as pretty-printed **JSON** to the clipboard, then updates `#clipDump`.
  - `updateClipDump()` — populates the `#clipDump` textarea with the full pretty-printed JSON (the textarea is scrollable and shows everything).
  - `saveClipJSON()` — saves the current JSON settings as an `application/json` file download (blob + `a[download]`), named `zero-db-hero-<localTimestamp>.json` (local-time timestamp, colons → dashes). Also refreshes `#clipDump`.
  - `rowDbLabel(row)` — returns the dB-ladder label string for a row (e.g. `-20.0`).
  - `rowDbValue(row)` — returns the dB-ladder value as a number for a row: `state.dbMax − row * state.dbStep` (`state.dbMax` when `S ≤ 1`).
  - `defaultMidRow()` — returns the row index nearest the ladder midpoint `(dbMax+dbMin)/2` (−50.0 dB at row 10 of 31 with the defaults), clamped into `[0, S−1]`.
- **Playback functions** (in `js/audio.js`):
  - `startTone(ch, col, cellEl, rowDbStr)` — starts playing a tone (row and channel are parsed from the cell's radio `id`). If a tone is already playing, `stopCurrent()` is called first. Adds the `active` class to `cellEl`; the status line shows `playing freq=XHz vol=Y dB ch=… remaining: Zs`.
  - `stopCurrent()` — stops the current tone, clears timers, removes the `active` class from the cell, resets `state.playing` to null, sets status to `idle`.
  - `toggleCell(cell)` — if `cell === state.playing.cellEl`, calls `stopCurrent()`; otherwise calls `startTone()` for the cell's (channel, column, row).
- **Settings lock** (in `js/main.js`):
  - `setLocked(on)` — disables/enables the locked controls: `dbStepIn`/`dbStepMinus`/`dbStepPlus`, `dbMinIn`/`dbMinMinus`/`dbMinPlus`, `dbMaxIn`/`dbMaxMinus`/`dbMaxPlus`, the `fm` frequency-mode radios, `customFreq`, `applyFreq`. Called `setLocked(true)` from the **matrix selectors only** (matrix radio `change`, cell `click`, in `js/render.js`); changing settings inputs or the frequency mode does **not** lock. Called `setLocked(false)` by the footer **Reset** button; unlocking re-applies the custom-mode rule (`customFreq`/`applyFreq` disabled unless the mode is Custom). Sequence length, delay, and the matrices are never locked.

## How to extend

- **Add a new frequency preset**: declare a new const array in `js/presets.js` next to `PRESET_A`/`PRESET_B`, add it to the `PRESETS` object, then reference it in the frequency-mode radio handler in `js/main.js`.
- **Change chart marker or colors**: edit the `drawChart()` function in `js/render.js`. The current colors are: axes/grid `#999`, data line `#555`, markers `#d63333`.
- **Add new UI elements**: any new UI must be rendered by the three main rendering functions (`renderChannel`, `renderCharts`, `setStatus`/`updateClipDump`) so that re-renders (triggered by frequency or ladder changes) stay in sync.

## Testing

No automated test suite exists. Verification is manual:

1. Open `index.html` in a modern browser.
2. Verify: two matrices (19 columns × 31 rows — Preset B default), two charts, status line shows `idle`, `#clipDump` is empty. Column headers are bare numbers `125 … 8000` (no `Hz`). Row labels are a single dB line: `−20.0 dB` top … `−80.0 dB` bottom. The Min dB / Max dB inputs show −80 / −20 and the dB step input shows 2.
3. Click a matrix cell (there is no tone button) — verify the tone plays, the cell is highlighted (light red), status changes to `playing freq=XHz vol=Y dB ch=… remaining: Zs`, and the cell's radio becomes checked.
4. Click a second cell while the first is playing — verify the first stops (exclusive) and the second starts and is highlighted.
5. Click the active (highlighted) cell again — verify it stops immediately and the highlight is removed.
6. Press Escape — verify the current tone stops.
7. Change a matrix radio — verify the chart updates and the settings controls lock.
8. Click "Copy to clipboard" — verify the clipboard contains pretty-printed JSON with a `timestamp` (ISO 8601 UTC, e.g. `2026-10-14T12:34:56.789Z`) and a `localTimestamp` (same moment, local time) followed by the keys `dbStep`, `dbMin`, `dbMax`, `sequenceLengthSec`, `delayBetweenBeepsSec`, and a `channels.left`/`channels.right` array of `{"freqHz":N,"volumeDb":D}` objects (no `volumePct`).
9. Click "Save" — verify a `zero-db-hero-<localTimestamp>.json` file downloads (local timestamp with colons replaced by dashes) and the text area updates.
10. Select a matrix value (click a cell or a matrix radio — but not a settings input or frequency-mode change) — verify the dB step / Min dB / Max dB inputs (incl. steppers) and the frequency controls become disabled; click **Reset** → they re-enable (Apply frequencies stays disabled unless the mode is Custom).
11. Toggle between Preset A (15 tones), Preset B (19 tones, the default), and Custom frequencies — verify the matrices and charts update.
12. Use the steppers to change dB step, Min/Max dB, sequence length, and delay — verify the input values and behavior update correctly (ladder changes re-render the matrices with the derived row count and stop any playing tone).

## Conventions

- Vanilla JS only — no build step, no CDNs. One external audio library, `lib/Tone.js` (Tone.js v15.1.22), and Chart.js (`lib/chart.js.min.js`) are loaded from `index.html` before the app scripts.
- All user-facing element IDs are pinned in `index.html` and must not change:
  - Numeric inputs: `dbStepIn`, `lenIn`, `delayIn`, `dbMinIn`, `dbMaxIn`
  - Steppers: `dbStepMinus`/`dbStepPlus`, `lenInMinus`/`lenInPlus`, `delayInMinus`/`delayInPlus`, `dbMinMinus`/`dbMinPlus`, `dbMaxMinus`/`dbMaxPlus`
  - Frequency mode: `fm` radio group, `customFreq`, `applyFreq`
  - Matrices: `matrix-L`, `matrix-R`
  - Charts: `chartL`, `chartR`
  - Footer: `resetBtn`, `copyBtn`, `saveBtn`, `clipDump` — the three buttons are stacked **vertically** in a `footer .footer-actions` column (Reset on top, then Copy to clipboard, then Save) beside the `clipDump` textarea.
- Radio `name` format: `vol-{ch}-{col}` where `ch` is `left` or `right` and `col` is the frequency index.
- Radio `id` format: `rad-{ch}-{col}-{row}`.
- Matrix cells contain a radio only — **no tone buttons**; the row/column/channel of a clicked cell come from the radio `id` inside the cell. The playing cell gets the `active` class (`td.cell.active`, background `#f7b7b7`).
- Clipboard/`#clipDump` format: pretty-printed JSON (2-space indent) with keys `timestamp` (ISO 8601 UTC capture time, e.g. `2026-10-14T12:34:56.789Z`), `localTimestamp` (same moment in local time, e.g. `2026-10-14T14:34:56.789`), `dbStep`, `dbMin`, `dbMax`, `sequenceLengthSec`, `delayBetweenBeepsSec`, and `channels` = `{left:[{freqHz,volumeDb}...], right:[...]}` (freqs low→high, built from `state.freqs`/`state.vols`; `volumeDb` is the dB value the row plays at). The row count is intentionally omitted — it is derivable from `dbStep`/`dbMin`/`dbMax`. The **Save** button downloads this JSON as `zero-db-hero-<localTimestamp>.json` (local timestamp, colons → dashes).
- Volume row r (0 = top): `rowDbValue(r) = dbMax − r·dbStep` dB, gain `10^(db/20)` → `state.dbMax` top, each row `dbStep` dB quieter, bottom row (S−1) = `dbMax − (S−1)·dbStep` (defaults: −20.0 dB top … −80.0 dB bottom, 31 rows, 2 dB per row). `dbStep`/`dbMin`/`dbMax` are the user-set dB step / Min dB / Max dB inputs (ladder bounds −1000…0 dB for Min/Max, 0.1–10 for the step, cross-clamped so `dbMin ≤ dbMax`). The default checked row is the nearest ladder midpoint (−50.0 dB at row 10 of 31 with the defaults).
