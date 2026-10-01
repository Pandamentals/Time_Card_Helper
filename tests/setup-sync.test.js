// First-launch setup and two-device sync: validation, merge rules, links, undo, tampered codes
const { APP_URL, launch } = require('./helpers');
const URL = APP_URL;
const dayClick = async (page, k) => { if (await page.locator('#ptab-cal[aria-selected="false"]').count()) await page.click('#ptab-cal'); const id = k.slice(0, 7); if (!(await page.locator(`button.p-day[data-k="${k}"]`).count())) { if (!(await page.locator('#p-mlist').count())) await page.click('#p-mtoggle'); await page.click(`.p-mitem[data-month="${id}"]`); } await page.click(`button.p-day[data-k="${k}"]`); };
const monthCount = async page => { if (!(await page.locator('#p-mlist').count())) { if (!(await page.locator('#p-mtoggle').count())) return 0; await page.click('#p-mtoggle'); } return page.locator('.p-mitem:not(.p-mnow)').count(); };
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (x ? '  [' + x + ']' : '')); };
const T = h => new Date(`2026-12-01T${String(h).padStart(2, '0')}:00:00`);
(async () => {
  const b = await launch();
  const device = async (name, start, pre = {}) => {
    const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => { if (!/ServiceWorker/.test(String(e))) errs.push(name + ': ' + String(e).slice(0, 100)); });
    await page.route(/fonts\./, r => r.abort());
    await page.clock.install({ time: T(start) });
    await page.addInitScript(p => { try { localStorage.setItem('timecard_boot_date', new Date().toISOString().slice(0, 10)); for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v); } catch (e) {} }, pre);
    return { name, ctx, page, errs };
  };
  const at = (d, h) => d.page.clock.setSystemTime(T(h));
  const open = async (d, hash = '') => { await d.page.goto(URL + hash); await d.page.waitForTimeout(100); };
  const setup = async (d, bal, acc, asOf) => { await d.page.fill('#ps_start', String(bal)); await d.page.fill('#ps_accrual', String(acc)); if (asOf) await d.page.fill('#ps_asOf', asOf); await d.page.click('[data-sync="setup-save"]'); };
  const planner = d => d.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pto-planner-v1') || 'null'); return s && { start: s.start, accrual: s.accrual, days: Object.fromEntries(Object.entries(s.days).filter(([, e]) => e.u).map(([k, e]) => [k, e.t + (e.h ? ':' + e.h : e.full ? ':full' : '')])) }; });
  const openSettings = async d => { if (await d.page.locator('#ptab-set[aria-selected="false"]').count()) await d.page.click('#ptab-set'); };
  const getCode = async d => { await openSettings(d); await d.page.click('[data-sync="code-get"]'); return d.page.inputValue('#p-code-out'); };
  const tapDay = async (d, k, act) => { await dayClick(d.page, k); await d.page.click(`[data-act="${act}"]`); };
  const mergeVia = async (d, code) => { if (!(await d.page.locator('#p-code-in').count())) await openSettings(d); await d.page.fill('#p-code-in', code); await d.page.click('[data-sync="merge-code"]'); };

  // ── A. brand-new user ────────────────────────────────────────────────
  let A = await device('A', 9); await open(A);
  ok('A launches on the PTO tab with the setup card', await A.page.locator('#tab-pto[aria-selected="true"]').count() === 1 && await A.page.locator('#ps_start').count() === 1);
  ok('A no calendar and no personal numbers before setup', await monthCount(A.page) === 0 && !(await A.page.innerText('body')).match(/15\.85|4\.62/));
  await A.page.click('#tab-timecard');
  ok('A timecard works before setup', (await A.page.textContent('#total')) !== '–');
  await A.page.click('#tab-pto');
  for (const [bal, acc, asOf, label] of [['', '4', null, 'empty balance'], ['-3', '4', null, 'negative balance'], ['10', '0', null, 'zero accrual'], ['10', '4', '2028-01-01', 'date past plan end']]) {
    await A.page.fill('#ps_start', bal); await A.page.fill('#ps_accrual', acc); await A.page.fill('#ps_asOf', asOf || '2026-12-01'); await A.page.click('[data-sync="setup-save"]');
    ok('A setup rejects ' + label, (await A.page.textContent('#p-setup-err')).length > 5 && await monthCount(A.page) === 0);
  }
  await setup(A, 20, 4, '2026-12-01');
  ok('A setup saves -> calendar + balance tile', await monthCount(A.page) >= 9 && /20\.00H|20H/.test(await A.page.innerText('.p-stat')), (await A.page.innerText('.p-stat')).replace(/\n+/g, ' '));
  await A.page.reload(); ok('A does not see setup again', await A.page.locator('#ps_start').count() === 0);

  // ── B. second device, fresh: import from A skips setup ───────────────
  await at(A, 9); await tapDay(A, '2026-12-08', 'full'); await tapDay(A, '2026-12-09', 'half'); await tapDay(A, '2026-12-10', 'full');
  const codeA1 = await getCode(A);
  ok('A produces a compact code', codeA1.length > 40 && codeA1.length < 1500 && /^[A-Za-z0-9_-]+$/.test(codeA1), codeA1.length + ' chars');
  let B = await device('B', 10); await open(B);
  await mergeVia(B, codeA1);
  ok('B shows a confirm panel, nothing applied yet', await B.page.locator('.p-pending').count() === 1 && await monthCount(B.page) === 0);
  await B.page.click('[data-sync="merge-confirm"]');
  const b1 = await planner(B);
  ok('B skipped setup via code: settings + 3 days arrived', b1.start === 20 && b1.accrual === 4 && Object.keys(b1.days).length === 3 && await monthCount(B.page) > 9, JSON.stringify(b1));

  // ── C. both edit, then merge both ways ───────────────────────────────
  await at(A, 11); await tapDay(A, '2026-12-14', 'full');                       // A-only edit
  await at(B, 12); await tapDay(B, '2026-12-15', 'full');                       // B-only edit
  await tapDay(B, '2026-12-09', 'clear');                                       // B removes a day A planned (later)
  await at(A, 13); await tapDay(A, '2026-12-10', 'half');                       // A changes a day later than B's copy
  await at(B, 14); await tapDay(B, '2026-12-10', 'clear');                      // B clears it even later -> B wins
  const codeA2 = await getCode(A), codeB2 = await getCode(B);
  await mergeVia(A, codeB2); await A.page.click('[data-sync="merge-confirm"]');
  await mergeVia(B, codeA2); await B.page.click('[data-sync="merge-confirm"]');
  const pa = await planner(A), pb = await planner(B);
  ok('after merging both ways the devices hold the same days', JSON.stringify(Object.entries(pa.days).sort()) === JSON.stringify(Object.entries(pb.days).sort()), 'A=' + JSON.stringify(pa.days) + ' B=' + JSON.stringify(pb.days));
  ok('edits made on each device both survived', pa.days['2026-12-14'] === 'pto:full' && pa.days['2026-12-15'] === 'pto:full' && pa.days['2026-12-08'] === 'pto:full');
  ok('newer removal wins (Dec 9 and Dec 10 gone)', pa.days['2026-12-09'] === 'none' && pa.days['2026-12-10'] === 'none');
  const ba = await A.page.evaluate(() => [...document.querySelectorAll('.p-stat .v')][0].textContent), bb = await B.page.evaluate(() => [...document.querySelectorAll('.p-stat .v')][0].textContent);
  ok('both devices show the same balance today', ba === bb, ba + ' / ' + bb);

  // ── D. link flow, undo, safety ───────────────────────────────────────
  const link = await A.page.inputValue('#p-code-out').then(c => URL + '#sync=' + c);
  let C = await device('C', 15); await C.page.goto(link); await C.page.waitForTimeout(150);
  ok('link opens the planner with a pending confirm', await C.page.locator('#tab-pto[aria-selected="true"]').count() === 1 && await C.page.locator('.p-pending').count() === 1);
  ok('link hash is stripped from the address bar', !(await C.page.evaluate(() => location.hash)));
  await C.page.click('[data-sync="merge-cancel"]');
  ok('cancel applies nothing', (await planner(C)) === null || (await planner(C)).start == null);
  await C.page.click('[data-sync="merge-cancel"]').catch(() => {});
  await mergeVia(C, link); await C.page.click('[data-sync="merge-confirm"]');
  ok('C merged from a pasted link', (await planner(C)).start === 20);
  await openSettings(C).catch(() => {});
  await tapDay(C, '2026-12-16', 'full'); const withEdit = Object.keys((await planner(C)).days).length;
  const codeB3 = await getCode(B); await at(C, 16); await mergeVia(C, codeB3); await C.page.click('[data-sync="merge-confirm"]');
  await openSettings(C).catch(() => {});
  await C.page.click('[data-sync="undo"]');
  ok('undo restores the pre-merge plan', Object.keys((await planner(C)).days).length === withEdit, String(withEdit));
  for (const [label, code] of [['garbage text', 'hello world'], ['tampered hours', Buffer.from(JSON.stringify({ v: 1, d: { '2026-12-08': { t: 'pto', h: 99, u: 5 } } })).toString('base64')], ['wrong type', Buffer.from(JSON.stringify({ v: 1, d: { '2026-12-08': { t: '<img>', u: 5 } } })).toString('base64')], ['bad settings', Buffer.from(JSON.stringify({ v: 1, d: {}, su: 9, s: { start: 5, accrual: 4, cap: 120, hMT: 8, hF: 7, asOf: '2027-02-01', firstPay: '2026-10-08', end: '2026-01-01' } })).toString('base64')]]) {
    await openSettings(C).catch(() => {});
    await C.page.fill('#p-code-in', code); await C.page.click('[data-sync="merge-code"]');
    ok('rejects ' + label, await C.page.locator('.p-pending').count() === 0 && /COULD NOT BE READ/.test(await C.page.innerText('body')));
  }

  // ── E. timecard sees merged PTO; reset returns to setup; legacy plan ──
  await at(B, 14); await B.page.click('#tab-timecard');
  ok('timecard week reflects synced planning', await B.page.evaluate(() => /DEC 1\b/.test(document.getElementById('date-1').textContent)));
  await B.page.click('#tab-pto'); await openSettings(B); await B.page.click('#p-reset'); await B.page.click('#p-reset');
  ok('Reset Plan brings the setup card back', await B.page.locator('#ps_start').count() === 1);
  const legacy = JSON.stringify({ rev: 7, start: 12, asOf: '2026-11-30', accrual: 3, firstPay: '2026-10-08', cap: 120, hMT: 8.25, hF: 7, end: '2027-09-30', days: { '2026-12-03': { t: 'pto', full: true } } });
  const L = await device('L', 9, { 'pto-planner-v1': legacy }); await open(L); await L.page.click('#tab-pto');
  ok('existing saved plan skips setup', await L.page.locator('#ps_start').count() === 0 && await monthCount(L.page) > 9);
  const lcode = await getCode(L);
  const lj = JSON.parse(Buffer.from(lcode.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  ok('pre-sync edits are stamped so they export', lj.d['2026-12-03'] && lj.d['2026-12-03'].u === 1 && lj.s && lj.s.start === 12, JSON.stringify(lj).slice(0, 120));

  const all = [A, B, C, L].flatMap(d => d.errs);
  ok('no page errors on any device', all.length === 0, all.join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
