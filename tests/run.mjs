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
  app: 'offline', hellfire: 'offline', games: 'offline', regalia: 'offline',
  fixes6: 'stub', worldclock: 'stub', facetoface: 'stub', g4: 'stub'
};
const PORT = Number(process.env.PORT) || 4173;
const OUT = 'tests/out';
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const wanted = args.length === 0 ? Object.keys(MODES)
  : args.every((a) => a === 'stub' || a === 'offline') ? Object.keys(MODES).filter((n) => args.includes(MODES[n]))
    : args;
for (const name of wanted) if (!MODES[name]) { console.error(`no suite called ${name}`); process.exit(2); }

const waitForPort = (port, tries = 60) => new Promise((resolve, reject) => {
  const attempt = (n) => {
    const sock = createConnection({ port, host: '127.0.0.1' });
    sock.once('connect', () => { sock.end(); resolve(); });
    sock.once('error', () => { if (n <= 0) reject(new Error('preview never came up')); else setTimeout(() => attempt(n - 1), 500); });
  };
  attempt(tries);
});

const results = [];
for (const mode of [...new Set(wanted.map((n) => MODES[n]))]) {
  execSync(`node tests/build.mjs ${mode}`, { stdio: 'inherit' });
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  try {
    await waitForPort(PORT);
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
    await new Promise((r) => setTimeout(r, 500));
  }
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} suite(s) failed: ${failed.map((r) => r.name).join(', ')} (see tests/out/*.log)` : `\nall ${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
