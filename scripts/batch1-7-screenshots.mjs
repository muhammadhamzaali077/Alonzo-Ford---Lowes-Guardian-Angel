// Batch 1.7 screenshot pass: home (4-row preview), /logs (25 rows + Show
// more), /logs after one Show more click, nav active states. Desktop +
// 375px mobile.

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots-batch1-7';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

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

    console.log(`[${vp.label}] login...`);
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.$eval('input[name="email"]', (el) => { el.value = ''; });
    await page.type('input[name="email"]', 'alonzo@lowesguardianangel.com');
    await page.$eval('input[name="password"]', (el) => { el.value = ''; });
    await page.type('input[name="password"]', 'demo');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    await new Promise((r) => setTimeout(r, 1500));

    // Home — should show 4-row preview + View all flags CTA, then tiles +
    // locations + trend visible without scrolling on desktop.
    console.log(`[${vp.label}] capturing home (above the fold)...`);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: join(OUT, `${vp.label}-01-home-fold.png`), fullPage: false });
    await page.screenshot({ path: join(OUT, `${vp.label}-01b-home-full.png`), fullPage: true });

    // /logs — full 25-row stream + Show more
    console.log(`[${vp.label}] capturing /logs initial...`);
    await page.goto(`${BASE}/logs`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: join(OUT, `${vp.label}-02-logs-initial.png`), fullPage: true });

    // Click "Show more" once and confirm row count grew
    const beforeCount = await page.$$eval('#log-stream li.ga-log-row', (els) => els.length);
    await page.evaluate(() => {
      document.querySelector('#stream-load-more button')?.scrollIntoView({ block: 'center' });
    });
    await new Promise((r) => setTimeout(r, 400));
    const btn = await page.$('#stream-load-more button');
    if (btn) {
      await btn.click();
      await new Promise((r) => setTimeout(r, 1500));
      const afterCount = await page.$$eval('#log-stream li.ga-log-row', (els) => els.length);
      console.log(`[${vp.label}] /logs Show more: ${beforeCount} -> ${afterCount} rows`);
      await page.screenshot({ path: join(OUT, `${vp.label}-03-logs-after-showmore.png`), fullPage: false });
    } else {
      console.log(`[${vp.label}] no Show more button (only ${beforeCount} rows total)`);
    }

    await page.close();
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('done. files in', OUT);
