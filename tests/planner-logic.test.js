// PTO planner math: payday accrual, PTO cost (8.25 Mon-Thu, 7.00 Fri), free holidays, part-day PTO,
// the Jan 1 rollover cap, overdraw warnings, and the setMode/getMode contract the timecard relies on.
const { launch, planWith, openApp, gotoMonth, suite } = require('./helpers');
const t = suite('Planner logic');

(async () => {
  const b = await launch();
  const tile = async (page, label) => page.evaluate(l => { const el = [...document.querySelectorAll('.p-stat')].find(s => s.querySelector('.k').textContent.toLowerCase() === l); return el ? { v: el.querySelector('.v').textContent, n: el.querySelector('.n').textContent, cls: el.className } : null; }, label);
  const cellBal = (page, k) => page.evaluate(d => { const el = document.querySelector(`button.p-day[data-k="${d}"]`); return el ? el.getAttribute('aria-label') : null; }, k);

  // projection: 15.00 on Sep 30 + paydays Oct 8, Oct 22, Nov 5, Nov 19 (4 x 4.62) = 33.48 on Dec 2
  let a = await openApp(b, { plan: planWith(), tab: 'pto' });
  let x = await tile(a.page, 'balance today');
  t.ok('balance today = start + paydays so far (15.00 + 4 x 4.62)', x.v === '33.48H', JSON.stringify(x));
  await gotoMonth(a.page, '2026-12');
  t.ok('a payday adds the accrual (Dec 3: 33.48 + 4.62 = 38.10)', /balance 38\.10 hours/.test(await cellBal(a.page, '2026-12-03')));
  t.ok('paydays fall every other Thursday (Dec 3, 17, 31 yes; Dec 10, 24 no)', await a.page.evaluate(() => ['2026-12-03', '2026-12-17', '2026-12-31'].every(k => document.querySelector(`button.p-day[data-k="${k}"] .p-pay`)) && ['2026-12-10', '2026-12-24'].every(k => !document.querySelector(`button.p-day[data-k="${k}"] .p-pay`))));
  t.ok('holiday costs nothing (Thanksgiving)', await (async () => { await gotoMonth(a.page, '2026-11'); const h = await cellBal(a.page, '2026-11-26'); const prev = await cellBal(a.page, '2026-11-25'); return /HOL/.test(h) && /balance 33\.48 hours/.test(h) && /balance 33\.48 hours/.test(prev); })());
  t.ok('company shutdown days cost PTO (3 x 8.25 = 24.75 from the Dec 17 balance)', await (async () => { await gotoMonth(a.page, '2026-12'); const a28 = await cellBal(a.page, '2026-12-28'); return /-8\.25/.test(a28); })());
  t.ok('Dec 31 balance = 15.00 + 7 paydays (32.34) - shutdown (24.75) = 22.59', (await tile(a.page, 'dec 31 balance')).v === '22.59H', (await tile(a.page, 'dec 31 balance')).v);
  await a.ctx.close();

  // PTO cost depends on the weekday
  a = await openApp(b, { plan: planWith({ '2026-12-08': { t: 'pto', full: true, u: 9 }, '2026-12-11': { t: 'pto', full: true, u: 9 } }), tab: 'pto' });
  await gotoMonth(a.page, '2026-12');
  t.ok('Tue full day costs 8.25 (Dec 8 balance 29.85)', /balance 29\.85 hours/.test(await cellBal(a.page, '2026-12-08')));
  t.ok('Fri full day costs 7.00 (Dec 11 balance 22.85)', /balance 22\.85 hours/.test(await cellBal(a.page, '2026-12-11')));
  await a.ctx.close();
  a = await openApp(b, { plan: planWith({ '2026-12-08': { t: 'pto', h: 4.13, u: 9 } }), tab: 'pto' });
  await gotoMonth(a.page, '2026-12');
  t.ok('part-day PTO costs exactly its hours (Dec 3: 38.10 - 4.13 = 33.97)', /balance 33\.97 hours/.test(await cellBal(a.page, '2026-12-08')) && /-4\.13/.test(await a.page.locator('button.p-day[data-k="2026-12-08"] .p-tag').textContent()));
  await a.ctx.close();

  // Jan 1 rollover cap
  a = await openApp(b, { plan: planWith({}, { start: 200 }), tab: 'pto' });
  x = await tile(a.page, 'dec 31 balance');
  t.ok('balance above the cap on Dec 31 is flagged as lost on Jan 1', /OVER THE 120\.00H CAP, LOST JAN 1/.test(x.n) && /warn/.test(x.cls), x.n);
  await gotoMonth(a.page, '2027-01');
  t.ok('Jan 1 shows the CAP marker and the balance drops to the cap', await a.page.locator('button.p-day[data-k="2027-01-01"] .p-cap').count() === 1 && /balance 120\.00 hours/.test(await cellBal(a.page, '2027-01-01')), await cellBal(a.page, '2027-01-01'));
  await a.ctx.close();
  a = await openApp(b, { plan: planWith(), tab: 'pto' });
  t.ok('under the cap: no loss warning', /UNDER THE 120\.00H ROLLOVER CAP/.test((await tile(a.page, 'dec 31 balance')).n));
  await a.ctx.close();

  // overdraw
  a = await openApp(b, { plan: planWith({}, { start: 3, accrual: 1 }), tab: 'pto' });
  x = await tile(a.page, 'lowest point');
  t.ok('a plan that goes below zero shows OVERDRAWN on the lowest-point tile', /OVERDRAWN/.test(x.n) && /bad/.test(x.cls) && x.v.startsWith('-'), JSON.stringify(x));
  await gotoMonth(a.page, '2026-12');
  t.ok('days below zero are outlined', await a.page.locator('button.p-day.neg').count() > 0);
  await a.ctx.close();

  // setMode / getMode: the contract the timecard depends on (every seeded day type, any order of toggles)
  a = await openApp(b, { plan: planWith({ '2026-10-14': { t: 'pto', h: 4, u: 9 } }), tab: 'pto' });
  const bad = await a.page.evaluate(() => {
    const fails = [], seeds = { '2026-11-26': 'holiday', '2026-12-28': 'shutdown', '2026-10-14': 'part-day PTO', '2026-10-20': 'plain day' };
    for (const [k, label] of Object.entries(seeds)) for (const m of ['pto', 'hol', 'none', 'pto', 'none', 'hol', 'none']) {
      PTO.setMode(k, m); const g = PTO.getMode(k).mode;
      const ok = m === 'none' ? (g === 'none' || g === 'off') : g === m;
      if (!ok) fails.push(`${label} ${k}: set ${m} -> ${g}`);
    }
    return fails;
  });
  t.ok('setMode/getMode round-trips for holiday, shutdown, part-day and plain days', bad.length === 0, bad.join('; '));
  t.ok('turning a seeded holiday off means "working that day" (name kept)', await a.page.evaluate(() => { PTO.setMode('2026-11-26', 'none'); const g = PTO.getMode('2026-11-26'); return g.mode === 'none' && g.working === true && g.name === 'Thanksgiving'; }));
  t.ok('turning a shutdown day off leaves it unpaid', await a.page.evaluate(() => { PTO.setMode('2026-12-29', 'none'); return PTO.getMode('2026-12-29').mode === 'off'; }));
  t.ok('no page errors', a.errors.length === 0, a.errors.join('|'));
  await a.ctx.close();

  await b.close(); t.done();
})();
