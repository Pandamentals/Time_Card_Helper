// Tic, the status mascot: mood follows the week's difference, the motion engine runs, hello only plays when calm,
// hover and tap react, and nothing throws.
const { launch, planWith, openApp, suite } = require('./helpers');
const t = suite('Mascot');

(async () => {
  const b = await launch();
  const MON = '2026-11-02T09:00:00';   // week of Nov 2-6 2026: no company holidays, default 40H week
  const open = (opts = {}) => openApp(b, Object.assign({ date: MON, plan: planWith({}) }, opts));
  const setTime = (page, id, v) => page.evaluate(([i, val]) => { const el = document.getElementById(i); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
  const mood = page => page.evaluate(() => [...document.getElementById('mascotPanel').classList].filter(c => c.startsWith('mascot-status-')).join(','));
  const copy = page => page.evaluate(() => document.getElementById('mascotLineA').textContent);
  const attr = (page, p, name) => page.evaluate(([k, n]) => document.querySelector(`[data-p="${k}"]`).getAttribute(n), [p, name]);
  const style = (page, p, prop) => page.evaluate(([k, n]) => document.querySelector(`[data-p="${k}"]`).style[n], [p, prop]);
  // sample a numeric reading every `step` ms of page time and return the samples
  const sample = async (page, ms, step, read) => { const out = []; for (let i = 0; i < ms / step; i++) { await page.clock.runFor(step); out.push(await read()); } return out; };
  const hiOpacity = page => style(page, 'hi', 'opacity').then(Number);
  const bodyY = page => style(page, 'body', 'transform').then(v => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(v || ''); return m ? +m[2] : 0; });
  const mittAngle = page => attr(page, 'mittR', 'transform').then(v => { const m = /rotate\(([-\d.]+)/.exec(v || ''); return m ? +m[1] : 0; });

  // ── mood follows the week's difference: one status class at a time ──
  let a = await open();
  t.ok('on target: good mood, "TARGET LOCKED"', await mood(a.page) === 'mascot-status-good' && await copy(a.page) === 'TARGET LOCKED', await mood(a.page));
  const steps = [['09:00', 'worried', 'SHORT 1+'], ['10:00', 'stressed', 'SHORT 2+'], ['11:00', 'meltdown', 'SHORT 3+']];
  for (const [time, name, text] of steps) {
    await setTime(a.page, 'in-0', time);
    t.ok(`starting ${time}: ${name} mood and "${text}"`, await mood(a.page) === `mascot-status-${name}` && await copy(a.page) === text, `${await mood(a.page)} / ${await copy(a.page)}`);
  }
  await setTime(a.page, 'in-0', '08:00'); await setTime(a.page, 'out-0', '17:45');
  t.ok('half an hour over is still on target', await mood(a.page) === 'mascot-status-good', await mood(a.page));
  await setTime(a.page, 'out-0', '18:15');
  t.ok('an hour over: a single "over" mood, "OVER TARGET"', await mood(a.page) === 'mascot-status-over' && await copy(a.page) === 'OVER TARGET', `${await mood(a.page)} / ${await copy(a.page)}`);
  await setTime(a.page, 'out-0', '21:15');
  t.ok('four hours over uses the same single "over" mood', await mood(a.page) === 'mascot-status-over', await mood(a.page));
  t.ok('no page errors (moods)', a.errors.length === 0, a.errors.join('|')); await a.ctx.close();

  // ── the motion engine runs and drives the drawing ──
  a = await open();
  await a.page.clock.runFor(800);
  t.ok('body is being moved by the engine', /translate\(/.test(await style(a.page, 'body', 'transform')), await style(a.page, 'body', 'transform'));
  const d1 = await attr(a.page, 'armPathL', 'd');
  await a.page.clock.runFor(700);
  t.ok('noodle arm path changes over time', d1 !== await attr(a.page, 'armPathL', 'd'));
  t.ok('pupils move (translate set)', /translate\(/.test(await style(a.page, 'pupilL', 'transform')));
  t.ok('no page errors (engine)', a.errors.length === 0, a.errors.join('|')); await a.ctx.close();

  // ── hello: waves with a HI! bubble when on target, never when short ──
  a = await open();
  let ops = await sample(a.page, 3000, 125, () => hiOpacity(a.page));
  t.ok('on target: HI! bubble shows on load', Math.max(...ops) > 0.6, 'peak ' + Math.max(...ops).toFixed(2));
  t.ok('HI! bubble is gone again afterwards', ops[ops.length - 1] < 0.05, 'last ' + ops[ops.length - 1]);
  await a.ctx.close();
  a = await open();
  await setTime(a.page, 'in-0', '09:00');
  ops = await sample(a.page, 3000, 125, () => hiOpacity(a.page));
  t.ok('short mood: no HI! bubble', Math.max(...ops) === 0, 'peak ' + Math.max(...ops));
  await a.ctx.close();
  a = await open();
  await setTime(a.page, 'out-0', '18:15');
  ops = await sample(a.page, 3000, 125, () => hiOpacity(a.page));
  t.ok('over target: HI! bubble shows', Math.max(...ops) > 0.6, 'peak ' + Math.max(...ops).toFixed(2));
  await a.ctx.close();

  // ── hover (mouse) waves, tap hops ──
  a = await open();
  await a.page.clock.runFor(4000);                                           // let hello finish
  const idle = await sample(a.page, 600, 50, () => mittAngle(a.page));
  await a.page.hover('#mascotPanel');
  const waving = await sample(a.page, 800, 50, () => mittAngle(a.page));
  t.ok('hovering Tic makes the right arm wave', Math.max(...waving.map(Math.abs)) > Math.max(...idle.map(Math.abs)) + 8,
    `idle ${Math.max(...idle.map(Math.abs)).toFixed(1)} vs hover ${Math.max(...waving.map(Math.abs)).toFixed(1)}`);
  await a.page.mouse.move(5, 5);
  await a.page.clock.runFor(1500);
  const ys0 = await sample(a.page, 400, 50, () => bodyY(a.page));
  await a.page.click('#mascotPanel');
  const ys1 = await sample(a.page, 500, 50, () => bodyY(a.page));
  t.ok('tapping Tic makes it hop', Math.min(...ys1) < Math.min(...ys0) - 2, `rest ${Math.min(...ys0).toFixed(1)} vs tap ${Math.min(...ys1).toFixed(1)}`);
  t.ok('no page errors (hover and tap)', a.errors.length === 0, a.errors.join('|')); await a.ctx.close();

  // ── reduced motion keeps working, just calmer ──
  a = await open({ reducedMotion: 'reduce' });
  await a.page.clock.runFor(1500);
  t.ok('reduced motion: engine still drives the drawing without errors', /translate\(/.test(await style(a.page, 'body', 'transform')) && a.errors.length === 0, a.errors.join('|'));
  await a.ctx.close();

  // ── narrow screen ──
  a = await open({ width: 360 });
  await a.page.clock.runFor(1500);
  const box = await a.page.evaluate(() => { const r = document.querySelector('.time-mascot').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  t.ok('narrow screen: mascot is 44px and the page does not scroll sideways', box[0] === 44 && box[1] === 44 && await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), JSON.stringify(box));
  await a.ctx.close();

  await b.close();
  t.done();
})().catch(e => { console.error(e); process.exit(1); });
