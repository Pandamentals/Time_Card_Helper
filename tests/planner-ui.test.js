// Planner navigation: month pager, quick-pick list, swipe, sub-tabs, red-month markers
const { APP_URL, launch } = require('./helpers');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (x ? '  [' + x + ']' : '')); };
const plan = { rev: 50, start: 15, asOf: '2026-09-30', accrual: 4.62, firstPay: '2026-10-08', cap: 120, hMT: 8.25, hF: 7, end: '2027-09-30', su: 5,
  days: { '2026-12-08': { t: 'pto', full: true, u: 9 }, '2026-11-26': { t: 'hol', n: 'Thanksgiving' }, '2026-12-28': { t: 'shut', full: true, n: 'Shutdown' }, '2026-12-29': { t: 'shut', full: true, n: 'Shutdown' }, '2026-12-30': { t: 'shut', full: true, n: 'Shutdown' }, '2027-01-01': { t: 'hol', n: "New Year's Day" },
    '2027-02-16': { t: 'pto', full: true, u: 9 }, '2027-02-17': { t: 'pto', full: true, u: 9 }, '2027-02-18': { t: 'pto', full: true, u: 9 }, '2027-02-19': { t: 'pto', h: 7, u: 9 } } };
(async () => {
  const b = await launch();
  const mk = async (w = 390) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) errs.push(String(e).slice(0, 100)); });
    await page.route(/fonts\./, r => r.abort());
    await page.clock.install({ time: new Date('2026-12-02T09:00:00') });
    await page.addInitScript(p => { try { localStorage.setItem('timecard_boot_date', new Date().toISOString().slice(0, 10)); localStorage.setItem('timecard_tab', 'pto'); localStorage.setItem('timecard_setup_seen', '1'); localStorage.setItem('pto-planner-v1', JSON.stringify(p)); } catch (e) {} }, plan);
    await page.goto(APP_URL); await page.waitForTimeout(150);
    return { ctx, page, errs };
  };
  const { ctx, page, errs } = await mk();
  const st = () => page.evaluate(() => ({ title: document.querySelector('.p-pname span').textContent, months: document.querySelectorAll('.p-month').length, listOpen: !!document.getElementById('p-mlist'), exp: document.getElementById('p-mtoggle').getAttribute('aria-expanded'), items: document.querySelectorAll('.p-mitem:not(.p-mnow)').length, h: document.documentElement.scrollHeight, hasStrip: !!document.querySelector('.p-strip,.p-bar') }));

  let s = await st();
  ok('strip is gone; one month on screen, list closed', s.title === 'DECEMBER 2026' && s.months === 1 && !s.listOpen && !s.hasStrip && s.exp === 'false', JSON.stringify(s));
  console.log('      page height:', s.h, 'px (old 12-month layout ~4554)');
  ok('arrows still step the month', await (async () => { await page.click('[data-page="1"]'); const t = (await st()).title; await page.click('[data-page="-1"]'); return t === 'JANUARY 2027' && (await st()).title === 'DECEMBER 2026'; })());

  // the new button
  await page.click('#p-mtoggle'); s = await st();
  ok('▾ button opens the month list (12 months)', s.listOpen && s.items === 12 && s.exp === 'true');
  ok('list: current month is marked selected, focus moves into it', await page.evaluate(() => document.querySelector('.p-mitem.sel').dataset.month === '2026-12' && document.activeElement.classList.contains('p-mitem')));
  ok('list: no TODAY item while already on the current month', await page.locator('.p-mnow').count() === 0);
  const items = await page.evaluate(() => [...document.querySelectorAll('.p-mitem:not(.p-mnow)')].map(i => ({ m: i.dataset.month, neg: !!i.querySelector('b.neg'), dip: !!i.querySelector('b em'), label: i.getAttribute('aria-label') })));
  ok('list: a month that dips below zero is flagged (Feb, even though it ends positive)', items.find(i => i.m === '2027-02').dip && !items.find(i => i.m === '2027-02').neg && /goes below zero/.test(items.find(i => i.m === '2027-02').label), JSON.stringify(items.find(i => i.m === '2027-02')));

  // jump Dec -> Feb -> Jan -> Sep, one tap each
  await page.click('.p-mitem[data-month="2027-02"]'); s = await st();
  ok('quick select: Dec -> Feb in one tap, list closes', s.title === 'FEBRUARY 2027' && !s.listOpen && s.exp === 'false');
  ok('quick select: focus returns to the ▾ button', await page.evaluate(() => document.activeElement.id) === 'p-mtoggle');
  ok('title does not wrap onto a second line', await page.evaluate(() => { const e = document.querySelector('.p-pname span'); return e.getBoundingClientRect().height < parseFloat(getComputedStyle(e).fontSize) * 1.6; }));
  await page.click('#p-mtoggle'); ok('TODAY item appears away from the current month', await page.locator('.p-mnow').count() === 1);
  await page.click('.p-mnow'); ok('TODAY item returns to December', (await st()).title === 'DECEMBER 2026');
  await page.click('#p-mtoggle'); await page.click('.p-mitem[data-month="2027-09"]');
  ok('far jump: Dec -> Sep in one tap, › disabled', (await st()).title === 'SEPTEMBER 2027' && await page.locator('[data-page="1"][disabled]').count() === 1);

  // dismiss paths
  await page.click('#p-mtoggle'); await page.click('#p-mtoggle');
  ok('tapping ▾ again closes the list without changing month', !(await st()).listOpen && (await st()).title === 'SEPTEMBER 2027');
  await page.click('#p-mtoggle'); await page.keyboard.press('Escape');
  ok('Escape closes the list and returns focus to ▾', !(await st()).listOpen && await page.evaluate(() => document.activeElement.id) === 'p-mtoggle');
  await page.click('#p-mtoggle'); await page.click('[data-page="-1"]');
  ok('using an arrow also closes the list', !(await st()).listOpen && (await st()).title === 'AUGUST 2027');
  await page.click('#p-mtoggle'); await page.click('#ptab-set'); await page.click('#ptab-cal');
  ok('switching sub-tabs closes the list; month remembered', !(await st()).listOpen && (await st()).title === 'AUGUST 2027');

  // keyboard
  await page.focus('#p-mtoggle'); await page.keyboard.press('Enter');
  ok('keyboard: Enter on ▾ opens the list', (await st()).listOpen);
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  ok('keyboard: Tab to an item + Enter selects it', !(await st()).listOpen);

  // narrow screen: no wrapping, list readable
  const n = await mk(360);
  await n.page.click('#p-mtoggle'); await n.page.click('.p-mitem[data-month="2027-02"]');
  ok('360px wide: FEBRUARY 2027 + ▾ + arrows fit on one line', await n.page.evaluate(() => { const r = document.querySelector('.p-pager').getBoundingClientRect(); const sp = document.querySelector('.p-pname span').getBoundingClientRect(); return r.height < 60 && sp.height < 34; }));
  await n.page.click('#p-mtoggle');
  ok('360px wide: list items do not overflow their cells', await n.page.evaluate(() => [...document.querySelectorAll('.p-mitem')].every(i => i.scrollWidth <= i.clientWidth + 1)));
  await n.ctx.close();

  // day dialog still works from a list-selected month
  await page.click('#p-mtoggle'); await page.click('.p-mitem[data-month="2027-03"]');
  await page.click('button.p-day[data-k="2027-03-10"]'); await page.click('[data-act="full"]');
  ok('editing a day in a list-selected month works', await page.locator('button.p-day[data-k="2027-03-10"].pto').count() === 1);
  ok('no page errors', errs.length === 0, errs.join('|'));
  await ctx.close(); await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
