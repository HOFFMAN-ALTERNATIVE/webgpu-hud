import { stepSpring, type Spring } from '../core/anim';
import { bearing, bitrate, fixed, missionClock, percent } from '../core/format';
import type { Backend, MotionProfile } from '../core/settings';
import { bearingOf, type RadarSim } from '../sim/radar';
import { CHANNELS, TelemetryStream, type ChannelId, type HudEvent } from '../sim/telemetry';
import { drawSparkline } from './sparkline';

const HUES: Record<ChannelId, string> = {
  cpu: '#19f0ff', mem: '#4d7cff', rx: '#3dffc5', tx: '#19f0ff', temp: '#ffc23d', power: '#ff2bd6', signal: '#3dffc5',
};

function formatValue(id: ChannelId, v: number): string {
  const c = CHANNELS.find((x) => x.id === id)!;
  switch (c.unit) {
    case 'ratio': return percent(v);
    case 'bps': return bitrate(v);
    case 'celsius': return `${fixed(v, 1, 5)} °C`;
    case 'kw': return `${fixed(v, 1, 5)} kW`;
    case 'db': return `${fixed(v, 1, 5)} dB`;
  }
}

const el = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`missing ${sel}`);
  return e;
};

/** DOM overlay: crisp text panels over the WebGPU canvas, updated at ~10 Hz. */
export class Overlay {
  private readonly rows = new Map<ChannelId, { value: HTMLElement; bar: HTMLElement; ctx: CanvasRenderingContext2D }>();
  private readonly contactsBody = el<HTMLTableSectionElement>('#contacts tbody');
  private readonly log = el<HTMLOListElement>('#event-log');
  private readonly threatArc = el<SVGCircleElement & HTMLElement>('#threat-arc');
  private readonly threatValue = el('#threat-value');
  private readonly threatLabel = el('#threat-label');
  private readonly clock = el('#clock');
  private readonly fps = el('#fps');
  private readonly sweepEl = el('#sweep-bearing');
  private needle: Spring = { value: 0, velocity: 0 };
  private readonly circumference: number;

  constructor() {
    const list = el('#telemetry-list');
    for (const c of CHANNELS) {
      const li = document.createElement('li');
      li.className = 'tm';
      li.dataset.channel = c.id;
      li.innerHTML = `<div class="tm-head"><span class="tm-label">${c.label}</span><span class="tm-value" data-testid="tm-${c.id}">—</span></div>
        <div class="tm-bar"><i></i></div><canvas width="320" height="44" aria-hidden="true"></canvas>`;
      list.append(li);
      this.rows.set(c.id, {
        value: li.querySelector('.tm-value')!,
        bar: li.querySelector('.tm-bar i')!,
        ctx: li.querySelector('canvas')!.getContext('2d')!,
      });
    }
    this.circumference = 2 * Math.PI * Number(this.threatArc.getAttribute('r'));
    this.threatArc.style.strokeDasharray = `${this.circumference}`;
  }

  setBackend(b: Backend): void {
    const badge = el('#backend');
    badge.textContent = b === 'webgpu' ? 'WEBGPU · WGSL' : 'WEBGL2 · FALLBACK';
    badge.dataset.backend = b;
    document.documentElement.dataset.backend = b;
  }

  setMotion(m: MotionProfile): void {
    document.documentElement.dataset.motion = m.reduced ? 'reduced' : 'full';
    el('#motion-toggle').textContent = m.reduced ? 'MOTION · REDUCED' : 'MOTION · FULL';
    el('#motion-toggle').setAttribute('aria-pressed', String(m.reduced));
  }

  setPaused(p: boolean): void {
    el('#pause-toggle').textContent = p ? 'RESUME' : 'PAUSE';
    el('#pause-toggle').setAttribute('aria-pressed', String(p));
    document.documentElement.dataset.paused = String(p);
  }

  pushEvents(events: readonly HudEvent[]): void {
    for (const e of events) {
      const li = document.createElement('li');
      li.className = `ev ev-${e.severity}`;
      li.innerHTML = `<time>${missionClock(e.t)}</time><b>${e.code}</b><span>${e.message}</span>`;
      this.log.prepend(li);
    }
    while (this.log.children.length > 5) this.log.lastElementChild!.remove();
  }

  update(dt: number, tm: TelemetryStream, radar: RadarSim, fps: number): void {
    for (const c of CHANNELS) {
      const row = this.rows.get(c.id)!;
      const h = tm.history[c.id];
      const v = h.last() ?? c.mean;
      row.value.textContent = formatValue(c.id, v);
      row.bar.style.transform = `scaleX(${Math.min(1, Math.max(0.02, TelemetryStream.normalised(c.id, v))).toFixed(3)})`;
      drawSparkline(row.ctx, h.toArray(), c.min, c.max, HUES[c.id]);
    }

    const rows = radar.nearest(7).map((c) => {
      const d = Math.hypot(c.x, c.y);
      const it = radar.intensity(c);
      return `<tr class="ct ct-${c.cls}"><td><i class="chip"></i>${c.id}</td><td>${c.cls.toUpperCase()}</td>
        <td>${bearing(bearingOf(c.x, c.y))}</td><td>${fixed(d, 1, 5)}</td><td>${fixed(Math.hypot(c.vx, c.vy) * 3600, 0, 4)}</td>
        <td><span class="sig" style="--s:${it.toFixed(2)}"></span></td></tr>`;
    });
    this.contactsBody.innerHTML = rows.join('');

    const threat = radar.threat();
    this.needle = stepSpring(this.needle, threat, 6, dt);
    const n = Math.min(1, Math.max(0, this.needle.value));
    this.threatArc.style.strokeDashoffset = `${this.circumference * (1 - n * 0.75)}`;
    this.threatValue.textContent = percent(threat);
    const level = threat > 0.66 ? 'CRITICAL' : threat > 0.33 ? 'ELEVATED' : 'NOMINAL';
    this.threatLabel.textContent = level;
    document.documentElement.dataset.threat = level.toLowerCase();

    this.clock.textContent = missionClock(tm.time);
    this.fps.textContent = `${fixed(fps, 0, 3)} FPS`;
    this.sweepEl.textContent = bearing(radar.sweep);
  }
}
