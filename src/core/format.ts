/** Fixed-width formatters so HUD numbers don't jitter horizontally. */

export const pad = (n: number, width: number): string => String(Math.trunc(Math.abs(n))).padStart(width, '0');

export function bearing(rad: number): string {
  const deg = ((rad * 180) / Math.PI) % 360;
  return `${pad((deg + 360) % 360, 3)}°`;
}

export function fixed(v: number, digits = 1, width = 0): string {
  const s = (Number.isFinite(v) ? v : 0).toFixed(digits);
  return width > 0 ? s.padStart(width, '\u2007') : s; // figure space keeps columns aligned
}

export function percent(v01: number): string {
  return `${fixed(Math.min(100, Math.max(0, v01 * 100)), 0, 3)}%`;
}

const UNITS = ['b/s', 'kb/s', 'Mb/s', 'Gb/s', 'Tb/s'];

export function bitrate(bitsPerSecond: number): string {
  let v = Math.max(0, bitsPerSecond);
  let i = 0;
  while (v >= 1000 && i < UNITS.length - 1) {
    v /= 1000;
    i++;
  }
  return `${fixed(v, v < 10 ? 2 : v < 100 ? 1 : 0)} ${UNITS[i]}`;
}

/** Mission clock: T+HH:MM:SS.cc */
export function missionClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `T+${pad(h, 2)}:${pad(m, 2)}:${pad(sec, 2)}.${pad(cs, 2)}`;
}
