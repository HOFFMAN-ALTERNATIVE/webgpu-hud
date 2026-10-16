import { uniform } from 'three/tsl';

/**
 * Scene-wide uniforms. `uTime` is advanced by the app (scaled by the motion
 * profile, frozen when paused) instead of using the global TSL `time`, so
 * reduced-motion and pause apply to every shader at once.
 */
export const U = {
  time: uniform(0),
  sweep: uniform(0), // radar sweep, 0..1 of a full turn (clockwise from north)
  threat: uniform(0), // 0..1
  flicker: uniform(1), // 0 when reduced motion
  pointer: uniform(0), // pointer x for subtle chromatic shift
};
