# Wikster

A trading card game built out of Wikipedia. You buy booster packs, tear them
open with your thumb, and the cards inside are real Wikipedia articles: a
photograph, a title, the opening lines, and a rarity decided by how many
people actually read that page last month.

It runs as a website and as an Android app, from one codebase and one build.

- **Play in a browser:** https://jupiteriansoul.github.io/Wikster/
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
what the Android app wraps, byte for byte (less the music, which the app
plays from the site).

```sh
npm test               # npm run check, then every browser suite
npm run check          # i18n parity, the sweep, the unit checks, the type check
npm run test:offline   # the suites that need no backend
npm run test:stub      # the suites that run against the fake Supabase
npm run shots          # every screen at 1440x900, for looking at
node tools/economy-report.mjs   # where Buckarooz come from and go
```

The suites live in `tests/suites` and run with Playwright against a real
build served by `vite preview`; `tests/run.mjs` builds each mode into its
own folder first, so editing while a suite runs changes nothing about what
it tests. `tests/lib/supastub.mjs` is a Supabase that answers from memory
(auth, saves and their history, friends, chat, trades, auctions, the codex,
the leaderboard), which is what lets the social suites run without a
project. `tests/unit` holds Node-only checks of the pure modules. The same
`npm test` runs on every push in `.github/workflows/tests.yml`.

`jsconfig.json` and `npm run typecheck` run TypeScript over the JavaScript:
the pure modules carry `// @ts-check`, `src/types.js` names the shapes
(Card, Entry, PackSpec, SaveEnvelope) and `src/env.d.ts` the build's globals.

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
4. **Ask how many people read it.** Once the draw has settled on its cards,
   one request fetches their monthly readers, and that number is each
   article's **fame**: it sets the price. It does not decide the rarity; the
   booster does, below. A pack is never held for it: past a couple of
   seconds the card is priced on its size and corrected on its next pull.

Cards are drawn in the language the app is set to. A French card that has no
French article falls back to the English one rather than vanishing.

## Boosters

A booster has a **subject**, a **size** (3 to 7 cards) and sometimes a
**tier**.

There are 26 subjects, from Animals and Space to Cinema, Football and Memes.
Most are searches; a subject may instead be a curated roll, its articles named
outright in `src/data/packs.js`, and the booster then deals a random hand from
that list.

### Rarity is the print

Rarity is rolled when a pack is opened, one roll per card, off the booster's
odds row. The roll is the card's rarity: its **print**, the way a physical
card is a common or a foil of the same picture. The article is drawn from the
subject separately. The two are independent, which is the whole point: an
Epic pack deals Epics at its printed rate in every subject, thin or famous,
and nothing has to be owed, capped or repaired afterwards.

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

Pull an article you already own at a better print and the better print takes
its place in the collection, copies kept. That is what a duplicate is for.

### Custom boosters

You can build a booster out of any Fandom wiki: type a subject, the app probes
for a matching wiki, and if it finds one with real content the booster draws
from it. Getting a usable picture out of Fandom is the hard part, so the draw
tries the page image, the original upload, the lead image and finally any
image on the page, rejecting thumbnails too small to fill a card.

Custom boosters are private to whoever built them and never enter the shared
card index.

## Rarity

Eight tiers, rolled per card as described above, plus **Special**, which sits
outside the table and cannot be drawn.

Each tier has its own treatment on the card: foils, refraction, glare that
follows the phone's gyroscope, and for the top tiers an animated surface. The
odds sheet in the app shows the exact rates for the booster in front of you.

A collection written before prints existed keeps the tiers it had: a card
with no tier on record is graded once from its fame, and never again.

## Money

The currency is Buckarooz. A card's price comes from its fame and its print,
selling returns a fraction of that price, and boosters are priced from
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
and for each personal booster. An album knows its real total: for a searched
subject it is the number of matching articles on Wikipedia, so most albums
cannot be finished, and that is the joke.

Duplicates stack as `×2`. The binder has an album shelf and a **classic**
view of every card at once, grouped by subject, with a search field of its
own.

Since most albums cannot be finished, each has **medals** that can be
(`ALBUM_TIERS` in `src/albums.js`): Bronze at 75 different cards of the
subject, Silver at 200, Gold at 500, Diamond at 1,000, each paying coins and
from Silver up a booster of the subject with a guaranteed tier. An album
smaller than a rung awards it on being complete instead; the personal
albums behind a code have none. The rung reached shows as a disc on the
cover, and the open album carries the four rungs with the one to claim.

