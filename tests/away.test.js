// Away time: the [AWAY] dialog (punched out / back in), the card tag, and the away rules:
// back-in read as PM, only time inside the shift counts, lunch counted once when away is over 12:00-1:30.
const { launch, planWith, openApp, suite } = require('./helpers');
const t = suite('Away time');

(async () => {
  const b = await launch();
  const TUE = '2026-11-03T09:00:00';   // week of Nov 2-6 2026: no company holidays
  const open = (opts = {}) => openApp(b, Object.assign({ date: TUE, plan: planWith() }, opts));
  const text = (page, sel) => page.evaluate(s => document.querySelector(s).innerText.replace(/\s+/g, ' ').trim(), sel);
  const pill = (page, i) => text(page, `#pill-${i}`);
  const total = page => text(page, '#total');
  async function logAway(page, i, out, back, { lunchClick = false } = {}) {
    await page.click(`.away-btn[data-day="${i}"]`);
    await page.fill('#a-out', out); await page.fill('#a-in', back);
    if (lunchClick) await page.click('#a-lunch');
    await page.click('#a-save');
  }

  let a = await open();
  const p = a.page;

  // nothing stacks on the card any more
  t.ok('no away inputs on the card before anything is logged', await p.locator('#card-1 input[type=time]').count() === 2 && await p.isHidden('#away-tag-1'));

  // dialog basics
  await p.click('.away-btn[data-day="1"]');
  t.ok('[AWAY] opens the away dialog', await p.isVisible('.away-sheet') && (await text(p, '#a-title')).startsWith('AWAY · TUE'));
  t.ok('punched-out box has focus', await p.evaluate(() => document.activeElement.id === 'a-out'));
  t.ok('save is disabled until both times are in', await p.isDisabled('#a-save'));
  await p.fill('#a-out', '14:00');
  t.ok('a missing back-in time is called out, not ignored', await text(p, '#a-res') === 'ADD BACK IN' && await p.isDisabled('#a-save'));
  await p.keyboard.press('Escape');
  t.ok('Escape closes without saving', await p.locator('.away-sheet').count() === 0 && await pill(p, 1) === '8.25H' && await p.isHidden('#away-tag-1'));

  // AM/PM mix-up: 11:30 out, 1:30 (AM) back -> read as 1:30 PM
  await p.click('.away-btn[data-day="1"]');
  await p.fill('#a-out', '11:30'); await p.fill('#a-in', '01:30');
  t.ok('back-in before punched-out is read as PM and says so', /BACK IN READ AS 1:30P/.test(await text(p, '#a-day')) && !(await p.isDisabled('#a-save')), await text(p, '#a-day'));
  t.ok('away over 12:00-1:30 ticks "ate lunch during this" by itself', await p.isVisible('#a-lunch') && await p.getAttribute('#a-lunch', 'aria-pressed') === 'true');
  t.ok('lunch counted once: 2.00H off, day total 7.25H', await text(p, '#a-res') === '−2.00H' && /DAY TOTAL 7.25H/.test(await text(p, '#a-day')));
  await p.click('#a-save');
  t.ok('pill shows 7.25H with AWAY+LUNCH −2.00', (await pill(p, 1)).startsWith('7.25H') && (await pill(p, 1)).includes('AWAY+LUNCH −2.00'), await pill(p, 1));
  t.ok('card tag shows the times, lunch chip and hours', /AWAY 11:30A → 1:30P LUNCH INCL −2.00H/.test(await text(p, '#away-tag-1')), await text(p, '#away-tag-1'));
  t.ok('week total drops by 1.00H', await total(p) === '39.00H');

  // reopen from the tag; untick lunch -> both come off
  await p.click('#away-tag-1');
  t.ok('the tag reopens the dialog with the saved times', await p.inputValue('#a-out') === '11:30' && await p.inputValue('#a-in') === '13:30');
  await p.click('#a-lunch');
  t.ok('unticking lunch takes off both (day total 6.25H)', await text(p, '#a-res') === '−2.00H' && /DAY TOTAL 6.25H/.test(await text(p, '#a-day')));
  await p.click('#a-save');
  t.ok('pill shows AWAY −2.00 and 6.25H', (await pill(p, 1)).startsWith('6.25H') && (await pill(p, 1)).includes('AWAY −2.00'), await pill(p, 1));

  // survives a reload, lunch override included
  await p.reload(); await p.waitForTimeout(150);
  t.ok('away time and the lunch choice survive a reload', (await pill(p, 1)).startsWith('6.25H') && !/LUNCH INCL/.test(await text(p, '#away-tag-1')));

  // short errand at lunch: the longer of the two comes off
  await logAway(p, 2, '12:30', '13:00');
  t.ok('30 min away during a 1H lunch: only the lunch hour comes off (8.25H)', (await pill(p, 2)).startsWith('8.25H'), await pill(p, 2));

  // afternoon appointment: no lunch question, both come off
  await p.click('.away-btn[data-day="3"]');
  await p.fill('#a-out', '14:00'); await p.fill('#a-in', '16:00');
  t.ok('away outside 12:00-1:30 does not ask about lunch', await p.isHidden('#a-lunch'));
  await p.click('#a-save');
  t.ok('afternoon 2H away: 6.25H', (await pill(p, 3)).startsWith('6.25H'), await pill(p, 3));

  // only the part inside the shift counts (Fri shift 8:00-3:30)
  await logAway(p, 4, '15:00', '16:30');
  t.ok('away past clock-out only counts up to clock-out (Fri 7.00 - 0.50 = 6.50H)', (await pill(p, 4)).startsWith('6.50H'), await pill(p, 4));

  // Remove
  await p.click('#away-tag-4'); await p.click('#a-del');
  t.ok('REMOVE clears the away time and the tag', await pill(p, 4) === '7.00H' && await p.isHidden('#away-tag-4') && await p.getAttribute('.away-btn[data-day="4"]', 'aria-pressed') === 'false');

  // Enter saves
  await p.click('.away-btn[data-day="0"]');
  await p.fill('#a-out', '09:00'); await p.fill('#a-in', '10:00'); await p.press('#a-in', 'Enter');
  t.ok('Enter in a time box saves', (await pill(p, 0)).startsWith('7.25H') && await p.locator('.away-sheet').count() === 0);

  // a holiday hides the tag; clearing it brings the tag back
  await p.click('.hol-btn[data-day="0"]');
  t.ok('a holiday hides the away tag', await p.isHidden('#away-tag-0') && await pill(p, 0) === '8.00H');
  await p.click('.hol-btn[data-day="0"]');
  t.ok('clearing the holiday brings the tag back', await p.isVisible('#away-tag-0'));

  // Reset Week clears away
  await p.click('#resetBtn'); await p.click('#confirmYes');
  t.ok('Reset Week clears every away block', await p.locator('.away-tag:not([hidden])').count() === 0 && await total(p) === '40.00H');
  t.ok('no page errors', a.errors.length === 0, a.errors.join('|'));
  await a.ctx.close();

  // saved data from the old stacked block (wrong AM end) now counts
  const old = JSON.stringify({ weekStart: '2026-11-02', synced: true, days: [0, 1, 2, 3, 4].map(i => ({ inV: '08:00', outV: i === 4 ? '15:30' : '17:15', lunch: i === 4 ? 30 : 60, holiday: false, pto: false,
    away: i === 1, awayIn: i === 1 ? '11:30' : null, awayOut: i === 1 ? '01:30' : null, savedIn: null, savedOut: null })) });
  a = await open({ pre: { timecard_v3: old } });
  t.ok('old saved away 11:30 -> 01:30 (AM) now applies as 11:30A-1:30P', (await pill(a.page, 1)).startsWith('7.25H'), await pill(a.page, 1));
  t.ok('no page errors (old data)', a.errors.length === 0, a.errors.join('|'));
  await a.ctx.close();

  // phone width: dialog fits on screen
  a = await open({ width: 390, height: 844, touch: true });
  await a.page.click('.away-btn[data-day="1"]');
  const box = await a.page.locator('.away-sheet').boundingBox();
  t.ok('phone: the dialog fits the screen', box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  await a.ctx.close();

  await b.close(); t.done();
})();
