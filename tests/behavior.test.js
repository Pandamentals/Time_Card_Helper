// App behaviour: storage failures, week rollover, dialog focus, balance projection, plan dates
const { APP_URL, launch } = require('./helpers');
const URL = APP_URL;
const dayClick = async (page, k) => { if (await page.locator('#ptab-cal[aria-selected="false"]').count()) await page.click('#ptab-cal'); const id = k.slice(0, 7); if (!(await page.locator(`button.p-day[data-k="${k}"]`).count())) { if (!(await page.locator('#p-mlist').count())) await page.click('#p-mtoggle'); await page.click(`.p-mitem[data-month="${id}"]`); } await page.click(`button.p-day[data-k="${k}"]`); };
const monthCount = async page => { if (!(await page.locator('#p-mlist').count())) { if (!(await page.locator('#p-mtoggle').count())) return 0; await page.click('#p-mtoggle'); } return page.locator('.p-mitem:not(.p-mnow)').count(); };
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : '')); };
(async () => {
  const b = await launch();
  const mk = async (o = {}) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) errs.push(String(e).slice(0, 100)); });
    await page.route(/fonts\./, r => r.abort());
    if (o.date) await page.clock.install({ time: new Date(o.date) });
    await page.addInitScript(o => { try { if (!localStorage.getItem('pto-planner-v1')) localStorage.setItem('pto-planner-v1', JSON.stringify({rev:50,start:15.85,asOf:'2026-09-30',accrual:4.62,firstPay:'2026-10-08',cap:120,hMT:8.25,hF:7,end:'2027-09-30',days:{'2026-11-26':{t:'hol',n:'Thanksgiving'},'2026-11-27':{t:'hol',n:'Day after Thanksgiving'},'2026-12-28':{t:'shut',full:true,n:'Shutdown'},'2026-12-29':{t:'shut',full:true,n:'Shutdown'},'2026-12-30':{t:'shut',full:true,n:'Shutdown'},'2026-10-29':{t:'pto',h:4.13}}})); localStorage.setItem('timecard_boot_date', new Date().toISOString().slice(0,10)); if (o.tab) localStorage.setItem('timecard_tab', o.tab); for (const [k, v] of Object.entries(o.pre || {})) localStorage.setItem(k, v); } catch (e) {} }, o);
    return { ctx, page, errs };
  };
  const tcState = (week, edited) => JSON.stringify({ weekStart: week, synced: true, days: [0,1,2,3,4].map(i => ({ inV: edited && i === 0 ? '07:00' : '08:00', outV: i === 4 ? '15:30' : '17:15', lunch: i === 4 ? 30 : 60, holiday: false, pto: false, away: false, awayIn: null, awayOut: null, savedIn: null, savedOut: null })) });

  // R1-1 storage blocked
  let t = await mk(); await t.page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); });
  await t.page.goto(URL);
  ok('1 storage blocked: no errors', t.errs.length === 0, t.errs.join('|'));
  ok('1 storage blocked: totals computed', (await t.page.textContent('#total')) !== '–', await t.page.textContent('#total'));
  ok('1 storage blocked: setup card shown (nothing can be remembered)', await t.page.locator('#ps_start').count() === 1);
  await t.page.fill('#ps_start', '10'); await t.page.fill('#ps_accrual', '4'); await t.page.fill('#ps_asOf', '2026-10-01'); await t.page.click('[data-sync="setup-save"]');
  ok('1 storage blocked: setup works in memory + planner renders', await monthCount(t.page) > 10);
  await dayClick(t.page, '2026-10-14'); await t.page.click('[data-act="full"]');
  ok('1 storage blocked: edit works in memory', (await t.page.locator('button.p-day[data-k="2026-10-14"].pto').count()) === 1);
  await t.ctx.close();

  // R1-2 midnight rollover (week changes while app is open), edited times -> prompt
  t = await mk({ date: '2026-11-22T23:59:00', pre: { timecard_v3: tcState('2026-11-16', true) } });
  await t.page.goto(URL);
  const before = await t.page.textContent('#date-0');
  await t.page.clock.fastForward(3 * 60 * 1000);
  const after = await t.page.textContent('#date-0');
  ok('2 midnight: dates roll to new week', before.startsWith('NOV 16') && after.startsWith('NOV 23'), before + ' -> ' + after);
  ok('2 midnight: edited times -> rollover prompt', await t.page.locator('#week-prompt.active').count() === 1);
  await t.ctx.close();

  // R1-4 pristine week -> no prompt; edited -> prompt (load time)
  t = await mk({ date: '2026-11-30T09:00:00', pre: { timecard_v3: tcState('2026-11-23', false) } }); await t.page.goto(URL);
  ok('4 untouched week: no prompt', await t.page.locator('#week-prompt.active').count() === 0);
  const stamped = await t.page.evaluate(() => JSON.parse(localStorage.getItem('timecard_v3')).weekStart);
  ok('4 untouched week: silently re-stamped', stamped === '2026-11-30', stamped); await t.ctx.close();
  t = await mk({ date: '2026-11-30T09:00:00', pre: { timecard_v3: tcState('2026-11-23', true) } }); await t.page.goto(URL);
  ok('4 edited week: prompt shown', await t.page.locator('#week-prompt.active').count() === 1); await t.ctx.close();

  // R1-5 dialog focus + inert
  t = await mk({ date: '2026-11-23T10:00:00', tab: 'pto' }); await t.page.goto(URL);
  await dayClick(t.page, '2026-11-17');
  ok('5 dialog: monitor inert while open', await t.page.evaluate(() => document.getElementById('monitor').inert));
  ok('5 dialog: focus inside dialog', await t.page.evaluate(() => !!document.activeElement.closest('.p-sheet')));
  await t.page.click('[data-act="full"]');
  ok('5 dialog: inert released', !(await t.page.evaluate(() => document.getElementById('monitor').inert)));
  ok('5 dialog: focus returns to the day cell', await t.page.evaluate(() => document.activeElement.dataset.k) === '2026-11-17');
  await dayClick(t.page, '2026-11-18'); await t.page.keyboard.press('Escape');
  ok('5 dialog: Escape returns focus', await t.page.evaluate(() => document.activeElement.dataset.k) === '2026-11-18');
  await t.ctx.close();

  // R2 projected balance, any as-of date
  t = await mk({ date: '2027-02-10T09:00:00', tab: 'pto' }); await t.page.goto(URL);
  let tile = await t.page.evaluate(() => [...document.querySelectorAll('.p-stat')][0].innerText.replace(/\n+/g, ' | '));
  const projected = parseFloat(tile.match(/([\d.]+)H/)[1]);
  ok('R2 balance tile is projected, not the stale start', projected > 15.85 && /BALANCE TODAY/i.test(tile), tile);
  // update flow: real balance on a mid-month date
  await t.page.click('#p-update');
  ok('R2 [UPDATE] opens the settings tab and focuses the balance field', await t.page.evaluate(() => document.getElementById('ptab-set').getAttribute('aria-selected') === 'true' && document.activeElement.id === 'pf_start'));
  await t.page.fill('#pf_start', '30.5'); await t.page.dispatchEvent('#pf_start', 'change');
  await t.page.fill('#pf_asOf', '2027-02-05'); await t.page.dispatchEvent('#pf_asOf', 'change');
  await t.page.click('#ptab-cal'); await monthCount(t.page);
  const d = await t.page.evaluate(() => { const tl = [...document.querySelectorAll('.p-stat')][0].innerText.replace(/\n+/g, ' | '); return { tile: tl, firstMonth: document.querySelector('.p-mitem:not(.p-mnow)').getAttribute('aria-label'),
    feb4: !!document.querySelector('button.p-day[data-k="2027-02-04"]'), feb8: !!document.querySelector('button.p-day[data-k="2027-02-08"]'), feb8dim: !!document.querySelector('.p-day.wk'), nan: document.body.innerText.includes('NaN') }; });
  ok('R2 mid-month as-of: calendar starts in that month', /February 2027/i.test(d.firstMonth), d.firstMonth);
  ok('R2 days before as-of are not editable, after are', !d.feb4 && d.feb8);
  ok('R2 no NaN anywhere', !d.nan);
  ok('R2 tile re-based on typed balance/date', /AS OF|PROJECTED FROM 30.50H/.test(d.tile), d.tile);
  // validation
  await t.page.click('#ptab-set');
  await t.page.fill('#pf_end', '2027-01-01'); await t.page.dispatchEvent('#pf_end', 'change');
  ok('R2 end before as-of is rejected', await t.page.inputValue('#pf_end') === '2027-09-30');
  await t.page.fill('#pf_end', '2028-03-31'); await t.page.dispatchEvent('#pf_end', 'change');
  await t.page.click('#ptab-cal');
  ok('R2 plan can be extended past Sep 2027', await monthCount(t.page) >= 14, String(await monthCount(t.page)));
  ok('R2 no errors', t.errs.length === 0, t.errs.join('|')); await t.ctx.close();

  // default state unchanged (regression)
  t = await mk({ date: '2026-10-01T09:00:00', tab: 'pto' }); await t.page.goto(URL);
  await monthCount(t.page);
  const reg = await t.page.evaluate(() => ({ first: document.querySelector('.p-mitem:not(.p-mnow)').getAttribute('aria-label').split(',')[0].toUpperCase(), n: document.querySelectorAll('.p-mitem:not(.p-mnow)').length, sub: document.querySelector('.p-sub').textContent.slice(0, 22) }));
  ok('regression: default plan still Oct 2026 -> 12 months', reg.first === 'OCTOBER 2026' && reg.n === 12, JSON.stringify(reg));
  await t.ctx.close(); await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
