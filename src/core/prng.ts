/**
 * Deterministic PRNG (mulberry32). The whole simulation is seeded so a given
 * `?seed=` reproduces the exact same telemetry and radar picture — useful for
 * screenshots, tests and bug reports.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng: Rng, min: number, max: number): number => min + (max - min) * rng();

export const pick = <T>(rng: Rng, items: readonly T[]): T => {
  if (items.length === 0) throw new Error('pick: empty list');
  return items[Math.floor(rng() * items.length) % items.length]!;
};

/** Standard normal sample (Box–Muller). */
export function gaussian(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Hash a string (e.g. URL seed) into a 32-bit seed (FNV-1a). */
export function seedFrom(input: string | number): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input >>> 0;
  let h = 0x811c9dc5;
  for (const ch of String(input)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
