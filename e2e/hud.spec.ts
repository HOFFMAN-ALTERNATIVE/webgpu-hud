import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

interface Hud {
  ready: boolean;
  backend: 'webgpu' | 'webgl2' | null;
  frames: number;
  tier: string;
  motion: 'full' | 'reduced';
  error: string | null;
}

const hud = (page: Page) => page.evaluate(() => (window as unknown as { __HUD__: Hud }).__HUD__);

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`./${query}`);
  await page.waitForFunction(() => (window as unknown as { __HUD__?: Hud }).__HUD__?.ready === true, null, { timeout: 45_000 });
  return errors;
}

/** Decodes a canvas screenshot and summarises what was actually rendered. */
async function canvasStats(page: Page) {
  const png = PNG.sync.read(await page.locator('canvas#gl').screenshot());
  let lit = 0;
  let cyan = 0;
  let magenta = 0;
  let centre = 0;
  let corners = 0;
  const { width: w, height: h, data } = png;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 40) lit++;
      if (g > 120 && b > 120 && r < 120) cyan++;
      if (r > 140 && b > 120 && g < 110) magenta++;
      const inCentre = Math.abs(x - w / 2) < w * 0.15 && Math.abs(y - h / 2) < h * 0.2;
      const inCorner = (x < w * 0.08 || x > w * 0.92) && y < h * 0.12;
      if (inCentre) centre += lum;
      if (inCorner) corners += lum;
    }
  }
  const samples = (w / 2) * (h / 2);
  return { litRatio: lit / samples, cyan, magenta, centreBrighter: centre > corners * 2, png };
}

test('boots, falls back to WebGL 2 when WebGPU is unavailable, and renders the scene', async ({ page }) => {
  const errors = await open(page);
  const state = await hud(page);
  expect(state.error).toBeNull();
  expect(['webgpu', 'webgl2']).toContain(state.backend);
  await expect(page.getByTestId('backend')).toHaveText(state.backend === 'webgpu' ? 'WEBGPU · WGSL' : 'WEBGL2 · FALLBACK');

  const s = await canvasStats(page);
  expect(s.litRatio, 'canvas should not be blank').toBeGreaterThan(0.02);
  expect(s.cyan, 'cyan HUD elements rendered').toBeGreaterThan(500);
  expect(s.magenta, 'magenta accents (rings / particles) rendered').toBeGreaterThan(5);
  expect(s.centreBrighter, 'radar + hologram in the centre of the frame').toBe(true);
  expect(errors).toEqual([]);
});

test('forced WebGL 2 backend via ?renderer=webgl', async ({ page }) => {
  await open(page, '?renderer=webgl');
  expect((await hud(page)).backend).toBe('webgl2');
  expect((await canvasStats(page)).litRatio).toBeGreaterThan(0.02);
});

test('animates: frames advance and the image changes over time', async ({ page }) => {
  await open(page, '?seed=e2e');
  const a = await canvasStats(page);
  const f0 = (await hud(page)).frames;
  await expect.poll(async () => (await hud(page)).frames, { timeout: 20_000 }).toBeGreaterThan(f0 + 5);
  const b = await canvasStats(page);
  let diff = 0;
  for (let i = 0; i < a.png.data.length; i += 16) if (Math.abs(a.png.data[i]! - b.png.data[i]!) > 24) diff++;
  expect(diff, 'sweep / particles / hologram should move').toBeGreaterThan(200);
});

test('telemetry panels are fed by the simulated stream', async ({ page }) => {
  await open(page, '?seed=e2e');
  await expect(page.getByTestId('contacts').locator('tr')).toHaveCount(7);
  await expect(page.getByTestId('tm-cpu')).toHaveText(/^\s*\d{1,3}%$/);
  await expect(page.getByTestId('tm-rx')).toHaveText(/b\/s$/);
  await expect(page.getByTestId('threat')).toHaveText(/\d+%/);
  const clock0 = await page.getByTestId('clock').textContent();
  await expect.poll(() => page.getByTestId('clock').textContent(), { timeout: 20_000 }).not.toBe(clock0);
  await expect(page.locator('#telemetry-list canvas')).toHaveCount(7);
});

test('pause freezes the simulation clock; space bar resumes', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'PAUSE' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-paused', 'true');
  await page.waitForTimeout(400);
  const t = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('clock')).toHaveText(t!);
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-paused', 'false');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('respects prefers-reduced-motion and can be toggled', async ({ page }) => {
    await open(page);
    expect((await hud(page)).motion).toBe('reduced');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await expect(page.locator('.fx-scan')).toBeHidden();
    const btn = page.locator('#motion-toggle');
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await btn.click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
    await page.keyboard.press('m');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  });
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('panels move below the radar and the scene stays visible', async ({ page }) => {
    await open(page);
    for (const sel of ['.left', '.right']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box.y, `${sel} should sit in the lower part of the screen`).toBeGreaterThan(844 * 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    await expect(page.locator('.bottom')).toBeHidden();
    expect((await canvasStats(page)).litRatio).toBeGreaterThan(0.02);
  });
});
