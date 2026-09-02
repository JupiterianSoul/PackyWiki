# Wiklodo

A trading card game built out of Wikipedia. You buy booster packs, tear them
open with your thumb, and the cards inside are real Wikipedia articles: a
photograph, a title, the opening lines, and a rarity decided by how many
people actually read that page last month.

It runs as a website and as an Android app, from one codebase and one build.

- **Play in a browser:** https://jupiteriansoul.github.io/PackyWiki/
- **Android:** the newest APK is always the `apk-latest` release of this
  repository.

The whole app is vanilla JavaScript with no framework. Vite bundles it, the
Android app is a WebView around the same `dist/`, and Supabase holds accounts
and the social features. If you want to read the source, `src/main.js` is the
application and everything else is a module it pulls in.

## Contents

- [Running it](#running-it)
- [How a card is made](#how-a-card-is-made)
- [Boosters](#boosters)
- [Rarity](#rarity)
- [Money](#money)
- [The collection](#the-collection)
- [Progression](#progression)
- [Accounts and the social side](#accounts-and-the-social-side)
- [Themes, sound and motion](#themes-sound-and-motion)
- [Secret codes](#secret-codes)
- [The Android app](#the-android-app)
- [The website](#the-website)
- [Project layout](#project-layout)
- [Names that cannot change](#names-that-cannot-change)
- [Credits](#credits)

## Running it

Node 20 or newer.

```sh
npm install
npm run dev        # development server on :5173
npm run build      # production build into dist/
npm run preview    # serve the built dist/ on :4173
```

`npm run build` is the whole product. `dist/` is what the website serves and
what the Android app wraps, byte for byte.

The app works with no backend at all: without Supabase credentials it runs
fully offline-capable and local, and only the account features are missing.
To turn those on, see [Accounts](#accounts-and-the-social-side).

## How a card is made

A card is one Wikipedia article. Drawing one means:

1. **Find candidates.** A booster's subject is a set of search queries. The
   draw runs two of them and pools the results, so a whole pack costs about
   one search rather than one per card.
2. **Insist on a picture.** A card with no image is not a card. The draw takes
   the lead image, and if there is none it goes looking for the first real
   photograph on the page. An article that cannot produce one is skipped, not
   shown blank.
3. **Insist on real text.** Disambiguation pages, list articles and stubs
   whose opening lines say nothing are rejected.
4. **Ask how many people read it.** Monthly pageviews come from the Wikimedia
   REST API, and that number alone decides the card's rarity.

The same article is therefore the same rarity for every player in the world,
which is the property the whole economy rests on.

Cards are drawn in the language the app is set to. A French card that has no
French article falls back to the English one rather than vanishing.

## Boosters

A booster has a **subject**, a **size** (3 to 7 cards) and sometimes a
**tier**.

There are 27 subjects, from Animals and Space to Cinema, Football and the
Darwin Awards. Two of them are curated rolls rather than searches: their
articles are named outright in `src/data/packs.js` and the booster deals a
random hand from that list.

### Tier boosters

A booster can carry a rarity on its face, and that is a promise about what is
inside it:

Rarity is rolled, then the card is found. Per card, twice over:

1. **Roll a rarity** off the booster's odds row.
2. **Find an article that has it**, from the popularity range that rarity means.

Rarity is still the article's own property, so the same page is the same rarity
for everyone. What the table decides is what the draw goes looking for.

A tier booster rolls on a better row and, on top of that, always contains at
least one card of its tier. A card above the promised tier keeps the promise:
a Legendary in an Epic pack is not a broken one.

| Booster | Com | Unc | Rare | Epic | Leg | Myth | Exo | Pris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| basic | 68 | 18 | 8 | 3.5 | 1.6 | 0.6 | 0.25 | 0.05 |
| Uncommon | 50 | 28 | 13 | 5.5 | 2.2 | 0.9 | 0.35 | 0.05 |
| Rare | 34 | 30 | 20 | 9 | 4.2 | 1.8 | 0.85 | 0.15 |
| Epic | 20 | 26 | 26 | 16 | 7.5 | 3 | 1.3 | 0.2 |
| Legendary | 11 | 18 | 25 | 23 | 14 | 6 | 2.6 | 0.4 |
| Mythic | 6 | 11 | 19 | 24 | 22 | 12 | 5 | 1 |
| Exotic | 3 | 6 | 12 | 19 | 24 | 20 | 13 | 3 |
| Prismatic | 1.5 | 3 | 7 | 13 | 20 | 24 | 20 | 11.5 |

The whole table lives in `src/data/odds.js`. Booster prices are computed from
it, so tuning a row reprices the shop rather than desynchronising it.

### When a subject cannot serve a roll

Roll a Mythic in an Animals booster and the subject may hold no page that
famous. The draw does **not** go looking elsewhere: a footballer in an Animals
pack is worse than a missing tier. It drops a tier instead, and the player is
owed a single-card booster of the rarity that went missing, with no subject of
its own so it can actually deliver it.

One card owed, one card paid, and that size is load bearing. Paying a full pack
for one missing card is a fivefold rebate, and the odds make that ruinous: a
Prismatic booster rolls a rarity its subject cannot serve in 98% of openings,
so it would refund itself nearly every time.

### Custom boosters

You can build a booster out of any Fandom wiki: type a subject, the app probes
for a matching wiki, and if it finds one with real content the booster draws
from it. Getting a usable picture out of Fandom is the hard part, so the draw
tries the page image, the original upload, the lead image and finally any
image on the page, rejecting thumbnails too small to fill a card.

Custom boosters are private to whoever built them and never enter the shared
card index.

## Rarity

Eight tiers, decided entirely by monthly readership:

| Tier | Reads per month, roughly |
| --- | --- |
| Common | anything |
| Uncommon | 2,000 |
| Rare | 13,000 |
| Epic | 57,000 |
| Legendary | 160,000 |
| Mythic | 360,000 |
| Exotic | 700,000 |
| Prismatic | 1,300,000 |

Each tier has its own treatment on the card: foils, refraction, glare that
follows the phone's gyroscope, and for the top tiers an animated surface. The
odds sheet in the app explains the whole scale to players.

There is a ninth rarity, **Special**, which sits outside this table and cannot
be drawn. See [Secret codes](#secret-codes).

## Money

The currency is Buckarooz. A card's price comes from its readership and its
tier, selling returns a fraction of that price, and boosters are priced from
what they can be expected to contain, so opening and selling always loses
money on average. That is deliberate: the collection is the point, not the
arbitrage.

Income comes from a stipend paid on every shop restock (two hours), a daily
gift, timed boosters that build up whether the app is open or not, levelling
up, and a five-a-day quiz.

The shop restocks every two hours with a spotlight discount, a free shelf that
is always stocked so an empty wallet is never a dead end, six subjects, a
vault of tier boosters, and everything you have built yourself.

## The collection

Cards are filed into **albums**, one per subject, plus albums for custom wikis
and for each secret code. An album knows its real total: for a searched
subject it is the number of matching articles on Wikipedia, so most albums
cannot be finished, and that is the joke.

Duplicates stack as `×2`. The binder has a grid view and a classic two-page
book view you turn by swiping.

Alongside it, the **Card Index** is the shared record of every card anyone has
pulled, and a **wishlist** marks cards you want, which friends and the auction
floor can both see.

## Progression

- **Levels** to 500, earned by opening boosters, with a frame for your avatar
  every 10 levels across 5 styles.
- **100 achievements** in chains, from your first booster to genuinely absurd
  collection milestones.
- **Badges** in 10 styles, worn four at a time on your profile.

## Accounts and the social side

Accounts are optional. Signed in, you get cloud save across devices, plus
friends, chat, trading, gifting, an auction house where cards go to real
bidders, and presence.

The backend is Supabase. To run your own:

1. Create a project.
2. Run `supabase/schema.sql` in the SQL editor. It creates the tables and,
   more importantly, the row level security policies.
3. Put the project URL and the **publishable** key in `.env.production`:

   ```
   VITE_SUPABASE_URL=https://yourproject.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```

The publishable key is meant to ship inside the client and is committed here
on purpose. It grants nothing on its own: row level security is the boundary,
and every policy in `schema.sql` is written on the assumption that anyone can
see this key. The **secret** key must never appear in this repository or in a
build.

Syncing is last-writer-wins on a debounce, with the local save always
authoritative for the session you are in, so a dropped connection never costs
you cards.

## Themes, sound and motion

14 themes, each a full palette with its own animated backdrop, its own
synthesised sound kit, and its own launcher icon on Android. The app's mark is
painted in the current theme's accents, so the drawer, the splash and the sign
in gate all follow a theme change.

Every sound effect is synthesised at runtime from oscillators, so the app
ships no sound files for its own interface. Music is a shuffle of found jazz
recordings, credited in `src/assets/music/LICENSE.md`.

A low power mode cuts the backdrop and the card effects for phones that get
hot, and everything respects `prefers-reduced-motion`.

## Secret codes

Settings has a field for a secret code. A valid one hands over a whole gift at
once: a booster made for one specific person, an album of its own, a theme, a
badge, and cards wearing the **Special** tier that can never be sold,
auctioned, gifted or traded, and are never re-graded.

The codes themselves are not written down here, which is the point of them.
The machinery is in `src/codes.js` if you need to add one.

Special content is deliberately outside the game's accounting: it counts for
no achievement, no level and no album milestone, and its themes and badges
stay invisible until the code that grants them is redeemed.

## The Android app

A WebView around the built `dist/`, served over a real `https://` origin by
`WebViewAssetLoader` so that `fetch()` to Wikipedia obeys ordinary CORS rules
instead of the restrictions a `file://` page would face.

```sh
npm run build
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

CI builds it on every push and publishes it as the rolling `apk-latest`
release.

### Signing, and why the key is in the repo

`android/keystore/` holds a signing key, committed deliberately, used by both
build types.

Android identifies an app by its signature. Without a fixed key, every CI
build is signed by a freshly generated one, so every build looks like a
different app: updates refuse to install, and uninstalling to make room takes
the player's whole collection with it. The committed key buys the one thing
that matters for a sideloaded hobby app, which is that every build installs
over the last one and keeps the save. It protects nothing else, and the
password is in `build.gradle` next to it. Anything shipping for real should
generate a proper key and pass it through CI secrets.

### Play Protect

Android offers to scan any sideloaded APK with Play Protect. **No application
can switch that off**; it belongs to the device. You can decline the scan when
prompted, or turn it off in Play Store → Play Protect → Settings.

What the app can do is not make it worse, so what ships is a release build.
A debug build sets the `debuggable` flag, which is the thing Android words its
warnings most strongly about.

## The website

The site is the same `dist/`, published to GitHub Pages from the `gh-pages`
branch. That branch holds build output only and is replaced wholesale on each
publish. `.nojekyll` stops Pages filtering the build's filenames, and
`404.html` is a copy of `index.html` so deep links land in the app.

Cloudflare is supported as an alternative, either through its dashboard Git
integration or through `.github/workflows/cloudflare.yml`, which deploys
`wrangler.jsonc` as a Worker serving static assets once
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist as repository
secrets, and does nothing at all until then.

Above 1024px the app stops being a phone in the middle of a monitor:
`src/styles/desktop.css` stands the bottom bar up as a rail down the left,
opens sheets as centred dialogues, and lets the grids use the width.

## Project layout

```
src/
  main.js          the application: screens, rendering, every interaction
  wiki.js          all Wikipedia and Fandom access, and the draw itself
  collection.js    saved state and every localStorage key
  account.js       Supabase: auth, sync, friends, trades, auctions
  booster.js       a booster spec, and what it is allowed to draw
  economy.js       prices, tiers, the shop cadence, what a pack guarantees
  shop.js          the shelves, seeded so everyone sees the same shop
  albums.js        filing cards, and how big an album really is
  codes.js         secret codes and the cards they hand over
  achievements.js  badges.js  frames.js  progression.js  daily.js  quiz.js
  timed.js  pricing.js  packstyle.js  packview.js  save.js  i18n.js
  data/            rarities, subjects, icons, emblems, release notes
  ui/              themes, animated backdrops, the synth, the music player
  styles/          base, components, screens, cards, themes, desktop
  assets/          fonts, music, sound kits, the images a code hands over
android/           the WebView wrapper and its Gradle build
supabase/          schema.sql: tables, policies, the edge function
```

## Names that cannot change

Three identifiers still say `packywiki`, and all three are load bearing:

- **`packywiki.*` localStorage keys.** These are where every player's
  collection lives. Renaming them without a migration erases every save on
  every device.
- **`com.packywiki.app`**, the Android `applicationId`. It is the app's
  identity to Android and the key to the WebView's storage. Changing it
  installs a second app and strands the collection in the first.
- **The key name inside `supabase/schema.sql`**, which has to match the
  localStorage key it reads.

Everything a player can see says Wiklodo. These three are plumbing, and the
cost of renaming them is somebody's collection.

## Credits

Article text and images come from Wikipedia and are licensed
[CC BY-SA](https://en.wikipedia.org/wiki/Wikipedia:Copyrights). Every card
links back to the article it came from. This is a hobby project and is not
affiliated with the Wikimedia Foundation.

Bundled third-party material, all of it credited in place:

- Music: found recordings, credited track by track in
  `src/assets/music/LICENSE.md`.
- Two theme sound kits (Cartoon, Matrix) use recordings from the `uisfx`
  project, CC0 1.0, see `src/assets/sfx/LICENSE.md`.
- The Cartoon theme bundles Comic Neue, SIL OFL 1.1, see `src/assets/fonts/`.

Every other sound is synthesised at runtime and every other typeface is a
system stack.
