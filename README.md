# PackyWiki

A WikiMaster-style booster pack opener where the cards are **real Wikipedia
articles**. Browse the shelf, slide the rip line to tear a pack open, watch the cards fly
out of it, then swipe through them — each rolled against an eight-tier rarity
table with its own visual treatment and its own synthesised chime, priced in
Buckarooz by how many people actually read the article, and saved to a
collection you can filter and favourite.

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

Swipe the shelf to pick a pack → slide the rip line sideways to tear it open →
swipe right-to-left through the cards (left-to-right goes back). Pulls land in
the **Collection** tab. There is no cooldown.

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

## Android APK

The app also ships as a sideloadable Android APK — a thin WebView wrapper
around the same web build, so there is no second codebase to maintain.

**Getting it:** every push builds one in CI and publishes it to the rolling
[`apk-latest`](../../releases/tag/apk-latest) release. Download
`packywiki-debug.apk` on your phone, tap it, and allow your browser to install
unknown apps when prompted.

It's debug-signed, so if an existing install refuses to update, uninstall it
first. The app needs a network connection — only the shell is bundled; cards
are still fetched live from Wikipedia.

**Building it yourself** (needs the Android SDK, which CI provides):

```bash
npm run build                       # produces dist/
cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Gradle's `copyWebAssets` task copies `dist/` into the APK's assets, so
`npm run build` has to run first.

### One implementation note worth knowing

`MainActivity` serves the bundled build through `WebViewAssetLoader` on
`https://appassets.androidplatform.net/` rather than loading it over `file://`.
That isn't decoration: WebView blocks cross-origin `fetch()` from `file://`
pages, which would break every call to the Wikipedia API. Serving from a real
origin makes the app behave exactly as it does in a desktop browser.

Links to Wikipedia (`Read →`) are intercepted and handed to the system browser
instead of navigating away from the app.

Config: `minSdk 26` (Android 8.0), `targetSdk 35`. minSdk 26 also means the
vector adaptive icon is the only launcher icon needed, so the repo carries no
binary image assets.

---

## Project layout

