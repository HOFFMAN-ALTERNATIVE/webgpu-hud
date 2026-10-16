import { describe, expect, it } from 'vitest';
import { clamp, damp, easeInOutQuad, easeOutCubic, FixedStep, lerp, smoothstep, stepSpring, wrapAngle } from '../src/core/anim';
import { bearing, bitrate, fixed, missionClock, pad, percent } from '../src/core/format';
import { gaussian, mulberry32, pick, range, seedFrom } from '../src/core/prng';
import { RingBuffer } from '../src/core/ring';

describe('prng', () => {
  it('is deterministic per seed and uniform-ish in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 10_000 }, () => a());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeCloseTo(0.5, 1);
    expect(mulberry32(43)()).not.toBe(mulberry32(42)());
  });

  it('gaussian has ~zero mean and unit variance', () => {
    const r = mulberry32(7);
    const xs = Array.from({ length: 20_000 }, () => gaussian(r));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(variance).toBeGreaterThan(0.95);
    expect(variance).toBeLessThan(1.05);
  });

  it('range, pick and seedFrom', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = range(r, -2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(3);
      expect(['a', 'b']).toContain(pick(r, ['a', 'b']));
    }
    expect(() => pick(r, [])).toThrow();
    expect(seedFrom('hx7')).toBe(seedFrom('hx7'));
    expect(seedFrom('hx7')).not.toBe(seedFrom('hx8'));
    expect(seedFrom(12)).toBe(12);
  });
});

describe('RingBuffer', () => {
  it('keeps the newest N values in order', () => {
    const rb = new RingBuffer(3);
    expect(rb.last()).toBeUndefined();
    expect(rb.stats()).toEqual({ min: 0, max: 0, mean: 0 });
    [1, 2, 3, 4, 5].forEach((v) => rb.push(v));
    expect(rb.length).toBe(3);
    expect(rb.toArray()).toEqual([3, 4, 5]);
    expect(rb.last()).toBe(5);
    expect(rb.stats()).toEqual({ min: 3, max: 5, mean: 4 });
    expect(() => rb.at(3)).toThrow(RangeError);
    expect(() => new RingBuffer(0)).toThrow(RangeError);
  });
});

describe('animation math', () => {
  it('clamp / lerp / smoothstep / easings', () => {
    expect(clamp(2)).toBe(1);
    expect(clamp(-1)).toBe(0);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeInOutQuad(0.25)).toBeCloseTo(0.125);
    expect(easeInOutQuad(0.75)).toBeCloseTo(0.875);
  });

  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 0.25, 1 / 60);
    let b = 0;
    for (let i = 0; i < 144; i++) b = damp(b, 1, 0.25, 1 / 144);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeCloseTo(1 - 2 ** -4, 6); // 1 s = 4 half-lives
    expect(damp(0, 5, 0, 0.016)).toBe(5);
  });

  it('critically damped spring converges without overshoot, for any dt', () => {
    for (const dt of [1 / 240, 1 / 60, 1 / 10, 0.5]) {
      let s = { value: 0, velocity: 0 };
      let peak = 0;
      for (let t = 0; t < 4; t += dt) {
        s = stepSpring(s, 1, 8, dt);
        peak = Math.max(peak, s.value);
      }
      expect(s.value).toBeCloseTo(1, 3);
      expect(peak).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('wrapAngle', () => {
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(wrapAngle(5 * Math.PI)).toBeCloseTo(Math.PI);
  });

  it('FixedStep runs a constant rate and caps runaway frames', () => {
    const fs = new FixedStep(1 / 30, 8);
    let steps = 0;
    for (let i = 0; i < 120; i++) steps += fs.advance(1 / 60); // 2 s at 60 fps
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
    expect(fs.alpha).toBeGreaterThanOrEqual(0);
    expect(fs.alpha).toBeLessThan(1);
    expect(fs.advance(10)).toBe(8); // tab was hidden for 10 s: no spiral of death
    expect(fs.alpha).toBe(0);
    expect(fs.advance(-1)).toBe(0);
    expect(() => new FixedStep(0)).toThrow();
  });
});

describe('formatters', () => {
  it('produce fixed-width HUD strings', () => {
    expect(pad(7, 3)).toBe('007');
    expect(bearing(0)).toBe('000°');
    expect(bearing(Math.PI / 2)).toBe('090°');
    expect(bearing(-Math.PI / 2)).toBe('270°');
    expect(percent(0.426)).toBe('\u200743%');
    expect(percent(2)).toBe('100%');
    expect(fixed(Number.NaN, 1)).toBe('0.0');
    expect(fixed(3.14159, 2, 6)).toBe('\u2007\u20073.14');
    expect(bitrate(950)).toBe('950 b/s');
    expect(bitrate(2.4e9)).toBe('2.40 Gb/s');
    expect(bitrate(81.25e6)).toBe('81.3 Mb/s');
    expect(bitrate(-5)).toBe('0.00 b/s');
    expect(missionClock(3723.456)).toBe('T+01:02:03.45');
    expect(missionClock(-1)).toBe('T+00:00:00.00');
  });
});
