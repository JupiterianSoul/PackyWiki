/**
 * FIND THE MUSIC
 * ============================================================================
 * Runs in CI, where the network is open, and fills src/assets/music with slow
 * jazz that is legally free to ship: Creative Commons or public domain, with
 * the artist and the licence written down beside the file.
 *
 * Two places are asked, in order:
 *
 *   1. Openverse (api.openverse.org), the aggregator behind WordPress. Its
 *      audio index carries licence metadata per record, so a CC0 / CC-BY /
 *      public-domain filter is a real filter and not a guess.
 *   2. The Internet Archive's 78rpm collection, which is where the jazz-noir
 *      years actually live: American recordings published before 1930 are
 *      public domain in the United States, and the collection is curated.
 *
 * Nothing here is generated, and nothing is downloaded that does not carry a
 * licence saying it may be. What it writes:
 *
 *   src/assets/music/<slug>.mp3   the recordings
 *   src/assets/music/LICENSE.md   title, artist, licence and source for each
 *
 * Usage: node tools/find-music.mjs [howMany]
 */
import { writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'src/assets/music';
const WANT = Number(process.argv[2] ?? 4);
const MAX_BYTES = 9 * 1024 * 1024;      // a track nobody waits for
const MIN_SECONDS = 45;
const MAX_SECONDS = 480;

/* Words that say "slow, smoky, after hours" and words that say the opposite.
   A search engine cannot hear, so this is the closest thing to listening. */
const GOOD = /jazz|blues|swing|lounge|noir|sax|saxophone|trumpet|piano|torch|ballad|smok|midnight|nocturne|slow|mellow|cocktail|speakeasy|dixie|crooner/i;
const BAD = /remix|dubstep|techno|edm|hardcore|metal|punk|speedcore|drum ?and ?bass|trap|dance|workout|hyper|8-?bit|chiptune|christmas|jingle/i;

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'track';

const get = async (url, as = 'json') => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Wiklodo/1.0 (music sourcing; github.com/JupiterianSoul/PackyWiki)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'json' ? res.json() : res;
};

/* --- Openverse ------------------------------------------------------------ */

async function fromOpenverse() {
  const found = [];
  const queries = ['jazz noir saxophone', 'slow jazz piano', 'lounge jazz', 'blues saxophone'];
  for (const q of queries) {
    if (found.length >= WANT * 3) break;
    const url = 'https://api.openverse.org/v1/audio/?'
      + new URLSearchParams({ q, license: 'cc0,by,pdm', page_size: '20', mature: 'false' });
    let data;
    try { data = await get(url); } catch (error) { console.log(`  openverse "${q}": ${error.message}`); continue; }
    for (const row of data.results ?? []) {
      const seconds = (row.duration ?? 0) / 1000;
      const text = `${row.title ?? ''} ${(row.tags ?? []).map((t) => t.name).join(' ')} ${(row.genres ?? []).join(' ')}`;
      if (seconds && (seconds < MIN_SECONDS || seconds > MAX_SECONDS)) continue;
      if (BAD.test(text) || !GOOD.test(text)) continue;
      if (!row.url) continue;
      found.push({
        title: row.title ?? 'Untitled',
        artist: row.creator ?? 'Unknown',
        licence: `${(row.license ?? '').toUpperCase()} ${row.license_version ?? ''}`.trim(),
        licenceUrl: row.license_url ?? '',
        source: row.foreign_landing_url ?? row.url,
        url: row.url,
        where: 'Openverse'
      });
    }
    console.log(`  openverse "${q}": ${found.length} candidates so far`);
  }
  return found;
}

/* --- the Internet Archive's 78s ------------------------------------------- */

