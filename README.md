# PackyWiki

A WikiMaster-style booster pack opener where the cards are **real Wikipedia
articles**. Pick a pack, tear the zip strip open with a swipe, then swipe through five
articles one at a time — each rolled against a ten-tier rarity table with its
own visual treatment and its own synthesised chime, priced by how many people
actually read the page, and saved to a collection you can filter and favourite.

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

Pick a pack → drag the zip tab left or right to tear it open → swipe each card
to reveal it. Pulls land in the **Collection** tab. There is no cooldown, so
**Open Another** goes straight into a fresh rip.

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
  main.js             app controller: screens, zipper drag, swipe reveal, binder
  style.css           all styling, including one block per rarity treatment
  audio.js            Web Audio synthesis (rip, card flip, per-rarity chimes)
  wiki.js             Wikipedia + custom-wiki fetching, filtering, de-duplication
  pricing.js          popularity model and card prices
  collection.js       localStorage binder, favourites, filters and sorting
  data/
    packs.js          PACK TABLE    — themes, generated rarity packs, custom kinds
    rarities.js       RARITY TABLE  — one row per tier, with weights
    icons.js          ICON SET      — hand-drawn SVG, no emoji
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

Three kinds of booster:

**18 theme packs** — Cars, Formula One, Planes, Video Games, Books,
Movies & Shows, Space, Physics, Nature, Animals, Plants, History, Philosophy,
Celebrities, Quotes, Art, Cactus, Sport.

**10 rarity boosters**, one per tier, generated from the rarity table so a new
tier automatically gets a pack. Each has a `tierShift` that tilts the whole
table upward and a `floorTier` that excludes the bottom ranks outright — the
Legendary booster can't hand you a Common.

**3 custom booster kinds** — video game, book, movie/show. See below.

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
  id: 'deep-time', name: 'Deep Time', icon: 'animals',
  tagline: 'Dinosaurs, fossils, extinction events.',
  accent: '#a3e635', accent2: '#3f6212',
  queries: ['incategory:"Dinosaurs"', 'incategory:"Fossils"', 'extinction event']
}
```

`icon` is a key in `src/data/icons.js`, not an emoji — icons are hand-drawn
24×24 line SVGs so they render identically everywhere and inherit the pack's
accent colour.

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
created…"** until it settles. Once created, the pack is saved to localStorage
and named after the resolved wiki (so `TERRARIA` becomes `Terraria`, not
`TERRARIA`).

Cards are then drawn from that wiki with the same MediaWiki action API —
Fandom runs MediaWiki too — using `list=random`, `prop=extracts` for the lead
text, and an `action=parse` fallback for wikis without the TextExtracts
extension.

> Custom packs depend on the target wiki allowing anonymous CORS
> (`origin=*`), which standard MediaWiki does. A wiki that blocks it won't
> resolve.

---

## Rarity, popularity and price

Popularity is the hinge the whole economy turns on, and it deliberately pulls
in two directions:

- a popular article makes a card **worth more**
- a popular article makes a high rarity **harder to roll**

So a Legendary Ayrton Senna is both far rarer and far more valuable than a
Legendary on some 200-view stub.

Popularity comes from the Wikimedia pageviews API (average of the last two
complete months, on a log scale). Custom-wiki pages have no pageview API, so
article length stands in — on a topic wiki, the big articles are the ones
people care about.

### Rarity

| Tier | Odds (obscure) | Odds (famous) | Visual treatment |
| --- | --- | --- | --- |
| Common | 40% | 63% | matte stock |
| Uncommon | 25% | 24% | sheen sweep |
| Rare | 15% | 8.5% | pulsing edge glow |
| Double Rare | 9% | 3.1% | twin sheen + sparkles |
| Epic | 5.5% | 1.1% | pulsing aura |
| Ultra Rare | 3% | 0.35% | rainbow foil shimmer |
| Legendary | 1.6% | 0.12% | rotating light rays |
| Mythic | 0.7% | 0.03% | flame flicker |
| Secret Rare | 0.15% | 0.005% | holographic prismatic banding |
| Artifact | 0.05% | 0.001% | full iridescent burst |

Each tier's weight is multiplied by `0.6 ^ (popularity × rank)`, which is why
an Artifact is ~50× harder on a famous page than an obscure one. The same
table drives the in-app **Odds** modal, so the two can't drift.

### Price

`price = (12 + 180 × popularity^1.6) × rarity.value`, where `value` runs from
1× (Common) to 160× (Artifact). A Common on a dead article is ~$43; an Artifact
on a front-page-famous one is ~$31,000.

### Adding a rarity tier

1. Insert a row in `RARITIES` (`src/data/rarities.js`), ordered worst → best,
   with a `weight` and a price `value`.
2. Add a matching `[data-rarity="<id>"]` block in the **RARITY TREATMENTS**
   section of `src/style.css`.

A booster pack for the new tier is generated automatically. Each card carries
`data-rarity` plus `--rarity` / `--rarity-glow` custom properties, and has two
dedicated effect layers (`.fx-a`, `.fx-b`) plus a `.card-aura` behind it.
Effect layers sit above the artwork but *below* the text, so even the loudest
foil never makes the article unreadable.

While tuning, force every card on screen to one tier from the console:

```js
__packywiki.debugRarity('artifact')
__packywiki.clearCollection()
```

---

## Opening a pack

**The zipper.** Packs aren't opened by a button. There's a pull-tab on the
perforation line: drag it **left or right** and the foil tears in step with the
drag — the strip is clipped away behind a moving tear front, revealing the dark
interior and the card tops inside. Let go before 60% and it springs shut. The
tearing sound is granular, firing a short noise burst every few percent, so it
tracks the gesture rather than playing a fixed sample. Arrow keys and Enter
work too.

**The reveal.** Cards don't cascade in on their own. They arrive as a face-down
stack and you **swipe each one** — one swipe reveals the current card, retires
the previous one into the tray below it, and brings the next forward. Tap,
arrow keys and Enter do the same thing. Pulls are sorted worst-first, so the
best card is always last.

---

## Collection

Every pull is saved to localStorage and shows up in the **Collection** tab.

- Duplicates are kept as a copy count (`×3`), not separate entries, and the
  stored rarity is always the *best* pull of that article — pulling Tardigrade
  again as a Legendary upgrades the entry.
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
  can come out Artifact and a featured article can come out Common.

## Natural next steps

- **Trading** — export a card (or a whole binder) as a share code, import
  someone else's.
- **Set completion** — track which articles a pack *can* yield and show a
  completion percentage per pack.
- **Sell / buy** — the prices are there; a market that lets you sell
  duplicates for credits and spend them on packs is the obvious next loop.
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
