// Quick logo-size verification at desktop + 375px on home + /logs.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots-logo-bump';
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

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: join(OUT, `${vp.label}-home.png`), fullPage: false });

    await page.goto(`${BASE}/logs`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: join(OUT, `${vp.label}-logs.png`), fullPage: false });

    // Verify no horizontal overflow at this viewport
    const dims = await page.evaluate(() => ({
      sw: document.body.scrollWidth,
      cw: document.body.clientWidth,
    }));
    console.log(`[${vp.label}] sw=${dims.sw} cw=${dims.cw} overflow=${dims.sw > dims.cw}`);

    await page.close();
    await ctx.close();
  }
} finally {
  await browser.close();
}
