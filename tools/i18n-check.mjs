/**
 * The two languages have to carry the same keys, and each key once. Runs in
 * CI and before every release; a missing French line used to be found by a
 * player.
 */
import { readFileSync } from 'node:fs';
const src = readFileSync('src/i18n.js', 'utf8');
const en0 = src.indexOf('\n  en: {'), fr0 = src.indexOf('\n  fr: {');
if (en0 < 0 || fr0 < 0) { console.error('i18n: could not find the en/fr tables'); process.exit(2); }
const keysOf = (a, b) => [...src.slice(a, b).matchAll(/^    ([a-zA-Z0-9_]+):/gm)].map((m) => m[1]);
const en = keysOf(en0, fr0), fr = keysOf(fr0, src.length);
const se = new Set(en), sf = new Set(fr);
const dupes = (l) => l.filter((k, i) => l.indexOf(k) !== i);
const problems = [];
for (const k of en) if (!sf.has(k)) problems.push(`missing in fr: ${k}`);
for (const k of fr) if (!se.has(k)) problems.push(`extra in fr: ${k}`);
for (const k of dupes(en)) problems.push(`duplicate in en: ${k}`);
for (const k of dupes(fr)) problems.push(`duplicate in fr: ${k}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`i18n: ${en.length} keys in both languages`);
