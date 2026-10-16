/* eslint-disable no-console */
// Regenerates docs/preview.png from a running `npm run preview`.
//   node scripts/screenshot.mjs [url] [out.png] [settle-ms]
import { chromium } from '@playwright/test';

const [url = 'http://localhost:4791/?seed=hx7', out = 'docs/preview.png', settle = '6000'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForFunction(() => window.__HUD__?.ready, null, { timeout: 60_000 });
await page.waitForTimeout(Number(settle));
console.log(JSON.stringify(await page.evaluate(() => window.__HUD__)));
await page.screenshot({ path: out });
await browser.close();
