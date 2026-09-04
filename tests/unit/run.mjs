/**
 * The unit checks: plain Node, no browser, a second or two. Every file in
 * this folder ending in .test.mjs is run in its own process and passes when
 * it exits 0. `npm run check` runs these before the sweep.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests/unit').filter((n) => n.endsWith('.test.mjs')).sort();
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, [`tests/unit/${file}`], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} unit file(s) failed` : `\nunit: ${files.length} file(s) passed`);
process.exit(failed ? 1 : 0);