async function fromArchive() {
  const found = [];
  const search = 'https://archive.org/advancedsearch.php?'
    + new URLSearchParams({
      q: 'collection:(78rpm) AND (subject:jazz OR subject:blues OR subject:"dance orchestra") AND mediatype:audio',
      'fl[]': 'identifier', rows: '60', page: '1', output: 'json'
    });
  let docs = [];
  try { docs = (await get(search))?.response?.docs ?? []; }
  catch (error) { console.log(`  archive search: ${error.message}`); return found; }
  console.log(`  archive: ${docs.length} albums to look through`);
  for (const doc of docs.sort(() => Math.random() - 0.5)) {
    if (found.length >= WANT * 2) break;
    let meta;
    try { meta = await get(`https://archive.org/metadata/${doc.identifier}`); } catch { continue; }
    const licence = meta?.metadata?.licenseurl ?? '';
    const rights = `${meta?.metadata?.rights ?? ''} ${meta?.metadata?.possible_copyright_status ?? ''}`;
    // Only what says outright that it is free: a CC licence, or the
    // collection's own public-domain marking.
    const free = /creativecommons\.org/.test(licence) || /public ?domain/i.test(rights);
    if (!free) continue;
    const title = meta?.metadata?.title ?? doc.identifier;
    const artist = meta?.metadata?.creator ?? 'Unknown';
    if (BAD.test(`${title} ${artist}`)) continue;
    const file = (meta.files ?? []).find((f) => /\.mp3$/i.test(f.name ?? '')
      && Number(f.size ?? 0) > 200000 && Number(f.size ?? 0) < MAX_BYTES
      && Number(f.length ?? 0) > MIN_SECONDS && Number(f.length ?? 0) < MAX_SECONDS);
    if (!file) continue;
    found.push({
      title: String(title), artist: String(artist),
      licence: licence ? 'Creative Commons (see source)' : 'Public domain in the United States',
      licenceUrl: licence, source: `https://archive.org/details/${doc.identifier}`,
      url: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(file.name)}`,
      where: 'Internet Archive, 78rpm collection'
    });
  }
  return found;
}

/* --- download and write --------------------------------------------------- */

const main = async () => {
  await mkdir(DIR, { recursive: true });
  console.log('Looking for slow jazz that is free to ship.');
  let pool = await fromOpenverse();
  if (pool.length < WANT) {
    console.log(`Openverse gave ${pool.length}; asking the Internet Archive too.`);
    pool = pool.concat(await fromArchive());
  }
  // One track per artist, so the rotation is not the same band four times.
  const kept = [];
  const artists = new Set();
  for (const track of pool) {
    if (kept.length >= WANT) break;
    const key = track.artist.toLowerCase();
    if (artists.has(key)) continue;
    let bytes;
    try {
      const res = await get(track.url, 'raw');
      const type = res.headers.get('content-type') ?? '';
      if (!/audio|octet-stream|ogg|mpeg/.test(type)) { console.log(`  skip ${track.title}: ${type}`); continue; }
      bytes = Buffer.from(await res.arrayBuffer());
    } catch (error) { console.log(`  skip ${track.title}: ${error.message}`); continue; }
    if (bytes.length < 200000 || bytes.length > MAX_BYTES) { console.log(`  skip ${track.title}: ${bytes.length} bytes`); continue; }
    const name = `${slug(track.title)}.mp3`;
    await writeFile(join(DIR, name), bytes);
    artists.add(key);
    kept.push({ ...track, file: name, bytes: bytes.length });
    console.log(`  kept ${name} (${Math.round(bytes.length / 1024)} KB) - ${track.title} by ${track.artist} [${track.licence}]`);
  }

  if (!kept.length) {
    console.log('Found nothing that cleared the licence check. Leaving the folder alone.');
    process.exit(1);
  }

  // The old rotation goes, as asked: what plays now is what was just found.
  for (const name of await readdir(DIR)) {
    if (/\.(mp3|ogg)$/i.test(name) && !kept.some((k) => k.file === name)) {
      await unlink(join(DIR, name));
      console.log(`  removed ${name}`);
    }
  }

  const lines = [
    '# Background music',
    '',
    'The lounge of a card shop after hours: slow, smoky, jazz. Played in',
    'rotation by src/ui/music.js. Nothing here is generated; these are the',
    "artists' own recordings, found by tools/find-music.mjs, and the",
    'attributions below are the price of the ride.',
    ''
  ];
  for (const k of kept) {
    lines.push(`- \`${k.file}\` - "${k.title}" by ${k.artist}.`);
    lines.push(`  ${k.licence}.${k.licenceUrl ? ` <${k.licenceUrl}>` : ''}`);
    lines.push(`  Source: ${k.where}, <${k.source}>`);
  }
  lines.push('', '## Adding more', '',
    'Drop an `.ogg` or `.mp3` in this folder and it joins the rotation on the',
    'next build; nothing else needs changing. Add the artist and the licence',
    'here at the same time. Only recordings that are public domain or licensed',
    'for reuse with credit belong in this folder. `tools/find-music.mjs` can',
    'also be run again from the Actions tab to replace the whole rotation.', '');
  await writeFile(join(DIR, 'LICENSE.md'), lines.join('\n'));
  console.log(`\nWrote ${kept.length} tracks and their attributions.`);
};

main().catch((error) => { console.error(error); process.exit(1); });