Three spare copies of a card **fuse** into a one-card booster guaranteed a
tier above the card's (the fourth Cat becomes an Epic pull), from the card's
own sheet; a Prismatic has nowhere to go. When a card is looked at, its
article is checked once a week (`src/wiki/repair.js`): a renamed page brings
the card's title and text up to date, a deleted one is said to be gone. The
card itself is never taken away.

Cards are drawn from the whole encyclopaedia, and the whole encyclopaedia
includes articles nobody wants opening on a bus, so Settings carries **Blur
adult content**. It reads the card's own title, description and opening
against a short list of unambiguous terms (`src/sensitive.js`) and hides the
picture on the ones that match, in the collection, the albums and the picture
picker. Nothing is removed, no draw changes, and an open card can be
uncovered with a tap: the setting hides a picture, it does not edit the
game.

Alongside it, the **Card Index** is the shared record of every card anyone has
pulled, and a **wishlist** marks cards you want, which friends and the auction
floor can both see.

## Progression

- **Levels** to 500, earned by opening boosters, with a frame for your avatar
  from level 1 and a new tier of it every 10 levels, across 8 styles.
- **100 achievements** in chains, from your first booster to genuinely absurd
  collection milestones.
- **Badges** in 10 styles, worn four at a time on your profile.

### Dressing the collection

Customization holds two pickers beyond the theme.

**Card effects** choose the look each rarity wears, one row per tier and five
styles each: the treatment drawn for that tier, plus Foil Sheen, Prism Split,
Halo and Archive. They are earned by holding cards of that tier, so the cost
falls as the tier rises and still bites harder in practice. Every alternate is
painted in the rarity's own colour, so a choice never costs the ladder its
legibility. The table is `src/data/fx.js`; the CSS lives under `[data-fx]`.

**Level frames** open at a level of their own, from 15 to 200 across eight
styles, and a ninth, the Singularity, waits at the level cap of 500. A locked
frame still shows its drawing, since the point is to see what you are climbing
towards.

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

Syncing is per key, not per blob (`src/save.js`, `src/account/save.js`).
Every storage key in the save carries the time it last changed on the
device that wrote it, and a push first looks at the server's row: if another
device wrote since this one last looked, the two saves are merged key by
key, the newer copy of each winning and a tie going to the account, and
keys the other device changed later come down before the merged save goes
up. A device that has already played the account merges the same way at
sign-in; a fresh device, or one holding another account's save, takes the
account's save whole, which is what carries a collection onto a new phone.
The local save stays authoritative for the session you are in, so a dropped
connection never costs you cards.

Under all of it the server keeps the save's history: `saves_history` in
`schema.sql` files the row being replaced on every write (thinned with age:
the last hour, one an hour for a day, one a day after that, never more than
forty) and always the one from before an erase. Settings, Data, **Backups**
lists them and puts one back; the save it replaces is filed first, so a
restore can be undone. A project that ran an older `schema.sql` has to run
the current one again for the table and for the `submit_score` function the
newer games use.

### Ending a save, and ending an account

Settings, Data, holds three destructive buttons that do three different things.

**Remove all cards** empties the collection and keeps the player: level,
experience, achievements and personal boosters all stay.

**Erase everything** ends the save and signs you out. The save row is deleted,
the profile's progress is reset, the wishlist, friends, messages, deliveries,
trades and auctions go, and the device is cleared down to the session token, so
the app comes back at the welcome screen. Signing in again finds an account
with nothing stored against it. Signing out is the point: without it the cloud
save simply comes back down.

**Delete account** removes the account itself, so the address stops working and
is free to sign up with again. This one needs an edge function, because
deleting a row in `auth.users` takes the service key and that key must never
ship in an APK:

```sh
supabase secrets set SERVICE_ROLE_KEY=...   # Settings, API, service_role
supabase functions deploy delete-account
```

The function takes the caller's id from their token and never from the request
body, so it can only ever delete the person asking.

To wipe **every** account at once, `supabase/wipe-all-accounts.sql` is run by
hand in the SQL editor. It is deliberately not something the app can do.

## Themes, sound and motion

15 themes, each a full palette with its own animated backdrop, its own
synthesised sound kit, and its own launcher icon on Android. The app's mark is
painted in the current theme's accents, so the drawer, the splash and the sign
in gate all follow a theme change.

Every sound effect is synthesised at runtime from oscillators, so the app
ships no sound files for its own interface. Music is a shuffle of found jazz
recordings, credited in `src/assets/music/LICENSE.md`.

A low power mode cuts the backdrop and the card effects for phones that get
hot, and everything respects `prefers-reduced-motion`.

## The Android app

A WebView that opens the published site. The site updates the moment it is
published, so the app does too: every change reaches the phone on its next
launch, with no reinstall. The APK only needs rebuilding when the shell itself
changes (a new launcher icon, a WebView setting), which is rare.

