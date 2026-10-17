# 0002. Analytic particle motion in the vertex stage

Status: accepted
Date: 2026-10-17

## Context
The scene uses 6k to 32k particles depending on the quality tier. Updating positions
on the CPU and uploading them every frame costs bandwidth and main-thread time.
Compute shaders solve that on WebGPU, but WebGL 2 has no compute stage.

## Options
1. CPU simulation with per-frame buffer upload: simple, scales badly, competes with the UI.
2. WebGPU compute with storage buffers: allows interaction and collisions, needs a
   separate emulation path on WebGL 2.
3. Position as a pure function of `(seed, time)` evaluated in the vertex shader.

## Decision
Option 3. It renders identically on both backends and costs no CPU time or uploads.

## Consequences
- Particle count is limited by fill rate, not by the CPU.
- Particles cannot react to each other or to the radar contacts.
- Revisit if interaction becomes a requirement; that would mean compute on WebGPU and
  accepting a degraded look on the fallback.
