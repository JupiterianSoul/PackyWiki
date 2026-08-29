# PackyWiki

A WikiMaster-style booster pack opener where the cards are **real Wikipedia
articles**. Pick a pack, tear the foil, and watch five articles flip over one
at a time — each rolled against a ten-tier rarity table with its own visual
treatment and its own synthesised chime.

No backend, no API key, no build-time data. Everything is fetched live from
Wikipedia's public API and every sound is generated at runtime with the Web
Audio API.

---

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default <http://localhost:5173>).

Click a pack → **Open Pack** → watch the pulls. Click **Open Another** to go
straight into a fresh rip; there is no cooldown in this build.

Other scripts:

```bash
npm run build     # production bundle into dist/
npm run preview   # serve the built bundle
```

Requires Node 18+ (for `fetch`) and a browser with Web Audio — any current
Chrome, Firefox, Safari or Edge.

> **Sound:** browsers refuse to start audio before a user gesture, so the
> AudioContext is created on your first click. The 🔊 button in the top bar
> mutes everything.

---

## Project layout

```
index.html            markup for all three screens + the odds modal
src/
  main.js             app controller: screen flow, reveal choreography, wiring
  style.css           all styling, including one block per rarity treatment
  audio.js            Web Audio synthesis (rip, card flip, per-rarity chimes)
  wiki.js             Wikipedia fetching, filtering and de-duplication
  data/
    packs.js          PACK TABLE    — one row per booster pack
    rarities.js       RARITY TABLE  — one row per tier, with weights
vite.config.js
```

The two tables in `src/data/` are the extension points. Everything else reads
from them: the pack picker, the accent colours, the odds modal and the card
effects are all generated, so neither table has a hard-coded counterpart
anywhere in the UI code.

### Screen flow

1. **Pack picker** — tiles built from `PACKS`, each in its own accent colour.
2. **Open** — the pack floats idly, shakes while cards are fetched, then rips.
3. **Reveal** — cards deal in and flip one at a time, worst pull first.

---

## How packs work

Each pack has a `source`:

- `random` — hits `GET /api/rest_v1/page/random/summary`, so any article in the
  encyclopedia can turn up. This is **Classic Archive**.
- `category` — searches the action API for `incategory:"X"`, picks a random
  result, then fetches that title's summary.

The five packs that ship:

| Pack | Source | Categories |
| --- | --- | --- |
| Classic Archive | random | — |
| Science Wing | category | Physics, Biology, Chemistry, Astronomy, Mathematics, … |
| History Hall | category | Ancient history, Wars, Empires, Archaeology, … |
| Arts & Culture | category | Painting, Music, Film, Literature, … |
| World Atlas | category | Geography, Countries, Mountains, Rivers, … |

**Two things worth knowing about `incategory:`.** It matches *direct* members
of a category only — not articles in its subcategories — so a broad top-level
category has a shallower pool than you'd guess. And deep categories would
otherwise always serve the same first 50 hits, so `wiki.js` caches each
category's `totalhits` and re-queries at a random `sroffset` to sample across
the whole category.

Draws are filtered before they ever become a card. `wiki.js` rejects anything
that isn't `type: "standard"`, anything with an extract under 80 characters,
disambiguation pages, and `List of` / `Index of` / `Outline of` style pages. It
retries up to 8 times per card slot, and the last two attempts always fall back
to a random article — so a renamed or emptied category can never brick a pack.
Titles are also de-duplicated *within* a pack.

### Adding a pack

Append a row to `PACKS` in `src/data/packs.js`. That's the whole change:

```js
{
  id: 'deep-time',
  name: 'Deep Time',
  tagline: 'Dinosaurs, fossils, extinction events.',
  icon: '🦕',
  source: 'category',
  categories: ['Dinosaurs', 'Fossils', 'Extinction events'],
  cards: 5,
  accent: '#a3e635',
  accent2: '#3f6212'
}
```

---

## Rarity system

Ten tiers, rolled independently per card. Weights are relative, not
percentages — the roll normalises by the actual total, so you can add a tier
without rebalancing the others.

