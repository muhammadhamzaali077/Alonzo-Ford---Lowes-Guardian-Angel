// Batch 3 verification screenshots: admin org screens (settings hub +
// each list view + one form + one delete-confirm), upload page, digest
// preview, login. Desktop + 375px mobile.

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots-batch3';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

// Pre-auth pass for the login screen
const PRE_AUTH_ROUTES = [
  { name: '00-login', path: '/auth/login' },
];

// Authenticated pass
const ROUTES = [
  { name: '01-settings-hub',         path: '/admin/org' },
  { name: '02-locations-list',       path: '/admin/locations' },
  { name: '03-location-edit',        path: '/admin/locations/LOC002/edit' },
  { name: '04-location-delete',      path: '/admin/locations/LOC002/delete' },
  { name: '05-angels-list',          path: '/admin/angels' },
  { name: '06-individuals-list',     path: '/admin/individuals' },
  { name: '07-managers-list',        path: '/admin/managers' },
  { name: '08-recipients-list',      path: '/admin/recipients' },
  { name: '09-shift-schedules',      path: '/admin/shift-schedules' },
  { name: '10-ops-list',             path: '/admin/ops' },
  { name: '11-upload',               path: '/admin/upload' },
  { name: '12-digest-preview',       path: '/digest/preview' },
];

const VIEWPORTS = [
  { label: 'desktop', w: 1440, h: 900, ds: 1 },
  { label: 'mobile', w: 375, h: 667, ds: 2 },
];

const browser = await puppeteer.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.ds });

    // Pre-auth screenshots (login page) — capture before signing in.
    for (const r of PRE_AUTH_ROUTES) {
      console.log(`[${vp.label}] pre-auth → ${r.path}`);
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise((rs) => setTimeout(rs, 1500));
      await page.screenshot({ path: join(OUT, `${vp.label}-${r.name}.png`), fullPage: false });
    }

    console.log(`[${vp.label}] login...`);
    await page.$eval('input[name="email"]', (el) => { el.value = ''; });
    await page.type('input[name="email"]', 'alonzo@lowesguardianangel.com');
    await page.$eval('input[name="password"]', (el) => { el.value = ''; });
    await page.type('input[name="password"]', 'demo');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    await new Promise((r) => setTimeout(r, 1500));

    for (const r of ROUTES) {
      console.log(`[${vp.label}] → ${r.path}`);
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise((rs) => setTimeout(rs, 1500));
      await page.screenshot({ path: join(OUT, `${vp.label}-${r.name}.png`), fullPage: true });
    }

    await page.close();
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('done. files in', OUT);
