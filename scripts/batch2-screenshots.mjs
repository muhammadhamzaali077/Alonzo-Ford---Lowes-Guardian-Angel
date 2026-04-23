// Batch 2 screenshot pass: drill-down (location + angel + individual),
// note detail, rules editor (simplified). Desktop + 375px mobile.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots-batch2';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

const ROUTES = [
  { name: '01-location-riverside',  path: '/location/LOC002' },
  { name: '02-angel-jamal',          path: '/location/LOC002/angel/ANG007' },
  { name: '03-individual-mixed',     path: '/location/LOC002/angel/ANG007/individual/IND004' },
  { name: '04-note-detail',          path: '/note/TLOG000075/1' },
  { name: '05-rule-edit-copypaste',  path: '/rules/copy_paste/edit' },
  { name: '06-rule-edit-shortnote',  path: '/rules/short_note/edit' },
  { name: '07-rules-list',           path: '/rules' },
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
