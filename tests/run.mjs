/**
 * The suites, run the way they are meant to be run: a build for their mode,
 * the preview server up, each suite in its own process with the output
 * folder as its working directory, and one verdict at the end.
 *
 *   node tests/run.mjs             every suite
 *   node tests/run.mjs stub        only the suites that need the fake backend
 *   node tests/run.mjs offline     only the suites that run with no backend
 *   node tests/run.mjs app games   named suites (their modes are looked up)
 *
 * A suite passes when it exits 0. Screenshots and logs land in tests/out.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';

const MODES = {
  app: 'offline', hellfire: 'offline', games: 'offline', regalia: 'offline', offline: 'offline', product: 'offline', arcade2: 'offline',
  fixes6: 'stub', worldclock: 'stub', facetoface: 'stub', g4: 'stub', sync: 'stub'
};
const PORT = Number(process.env.PORT) || 4173;
const OUT = 'tests/out';
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const wanted = args.length === 0 ? Object.keys(MODES)
  : args.every((a) => a === 'stub' || a === 'offline') ? Object.keys(MODES).filter((n) => args.includes(MODES[n]))
    : args;
for (const name of wanted) if (!MODES[name]) { console.error(`no suite called ${name}`); process.exit(2); }

const portOpen = (port) => new Promise((resolve) => {
  const sock = createConnection({ port, host: '127.0.0.1' });
  sock.once('connect', () => { sock.end(); resolve(true); });
  sock.once('error', () => resolve(false));
});
const until = async (test, what, tries = 60) => {
  for (let n = 0; n < tries; n++) { if (await test()) return; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(what);
};

// The port must be ours. A server left behind by an earlier run would answer
// in the new one's place and serve the wrong build, and every suite would
// fail on its first screen for no reason the logs could show.
if (await portOpen(PORT)) { console.error(`port ${PORT} is already in use; stop that server first (or set PORT)`); process.exit(2); }

// Every mode is built first, each into its own folder, and only then served:
// the source tree is read once, at the start, so editing it while a long
// suite runs changes nothing about what that suite is testing.
const modes = [...new Set(wanted.map((n) => MODES[n]))];
for (const mode of modes) execSync(`node tests/build.mjs ${mode} ${OUT}/dist-${mode}`, { stdio: 'inherit' });

const results = [];
for (const mode of modes) {
  // vite itself, not through npx: killing a wrapper can leave the server
  // it started alive on the port.
  // Bound to 127.0.0.1 by name: on a runner where localhost is ::1 first, a
  // server on "localhost" never answers the address the suites dial.
  const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', `${OUT}/dist-${mode}`, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  try {
    await until(() => portOpen(PORT), 'preview never came up');
    for (const name of wanted.filter((n) => MODES[n] === mode)) {
      const started = Date.now();
      const code = await new Promise((resolve) => {
        const child = spawn('node', [`../suites/${name}.mjs`], { cwd: OUT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BASE_URL: `http://127.0.0.1:${PORT}/` } });
        let log = '';
        child.stdout.on('data', (d) => { log += d; });
        child.stderr.on('data', (d) => { log += d; });
        const timer = setTimeout(() => child.kill('SIGKILL'), 8 * 60 * 1000);
        child.on('close', (c) => { clearTimeout(timer); writeFileSync(`${OUT}/${name}.log`, log); resolve(c); });
      });
      const seconds = Math.round((Date.now() - started) / 1000);
      results.push({ name, mode, ok: code === 0, seconds });
      console.log(`${code === 0 ? 'ok  ' : 'FAIL'}  ${name} (${mode}, ${seconds}s)`);
    }
  } finally {
    preview.kill('SIGTERM');
    await until(async () => !(await portOpen(PORT)), 'preview would not stop', 20).catch(() => preview.kill('SIGKILL'));
  }
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} suite(s) failed: ${failed.map((r) => r.name).join(', ')} (see tests/out/*.log)` : `\nall ${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
