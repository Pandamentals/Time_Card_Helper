// PTO planner math: payday accrual, PTO cost (8.25 Mon-Thu, 7.00 Fri), free holidays, part-day PTO,
// the Jan 1 rollover cap, overdraw warnings, and the setMode/getMode contract the timecard relies on.
const { launch, planWith, openApp, gotoMonth, suite } = require('./helpers');
const t = suite('Planner logic');

(async () => {
  const b = await launch();
  const tile = async (page, label) => page.evaluate(l => { const el = [...document.querySelectorAll('.p-stat')].find(s => s.querySelector('.k').firstChild.textContent.toLowerCase() === l); return el ? { v: el.querySelector('.v').textContent, n: (el.querySelector('.n') || el.querySelector('.p-tip')).textContent, cls: el.className } : null; }, label);
  const cellBal = (page, k) => page.evaluate(d => { const el = document.querySelector(`button.p-day[data-k="${d}"]`); return el ? el.getAttribute('aria-label') : null; }, k);

  // projection: 15.00 on Sep 30 + paydays Oct 8, Oct 22, Nov 5, Nov 19 (4 x 4.62) = 33.48 on Dec 2
  let a = await openApp(b, { plan: planWith(), tab: 'pto' });
  let x = await tile(a.page, 'net balance');
  t.ok('net balance = start + paydays so far (15.00 + 4 x 4.62; shutdown not taken out ahead)', x.v === '33.48H', JSON.stringify(x));
  const tipText = () => a.page.evaluate(() => document.getElementById('p-tip-net').textContent);
  t.ok('net balance details are hidden until asked for', await a.page.locator('#p-tip-net').isHidden());
  await a.page.hover('#p-info');
  t.ok('hovering the info mark shows the tip, incl. what to keep for the shutdown (3 x 8.00)', await a.page.locator('#p-tip-net').isVisible() && /KEEP 24\.00H FOR SHUTDOWN/.test(await tipText()), await tipText());
  await a.page.mouse.move(0, 0);
  await a.page.click('#p-info'); await a.page.mouse.move(0, 0);
  t.ok('tapping the info mark keeps the tip open (touch screens)', await a.page.locator('#p-tip-net').isVisible());
  await gotoMonth(a.page, '2026-12');
  t.ok('a payday adds the accrual (Dec 3: 33.48 + 4.62 = 38.10)', /balance 38\.10 hours/.test(await cellBal(a.page, '2026-12-03')));
  t.ok('paydays fall every other Thursday (Dec 3, 17, 31 yes; Dec 10, 24 no)', await a.page.evaluate(() => ['2026-12-03', '2026-12-17', '2026-12-31'].every(k => document.querySelector(`button.p-day[data-k="${k}"] .p-pay`)) && ['2026-12-10', '2026-12-24'].every(k => !document.querySelector(`button.p-day[data-k="${k}"] .p-pay`))));
  t.ok('holiday costs nothing (Thanksgiving)', await (async () => { await gotoMonth(a.page, '2026-11'); const h = await cellBal(a.page, '2026-11-26'); const prev = await cellBal(a.page, '2026-11-25'); return /HOL/.test(h) && /balance 33\.48 hours/.test(h) && /balance 33\.48 hours/.test(prev); })());
  t.ok('company shutdown days cost PTO at 8.00 (Friday-holiday week: 3 x 8.00 = 24.00)', await (async () => { await gotoMonth(a.page, '2026-12'); const a28 = await cellBal(a.page, '2026-12-28'); return /-8\.00/.test(a28); })());
  t.ok('Dec 31 balance = 15.00 + 7 paydays (32.34) - shutdown (24.00) = 23.34', (await tile(a.page, 'dec 31 balance')).v === '23.34H', (await tile(a.page, 'dec 31 balance')).v);
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

  // half days round to the quarter hour; custom hours are taken as typed
  a = await openApp(b, { plan: planWith(), tab: 'pto' });
  const halfLabel = async k => { await gotoMonth(a.page, k.slice(0, 7)); await a.page.click(`button.p-day[data-k="${k}"]`); const l = await a.page.locator('[data-act="half"]').textContent(); await a.page.keyboard.press('Escape'); return l; };
  t.ok('Mon-Thu half day is 4.25 (8.25 / 2 rounded up to the quarter)', /4\.25/.test(await halfLabel('2026-12-08')));
  t.ok('Friday half day is 3.50', /3\.50/.test(await halfLabel('2026-12-11')));
  t.ok('half day in a Friday-holiday week is 4.00', /4\.00/.test(await halfLabel('2026-11-23')));
  await a.page.click('button.p-day[data-k="2026-11-23"]'); await a.page.click('[data-act="half"]');
  await gotoMonth(a.page, '2026-12');
  await a.page.click('button.p-day[data-k="2026-12-08"]'); await a.page.click('[data-act="half"]');
  await a.page.click('button.p-day[data-k="2026-12-09"]'); await a.page.fill('#p-customH', '2.1'); await a.page.click('[data-act="custom"]');
  t.ok('tapping Half day stores 4.25 / 4.00, custom stores 2.10 as typed', await a.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('pto-planner-v1')).days; return d['2026-12-08'].h === 4.25 && d['2026-11-23'].h === 4 && d['2026-12-09'].h === 2.1; }));
  t.ok('no page errors (half / custom)', a.errors.length === 0, a.errors.join('|'));
  await a.ctx.close();

  // the balance typed in is NET: planned PTO after its date is already out of it (Carlos: 17.59 gross, Fri Oct 23 off -> 10.59)
  a = await openApp(b, { date: '2026-10-22T09:00:00', plan: planWith({ '2026-10-23': { t: 'pto', full: true, u: 9 } }, { start: 30, asOf: '2026-10-01' }), tab: 'pto' });
  await a.page.click('#ptab-set');
  await a.page.evaluate(() => { const d = document.getElementById('pf_asOf'); d.value = '2026-10-22'; d.dispatchEvent(new Event('change', { bubbles: true })); });
  await a.page.evaluate(() => { const i = document.getElementById('pf_start'); i.value = '10.59'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  const stored = () => a.page.evaluate(() => JSON.parse(localStorage.getItem('pto-planner-v1')).start);
  t.ok('net 10.59 with Oct 23 (7.00) planned is kept as 17.59 before that day', await stored() === 17.59, String(await stored()));
  t.ok('settings field shows the net balance back', await a.page.inputValue('#pf_start') === '10.59');
  t.ok('net balance tile shows 10.59 (no double count)', (await tile(a.page, 'net balance')).v === '10.59H', JSON.stringify(await tile(a.page, 'net balance')));
  await a.page.click('#ptab-cal'); await gotoMonth(a.page, '2026-10');
  t.ok('Oct 23 ends at 10.59', /balance 10\.59 hours/.test(await cellBal(a.page, '2026-10-23')), await cellBal(a.page, '2026-10-23'));
  await a.page.click('button.p-day[data-k="2026-10-26"]'); await a.page.click('[data-act="full"]');
  t.ok('a day planned later comes out of the net (10.59 - 8.25 = 2.34)', (await tile(a.page, 'net balance')).v === '2.34H');
  await a.page.click('button.p-day[data-k="2026-10-23"]'); await a.page.click('[data-act="clear"]');
  t.ok('removing a planned day gives its hours back (2.34 + 7.00 = 9.34)', (await tile(a.page, 'net balance')).v === '9.34H');
  t.ok('no page errors (net balance)', a.errors.length === 0, a.errors.join('|'));
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
