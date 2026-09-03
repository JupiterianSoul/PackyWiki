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

There are 27 subjects, from Animals and Space to Cinema, Football and the
Darwin Awards. Two of them are curated rolls rather than searches: their
articles are named outright in `src/data/packs.js` and the booster deals a
random hand from that list.

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
outside the table and cannot be drawn (see [Secret codes](#secret-codes)).

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

**Level frames** open at a level of their own, from 25 to 450 across eight
styles. A locked frame still shows its drawing, since the point is to see what
you are climbing towards.

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

### Ending a save, and ending an account

Settings, Data, holds three destructive buttons that do three different things.

**Remove all cards** empties the collection and keeps the player: level,
experience, achievements and anything a secret code gave you all stay.

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

## Secret codes

Settings has a field for a secret code. A valid one hands over a whole gift at
once: a booster made for one specific person, an album of its own, a theme, a
badge, and cards wearing the **Special** tier that can never be sold,
auctioned, gifted or traded, and are never re-graded.

The codes themselves are not written down here, which is the point of them.
The machinery is in `src/codes.js` if you need to add one.

Special content is deliberately outside the game's accounting: it counts for
no achievement, no level and no album milestone, and its themes, badges and
frames stay invisible until the code that grants them is redeemed.

One code carries no cards at all. `regalia: true` marks it, and what it hands
over is a badge, an animated level frame, a theme and the launcher icon to
match.

A card in a code booster can name its own `wiki` (a thing Wikipedia has no
page for), carry its own `text`, keep a `slot` of its own when several cards
are read from one article, or be drawn rather than fetched (`art`): one
code's Matrix card wears the rain of the Matrix theme, painted on a canvas
the moment the pack is opened.

A code can also bring a level frame (`code` on a style in `src/frames.js`)
and a badge with a live effect (`live` on a badge in `src/badges.js`); both
go on the moment the code is redeemed. A code that is withdrawn is listed in
`RETIRED_CODES`, and everything it handed over is removed from a save at
launch, as if it had never been typed.

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
come from the word's own Wikipedia article, its short description and its
opening sentence with the word blanked, for a hundred of the day's points
each. A solve is worth 600 points in one guess down to 100 in six, paid
half in Buckarooz with a streak bonus of five percent a day up to half
again; a solve in two rows hands over a Rare booster, and every seventh day
of a streak a booster too. Signed in, the points are sent once to the
leaderboard.

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

**Daily quests** and **Leaderboard**. The rule that holds all of it together
is that nothing which pays out is decided on the phone.

**Wikdle** (`src/wikdle.js`, words in `src/data/wikdle-words.js`) is the
five-letter word of the day in six rows. The word is a function of the UTC
date, so everyone on Earth has the same one and a phone's clock cannot fetch
tomorrow's; a guess has to be in the dictionary before it costs a row;
duplicate letters are scored the way the original scores them (one E in the
word never lights two); and the board is written down after every guess, so
it survives a closed app and cannot be replayed once it is over. A solve is
worth 600 points in one guess down to 100 in six, paid half in Buckarooz and,
signed in, sent once to the leaderboard.

**The slot machine** (`src/slots.js`, book in `src/data/slots.js`) has three
reels, five symbols, five paylines and a paytable tuned so that it returns
95% of what is bet over the long run; `tools/slots-rtp.mjs` computes that
figure exactly from the tables. The spin is decided by the `slots` edge
function with `crypto.getRandomValues`, never by the app: the app takes the
coin, asks, checks the answer against the book (the stops exist, the windows
match them, the total adds up) and only then pays. If the house does not
answer, or the answer does not add up, the coin comes back. The machine is
one state at a time, idle, spinning, settling, paying, and refuses any input
that is not for the state it is in, so a double tap buys one spin.

**Daily quests** and **Leaderboard**. The rule that holds all of it together
is that nothing which pays out is decided on the phone.

**Wikdle** (`src/wikdle.js`, words in `src/data/wikdle-words.js`) is the
five-letter word of the day in six rows. The word is a function of the UTC
date, so everyone on Earth has the same one and a phone's clock cannot fetch
tomorrow's; a guess has to be in the dictionary before it costs a row;
duplicate letters are scored the way the original scores them (one E in the
word never lights two); and the board is written down after every guess, so
it survives a closed app and cannot be replayed once it is over. A solve is
worth 600 points in one guess down to 100 in six, paid half in Buckarooz and,
signed in, sent once to the leaderboard.

**The slot machine** (`src/slots.js`, book in `src/data/slots.js`) has three
reels, five symbols, five paylines and a paytable tuned so that it returns
95% of what is bet over the long run; `tools/slots-rtp.mjs` computes that
figure exactly from the tables. The spin is decided by the `slots` edge
function with `crypto.getRandomValues`, never by the app: the app takes the
coin, asks, checks the answer against the book (the stops exist, the windows
match them, the total adds up) and only then pays. If the house does not
answer, or the answer does not add up, the coin comes back. The machine is
one state at a time, idle, spinning, settling, paying, and refuses any input
that is not for the state it is in, so a double tap buys one spin.

**The roulette** (`src/roulette.js`, table in `src/data/roulette.js`) is a
European wheel, the real layout, every classic bet, plus the game's own tier
bets: a chip on Common covers the lowest 24 numbers and returns 1.5x, up to
Exotic on three numbers at 10x. Several chips ride one spin, up to a table
limit. The `roulette` edge function names the pocket; the app settles the
chips itself against the same table, refuses an answer that disagrees, and
turns the drawn wheel to the pocket on a long deceleration.

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
  wikdle.js  slots.js  quests.js  leaderboard.js  house.js
  achievements.js  badges.js  frames.js  progression.js  daily.js  quiz.js
  timed.js  pricing.js  packstyle.js  packview.js  save.js  i18n.js
  data/            rarities, subjects, icons, emblems, release notes,
                   the arcade's books and the Wikdle words
  ui/              themes, animated backdrops, the synth, the music player
  styles/          base, components, screens, cards, themes, desktop, games
  assets/          fonts, music, sound kits, the images a code hands over
android/           the WebView wrapper and its Gradle build
supabase/          schema.sql: tables, policies; functions/: the edge functions
tools/             sync-game-tables.mjs, slots-rtp.mjs
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
