/**
 * Runtime settings: URL parameters + user preferences → a quality/motion
 * profile. Pure functions so every branch is unit-tested.
 */

export type RendererPreference = 'auto' | 'webgpu' | 'webgl';
export type Backend = 'webgpu' | 'webgl2';
export type QualityTier = 'low' | 'medium' | 'high';

export interface Params {
  renderer: RendererPreference;
  seed: string;
  motion: 'auto' | 'full' | 'reduced';
  quality: QualityTier | 'auto';
  debug: boolean;
}

export function parseParams(search: string): Params {
  const q = new URLSearchParams(search);
  const oneOf = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = q.get(key)?.toLowerCase();
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
  };
  return {
    renderer: oneOf('renderer', ['auto', 'webgpu', 'webgl'] as const, 'auto'),
    seed: (q.get('seed') ?? 'hx7').slice(0, 64),
    motion: oneOf('motion', ['auto', 'full', 'reduced'] as const, 'auto'),
    quality: oneOf('quality', ['auto', 'low', 'medium', 'high'] as const, 'auto'),
    debug: q.has('debug'),
  };
}

export interface MotionProfile {
  reduced: boolean;
  /** Multiplier for scene time (sweep, particles, hologram). */
  timeScale: number;
  cameraDrift: number;
  parallax: number;
  /** Film grain / flicker / chromatic jitter — off when reduced. */
  flicker: number;
}

export function motionProfile(prefersReduced: boolean, override: Params['motion'] = 'auto'): MotionProfile {
  const reduced = override === 'reduced' || (override === 'auto' && prefersReduced);
  return reduced
    ? { reduced, timeScale: 0.25, cameraDrift: 0, parallax: 0, flicker: 0 }
    : { reduced, timeScale: 1, cameraDrift: 1, parallax: 1, flicker: 1 };
}

export interface Device {
  backend: Backend;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  width: number;
  height: number;
}

export interface Quality {
  tier: QualityTier;
  particles: number;
  pixelRatio: number;
  bloom: { strength: number; radius: number; threshold: number };
}

const TIERS: Record<QualityTier, Omit<Quality, 'tier' | 'pixelRatio'> & { maxDpr: number }> = {
  low: { particles: 6_000, maxDpr: 1, bloom: { strength: 0.6, radius: 0.35, threshold: 0.32 } },
  medium: { particles: 16_000, maxDpr: 1.5, bloom: { strength: 0.75, radius: 0.45, threshold: 0.28 } },
  high: { particles: 32_000, maxDpr: 2, bloom: { strength: 0.85, radius: 0.55, threshold: 0.25 } },
};

export function pickTier(d: Device): QualityTier {
  const pixels = d.width * d.height * d.devicePixelRatio ** 2;
  if (d.hardwareConcurrency <= 2) return 'low';
  if (d.backend === 'webgl2') return pixels > 4_000_000 || d.hardwareConcurrency < 8 ? 'low' : 'medium';
  if (d.width < 700 || d.hardwareConcurrency < 6) return 'medium';
  return 'high';
}

export function qualityFor(d: Device, requested: Params['quality'] = 'auto'): Quality {
  const tier = requested === 'auto' ? pickTier(d) : requested;
  const t = TIERS[tier];
  return { tier, particles: t.particles, bloom: t.bloom, pixelRatio: Math.min(d.devicePixelRatio || 1, t.maxDpr) };
}

/** Camera framing that keeps the radar fully visible on portrait screens. */
export interface Framing {
  fov: number;
  distance: number;
  height: number;
  /** Fraction of the viewport height to shift the image up (frees the bottom for panels on phones). */
  shift: number;
}

export function cameraFraming(aspect: number): Framing {
  const a = Math.max(0.3, aspect);
  if (a >= 1.2) return { fov: 42, distance: 8.2, height: 3.7, shift: 0.06 };
  const k = Math.min(1, (1.2 - a) / 0.9); // 0 at 1.2 (landscape), 1 at 0.3 (tall phone)
  return { fov: 42 + 14 * k, distance: 8.2 + 5.5 * k, height: 3.7 + 2.6 * k, shift: 0.06 + 0.14 * k };
}