The built `dist/` still ships inside the APK, as the fallback for when the
site cannot be reached: the shell opens it if the phone has no network, or if
the site's page fails to load. It is served over a real `https://` origin by
`WebViewAssetLoader` so that `fetch()` to Wikipedia obeys ordinary CORS rules
instead of the restrictions a `file://` page would face. The two copies are
different origins, so they keep separate device storage; the account's save
is what carries a collection between them.

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

## The arcade: minigames, quests and the leaderboard

Behind the shop there is a small arcade, in the drawer as **Minigames**,
**Daily quests** and **Leaderboard**. The rule that holds all of it together
is that nothing which pays out is decided on the phone.

**Wikdle** (`src/wikdle.js`, words in `src/data/wikdle-words.js`) is the
five-letter word of the day in six rows. The word is a function of the UTC
date, so everyone on Earth has the same one and a phone's clock cannot fetch
tomorrow's; a guess has to be in the dictionary before it costs a row;
duplicate letters are scored the way the original scores them (one E in the
word never lights two); and the board is written down after every guess, so
it survives a closed app and cannot be replayed once it is over. Two hints
are offered for 120 of the day's points each, and both have to earn it: the
first is always a letter in its place, read off the answer itself, so it
needs no connection and can never be vague; the second is what the word
means, taken from Wikipedia and only when the page is a real article rather
than a list of the things the word can name, and another letter when it is
not. A solve is worth 1,400 points in one guess down to 500 in six, never
less than 320 after hints, paid at ninety percent in Buckarooz with a streak
bonus of five percent a day up to half again; a solve in two rows hands over
a Rare booster, and every seventh day of a streak a booster too. Signed in,
the points are sent once to the leaderboard.

**The Popularity Duel** (`src/duel.js`) is two of your own cards: one shows
how many people read its article in a month, the other hides it, and the
call is more or fewer. Right, and the challenger takes the seat and a new
one walks in, the streak growing (100 points, then 110, then 120); wrong,
and the round is over; fifteen in a row is a perfect with a 500-point
bonus. Three rounds a day, paid at a quarter of the points in Buckarooz.
The cards are the player's, so the game is about knowing what you collected,
and it opens once the album holds ten different cards with a readership.

**Guess the Article** (`src/reveal.js`) is a card's picture, blurred past
recognition, and four titles: the answer and three decoys from the same
album, so the subject is never the tell. The blur lifts a step every few
seconds, or sooner on request, and the points fall with it, 250, 180, 120,
60; a wrong pick pays nothing and names the card. Eight cards a round,
three rounds a day, paid at thirty percent. It opens at twelve different
cards with a picture, and never shows a card the adult filter would blur.

Both send the day's best round to the leaderboard through `submit_score`,
which now takes the three device-scored games with a maximum per game and
keeps one row per game and day, replacing a duel's or a reveal's when a
later round beats it.

**The slot machine** (`src/slots.js`, book in `src/data/slots.js`) has three
reels, five paylines and eight symbols drawn as their own small pictures: six
that pay, a **wild** that stands in for any of them (three wilds is the
jackpot at 700 times the line bet), and a **bonus** scatter: three anywhere
in the window open eight free spins at the same bet, which the house plays on
the spot and answers with all at once. The paytable is tuned so that the
machine returns about 95% of what is bet over the long run, bonus counted;
`tools/slots-rtp.mjs` computes that figure exactly from the tables. The spin
is decided by the `slots` edge function with `crypto.getRandomValues`, never
by the app: the app takes the coin, asks, checks every window it is handed
against the book (the stops exist, the windows match them, the total adds
up, the bonus has exactly eight spins) and only then pays. If the house does
not answer, or the answer does not add up, the coin comes back. The machine
is one state at a time, idle, spinning, settling, paying, bonus, and refuses
any input that is not for the state it is in, so a double tap buys one spin.

**Daily quests** (`src/quests.js`, book in `src/data/quests.js`) are three a
day from a book of over a hundred, easy, medium and hard by weight, dealt
from the UTC date and the player's id so the deal is the same wherever it is
asked. Everything the player already does reports to them: opening, pulling,
buying, selling, quizzes, trades, the arcade. Signed in, the `quests`
function deals, records progress and honours a claim only when its own copy
of the progress meets the target; signed out, the device does the same for
itself, and nothing reaches a leaderboard.

**The leaderboard** (`src/leaderboard.js`) is three tables on the server,
daily, weekly and all-time, kept by a trigger over every score submitted;
`pg_cron` empties the daily table at midnight UTC and the weekly one on
Sunday. A page is twenty rows and the player's own standing comes back
separately so it can be pinned to the bottom of the screen.