```
index.html            markup for all three screens + the odds modal
src/
  main.js             app controller: shelf, rip, opening animation, binder
  style.css           all styling, including one block per rarity treatment
  audio.js            Web Audio synthesis (rip, card flip, per-rarity chimes)
  wiki.js             Wikipedia + custom-wiki fetching, filtering, de-duplication
  pricing.js          popularity model and card prices
  collection.js       localStorage binder, favourites, filters and sorting
  data/
    packs.js          PACK TABLE    — themes and custom-pack kinds
    rarities.js       RARITY TABLE  — one row per tier, with weights
    icons.js          ICON SET      — fallback art, logo, Buckarooz glyph
vite.config.js
android/              WebView wrapper that packages the web build as an APK
  app/src/main/
    java/.../MainActivity.java   hosts the WebView, serves assets over https
    AndroidManifest.xml
    res/                          theme + vector launcher icon
.github/workflows/android.yml     builds and publishes the APK
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

## Packs

**18 theme packs** on a horizontal shelf: Cars, Formula One, Planes, Video
Games, Books, Movies & Shows, Space, Physics, Nature, Animals, Plants, History,
Philosophy, Celebrities, Quotes, Art, Cactus, Sport. Swipe or drag the shelf
sideways; the pack in the middle is the one you open.

Each pack carries a **real photograph** rather than a symbol — its `hero` field
names a Wikipedia article, and all 18 lead images are fetched in a single
batched `pageimages` request. The drawn icon in `src/data/icons.js` is only the
fallback for when that image is missing or you're offline.

### How a theme pack draws

Each pack owns a list of `queries` used verbatim as the search API's
`srsearch`, so a row can mix two strategies:

```js
'incategory:"Sports cars"'   // only DIRECT members of that category
'sports car model'           // ordinary full-text search
```

That mix matters: `incategory:` doesn't descend into subcategories, so a broad
category alone gives a shallow pool. The free-text queries fill it back out.
One query is picked at random per card, deep queries are sampled at a random
`sroffset` (the total is cached per session), and dead queries are skipped
after one miss.

Draws are filtered before they become cards: non-standard page types, extracts
under 80 characters, disambiguation pages and `List of` / `Index of` / `Outline
of` pages are all rejected, with up to 8 retries per card slot. The last two
attempts fall back to a fully random article so a renamed category can never
leave a pack unopenable.

### Adding a pack

Append a row to `THEME_PACKS` in `src/data/packs.js`:

```js
{
  id: 'deep-time', hero: 'Tyrannosaurus', icon: 'animals', name: 'Deep Time',
  tagline: 'Dinosaurs, fossils, extinction events.',
  accent: '#a3e635', accent2: '#3f6212',
  queries: ['incategory:"Dinosaurs"', 'incategory:"Fossils"', 'extinction event']
}
```

---

## Custom boosters

Name a game, book or show and PackyWiki builds a booster entirely out of that
subject's **own wiki**.

Searching Wikipedia for "Terraria" yields a handful of pages; the Terraria wiki
has thousands. So the app resolves the dedicated wiki first:

1. Normalise the input — `Terraria`, `terraria` and `TERRARIA` all collapse to
   the same candidates, as do `The Legend of Zelda` → `legendofzelda`.
2. Probe each guessed Fandom subdomain's `api.php` for `meta=siteinfo`. A wiki
   only counts if MediaWiki answers **and** it has more than 40 articles, which
   rules out abandoned stubs.
3. If no slug matches, fall back to Fandom's cross-wiki search.
4. If nothing resolves: **"Booster cannot be created, try something else."**

Resolution takes a few round trips, so the UI shows **"Booster Pack is being
created…"** until it settles. The pack is then saved to localStorage, named
after the resolved wiki (`TERRARIA` becomes `Terraria`), and given the wiki's
logo as its pack art.

Cards are drawn from that wiki with the same MediaWiki action API — Fandom runs
MediaWiki too — using `list=random`, `prop=extracts` for the lead text, and an
`action=parse` fallback for wikis without the TextExtracts extension.

> Custom packs depend on the target wiki allowing anonymous CORS
> (`origin=*`), which standard MediaWiki does. A wiki that blocks it won't
> resolve.

---

## Rarity and money

### Rarity

Eight tiers. **Odds do not depend on the article** — a page with 100 views a
month has exactly the same chance at every tier as one with 100k.

| Tier | Chance | Visual treatment |
| --- | --- | --- |
| Common | 42% | matte stock, no motion |
| Uncommon | 27% | single sheen sweep |
| Rare | 17% | breathing border + slow scan bar |
| Epic | 9% | drifting colour blobs |
| Legendary | 3.6% | rotating light rays |
| Mythic | 0.9% | flames climbing the card |
| Exotic | 0.35% | holographic prismatic banding |
| Artifact | 0.15% | full iridescent burst |

Two rules hold for every treatment, and both are enforced by tests:

- **Nothing leaves the card.** Every effect lives inside `.card-front`, which
  `.card-face` clips with `overflow: hidden`, and no card carries an outward
  glow — an outer box-shadow is the one thing a clip can't contain.
- **Nothing is visible before the flip.** Effects are gated on `.is-revealed`
  *and* sit on the back-face-hidden front, so a face-down card can't hint at
  what it is. Rarity is only attached to a card after it has already flown out
  of the pack.

### Money

Prices are in **Buckarooz** (Ᏸ — a B wearing the two bars a dollar sign wears,
drawn as SVG in `src/data/icons.js`).

Popularity sets the **base price**; rarity is a **percentage on top**:

```
price = base(popularity) × (1 + rarity.bonusPct / 100)
```

`base` runs from Ᏸ20 for an unread article to Ᏸ500 for a front-page-famous one,
and the bonus runs from +0% (Common) to +3200% (Artifact). A Common and an
Artifact of the same article share a base — the Artifact is simply worth 33×
more of it. Custom-wiki pages have no pageview API, so article length stands in
for popularity.

### Adding a rarity tier

1. Insert a row in `RARITIES` (`src/data/rarities.js`), ordered worst → best,
   with a `weight` and a `bonusPct`.
2. Add a matching `[data-rarity="<id>"]` block in the **RARITY TREATMENTS**
   section of `src/style.css`.

Each card carries `data-rarity` plus `--rarity` / `--rarity-glow` custom
properties and two effect layers (`.fx-a`, `.fx-b`). While tuning:

```js
__packywiki.debugRarity('artifact')
__packywiki.clearCollection()
__packywiki.resetRipDirection()
```

---

## Opening a pack

**The rip.** There is no button and no pull-tab — the perforation line *is* the
control. Grab it near either end and slide sideways; the foil parts in step
with the drag, behind a glowing tear front, revealing the pack's mouth and the
card tops inside. Let go before 60% and it springs shut, complaining as it
goes. Whichever direction you pull the first time is remembered, and from then
on the pack only tears that way. Finish the tear and the torn scrap tumbles
away under gravity.

**No loading screen.** Cards start being fetched as soon as a pack reaches the
middle of the shelf, and the opening animation runs on card *backs*, which need
no data at all — so the animation begins the instant the pack tears. Cards fly
up out of the pack's mouth one by one while the pack sinks away beneath them,
then settle into a stack. The data lands underneath all of that.

**The reveal.** The current card turns itself over. Swipe **right-to-left** for
the next card and **left-to-right** to go back, freely, as many times as you
like. Tapping does nothing; holding and moving drags the card a little (damped,
so it follows your finger without being flung). Pull order is **random** — a
Legendary can come first and a Common last.

**The summary.** Once every card has been turned, the single-card view is
replaced by the whole pack laid out together at a smaller size, with a Back
button.

---

## Collection

Every pull is saved to localStorage and shows up in the **Collection** tab.

- Duplicates are kept as a copy count (`×3`), not separate entries, and the
  stored rarity is always the *best* pull of that article.
- **Favourite** any card with the star in its top-right corner.
- Filter by pack, rarity tier, popularity band, minimum price, favourites, and
  free-text title search; sort by newest, price, rarity, popularity or name.
- The header totals unique cards, copies, collection value and favourites.

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
- **Local persistence only.** The collection lives in this browser's
  localStorage. No account, no server, no sync between devices; clearing site
  data wipes it.
- **No cross-pack dedupe.** Titles are de-duplicated *within* one pack. Open
  two Animals packs and you can pull Tardigrade twice — it becomes a `×2`.
- **English Wikipedia only**, hard-coded in `wiki.js`. Custom packs are
  resolved against Fandom.
- **Rarity is not tied to the article.** It's an independent roll, so a stub
  can come out Artifact and a featured article can come out Common. Only the
  price knows how popular a page is.

## Natural next steps

- **Trading** — export a card (or a whole binder) as a share code, import
  someone else's.
- **Set completion** — track which articles a pack *can* yield and show a
  completion percentage per pack.
- **Sell / buy** — the prices are there; a market that lets you sell
  duplicates for Buckarooz and spend them on packs is the obvious next loop.
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
