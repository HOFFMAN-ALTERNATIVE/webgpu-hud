import { describe, expect, it } from 'vitest';
import { cameraFraming, motionProfile, parseParams, pickTier, qualityFor, type Device } from '../src/core/settings';

const desk: Device = { backend: 'webgpu', devicePixelRatio: 2, hardwareConcurrency: 12, width: 1920, height: 1080 };

describe('parseParams', () => {
  it('defaults and validates every parameter', () => {
    expect(parseParams('')).toEqual({ renderer: 'auto', seed: 'hx7', motion: 'auto', quality: 'auto', debug: false });
    expect(parseParams('?renderer=WEBGL&seed=abc&motion=reduced&quality=low&debug')).toEqual({
      renderer: 'webgl', seed: 'abc', motion: 'reduced', quality: 'low', debug: true,
    });
    const junk = parseParams('?renderer=vulkan&motion=wild&quality=ultra&seed=' + 'x'.repeat(200));
    expect(junk.renderer).toBe('auto');
    expect(junk.motion).toBe('auto');
    expect(junk.quality).toBe('auto');
    expect(junk.seed).toHaveLength(64);
  });
});

describe('motionProfile', () => {
  it('honours prefers-reduced-motion unless overridden', () => {
    expect(motionProfile(false).reduced).toBe(false);
    expect(motionProfile(true).reduced).toBe(true);
    expect(motionProfile(true, 'full').reduced).toBe(false);
    expect(motionProfile(false, 'reduced').reduced).toBe(true);
    const r = motionProfile(true);
    expect(r).toMatchObject({ cameraDrift: 0, parallax: 0, flicker: 0 });
    expect(r.timeScale).toBeGreaterThan(0); // still alive, just calm
    expect(r.timeScale).toBeLessThan(1);
  });
});

describe('quality', () => {
  it('picks tiers from device capabilities', () => {
    expect(pickTier(desk)).toBe('high');
    expect(pickTier({ ...desk, hardwareConcurrency: 2 })).toBe('low');
    expect(pickTier({ ...desk, width: 390, height: 844, devicePixelRatio: 3 })).toBe('medium');
    expect(pickTier({ ...desk, backend: 'webgl2', hardwareConcurrency: 8, devicePixelRatio: 1 })).toBe('medium');
    expect(pickTier({ ...desk, backend: 'webgl2' })).toBe('low'); // 8.3 MP through the fallback path
    expect(pickTier({ ...desk, hardwareConcurrency: 4 })).toBe('medium');
  });

  it('caps pixel ratio per tier and respects explicit requests', () => {
    const q = qualityFor(desk);
    expect(q.tier).toBe('high');
    expect(q.pixelRatio).toBe(2);
    const low = qualityFor({ ...desk, devicePixelRatio: 3 }, 'low');
    expect(low.pixelRatio).toBe(1);
    expect(low.particles).toBeLessThan(q.particles);
    expect(qualityFor({ ...desk, devicePixelRatio: 0 }).pixelRatio).toBe(1);
  });
});

describe('cameraFraming', () => {
  it('pulls back and shifts up on portrait screens, monotonically', () => {
    const wide = cameraFraming(16 / 9);
    expect(wide.shift).toBeLessThan(0.1);
    let prev = wide;
    for (const a of [1.2, 1, 0.75, 0.46, 0.3, 0.1]) {
      const f = cameraFraming(a);
      expect(f.distance).toBeGreaterThanOrEqual(prev.distance);
      expect(f.fov).toBeGreaterThanOrEqual(prev.fov);
      expect(f.shift).toBeGreaterThanOrEqual(prev.shift);
      prev = f;
    }
    expect(cameraFraming(0.1)).toEqual(cameraFraming(0.3)); // clamped
    expect(prev.shift).toBeLessThanOrEqual(0.2);
  });
});
