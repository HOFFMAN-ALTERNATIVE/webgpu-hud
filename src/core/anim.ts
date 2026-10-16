/** Animation math shared by the 3D scene and the DOM overlay. */

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t: number): number => 1 - (1 - clamp(t)) ** 3;
export const easeInOutQuad = (t: number): number => {
  const x = clamp(t);
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
};

/**
 * Frame-rate independent exponential smoothing: the same `halfLife` gives the
 * same visual result at 30, 60 or 144 fps.
 */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return lerp(target, current, 2 ** (-dt / halfLife));
}

/**
 * Critically damped spring (no overshoot), integrated in closed form so it is
 * stable for any dt. Used for camera parallax and gauge needles.
 */
export interface Spring {
  value: number;
  velocity: number;
}

export function stepSpring(s: Spring, target: number, omega: number, dt: number): Spring {
  const x = s.value - target;
  const exp = Math.exp(-omega * dt);
  const tmp = (s.velocity + omega * x) * dt;
  return {
    value: target + (x + tmp) * exp,
    velocity: (s.velocity - omega * tmp) * exp,
  };
}

/** Wraps an angle to [0, 2π). */
export const wrapAngle = (a: number): number => {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
};

/**
 * Fixed-timestep accumulator: simulation runs at a constant rate, decoupled
 * from rendering; a long frame (tab switch) is capped to avoid a spiral of death.
 */
export class FixedStep {
  private acc = 0;

  constructor(
    readonly step: number,
    readonly maxSteps = 8,
  ) {
    if (step <= 0) throw new RangeError('step must be > 0');
  }

  /** Returns how many fixed steps to run for this frame. */
  advance(dt: number): number {
    this.acc += Math.max(0, dt);
    let n = Math.floor(this.acc / this.step);
    if (n > this.maxSteps) {
      n = this.maxSteps;
      this.acc = 0; // drop the backlog instead of fast-forwarding
    } else {
      this.acc -= n * this.step;
    }
    return n;
  }

  /** Interpolation factor between the last two sim states. */
  get alpha(): number {
    return this.acc / this.step;
  }
}
