import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/prng';
import { bearingOf, RadarSim, sweptOver } from '../src/sim/radar';
import { CHANNELS, TelemetryStream } from '../src/sim/telemetry';
import { sparkPoints } from '../src/ui/sparkline';

describe('TelemetryStream', () => {
  it('is reproducible for a seed', () => {
    const a = new TelemetryStream({ rng: mulberry32(9) });
    const b = new TelemetryStream({ rng: mulberry32(9) });
    for (let i = 0; i < 200; i++) expect(a.step(1 / 30)).toEqual(b.step(1 / 30));
  });

  it('keeps every channel inside its physical range', () => {
    const s = new TelemetryStream({ rng: mulberry32(3), incidentRate: 5 });
    for (let i = 0; i < 3000; i++) {
      const f = s.step(1 / 30);
      for (const c of CHANNELS) {
        expect(f.values[c.id]).toBeGreaterThanOrEqual(c.min);
        expect(f.values[c.id]).toBeLessThanOrEqual(c.max);
      }
    }
  });

  it('mean-reverts (Ornstein–Uhlenbeck) towards the channel mean', () => {
    const s = new TelemetryStream({ rng: mulberry32(5), incidentRate: 0, historyLength: 6000 });
    for (let i = 0; i < 6000; i++) s.step(1 / 30); // 200 s
    for (const id of ['cpu', 'temp', 'signal'] as const) {
      const c = CHANNELS.find((x) => x.id === id)!;
      const { mean } = s.history[id].stats();
      expect(Math.abs(mean - c.mean) / (c.max - c.min)).toBeLessThan(0.12);
    }
  });

  it('emits incidents at roughly the Poisson rate', () => {
    const s = new TelemetryStream({ rng: mulberry32(11), incidentRate: 0.5 });
    let events = 0;
    const seconds = 600;
    for (let i = 0; i < seconds * 30; i++) events += s.step(1 / 30).events.length;
    expect(events).toBeGreaterThan(seconds * 0.5 * 0.8);
    expect(events).toBeLessThan(seconds * 0.5 * 1.2);
  });

  it('history and normalisation', () => {
    const s = new TelemetryStream({ rng: mulberry32(1), historyLength: 10 });
    for (let i = 0; i < 25; i++) s.step(0.1);
    expect(s.history.cpu.length).toBe(10);
    expect(s.time).toBeCloseTo(2.5);
    expect(TelemetryStream.normalised('temp', 35)).toBe(0);
    expect(TelemetryStream.normalised('temp', 96)).toBe(1);
  });
});

