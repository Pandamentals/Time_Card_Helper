// Shared setup for the browser tests (see README.md).
const path = require('path');
const { pathToFileURL } = require('url');

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright', '@playwright/test', 'playwright-core'].filter(Boolean);
  for (const name of candidates) { try { return require(name); } catch (e) {} }
  throw new Error('Playwright not found. Run `npm install` in tests/ (or set PLAYWRIGHT_PATH to an installed copy).');
}

const { chromium } = loadPlaywright();
const APP_URL = process.env.APP_URL || pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;   // APP_URL lets you point the suites at another build
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

// Company-wide calendar that ships as the planner default (holidays + the year-end shutdown).
const COMPANY_DAYS = {
  '2026-11-26': { t: 'hol', n: 'Thanksgiving' }, '2026-11-27': { t: 'hol', n: 'Day after Thanksgiving' },
  '2026-12-24': { t: 'hol', n: 'Christmas Eve' }, '2026-12-25': { t: 'hol', n: 'Christmas' },
  '2026-12-28': { t: 'shut', full: true, n: 'Shutdown' }, '2026-12-29': { t: 'shut', full: true, n: 'Shutdown' }, '2026-12-30': { t: 'shut', full: true, n: 'Shutdown' },
  '2026-12-31': { t: 'hol', n: "New Year's Eve" }, '2027-01-01': { t: 'hol', n: "New Year's Day" },
};

// A set-up plan (the test person's own numbers) on top of the company calendar.
function planWith(extraDays = {}, settings = {}) {
  return Object.assign({ rev: 50, start: 15, asOf: '2026-09-30', accrual: 4.62, firstPay: '2026-10-08', cap: 120, hMT: 8.25, hF: 7, end: '2027-09-30', su: 5,
    days: Object.assign({}, COMPANY_DAYS, extraDays) }, settings);
}

// Open the app in a fresh browser context with a pinned clock and (optionally) a stored plan / tab.
async function openApp(browser, { date = '2026-12-02T09:00:00', plan, tab = 'timecard', width = 430, height = 900, reducedMotion, touch = false, pre = {}, hash = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) errors.push(String(e).slice(0, 120)); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());   // tests never need the network
  await page.clock.install({ time: new Date(date) });
  await page.addInitScript(o => {
    try {
      localStorage.setItem('timecard_boot_date', new Date().toISOString().slice(0, 10));   // skip the boot animation
      localStorage.setItem('timecard_tab', o.tab);
      localStorage.setItem('timecard_setup_seen', '1');
      if (o.plan) localStorage.setItem('pto-planner-v1', JSON.stringify(o.plan));
      for (const [k, v] of Object.entries(o.pre)) localStorage.setItem(k, v);
    } catch (e) {}
  }, { tab, plan, pre });
  await page.goto(APP_URL + hash);
  await page.waitForTimeout(150);
  return { ctx, page, errors };
}

// Show a month in the planner calendar (opens the quick-pick list if that month is not on screen).
async function gotoMonth(page, id) {
  if (await page.locator('#ptab-cal[aria-selected="false"]').count()) await page.click('#ptab-cal');
  if (await page.locator(`button.p-day[data-k^="${id}"]`).count()) return;
  if (!(await page.locator('#p-mlist').count())) await page.click('#p-mtoggle');
  await page.click(`.p-mitem[data-month="${id}"]`);
}

// Tiny assertion collector so each suite prints PASS/FAIL lines and exits non-zero on failure.
function suite(title) {
  let pass = 0, fail = 0;
  console.log(`\n=== ${title}`);
  return {
    ok(name, cond, extra = '') { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : '')); },
    done() { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); },
  };
}

module.exports = { chromium, APP_URL, launch, COMPANY_DAYS, planWith, openApp, gotoMonth, suite };
