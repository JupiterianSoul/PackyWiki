/**
 * Things that must never reach the repository: an em dash anywhere in the
 * app's text, a private key, a mention of a personal code outside the code
 * table itself.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ROOTS = ['src', 'index.html', 'README.md', 'supabase', 'android/app/src/main/java'];
const SKIP = /\.(mp3|png|jpg|jpeg|webp|svg|ico|woff2?)$/i;
const files = [];
const walk = (p) => { try { const st = statSync(p); if (st.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f)); else if (!SKIP.test(p)) files.push(p); } catch { /* absent root */ } };
ROOTS.forEach(walk);
const RULES = [
  { name: 'em dash', test: (s) => s.includes('—') },
  { name: 'secret key', test: (s) => /sb_secret_[A-Za-z0-9_]{8,}/.test(s) && !/sb_secret_\.\.\./.test(s) },
  { name: 'Groq key', test: (s) => /gsk_[A-Za-z0-9]{20,}/.test(s) },
  { name: 'personal code outside src/codes.js', test: (s, f) => !/src[\/\\]codes\.js$/.test(f) && !/tests[\/\\]/.test(f) && /H3LLF1R3|TH3CR34T0R/.test(s) }
];
const problems = [];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const rule of RULES) if (rule.test(s, f)) problems.push(`${rule.name}: ${f}`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`sweep: ${files.length} files clean`);