describe('radar geometry', () => {
  it('uses compass bearings (0 = north, clockwise)', () => {
    expect(bearingOf(0, 1)).toBeCloseTo(0);
    expect(bearingOf(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(bearingOf(0, -1)).toBeCloseTo(Math.PI);
    expect(bearingOf(-1, 0)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('detects sweep crossings including the 360°→0° seam', () => {
    expect(sweptOver(0.1, 0.3, 0.2)).toBe(true);
    expect(sweptOver(0.1, 0.3, 0.4)).toBe(false);
    expect(sweptOver(0.1, 0.3, 0.1)).toBe(false); // already counted last step
    expect(sweptOver(0.1, 0.3, 0.3)).toBe(true);
    expect(sweptOver(6.2, 0.1, 6.25)).toBe(true);
    expect(sweptOver(6.2, 0.1, 0.05)).toBe(true);
    expect(sweptOver(6.2, 0.1, 3)).toBe(false);
    expect(sweptOver(1, 1, 1)).toBe(false);
  });
});

describe('RadarSim', () => {
  it('pings every contact exactly once per revolution', () => {
    const sim = new RadarSim({ rng: mulberry32(2), contacts: 20, sweepSpeed: Math.PI / 2 });
    for (const c of sim.contacts) {
      c.vx = 0;
      c.vy = 0;
    }
    const counts = new Map<string, number>();
    const dt = 1 / 30;
    for (let i = 0; i < 4 * 30 * 3; i++) for (const c of sim.step(dt)) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    expect(counts.size).toBe(20);
    for (const n of counts.values()) expect(n).toBe(3);
  });

  it('blips decay exponentially after a ping', () => {
    const sim = new RadarSim({ rng: mulberry32(4), contacts: 1, decay: 2 });
    const c = sim.contacts[0]!;
    expect(sim.intensity(c)).toBe(0);
    c.lastPing = sim.time;
    expect(sim.intensity(c)).toBe(1);
    sim.step(2);
    expect(sim.intensity(sim.contacts[0]!)).toBeLessThanOrEqual(1);
    c.lastPing = sim.time - 2;
    expect(sim.intensity(c)).toBeCloseTo(Math.exp(-1));
  });

  it('respawns contacts that leave the scope and keeps them in range', () => {
    const sim = new RadarSim({ rng: mulberry32(6), contacts: 12, rangeKm: 50 });
    for (let i = 0; i < 30 * 120; i++) {
      sim.step(1 / 30);
      for (const c of sim.contacts) expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(50 + 2.2 / 30);
    }
    expect(sim.contacts).toHaveLength(12);
  });

  it('threat rises as hostiles approach; nearest() sorts by range', () => {
    const sim = new RadarSim({ rng: mulberry32(8), contacts: 6 });
    sim.contacts.forEach((c, i) => Object.assign(c, { cls: 'friendly', x: 0, y: 10 + i * 10 }));
    expect(sim.threat()).toBe(0);
    sim.contacts[5]!.cls = 'hostile';
    const far = sim.threat();
    sim.contacts[5]!.y = 5;
    expect(sim.threat()).toBeGreaterThan(far);
    const near = sim.nearest(3);
    expect(near.map((c) => Math.hypot(c.x, c.y))).toEqual([...near.map((c) => Math.hypot(c.x, c.y))].sort((a, b) => a - b));
    expect(near).toHaveLength(3);
  });
});

describe('sparkPoints', () => {
  it('maps values into the padded canvas box', () => {
    expect(sparkPoints([], 100, 20, 0, 1)).toEqual([]);
    const pts = sparkPoints([0, 0.5, 1, 2], 102, 22, 0, 1, 1);
    expect(pts[0]).toEqual([1, 21]);
    expect(pts[1]![1]).toBeCloseTo(11);
    expect(pts[2]).toEqual([67.66666666666667, 1]);
    expect(pts[3]![1]).toBe(1); // clamped
    expect(sparkPoints([5], 10, 10, 5, 5)[0]).toEqual([2, 8]); // zero span is safe
  });
});

describe('drawSparkline', () => {
  it('draws fill + stroke + head marker through the 2D context API', async () => {
    const { drawSparkline } = await import('../src/ui/sparkline');
    const calls: string[] = [];
    const rec = (name: string) => (..._args: unknown[]) => void calls.push(name);
    const ctx = {
      canvas: { width: 320, height: 44 },
      clearRect: rec('clearRect'), beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
      closePath: rec('closePath'), fill: rec('fill'), stroke: rec('stroke'), fillRect: rec('fillRect'),
      createLinearGradient: () => ({ addColorStop: rec('addColorStop') }),
      set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {}, set lineWidth(_v: unknown) {},
      set shadowColor(_v: unknown) {}, set shadowBlur(_v: unknown) {},
    } as unknown as CanvasRenderingContext2D;
    drawSparkline(ctx, [0.1], 0, 1, '#19f0ff');
    expect(calls).toEqual(['clearRect']); // a single sample draws nothing
    calls.length = 0;
    drawSparkline(ctx, [0.1, 0.5, 0.9], 0, 1, '#19f0ff');
    expect(calls.filter((c) => c === 'lineTo').length).toBe(3 + 1 + 2);
    expect(calls).toContain('fill');
    expect(calls).toContain('stroke');
    expect(calls.at(-1)).toBe('fillRect');
  });
});
