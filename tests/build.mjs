/**
 * Build a dist for the suites.
 *
 *   node tests/build.mjs offline   no backend at all: the gate never shows
 *   node tests/build.mjs stub      a fake Supabase the suites answer for
 *   node tests/build.mjs           the real production build
 *
 * A second argument is the output folder; without one the build lands in
 * dist, where the production build belongs.
 *
 * `.env.production` carries the real project and wins over empty shell
 * variables, so the two test modes hide it for the length of the build.
 */
import { execSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';

const mode = process.argv[2] ?? 'production';
const outDir = process.argv[3] ?? 'dist';
const env = { ...process.env };
const hidden = '.env.production.hidden';
const hide = mode !== 'production' && existsSync('.env.production');
if (hide) renameSync('.env.production', hidden);
if (mode === 'stub') {
  env.VITE_SUPABASE_URL = 'https://stub.supabase.co';
  env.VITE_SUPABASE_ANON_KEY = 'stub-anon-key';
}
try {
  execSync(`npx vite build --outDir ${outDir}`, { stdio: 'pipe', env });
  console.log(`built ${mode} into ${outDir}`);
} finally {
  if (hide) renameSync(hidden, '.env.production');
}
