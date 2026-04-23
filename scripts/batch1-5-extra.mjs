// One-shot: capture the rule editor to confirm no version-history UI remains.
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots-batch1';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

const browser = await puppeteer.launch({ headless: true });
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.$eval('input[name="email"]', (el) => { el.value = ''; });
  await page.type('input[name="email"]', 'alonzo@lowesguardianangel.com', { delay: 0 });
  await page.$eval('input[name="password"]', (el) => { el.value = ''; });
  await page.type('input[name="password"]', 'demo', { delay: 0 });
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 2000));

  await page.goto(`${BASE}/rules/copy_paste/edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: join(OUT, 'desktop-05-rule-edit.png'), fullPage: true });

  // Scan the DOM for any "Previous versions" text or /history links.
  const dom = await page.content();
  const hasPrevText = /Previous versions/i.test(dom);
  const hasHistoryHref = /href="[^"]*\/history"/i.test(dom);
  console.log(JSON.stringify({ hasPrevText, hasHistoryHref }));

  await page.close();
  await ctx.close();
} finally {
  await browser.close();
}
