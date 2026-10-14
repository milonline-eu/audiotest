# Audio Tone Matrix

## What it is

It is a small set of HTML/CSS/JS files (no build step, no dependencies) — just open `index.html` in a browser and start playing tones.

## Run

Open `index.html` in any modern web browser.
On macOS you can simply run `open index.html` or double-click the file.
No server is required.

## Controls

| Control | What it does |
|---------|-------------|
| **Volume steps** (numeric input with −/+ steppers) | Sets how many volume rows to show (1–50). Rows form a dB ladder spanning the Min dB…Max dB range, linear in dB across the step count (default −20.0 top … −80.0 bottom). Changing this re-renders both matrices and stops any playing tone. |
| **Min dB** (numeric input with −/+ steppers) | dB of the bottom (quietest) row; range −1000…0 dB, default −80. Must stay ≤ Max dB (clamped). Changing it redistributes the dB ladder across the current step count, re-renders the row labels, and stops any playing tone. |
| **Max dB** (numeric input with −/+ steppers) | dB of the top (loudest) row; range −1000…0 dB, default −20. Must stay ≥ Min dB (clamped). Same behavior as Min dB. |
| **Sequence length (s)** (numeric input with −/+ steppers) | Total duration of each tone burst (0.5–60 s). Applied immediately; no re-render needed. |
| **Delay between beeps (s)** (numeric input with −/+ steppers) | When > 0, the tone plays in on/off blips of this duration (0% duty = 50% on, 50% off). Applied immediately. |
| **Frequency mode** (Preset A / Preset B / Custom radio buttons) | Preset A = 15-tone IEC set, Preset B = 19-tone IEC set. Custom enables the text field below. |
| **Custom** text field | Comma- or space-separated list of frequencies in Hz. Click **Apply frequencies** (or press Enter) to use them. |
| **Copy values** button | Copies all current channel/frequency/volume settings to the clipboard. |

## Layout

The page is split into two side-by-side columns, one per channel. In each column the chart sits directly above its tone matrix (left chart over the left matrix, right chart over the right matrix). A thin status bar is pinned to the very bottom of the viewport so it is always visible, even while scrolling.

## Matrix

Each matrix has frequencies as columns (low → high, left to right) and volume steps as rows. Volume is shown in two units: a **dB ladder** spanning the user-set **Min dB…Max dB** (default −80.0…−20.0 dB; top row = Max dB, bottom row = Min dB, linear in dB — the actual gain the tone button plays) and a **legacy linear percent** (100% at the top, 5% at the bottom with 20 steps — display-only).
- The row label in the left column of each matrix shows both: the percent on the top line and the dB value on the sub-line below it (e.g. `50` / `−51.6 dB` with defaults). Individual cells show no volume text.
- Each cell holds a **radio button** (on the left) and a **tone button** (filling the rest). Clicking the radio sets that frequency's volume for that channel (clicking a radio does not play any sound); clicking the tone button plays that frequency at that row's dB gain for the configured sequence length, with the chosen inter-beep delay.
- Only **one tone plays at a time** (exclusive). Clicking a new tone button stops the previous one.
- Clicking the **active** (highlighted red) button again stops the tone immediately.
- Pressing **Escape** also stops the current tone.

## Charts

- **X-axis**: frequencies, low → high, plotted by index (not by Hz value). Labels are rotated so long lists never overlap.
- **Y-axis**: 0–100% volume, with gridlines at 0, 25, 50, 75, 100.
- **Data line**: a grey line connecting the volume of each frequency.
- **Markers**: a red × at each point (one per frequency).

## Clipboard

Clicking **Copy values** writes the current settings to the clipboard as pretty-printed JSON:

```json
{
  "steps": 20,
  "sequenceLengthSec": 5,
  "delayBetweenBeepsSec": 0.2,
  "channels": {
    "left": [
      { "freqHz": 125, "volumePct": 50, "volumeDb": -51.578947368421055 },
      { "freqHz": 250, "volumePct": 50, "volumeDb": -51.578947368421055 }
    ],
    "right": [
      { "freqHz": 125, "volumePct": 50, "volumeDb": -51.578947368421055 }
    ]
  }
}
```

`volumePct` is the legacy linear percent for the row; `volumeDb` is the dB-ladder value that row actually plays at (top row = Max dB, bottom row = Min dB, linear in dB across the step count — with the defaults a 50% row reports ≈ −51.58).

The last copied text is shown in the small preview area at the bottom of the page (first 15 lines, truncated with `…` if longer).

## Defaults

- 20 volume steps
- Min dB −80 / Max dB −20 (ladder: −20.0 top … −80.0 bottom, linear in dB)
- 5 s sequence length
- 0.2 s delay (blips: on 0.2 s / off 0.2 s, truncated to sequence length)
- Preset A frequencies (15 tones)
- 50% volume per frequency (the default checked row is the middle row, whose dB is whatever the ladder gives — ≈ −51.6 dB with the default range, not a fixed −10 dB)

## No test suite

There is no automated test infrastructure. Verification is manual — see the "Testing" section of `AGENTS.md` for a checklist.
