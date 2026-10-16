import { RingBuffer } from '../core/ring';
import { gaussian, pick, type Rng } from '../core/prng';

/**
 * Simulated telemetry stream. Each channel is an Ornstein–Uhlenbeck process
 * (mean-reverting random walk) — it wanders like real metrics instead of
 * white noise — with Poisson-distributed incidents that spike channels and
 * emit log events.
 */
export interface ChannelSpec {
  id: ChannelId;
  label: string;
  unit: 'ratio' | 'bps' | 'celsius' | 'kw' | 'db';
  mean: number;
  reversion: number; // θ: how fast it returns to the mean (1/s)
  volatility: number; // σ
  min: number;
  max: number;
}

export type ChannelId = 'cpu' | 'mem' | 'rx' | 'tx' | 'temp' | 'power' | 'signal';

export const CHANNELS: readonly ChannelSpec[] = [
  { id: 'cpu', label: 'CPU LOAD', unit: 'ratio', mean: 0.42, reversion: 0.6, volatility: 0.18, min: 0.02, max: 1 },
  { id: 'mem', label: 'MEMORY', unit: 'ratio', mean: 0.61, reversion: 0.15, volatility: 0.05, min: 0.2, max: 0.98 },
  { id: 'rx', label: 'NET RX', unit: 'bps', mean: 2.4e9, reversion: 0.8, volatility: 1.1e9, min: 5e7, max: 9.6e9 },
  { id: 'tx', label: 'NET TX', unit: 'bps', mean: 8.0e8, reversion: 0.8, volatility: 4.5e8, min: 1e7, max: 9.6e9 },
  { id: 'temp', label: 'CORE TEMP', unit: 'celsius', mean: 61, reversion: 0.25, volatility: 3, min: 35, max: 96 },
  { id: 'power', label: 'POWER DRAW', unit: 'kw', mean: 14.2, reversion: 0.4, volatility: 1.6, min: 4, max: 32 },
  { id: 'signal', label: 'UPLINK SNR', unit: 'db', mean: 27, reversion: 0.5, volatility: 2.5, min: 3, max: 40 },
];

export type Severity = 'info' | 'warn' | 'crit';

export interface HudEvent {
  t: number;
  severity: Severity;
  code: string;
  message: string;
}

export interface TelemetryFrame {
  t: number;
  values: Record<ChannelId, number>;
  events: HudEvent[];
}

const INCIDENTS: readonly { code: string; message: string; severity: Severity; spike: Partial<Record<ChannelId, number>> }[] = [
  { code: 'IDS-401', message: 'Intrusion attempt blocked at edge node', severity: 'warn', spike: { cpu: 0.35, rx: 3e9 } },
  { code: 'NET-112', message: 'Uplink resync — packet loss recovered', severity: 'info', spike: { signal: -9 } },
  { code: 'THM-220', message: 'Thermal envelope exceeded on core 3', severity: 'crit', spike: { temp: 18, power: 6 } },
  { code: 'SYS-007', message: 'Hot patch applied, no restart required', severity: 'info', spike: { cpu: 0.15 } },
  { code: 'DAT-318', message: 'Burst replication to cold storage', severity: 'info', spike: { tx: 4e9 } },
  { code: 'PWR-090', message: 'Grid fluctuation, switched to buffer', severity: 'warn', spike: { power: 9 } },
];

export interface TelemetryOptions {
  rng: Rng;
  historyLength?: number;
  /** Mean incidents per second (Poisson rate). */
  incidentRate?: number;
}

export class TelemetryStream {
  readonly history: Record<ChannelId, RingBuffer>;
  private readonly values = {} as Record<ChannelId, number>;
  private readonly rng: Rng;
  private readonly rate: number;
  private t = 0;

  constructor(opts: TelemetryOptions) {
    this.rng = opts.rng;
    this.rate = opts.incidentRate ?? 0.12;
    const len = opts.historyLength ?? 120;
    this.history = {} as Record<ChannelId, RingBuffer>;
    for (const c of CHANNELS) {
      this.values[c.id] = c.mean;
      this.history[c.id] = new RingBuffer(len);
    }
  }

  get time(): number {
    return this.t;
  }

  /** Normalised 0..1 position of a value inside its channel range (for bars). */
  static normalised(id: ChannelId, v: number): number {
    const c = CHANNELS.find((x) => x.id === id)!;
    return (v - c.min) / (c.max - c.min);
  }

  step(dt: number): TelemetryFrame {
    this.t += dt;
    const events: HudEvent[] = [];
    const sqrtDt = Math.sqrt(dt);
    for (const c of CHANNELS) {
      const x = this.values[c.id];
      const next = x + c.reversion * (c.mean - x) * dt + c.volatility * sqrtDt * gaussian(this.rng);
      this.values[c.id] = Math.min(c.max, Math.max(c.min, next));
    }
    // Poisson arrivals: P(at least one event in dt) = 1 - e^(-λ·dt)
    if (this.rng() < 1 - Math.exp(-this.rate * dt)) {
      const inc = pick(this.rng, INCIDENTS);
      for (const [id, delta] of Object.entries(inc.spike) as [ChannelId, number][]) {
        const c = CHANNELS.find((x) => x.id === id)!;
        this.values[id] = Math.min(c.max, Math.max(c.min, this.values[id] + delta));
      }
      events.push({ t: this.t, severity: inc.severity, code: inc.code, message: inc.message });
    }
    for (const c of CHANNELS) this.history[c.id].push(this.values[c.id]);
    return { t: this.t, values: { ...this.values }, events };
  }
}
