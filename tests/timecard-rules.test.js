// Timecard hours rules: rounding, lunch, away, holiday (8.00H), PTO (normal day), Friday-holiday ripple,
// planner-driven days (part-day PTO, unpaid shutdown) and the week's dates.
const { launch, planWith, openApp, suite } = require('./helpers');
const t = suite('Timecard rules');

(async () => {
  const b = await launch();
  const MON = '2026-11-02T09:00:00';   // week of Nov 2-6 2026: no company holidays
  const open = (extra, opts = {}) => openApp(b, Object.assign({ date: MON, plan: planWith(extra) }, opts));
  const text = (page, sel) => page.evaluate(s => document.querySelector(s).innerText.replace(/\s+/g, ' ').trim(), sel);
  const setTime = (page, id, v) => page.evaluate(([i, val]) => { const el = document.getElementById(i); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
  const totals = async page => ({ total: await text(page, '#total'), target: await text(page, '#target-display'), diff: await text(page, '#diff'), sub: await text(page, '#diff-sub') });
  const pill = (page, i) => text(page, `#pill-${i}`);

  // default week
  let a = await open({});
  let s = await totals(a.page);
  t.ok('default week: 40.00H against a 40H target, on target', s.total === '40.00H' && s.target === '40H' && s.diff === 'ON TARGET', JSON.stringify(s));
  t.ok('default pills: Mon-Thu 8.25H, Fri 7.00H', (await Promise.all([0, 1, 2, 3, 4].map(i => pill(a.page, i)))).join(',') === '8.25H,8.25H,8.25H,8.25H,7.00H');
  t.ok('week label and dates are the real calendar week', await text(a.page, '#weekLabel') === 'WEEK OF NOV 2' && (await text(a.page, '#date-0')).includes('NOV 2') && (await text(a.page, '#date-4')).includes('NOV 6'));
  t.ok('today is marked on its row', await a.page.evaluate(() => document.getElementById('card-0').classList.contains('is-today') && !document.getElementById('card-1').classList.contains('is-today')));

  // rounding to the nearest quarter hour, lunch, away
  await setTime(a.page, 'in-0', '08:07');
  t.ok('clock-in 08:07 rounds down to 08:00', await pill(a.page, 0) === '8.25H');
  await setTime(a.page, 'in-0', '08:08');
  t.ok('clock-in 08:08 rounds up to 08:15 (8.00H)', await pill(a.page, 0) === '8.00H');
  await setTime(a.page, 'in-0', '08:00'); await setTime(a.page, 'out-0', '17:08');
  t.ok('clock-out 17:08 rounds up to 17:15', await pill(a.page, 0) === '8.25H');
  await setTime(a.page, 'out-0', '17:15');
  await a.page.click('.lunch-btn[data-day="0"][data-val="45"]');
  t.ok('45-minute lunch gives 8.50H', await pill(a.page, 0) === '8.50H');
  await a.page.click('.lunch-btn[data-day="0"][data-val="60"]');
  await a.page.click('.away-btn[data-day="1"]'); await setTime(a.page, 'away-in-1', '12:00'); await setTime(a.page, 'away-out-1', '12:30');
  t.ok('an away block is subtracted (8.25 - 0.50 = 7.75H)', (await pill(a.page, 1)).startsWith('7.75H') && (await pill(a.page, 1)).includes('-0.50'), await pill(a.page, 1));
  t.ok('no page errors (default week)', a.errors.length === 0, a.errors.join('|')); await a.ctx.close();

  // holiday mid-week credits 8.00H -> week 15 minutes short
  a = await open({});
  await a.page.click('.hol-btn[data-day="1"]'); s = await totals(a.page);
  t.ok('Tue holiday: credited 8.00H, week 0.25H short', await pill(a.page, 1) === '8.00H' && s.total === '39.75H' && s.diff === '-0.25H' && /15 MIN SHORT/.test(s.sub), JSON.stringify(s));
  t.ok('Tue holiday: banner says to make up the 15 minutes', /WEEK IS 0\.25H SHORT/.test(await text(a.page, '#holiday-banner')));
  t.ok('Tue holiday: written to the planner as a holiday', await a.page.evaluate(() => JSON.parse(localStorage.getItem('pto-planner-v1')).days['2026-11-03'].t) === 'hol');
  await a.page.click('.hol-btn[data-day="1"]'); s = await totals(a.page);
  t.ok('toggling it off restores the 40.00H week', s.total === '40.00H' && s.diff === 'ON TARGET');
  await a.ctx.close();

  // PTO credits the day's normal hours
  a = await open({});
  await a.page.click('.pto-btn[data-day="2"]'); s = await totals(a.page);
  t.ok('Wed PTO: credited 8.25H, still on target', await pill(a.page, 2) === '8.25H' && s.total === '40.00H' && s.diff === 'ON TARGET');
  await a.page.click('.pto-btn[data-day="4"]'); s = await totals(a.page);
  t.ok('Fri PTO: credited 7.00H (not 8.25), still on target', await pill(a.page, 4) === '7.00H' && s.total === '40.00H');
  t.ok('PTO is written to the planner as a full day', await a.page.evaluate(() => { const d = JSON.parse(localStorage.getItem('pto-planner-v1')).days; return d['2026-11-04'].full === true && d['2026-11-06'].full === true; }));
  await a.ctx.close();

  // Friday holiday ripple: Mon-Thu targets drop to 8.00 so the week stays at 40
  a = await open({});
  await a.page.click('.hol-btn[data-day="4"]'); s = await totals(a.page);
  t.ok('Fri holiday: target stays 40H, Fri credited 8.00H', await pill(a.page, 4) === '8.00H' && s.target === '40H');
  t.ok('Fri holiday: default times now run 1.00H over', s.diff === '+1.00H', JSON.stringify(s));
  t.ok('Fri holiday: banner says to leave at 17:00 Mon-Thu', /LEAVE AT 17:00 MON.THU/.test(await text(a.page, '#holiday-banner')));
  for (let i = 0; i < 4; i++) await setTime(a.page, `out-${i}`, '17:00');
  s = await totals(a.page);
  t.ok('Fri holiday: leaving at 17:00 Mon-Thu lands exactly on target', s.total === '40.00H' && s.diff === 'ON TARGET', JSON.stringify(s));
  await a.ctx.close();

  // planner-driven: part-day PTO credit
  a = await open({ '2026-11-03': { t: 'pto', h: 4, u: 9 } });
  s = await totals(a.page);
  t.ok('part-day PTO (4h on Tue): credited on top of worked time', (await pill(a.page, 1)).includes('+4.00 PTO') && s.total === '44.00H', JSON.stringify(s));
  await setTime(a.page, 'out-1', '13:15');
  s = await totals(a.page);
  t.ok('part-day PTO: working 4.25H + 4.00H credit is a full day', s.total === '40.00H' && s.diff === 'ON TARGET', JSON.stringify(s));
  await a.ctx.close();

  // planner-driven: company shutdown week (Dec 28 - Jan 1), then one shutdown day left unpaid
  a = await open({}, { date: '2026-12-28T09:00:00' });
  s = await totals(a.page);
  t.ok('shutdown week: Mon-Wed PTO, Thu/Fri holidays -> target 40.75H, on target', s.target === '40.75H' && s.diff === 'ON TARGET', JSON.stringify(s));
  await a.ctx.close();
  a = await open({ '2026-12-29': { t: 'shut', h: 0, n: 'Shutdown', u: 9 } }, { date: '2026-12-28T09:00:00' });
  s = await totals(a.page);
  t.ok('unpaid shutdown day: shows OFF and drops 8.25H from the target', await pill(a.page, 1) === 'OFF' && s.target === '32.50H', JSON.stringify(s));
  t.ok('unpaid shutdown day: banner says the target was reduced', /SHUTDOWN . UNPAID/.test(await text(a.page, '#holiday-banner')));
  t.ok('no page errors (planner-driven weeks)', a.errors.length === 0, a.errors.join('|'));

  // Reset Week clears times but planned days come straight back
  await setTime(a.page, 'in-0', '09:00');
  await a.page.click('#resetBtn'); await a.page.click('#confirmYes');
  t.ok('Reset Week restores default times but keeps planned days', await a.page.inputValue('#in-0') === '08:00' && await pill(a.page, 1) === 'OFF');
  await a.ctx.close();

  await b.close(); t.done();
})();
