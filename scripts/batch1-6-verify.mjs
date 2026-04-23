// Close-in verification: locations list secondary line (REQ-10) +
// rule-editor "Previous versions" audit (REQ-6, unchanged) + stream
// show-more click (REQ-2 AC-2.5).

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'C:/Users/DELL/AppData/Local/Temp/ga-shots-batch1-6';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

const browser = await puppeteer.launch({ headless: true });
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // Log in once
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.type('input[name="email"]', 'alonzo@lowesguardianangel.com', { delay: 0 });
  await page.$eval('input[name="password"]', (el) => { el.value = ''; });
  await page.type('input[name="password"]', 'demo', { delay: 0 });
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Home page full-page + scroll to locations list section
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));

  // Scroll to "Locations this week" heading and screenshot just that area
  const locBox = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h2')).find((el) => /Locations this week/i.test(el.textContent ?? ''));
    if (!h) return null;
    const ul = h.nextElementSibling;
    const rect = ul?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y + window.scrollY, w: rect.width, h: rect.height } : null;
  });

  if (locBox) {
    await page.evaluate((y) => window.scrollTo(0, y - 20), locBox.y);
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({
      path: join(OUT, 'desktop-06-locations-list.png'),
      clip: { x: 0, y: 0, width: 1440, height: Math.min(600, locBox.h + 100) },
    });
  }

  // 2. Audit DOM for REQ-10 compliance: no location-type strings on home
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const req10 = await page.evaluate(() => {
    const text = document.body.textContent ?? '';
    // Scope the check: the "Locations this week" <ul> should not contain
    // any of the type strings. Other sections (welcome banner, stream
    // note previews) may legitimately contain those words.
    const h = Array.from(document.querySelectorAll('h2')).find((el) => /Locations this week/i.test(el.textContent ?? ''));
    const ul = h?.nextElementSibling;
    const scoped = ul?.textContent ?? '';
    return {
      hasGroupHomeInLocationsList: /group home/i.test(scoped),
      hasHostHomeInLocationsList: /host home/i.test(scoped),
      hasDayProgramInLocationsList: /day program/i.test(scoped),
      hasFlagBreakdown: /\d+ red\b/i.test(scoped) || /No flags this week/i.test(scoped),
    };
  });
  console.log('REQ-10 audit:', JSON.stringify(req10));

  // 3. Stream audit: counter present, 25 rows, hx-trigger + hx-get present
  const streamAudit = await page.evaluate(() => {
    const section = document.getElementById('log-stream');
    if (!section) return { error: 'no #log-stream element' };
    const rows = section.querySelectorAll('li.ga-log-row');
    const counter = section.querySelector('.ga-caption')?.textContent?.trim();
    return {
      rowCount: rows.length,
      counter,
      hxTrigger: section.getAttribute('hx-trigger'),
      hxGet: section.getAttribute('hx-get'),
      hxSwap: section.getAttribute('hx-swap'),
      showMoreBtnHref: document.querySelector('#stream-load-more button')?.getAttribute('hx-get') ?? null,
    };
  });
  console.log('Stream audit:', JSON.stringify(streamAudit));

  // 4. Background gradient audit: body should have a radial-gradient
  //    background-image
  const bgAudit = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return {
      bgImage: cs.backgroundImage.slice(0, 80),
      bgAttachment: cs.backgroundAttachment,
    };
  });
  console.log('BG audit:', JSON.stringify(bgAudit));

  // 5. Click "Show more" and verify additional rows appended
  await page.evaluate(() => {
    document.querySelector('#stream-load-more button')?.scrollIntoView({ block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 500));
  const btn = await page.$('#stream-load-more button');
  if (btn) {
    await btn.click();
    await new Promise((r) => setTimeout(r, 1500));
    const afterClick = await page.evaluate(() => {
      const rows = document.querySelectorAll('#log-stream li.ga-log-row');
      return { rowCount: rows.length };
    });
    console.log('After Show more click:', JSON.stringify(afterClick));
    await page.screenshot({
      path: join(OUT, 'desktop-07-after-showmore.png'),
      fullPage: false,
    });
  }

  // 6. Drill-down page to verify type label STILL shows there (REQ-10 AC-10.4)
  await page.goto(`${BASE}/location/LOC002`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const drillAudit = await page.evaluate(() => {
    const h = document.querySelector('h1')?.textContent ?? '';
    const body = document.body.textContent ?? '';
    return {
      h1: h,
      bodyMentionsGroupHome: /group home/i.test(body),
    };
  });
  console.log('Drilldown type-label audit:', JSON.stringify(drillAudit));
  await page.screenshot({ path: join(OUT, 'desktop-08-drilldown-header.png'), fullPage: false });

  await page.close();
  await ctx.close();
} finally {
  await browser.close();
}
