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
| **Volume steps** (numeric input with −/+ steppers) | Sets how many volume rows to show (1–50). Changing this re-renders both matrices and stops any playing tone. |
| **Sequence length (s)** (numeric input with −/+ steppers) | Total duration of each tone burst (0.5–60 s). Applied immediately; no re-render needed. |
| **Delay between beeps (s)** (numeric input with −/+ steppers) | When > 0, the tone plays in on/off blips of this duration (0% duty = 50% on, 50% off). Applied immediately. |
| **Frequency mode** (Preset A / Preset B / Custom radio buttons) | Preset A = 15-tone IEC set, Preset B = 19-tone IEC set. Custom enables the text field below. |
| **Custom** text field | Comma- or space-separated list of frequencies in Hz. Click **Apply frequencies** (or press Enter) to use them. |
| **Copy values** button | Copies all current channel/frequency/volume settings to the clipboard. |

## Layout

The page is split into two side-by-side columns, one per channel. In each column the chart sits directly above its tone matrix (left chart over the left matrix, right chart over the right matrix). A thin status bar is pinned to the very bottom of the viewport so it is always visible, even while scrolling.

## Matrix

Each matrix has frequencies as columns (low → high, left to right) and volume steps as rows (100% at the top, 5% at the bottom).
- The percentage value is shown only by the row label in the left column of each matrix — the individual cells show no volume text.
- Each cell holds a **radio button** (on the left) and a **tone button** (filling the rest). Clicking the radio sets that frequency's volume for that channel (clicking a radio does not play any sound); clicking the tone button plays that frequency at that row's volume for the configured sequence length, with the chosen inter-beep delay.
- Only **one tone plays at a time** (exclusive). Clicking a new tone button stops the previous one.
- Clicking the **active** (highlighted red) button again stops the tone immediately.
- Pressing **Escape** also stops the current tone.

## Charts

- **X-axis**: frequencies, low → high, plotted by index (not by Hz value). Labels are rotated so long lists never overlap.
- **Y-axis**: 0–100% volume, with gridlines at 0, 25, 50, 75, 100.
- **Data line**: a grey line connecting the volume of each frequency.
- **Markers**: a red × at each point (one per frequency).

## Clipboard

Clicking **Copy values** writes one line per channel and frequency to the clipboard in this format:

```
left 125Hz 50.0%
left 250Hz 50.0%
…
right 8000Hz 50.0%
```

The last copied text is shown in the small preview area at the bottom of the page (first 15 lines, truncated with `…` if longer).

## Defaults

- 20 volume steps
- 5 s sequence length
- 0.2 s delay (blips: on 0.2 s / off 0.2 s, truncated to sequence length)
- Preset A frequencies (15 tones)
- 50% volume per frequency

## No test suite

There is no automated test infrastructure. Verification is manual — see the "Testing" section of `AGENTS.md` for a checklist.
