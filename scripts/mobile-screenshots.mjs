// 375×667 screenshot run for the demo-readiness audit.
// Not shipped — one-shot script. Run with `node scripts/mobile-screenshots.mjs`
// after `npm install --no-save puppeteer`.

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';

const ROUTES = [
  { name: '01-dashboard',         path: '/' },
  { name: '02-location-riverside', path: '/location/LOC002' },
  { name: '03-rule-edit',         path: '/rules/copy_paste/edit' },
  { name: '04-note-detail',       path: '/note/TLOG000075/1' },
  { name: '05-digest-preview',    path: '/digest/preview' },
  { name: '06-individual-mixed-flags', path: '/location/LOC002/angel/ANG007/individual/IND004' },
];

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: { width: 375, height: 667, deviceScaleFactor: 2 },
});

try {
  const page = await browser.newPage();

  // Log in once (session cookie persists across navigations in this page).
  // External CDN scripts (Tailwind Play, htmx) make networkidle0 flaky, so we
  // just wait on DOMContentLoaded and give Tailwind a moment to paint.
  console.log('logging in...');
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((res) => setTimeout(res, 800));
  await page.$eval('input[name="email"]', (el) => { el.value = ''; });
  await page.type('input[name="email"]', 'alonzo@lowesguardianangel.com', { delay: 0 });
  await page.$eval('input[name="password"]', (el) => { el.value = ''; });
  await page.type('input[name="password"]', 'demo', { delay: 0 });
  await page.click('button[type="submit"]');
  await new Promise((res) => setTimeout(res, 2000)); // login redirect + first dashboard paint

  for (const r of ROUTES) {
    console.log('→', r.path);
    await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Give Tailwind Play + count-up + sparklines a moment to settle.
    await new Promise((res) => setTimeout(res, 1500));
    const file = join(OUT, `${r.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const dims = await page.evaluate(() => {
      const body = document.body;
      return {
        scrollWidth: body.scrollWidth,
        clientWidth: body.clientWidth,
        scrollHeight: body.scrollHeight,
        hasHorizScroll: body.scrollWidth > body.clientWidth,
      };
    });
    console.log('  saved', file, JSON.stringify(dims));
  }
} finally {
  await browser.close();
}