| Tier | Odds | Visual treatment |
| --- | --- | --- |
| Common | 40% | matte stock, no shine |
| Uncommon | 25% | sheen sweep |
| Rare | 15% | pulsing edge glow |
| Double Rare | 9% | twin sheen + drifting sparkles |
| Epic | 5.5% | pulsing aura + colour blobs |
| Ultra Rare | 3% | rainbow foil shimmer |
| Legendary | 1.6% | rotating light rays |
| Mythic | 0.7% | flame flicker licking the card edges |
| Secret Rare | 0.15% | holographic prismatic banding |
| Artifact | 0.05% | full iridescent burst |

The top three tiers are all sub-1%. The same table drives the in-app **Odds**
modal, so it can never drift out of sync with the actual weights.

Rarity also scales the drama: higher tiers trigger a stronger screen flash, a
longer pause before the next card, and a more layered chime.

### Adding a rarity tier

1. Insert a row in `RARITIES` (`src/data/rarities.js`), keeping the array
   ordered worst → best, and give it a `weight`.
2. Add a matching `[data-rarity="<id>"]` block in the **RARITY TREATMENTS**
   section of `src/style.css`.

Each card element carries `data-rarity`, plus `--rarity` and `--rarity-glow`
custom properties, and has two dedicated effect layers (`.fx-a`, `.fx-b`) plus
a `.card-aura` behind it. Effect layers sit above the artwork but *below* the
text, so even the loudest foil never makes the article unreadable.

While tuning effects, force every card on screen to one tier from the console:

```js
__packywiki.debugRarity('artifact')
```

---

## Sound

`src/audio.js` synthesises everything — there are no audio files in this repo.

- **Rip** — two overlapping bandpass noise sweeps, a scatter of short
  high-frequency crinkles, and a low sine thump as the pack lands.
- **Card flip** — a short filtered noise burst.
- **Reveal chime** — a pentatonic arpeggio through a convolution reverb whose
  impulse response is generated from decaying noise. Rank drives everything:
  2 → 6 partials, a rising root note, a longer tail and more reverb send. From
  Epic up a sub-octave comes in; from Legendary a metallic sawtooth shimmer;
  from Mythic a riser; and the top two tiers add a bloom of detuned octaves.

---

## Intentionally missing (this is a debug build)

- **No cooldown.** Packs open back to back, unlimited, on purpose — it's the
  fastest way to eyeball the rare tiers. A real build would gate this.
- **No persistence.** Refreshing loses everything. There is no `localStorage`,
  no account, no server.
- **No cross-session dedupe.** Titles are de-duplicated *within* one pack only.
  Open two Science Wing packs and you can absolutely pull Tardigrade twice.
- **No collection view.** Cards exist until you open the next pack, then
  they're gone.
- **English Wikipedia only**, hard-coded in `wiki.js`.
- **Rarity is not tied to the article.** It's an independent roll, so a stub
  can come out Artifact and a featured article can come out Common.

## Natural next steps

- **Persistence** — write pulls to `localStorage` keyed by page ID, with a
  pulled-at timestamp and a copy count.
- **Collection / album view** — a binder grouped by pack or by rarity, with
  slots for what you haven't pulled yet and a completion percentage.
- **Trading** — export a card (or a whole binder) as a share code, import
  someone else's.
- **Quiz mode** — the article extract is already on the card, so blank out the
  title and make the player name it; scale the points by rarity.
- **Real cooldown + currency** — a pack timer, and rarer packs that cost
  something to open.
- **Duplicate handling** — a "shiny" upgrade path, or dust/crafting from
  repeats.
- **More packs** — the table makes this a one-row change; the interesting work
  is finding categories with deep direct membership.

---

## Notes

Article text and images come from Wikipedia and are licensed
[CC BY-SA](https://en.wikipedia.org/wiki/Wikipedia:Copyrights); every card
links back to its source article. This is a hobby project and is not
affiliated with the Wikimedia Foundation.
