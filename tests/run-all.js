// Runs every *.test.js in this folder and prints a summary. Exit code is non-zero if any suite fails.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
const results = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+) passed, (\d+) failed/);
  const crashed = !m;
  results.push({ f, pass: m ? +m[1] : 0, fail: m ? +m[2] : 0, crashed, out, status: r.status });
  if (r.status !== 0) process.stdout.write(out.split('\n').filter(l => /^FAIL|Error|^\s+at /.test(l)).slice(0, 25).join('\n') + '\n');
}
console.log('\nSuite'.padEnd(28) + 'passed  failed');
for (const r of results) console.log(('  ' + r.f).padEnd(28) + String(r.pass).padEnd(8) + (r.crashed ? 'CRASHED' : r.fail));
const totalFail = results.reduce((a, r) => a + r.fail + (r.crashed ? 1 : 0), 0);
console.log(`\n${results.reduce((a, r) => a + r.pass, 0)} checks passed, ${totalFail} failed`);
process.exit(totalFail ? 1 : 0);