Deploying the arcade to a Supabase project takes three steps: run
`supabase/schema.sql` (V6) in the SQL editor, enable the `pg_cron` extension
under Database, Extensions, and deploy the functions. The functions are
deployed by GitHub: `.github/workflows/supabase.yml` runs
`supabase functions deploy` for every function on each push that touches
one, once the repository holds a `SUPABASE_ACCESS_TOKEN` secret (a personal
access token from the Supabase dashboard, Account, Access Tokens). From a
terminal instead:

```
npx supabase login
npx supabase functions deploy slots quests --project-ref lfcehzltokzaymnqodgh
```

`tools/sync-game-tables.mjs` copies the books (slots, quests) into
`supabase/functions/_shared/` as TypeScript, so the server and the app can
never disagree about what a line pays. Without the functions the app still
runs: Wikdle and the quests work on the device, the casino says the house is
closed, and the leaderboard says what to run.

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

The site is also an installable web app: `public/manifest.webmanifest` and
its icons (drawn from the logo by `tools/icons.mjs`), and a service worker
written out by the build from `src/sw.js` with the build's own file list in
it. The worker stores the shell on the first visit (the page, the scripts,
the styles, the sounds; not the music) and answers navigations from the
network first, three seconds, then the shell, so an update is never held
back by the cache and no connection still opens the app. Card pictures from
Wikipedia are kept as they go by, a few hundred at most. Wikipedia itself is
never cached: a draw needs the live encyclopaedia. The APK's built-in copy
does not register it; that origin is answered by the wrapper.

The eight stylesheets are cascade layers in the order `src/style.css` lists
them, so a later file restyles an earlier one by position rather than by
selector weight, and the first screen loads a third of the JavaScript it
used to: the market, the index, the quiz, the timeline, the games, the Wikdle
word lists and the sample kits are chunks fetched when they are opened.

## Project layout

```
src/
  main.js          the entry: it loads src/app/boot.js
  app/             the application, one module per screen: boot, core,
                   open, packs, shop, binder, detail, market, social, gate,
                   settings, arcade, wikdle, slots, duel, reveal, quiz...
  wiki.js          the public face of src/wiki/: fetch, draw, custom,
                   translate, repair, filter, core
  collection.js    saved state and every localStorage key
  account.js       the public face of src/account/: client, session,
                   profile, save (sync and backups), schema, social,
                   market, index
  duel.js  reveal.js   the two newer games' arithmetic and ledgers
  sw.js            the service worker, written out by the build
  booster.js       a booster spec, and what it is allowed to draw
  economy.js       prices, tiers, the shop cadence, what a pack guarantees
  shop.js          the shelves, seeded so everyone sees the same shop
  albums.js        filing cards, and how big an album really is
  wikdle.js  slots.js  quests.js  leaderboard.js  house.js
  achievements.js  badges.js  frames.js  progression.js  daily.js  quiz.js
  timed.js  pricing.js  packstyle.js  packview.js  save.js  i18n.js
  data/            rarities, subjects, icons, emblems, release notes,
                   the arcade's books and the Wikdle words
  ui/              themes, animated backdrops, the synth, the music player,
                   the sample kits, h() for building DOM, the event bus
  styles/          themes, base, components, booster, cards, screens, games,
                   desktop: cascade layers, in that order
  assets/          fonts, music, sound kits, a few bundled pictures
public/            the web manifest and its icons
android/           the WebView wrapper and its Gradle build
supabase/          schema.sql: tables, policies; functions/: the edge functions
tests/             the browser suites, their stubs, the runner, the unit checks
tools/             split-module.mjs (the AST splitter), i18n-check.mjs,
                   sweep.mjs, economy-report.mjs, icons.mjs,
                   sync-game-tables.mjs, slots-rtp.mjs
```

## The names underneath

The app has been PackyWiki, then Wiklodo, and is Wikster. Three identifiers
carry a rename's cost, and each was handled rather than left behind:

- **`wikster.*` localStorage keys.** These are where every player's
  collection lives. The first launch of a build carries every `packywiki.*`
  key over to its `wikster.*` name and removes the old one
  (`migrateLegacyStorage` in `src/save.js`), and a pasted save from before
  the rename is read under its old keys and old envelope name.
- **`com.wikster.app`**, the Android `applicationId`. It is the app's
  identity to Android and the key to the WebView's storage. It changed with
  the rename, so this APK installs beside an older Wiklodo rather than over
  it: the old one is uninstalled by hand, and the account's save carries the
  collection across.
- **The key name inside `supabase/schema.sql`**, which has to match the
  localStorage key it reads. It says `wikster.collection.v3`; a project that
  ran an older schema.sql has to run the current one again.

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
