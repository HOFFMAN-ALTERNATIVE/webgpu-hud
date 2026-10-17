# 0001. TSL node materials instead of hand-written shaders

Status: accepted
Date: 2026-10-17

## Context
The HUD must render on WebGPU where available and fall back to WebGL 2 everywhere else
(headless CI, older Safari and Firefox, blocklisted GPUs). Each effect (radar, hologram,
particles, beam, grid, post) needs a custom shader. Maintaining two shader languages
doubles the work and lets the backends drift apart visually.

## Options
1. Hand-written WGSL plus a GLSL port of every shader: full control, smallest runtime,
   two codebases to keep in sync.
2. WebGL 2 only with GLSL: one codebase, but gives up WebGPU entirely.
3. three.js TSL node materials: one TypeScript node graph compiled to WGSL or GLSL by
   `WebGPURenderer`, composable helpers, but a young API and the three.js bundle.

## Decision
Option 3. A single source of truth for every effect is what makes the fallback free,
and the fallback is the path most visitors and all of CI actually take.

## Consequences
- Shader helpers (anti-aliased lines, fresnel) are plain TypeScript functions.
- The three.js chunk is 243.7 kB gzip.
- TSL changes between three.js releases; three is pinned to an exact version and
  upgrades go through the Playwright pixel tests.
- Revisit if a feature needs WGSL-only capabilities (storage textures, subgroups).
