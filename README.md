# Zero dB Hero

## What it is

It is a small set of HTML/CSS/JS files (no build step, no dependencies) — just open `index.html` in a browser and start playing tones.

## Run

Open `index.html` in any modern web browser.
On macOS you can simply run `open index.html` or double-click the file.
No server is required.

## Controls

| Control | What it does |
|---------|-------------|
| **dB step** (numeric input with −/+ steppers) | The dB difference between adjacent rows (0.1–10, default 2). The row count is derived: `round((Max − Min) / step) + 1` (31 rows with the defaults). Changing it re-renders both matrices and stops any playing tone. |
| **Min dB** (numeric input with −/+ steppers) | dB of the bottom (quietest) row; range −1000…0 dB, default −80. Must stay ≤ Max dB (clamped). The row count changes with it; re-renders the matrices and stops any playing tone. |
| **Max dB** (numeric input with −/+ steppers) | dB of the top (loudest) row; range −1000…0 dB, default −20. Must stay ≥ Min dB (clamped). Same behavior as Min dB. |
| **Sequence length (s)** (numeric input with −/+ steppers) | Total duration of each tone burst (0.5–60 s). Applied immediately; no re-render needed. |
| **Delay between beeps (s)** (numeric input with −/+ steppers) | When > 0, the tone plays in on/off blips of this duration (50% on, 50% off). Applied immediately. |
| **Frequency mode** (Preset A / Preset B / Custom radio buttons) | Preset A = 15-tone IEC set, Preset B = 19-tone IEC set (the default). Custom enables the text field below. |
| **Custom** text field | Comma- or space-separated list of frequencies in Hz. Click **Apply frequencies** (or press Enter) to use them. |
| **Reset** button | Re-enables the dB step / Min dB / Max dB inputs and the frequency controls once they have locked. Locking happens automatically the first time a value is set in the **matrix selectors** — a matrix radio change or a cell click. Changing the settings inputs or frequency mode does not lock. |
| **Copy values** button | Copies all current channel/frequency/volume settings to the clipboard. |

## Layout

The page is split into two side-by-side columns, one per channel. In each column the chart sits directly above its tone matrix (left chart over the left matrix, right chart over the right matrix). A thin status bar is pinned to the very bottom of the viewport so it is always visible, even while scrolling.

## Matrix

Each matrix has frequencies as columns (low → high, left to right) and the dB ladder as rows. Volume is a single dB ladder: the top row plays at **Max dB**, each row is **dB step** dB quieter, and the bottom row is `Max − (rows−1)·step` (with the defaults: −20.0 top … −80.0 bottom, 2 dB per row).
- The row label in the left column of each matrix is a single dB line (e.g. `−50.0 dB`). Column headers are bare numbers (e.g. `125`, no `Hz`).
- Each cell holds **only a radio** selector. Clicking the cell plays that (channel, frequency, row) at that row's dB gain for the configured sequence length, with the chosen inter-beep delay; the clicked cell's radio is checked automatically.
- Cells are compact — sized to their radio (~20×20 px) — and frequency column headers are written vertically so long (4-digit) values fit in the narrow columns.
- The cell of the currently playing tone is **highlighted** (light red).
- Only **one tone plays at a time** (exclusive). Clicking another cell stops the previous one.
- Clicking the **active** (highlighted) cell again stops the tone immediately.
- Pressing **Escape** also stops the current tone.
- The default checked row per column is the one nearest the ladder midpoint (−50.0 dB with the defaults).

## Charts

- **X-axis**: frequencies, low → high, plotted by index (not by Hz value). Labels are rotated so long lists never overlap.
- **Y-axis**: dB volume, auto-scaled to the data (default −80…−20 range).
- **Data line**: a grey line connecting the volume of each frequency.
- **Markers**: a red × at each point (one per frequency).

## Clipboard

Clicking **Copy values** writes the current settings to the clipboard as pretty-printed JSON:

```json
{
  "dbStep": 2,
  "dbMin": -80,
  "dbMax": -20,
  "sequenceLengthSec": 2,
  "delayBetweenBeepsSec": 0.1,
  "channels": {
    "left": [
      { "freqHz": 125, "volumeDb": -50 },
      { "freqHz": 160, "volumeDb": -50 }
    ],
    "right": [
      { "freqHz": 125, "volumeDb": -50 }
    ]
  }
}
```

`volumeDb` is the dB value the row plays at (`rowDbValue(r) = dbMax − r·dbStep`; the default row is the ladder midpoint ≈ −50.0 dB with the defaults). The row count is not included — it is derivable from `dbStep`/`dbMin`/`dbMax`.

The last copied text is shown in full in the scrollable text area at the bottom of the page.

## Defaults

- dB step 2 dB, Min dB −80 / Max dB −20 → 31 rows (−20.0 top … −80.0 bottom)
- 2 s sequence length
- 0.1 s delay (blips: on 0.1 s / off 0.1 s, truncated to sequence length)
- Preset B frequencies (19 tones)
- default volume per frequency = ladder midpoint (−50.0 dB with the defaults)

## No test suite

There is no automated test infrastructure. Verification is manual — see the "Testing" section of `AGENTS.md` for a checklist.
