# PackyWiki

A WikiMaster-style booster pack opener where the cards are **real Wikipedia
articles**. Buy boosters from a shop that restocks every two hours, slide the rip line to
tear one open, watch the cards fly out of it, then swipe through them — each
rolled against an eight-tier rarity table with its own visual treatment and its
own synthesised chime, priced in Buckarooz by how many people actually read the
article, and saved to a collection you can filter, favourite and sell from.

Available in English and French, including the articles themselves.

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

On first launch you pick a language and get a starter kit. Buy boosters in the
**Shop**, open them from **Boosters**, and your pulls land in the
**Collection**, where you can sell duplicates back for Buckarooz.

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
  economy.js          booster prices, sell rate, the house edge, the stipend
  shop.js             the two-hourly shop, generated from the window index
  booster.js          booster specs: identity, naming, colours, art
  collection.js       localStorage: cards, wallet, inventory, profile
  i18n.js             English/French strings and the language lock
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

## The economy

This is the part that had to be right, so it is worth stating plainly.

**You cannot get rich by churning boosters.** Selling a booster's entire
contents returns a fixed fraction of what the booster cost — the same fraction
at every tier — so sell-and-reinvest always leaks value instead of compounding:

```
sell value of a card  = 30% of its price
price of a booster    = its expected sell value ÷ 0.72
```

A simulation of the obvious exploit (start with the starter kit, always buy the
most expensive booster you can afford, open it, sell everything, repeat) goes
broke in **100% of runs**, averaging 3.9 boosters before the money is gone. The
measured return is ~0.80 at every tier — Common through Artifact — so no rung
of the ladder is a better deal than any other.

A lucky Artifact can still pay for several packs. That is variance around a
losing mean, not a strategy, and it is where the excitement lives: about 5% of
those runs hit an Artifact booster at some point on the way down.

Progression therefore comes from **time**, not grinding. Each shop restock pays
a stipend, capped at four missed restocks so a long absence doesn't hand over a
fortune.

| | |
| --- | --- |
| Sell rate | 30% of card price |
| Booster return if you sell it all | 72% of its price |
| Restock / stipend | every 2 hours, Ᏸ500, max 4 banked |
| Starter kit | Ᏸ1,500 and 3 boosters |
| Subject surcharge | +25% for a booster tied to one theme |

### The shop

Stock is generated from the current two-hour window index, so it is stable
across reloads and restocks on its own — no server involved. Shelves are
grouped by tier, by subject, mixed, or just cheap, and each booster's size is
rolled between 3 and 7 cards. Price scales with both size and tier
automatically, because it is derived from the booster's own expected contents.

Scarcity is the other brake. Pricing alone would let a lucky player buy
Artifact boosters back to back, so high tiers are also **rare on the shelves**:

| Tier | Windows it appears in |
| --- | --- |
| Uncommon | 95% |
| Rare | 90% |
| Epic | 68% |
| Legendary | 40% |
| Mythic | 9% |
| Exotic | 3% |
| Artifact | 2% |

Custom boosters can turn up on any shelf too.

---

## Boosters

**18 subjects**: Cars, Formula One, Planes, Video Games, Books, Movies & Shows,
Space, Physics, Nature, Animals, Plants, History, Philosophy, Celebrities,
Quotes, Art, Cactus, Sport.

The **Boosters** tab shows only the ones you own, with a count. Each carries a
real photograph — its `hero` field names a Wikipedia article, and all 18 lead
images are fetched in a single batched `pageimages` request. The drawn icon in
`src/data/icons.js` is only the fallback for when that image is missing.

A **rarity booster** keeps its subject's colours and photo and wears the tier
as an effect on top; one with no subject falls back to the tier's own colour.

### How a booster draws

Each subject owns a list of `queries`, per language, used verbatim as the
search API's `srsearch`, so a row can mix two strategies:

```js
'incategory:"Sports cars"'   // only DIRECT members of that category
'sports car model'           // ordinary full-text search
```

`incategory:` doesn't descend into subcategories, so a broad category alone
gives a shallow pool; the free-text queries fill it back out. They also travel
between languages far better than category names do, which is why the French
lists lean on them.

Draws are filtered before they become cards: non-standard page types, extracts
under 80 characters, disambiguation pages and `List of` / `Liste de` style
pages are all rejected, with up to 8 retries per card slot and a random-article
fallback so a renamed category can never leave a booster unopenable.

### Adding a subject

Append a row to `THEME_PACKS` in `src/data/packs.js` with both languages
filled in. The shop will start stocking it on the next restock.

---

## Custom boosters

Name a game, book, film or show and PackyWiki builds a booster entirely out of
that subject's **own wiki**. Searching Wikipedia for "Terraria" yields a
handful of pages; the Terraria wiki has thousands.

1. Normalise the input — `Terraria`, `terraria` and `TERRARIA` all collapse to
   the same candidates, as do `The Legend of Zelda` → `legendofzelda`.
2. Probe each guessed Fandom subdomain's `api.php`. In a non-English session
   the **language path** (`terraria.fandom.com/fr/api.php`) is tried first, so
   a French booster holds French cards. A wiki only counts if MediaWiki answers
   **and** it has more than 40 articles, which rules out abandoned stubs.
3. If no slug matches, fall back to Fandom's cross-wiki search.
4. If nothing resolves: **"Booster cannot be created, try something else."**

