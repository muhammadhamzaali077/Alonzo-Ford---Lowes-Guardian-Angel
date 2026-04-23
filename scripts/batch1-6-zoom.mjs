// Zoom into the locations list on the home page to verify REQ-10
// visually: secondary line should show flag breakdown, not type.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots-batch1-6';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

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

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  // Find the "Locations this week" heading and screenshot it plus the next ~500px.
  const box = await page.evaluate(() => {
    const headings = document.querySelectorAll('h2');
    for (const h of headings) {
      if (h.textContent && h.textContent.includes('Locations this week')) {
        const r = h.getBoundingClientRect();
        return { top: r.top + window.scrollY };
      }
    }
    return null;
  });
  if (!box) { console.log('not found'); process.exit(1); }

  // Capture the locations list by computing its absolute position and
  // taking a full-page screenshot, then cropping via the clip we pass to
  // puppeteer. Clip coords on full-page screenshots are ABSOLUTE document
  // coords, not viewport coords — unlike regular screenshots.
  await page.screenshot({
    path: join(OUT, 'desktop-06-locations-list.png'),
    clip: { x: 0, y: box.top - 30, width: 1440, height: 500 },
    captureBeyondViewport: true,
  });
  console.log('saved locations list zoom');

  // Also drill-down to verify type label.
  await page.goto(`${BASE}/location/LOC002`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: join(OUT, 'desktop-08-drilldown-header.png'), clip: { x: 0, y: 0, width: 1440, height: 400 } });
  console.log('saved drilldown header');

  await page.close();
} finally {
  await browser.close();
}
