// Batch 1 / 1.5 shell-verification screenshots: login + dashboard + rules
// at desktop (1440×900) and 375×667 mobile. One-shot — not shipped.
// Run: npm install --no-save puppeteer && node scripts/batch1-screenshots.mjs

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots-batch1';
mkdirSync(OUT, { recursive: true });

const CAPTURE_RULES = true;
const CAPTURE_DIGEST = true;

const BASE = 'http://localhost:3000';

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { label: 'mobile', width: 375, height: 667, deviceScaleFactor: 2 },
];

const browser = await puppeteer.launch({ headless: true });

try {
  for (const vp of VIEWPORTS) {
    // Isolated context per viewport so session cookies don't leak
    // between iterations (desktop login would otherwise auto-redirect
    // the mobile pass away from /auth/login).
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor });

    // Login page (pre-auth) — captures full-bleed dark theme + logo placeholder
    console.log(`[${vp.label}] capturing login...`);
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: join(OUT, `${vp.label}-01-login.png`), fullPage: false });

    // Sign in
    console.log(`[${vp.label}] logging in...`);
    await page.$eval('input[name="email"]', (el) => { el.value = ''; });
    await page.type('input[name="email"]', 'alonzo@lowesguardianangel.com', { delay: 0 });
    await page.$eval('input[name="password"]', (el) => { el.value = ''; });
    await page.type('input[name="password"]', 'demo', { delay: 0 });
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 2000));

    // Dashboard — captures header + data-bar + shell
    console.log(`[${vp.label}] capturing dashboard...`);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: join(OUT, `${vp.label}-02-dashboard.png`), fullPage: false });

    // Full-page dashboard screenshot to see the whole thing
    await page.screenshot({ path: join(OUT, `${vp.label}-02b-dashboard-full.png`), fullPage: true });

    if (CAPTURE_RULES) {
      console.log(`[${vp.label}] capturing rules list...`);
      await page.goto(`${BASE}/rules`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1500));
      await page.screenshot({ path: join(OUT, `${vp.label}-03-rules.png`), fullPage: true });
    }

    if (CAPTURE_DIGEST) {
      console.log(`[${vp.label}] capturing digest preview...`);
      await page.goto(`${BASE}/digest/preview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1500));
      await page.screenshot({ path: join(OUT, `${vp.label}-04-digest.png`), fullPage: false });
    }

    const dims = await page.evaluate(() => ({
      sw: document.body.scrollWidth,
      cw: document.body.clientWidth,
      overflow: document.body.scrollWidth > document.body.clientWidth,
    }));
    console.log(`[${vp.label}] dims ${JSON.stringify(dims)}`);

    await page.close();
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('done. files in', OUT);
