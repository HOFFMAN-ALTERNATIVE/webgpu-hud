import { wrapAngle } from '../core/anim';
import { pick, range, type Rng } from '../core/prng';

/**
 * Radar picture: contacts move in a flat plane (km, x = east, y = north),
 * a sweep rotates clockwise from north, and each contact "pings" when the
 * beam passes over it; its blip then decays exponentially like phosphor.
 */
export type ContactClass = 'hostile' | 'unknown' | 'friendly';

export interface Contact {
  id: string;
  cls: ContactClass;
  x: number;
  y: number;
  vx: number;
  vy: number;
  altitude: number; // 0..1, drives the holographic stalk height
  lastPing: number; // sim time of last detection, -Infinity = never
}

export interface RadarOptions {
  rng: Rng;
  contacts?: number;
  rangeKm?: number;
  /** Sweep angular speed (rad/s). */
  sweepSpeed?: number;
  /** Phosphor decay constant (s). */
  decay?: number;
}

/** Compass bearing (0 = north, clockwise) of a point. */
export const bearingOf = (x: number, y: number): number => wrapAngle(Math.atan2(x, y));

/**
 * True when a clockwise sweep moving from `prev` to `curr` (both wrapped to
 * [0, 2π)) passed `target`, including across the 2π → 0 seam.
 */
export function sweptOver(prev: number, curr: number, target: number): boolean {
  const span = wrapAngle(curr - prev);
  if (span === 0) return false;
  const off = wrapAngle(target - prev);
  return off > 0 && off <= span;
}

const CALLSIGNS = ['VIPER', 'RAVEN', 'GHOST', 'NOMAD', 'ORBIT', 'SABLE', 'KESTREL', 'WRAITH', 'ECHO', 'TALON'];

export class RadarSim {
  readonly contacts: Contact[] = [];
  readonly rangeKm: number;
  sweep = 0;
  private t = 0;
  private readonly rng: Rng;
  private readonly speed: number;
  private readonly decay: number;
  private serial = 100;

  constructor(opts: RadarOptions) {
    this.rng = opts.rng;
    this.rangeKm = opts.rangeKm ?? 120;
    this.speed = opts.sweepSpeed ?? Math.PI / 2; // one revolution every 4 s
    this.decay = opts.decay ?? 2.6;
    for (let i = 0; i < (opts.contacts ?? 14); i++) this.contacts.push(this.spawn(false));
  }

  get time(): number {
    return this.t;
  }

  private spawn(atEdge: boolean): Contact {
    const r = atEdge ? this.rangeKm * 0.98 : range(this.rng, 0.15, 0.95) * this.rangeKm;
    const a = range(this.rng, 0, Math.PI * 2);
    const x = Math.sin(a) * r;
    const y = Math.cos(a) * r;
    // Head roughly towards the centre when spawning at the edge, random otherwise.
    const heading = atEdge ? a + Math.PI + range(this.rng, -0.6, 0.6) : range(this.rng, 0, Math.PI * 2);
    const speed = range(this.rng, 0.4, 2.2); // km/s — fast movers keep the picture alive
    const cls = pick(this.rng, ['hostile', 'unknown', 'unknown', 'friendly', 'friendly'] as const);
    return {
      id: `${pick(this.rng, CALLSIGNS)}-${this.serial++}`,
      cls,
      x,
      y,
      vx: Math.sin(heading) * speed,
      vy: Math.cos(heading) * speed,
      altitude: range(this.rng, 0.1, 1),
      lastPing: -Infinity,
    };
  }

  step(dt: number): Contact[] {
    const prev = this.sweep;
    this.t += dt;
    this.sweep = wrapAngle(this.sweep + this.speed * dt);
    const pinged: Contact[] = [];
    for (let i = 0; i < this.contacts.length; i++) {
      const c = this.contacts[i]!;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (Math.hypot(c.x, c.y) > this.rangeKm) {
        this.contacts[i] = this.spawn(true);
        continue;
      }
      if (sweptOver(prev, this.sweep, bearingOf(c.x, c.y))) {
        c.lastPing = this.t;
        pinged.push(c);
      }
    }
    return pinged;
  }

  /** Blip brightness 0..1 at the current time. */
  intensity(c: Contact): number {
    if (!Number.isFinite(c.lastPing)) return 0;
    return Math.exp(-(this.t - c.lastPing) / this.decay);
  }

  /** 0..1 threat: hostile contacts weighted by proximity. */
  threat(): number {
    let s = 0;
    for (const c of this.contacts) {
      if (c.cls !== 'hostile') continue;
      const d = Math.hypot(c.x, c.y) / this.rangeKm;
      s += Math.max(0, 1 - d) ** 2;
    }
    return Math.min(1, s / 1.5);
  }

  /** Contacts sorted by distance (closest first) for the HUD table. */
  nearest(n: number): Contact[] {
    return [...this.contacts].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)).slice(0, n);
  }
}
