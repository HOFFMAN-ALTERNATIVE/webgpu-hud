# 0003. Render text panels as DOM, not in WebGL

Status: accepted
Date: 2026-10-17

## Context
The HUD shows telemetry values, a contacts table, an event log and controls. Text drawn
in the canvas (SDF fonts or textures) blurs at fractional DPR, is invisible to screen
readers and cannot be selected or translated.

## Options
1. Text in WebGL via SDF fonts: one compositing layer, consistent post-processing glow.
2. HTML/CSS panels over the canvas, updated at 10 Hz.

## Decision
Option 2. Sharp text and accessibility outweigh having bloom on the labels.

## Consequences
- Panels are semantic HTML with fixed-width numerals, so values do not jitter.
- Text is not affected by the post stack; the glow is approximated in CSS.
- Updating at 10 Hz keeps layout cost low; text changing at 60 Hz is unreadable anyway.
- The production CSP needs `style-src-attr 'unsafe-inline'` for one per-row CSS
  custom property in the contacts table.