Building one gives you a copy for free — you designed it. After that they turn
up in the shop like anything else.

Fandom's `pageimages` misses a lot, so when it comes back empty the app asks
what images the page actually *uses* and resolves the first real one, skipping
icons, logos and other chrome.

> Custom boosters depend on the target wiki allowing anonymous CORS
> (`origin=*`), which standard MediaWiki does.

---

## Rarity and money

### Rarity

Eight tiers. **Odds do not depend on the article** — a page with 100 views a
month has exactly the same chance at every tier as one with 100k.

| Tier | Chance | Price bonus | Visual treatment |
| --- | --- | --- | --- |
| Common | 42% | +0% | matte stock, no motion |
| Uncommon | 27% | +25% | single sheen sweep |
| Rare | 17% | +60% | breathing border + slow scan bar |
| Epic | 9% | +140% | drifting colour blobs |
| Legendary | 3.6% | +320% | rotating light rays |
| Mythic | 0.9% | +700% | flames climbing the card |
| Exotic | 0.35% | +1500% | holographic prismatic banding |
| Artifact | 0.15% | +3200% | full iridescent burst |

Two rules hold for every treatment, and both are enforced by tests:

- **Nothing leaves the card.** Every effect lives inside `.card-front`, which
  `.card-face` clips, and no card carries an outward glow.
- **Nothing is visible before the flip.** Effects are gated on `.is-lit` *and*
  sit on the back-face-hidden front. Rarity is only attached to a card after it
  has already flown out of the pack.

### Money

Prices are in **Buckarooz** (Ᏸ — a B wearing the two bars a dollar sign wears,
drawn as SVG). Popularity sets the **base price**; rarity is a **percentage on
top**:

```
price = base(popularity) × (1 + rarity.bonusPct / 100)
```

`base` runs from Ᏸ20 for an unread article to Ᏸ500 for a front-page-famous one.
A Common and an Artifact of the same article share a base — the Artifact is
simply worth 33× more of it.

---

## Opening a booster

**The rip.** No button, no pull-tab — the perforation line *is* the control.
Grab it near either end and slide; the foil parts in step with the drag behind
a glowing tear front, revealing the pack's mouth and the card tops inside. Let
go before 60% and it springs shut, complaining as it goes. Whichever direction
you pull the first time is remembered, and from then on the pack only tears
that way. Finish the tear and the torn scrap tumbles away under gravity.

**No loading screen.** Cards start being fetched as soon as a booster reaches
the middle of the shelf, and the opening animation runs on card *backs*, which
need no data — so it begins the instant the pack tears. Cards fly up out of the
pack's mouth one by one from *behind* it, while the pack sinks away, then
settle into a stack. Card backs take the booster's own colours and icon.

**The reveal.** The current card turns itself over. Swipe **right-to-left** for
the next card and **left-to-right** to go back, freely. Tapping does not
advance; holding and moving makes the card *lean* — it turns on its own axes
rather than sliding around. Pull order is **random**.

**The summary.** Once every card has been turned, the single-card view is
replaced by the whole booster laid out three to a row, with a Back button.

---

## Collection

Every pull is saved to localStorage and shows up in the **Collection** tab.

- Duplicates are kept as a copy count (`×3`); the stored rarity is the *best*
  pull of that article.
- **Click any card**, anywhere in the app, to open it full size: the whole
  article extract, scrollable, and the card itself leans as you drag it.
- From the binder that detail view also offers **Sell**. The button arms on the
  first tap and confirms on the second, so it is its own confirmation rather
  than a second dialog, and it disarms itself after a few seconds.
- **Favourite** with the star in a card's top-right corner.
- Filters live behind a **Filters** button rather than eating the top of the
  screen, with a badge showing how many are active. Filter by booster, tier,
  popularity band, minimum price, favourites and title; sort by newest, price
  ascending or descending, rarity, popularity or name.

---

## Language

English and French, chosen on first launch and then **locked**.

That is a deliberate limitation. Cards are stored with the text the wiki gave
us, so re-translating a collection would mean re-fetching every card through
langlinks — slow, lossy, and liable to fail halfway, leaving a binder in two
languages. Locking keeps every card consistent with every other.

The language decides which Wikipedia is queried, which search terms a booster
uses, and which Fandom language path a custom booster resolves against, so
cards are always in the selected language rather than whatever the wiki
happened to return.

To start over during development: `__packywiki.resetAll()`.

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

- **Local persistence only.** The collection lives in this browser's
  localStorage. No account, no server, no sync between devices; clearing site
  data wipes it.
- **No cross-pack dedupe.** Titles are de-duplicated *within* one pack. Open
  two Animals packs and you can pull Tardigrade twice — it becomes a `×2`.
- **Two languages**, English and French, chosen once and then locked.
- **No trading, no accounts, no sync.** Everything is one browser.
- **Rarity is not tied to the article.** It's an independent roll, so a stub
  can come out Artifact and a featured article can come out Common. Only the
  price knows how popular a page is.

## Natural next steps

- **Trading** — export a card (or a whole binder) as a share code, import
  someone else's.
- **Daily goals** — a reason to open a specific subject, and a second income
  stream that isn't the stipend.
- **Set completion** — track which articles a pack *can* yield and show a
  completion percentage per pack.
- **Quiz mode** — the article extract is already on the card, so blank out the
  title and make the player name it; scale the points by rarity.
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
