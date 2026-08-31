# Wiklodo

A WikiMaster-style booster pack opener where the cards are **real Wikipedia
articles**. Buy boosters from a shop that restocks every two hours, slide the rip line to
tear one open, watch the cards fly out of it, then swipe through them — each
rolled against an eight-tier rarity table with its own visual treatment and its
own synthesised chime, priced in Buckarooz by how many people actually read the
article, and saved to a collection you can filter, favourite and sell from.

Four themes, and a theme here is not a palette: each carries its own shapes,
typeface, pace, texture, live backdrop and musical instrument.

Available in English and French, including the articles themselves.

No backend, no API key, no build-time data, and no UI framework or component
library. Everything is fetched live from Wikipedia's public API, every control
is built from scratch, and every sound is synthesised at runtime with the Web
Audio API.

> The app was called PackyWiki until the rename. Two things deliberately kept
> the old name: the Android `applicationId` (`com.packywiki.app`) and the
> `packywiki.` localStorage prefix. Both are identity rather than branding —
> changing the first installs a second, empty app alongside the first, and
> changing the second wipes every existing collection on the next launch.

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

Accounts, cloud save and friends need a Supabase project; see
[Accounts, cloud save and friends](#accounts-cloud-save-and-friends). Without
one, everything else works and the collection simply stays on the device.

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
`wiklodo-debug.apk` on your phone, tap it, and allow your browser to install
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

### Signing, and why the key is in the repo

`android/keystore/wiklodo-debug.keystore` is committed, and every build is
signed with it.

It has to be. Android identifies an app by its signing certificate. There was
no `signingConfig` at first, so `assembleDebug` fell back to
`~/.android/debug.keystore` — and a CI runner is a fresh machine every time, so
Gradle **generated a new random key on every build**. Every APK looked like a
different app: none would install over the last, and uninstalling to make room
took the WebView's localStorage, and with it the player's whole collection.

The key is a debug key for a sideloaded app, the password is in the Gradle file
next to it, and it protects nothing — a debug-signed APK is not trustworthy to
begin with. What it buys is the only thing that matters here: **every build
updates in place and keeps the save.** If this ever ships properly, generate a
real key and pass it through CI secrets instead of committing it.

`versionCode` comes from `BUILD_NUMBER` (the CI run number), so each build is
newer than the last, and `allowBackup` is on so Android's own backup carries a
save to a new phone.

Installs made before this was fixed cannot be updated in place — the key that
signed them is gone. **`RESCUE.md`** has the one-time procedure for getting
that collection out through `chrome://inspect` and back in through the new
save transfer.

---

## The interface

The app is not a web page with an app-shaped stylesheet on it. Its parts are
built here rather than borrowed, and none of it is a component library.

**The frame.** A live canvas backdrop, a floating app bar carrying the level
ring, the screen, the wallet and the gift, five destinations in a floating
bottom bar, and one sheet that every panel in the app uses. Opening a pack is
a **takeover**: the frame gets out of the way and the backdrop stops, so the
whole frame budget goes to the cards.

**The controls**, all in `src/ui/components.js`:

| | |
|---|---|
| `press` | takes the press on the way *down*, with the sound |
| `Odometer` | digits that roll, so a balance change reads before you can |
| `Ring` | the level badge, sweeping to its value |
| `Bar` | a fill that animates from wherever it already was |
| `Segmented` | one indicator that *travels* between segments |
| `Sheet` | rubber-bands upward, dismisses on distance **or** velocity |
| `NavBar` | one indicator that travels; the active icon lifts |
| `Rail` | a depth carousel with a magnetic centre |

The pairing that matters most is the sheet's: dismissing on velocity as well
as distance is most of what separates a sheet that feels native from a div
someone animated.

---

## Themes

A theme is not a palette. Each of the four carries its own **shape language,
typeface, pace, texture, backdrop and instrument**:

| | Aurora | Paper | Arcade | Noir |
|---|---|---|---|---|
| Surface | glass, blurred | cream, hard ink border | neon on black | one light on black |
| Corners | 18px | 8px | 2px | 2px |
| Type | sans | serif | monospace, uppercase | display serif |
| Shadow | soft, blurred | hard offset block | outer glow | deep, soft |
| Press | scales down | sinks into its shadow | shifts and flares | barely moves |
| Pace | 1.0x | 0.6x, snappy | 0.42x, immediate | 1.5x, cinematic |
| Backdrop | drifting aurora ribbons | paper fibre and ruled lines | CRT grid horizon | light leak, blinds, grain |
| Instrument | FM bell | marimba | square and saw | plucked string |

Colour and shape live in `styles/themes.css`, one block per theme; the canvas
and synth parameters live in `ui/themes.js` under the same ids. Adding a theme
is a row in one, a block in the other, and a renderer — nothing else in the app
knows the list.

The picker in Settings gives each option its own `data-theme`, so **the token
block applies to the option itself**: you are choosing between four miniatures
of the app rather than four names and a swatch.

---

## Sound

Every sound is synthesised at runtime. The repo ships no audio files, and the
theme decides the instrument, so switching theme changes what the app *sounds*
like as much as what it looks like. One chain serves everything:

```
voice -> [ soft clip ] -> bus -> filter -> compressor -> master -> out
                           \-> send -> convolver (generated room) -> master
```

Four voices, written from first principles: an **FM bell** (a modulator at
3.01x, decaying faster than its carrier), a **marimba** (three inharmonic
partials plus a mallet knock), a **chiptune** stack (square plus detuned saw,
gated rather than faded), and a **plucked string** (Karplus-Strong: a noise
burst through a tuned delay that damps a little each pass).

Twenty-odd sounds cover the whole app rather than just the opening: taps,
navigation with a sense of direction, toggles that differ on and off, sheets,
a card turning face up, the shelf snapping, buying, selling, refusal, arming
something destructive, gifts, level-ups, XP, and a chime when a timed booster
becomes ready.

---

## Project layout

```
index.html            the app shell: frame, screens, one sheet
src/
  main.js             app controller: screens, opening flow, wiring
  style.css           imports the six stylesheets below
  styles/
    themes.css        ONE BLOCK PER THEME — the only place colour lives
    base.css          reset, typography, frame, backdrop, texture
    components.css    the app's own controls and their per-theme variants
    booster.css       the foil pack and the rip
    cards.css         the card, the flip, one block per rarity tier
    screens.css       layout for each destination
  ui/
    themes.js         THEME TABLE — canvas and synth parameters
    sound.js          the synthesiser: four voices, one signal chain
    backdrop.js       one live canvas renderer per theme
    components.js     press, Odometer, Ring, Bar, Segmented, Sheet, NavBar, Rail
  account.js          the only file that talks to a server: auth, sync, friends
  save.js             export/import of the whole save, as inspectable text
  wiki.js             Wikipedia + custom-wiki fetching, filtering, de-duplication
  pricing.js          popularity model and card prices
  economy.js          booster prices, sell rate, the house edge, the stipend
  shop.js             the two-hourly shop, generated from the window index
  booster.js          booster specs: identity, naming, colours, art
  progression.js      XP, the 500-level curve, ranks and level rewards
  daily.js            the 30-slot daily gift board and its claim rules
  timed.js            timed boosters: accrual, the ten-level track, odds
  collection.js       localStorage: cards, wallet, inventory, profile
  i18n.js             English/French strings and the language lock
  data/
    packs.js          PACK TABLE    — themes and custom-pack kinds
    rarities.js       RARITY TABLE  — one row per tier, with weights
    icons.js          ICON SET      — fallback art, logo, Buckarooz glyph
vite.config.js
supabase/schema.sql   the three tables, and the row-level rules that guard them
android/              WebView wrapper that packages the web build as an APK
  app/src/main/
    java/.../MainActivity.java   hosts the WebView, serves assets over https
    AndroidManifest.xml
    res/                          theme + vector launcher icon
.github/workflows/android.yml     builds and publishes the APK
```

The tables in `src/data/` and `src/ui/themes.js` are the extension points. Everything else reads
from them: the pack picker, the accent colours, the odds modal and the card
effects are all generated, so neither table has a hard-coded counterpart
anywhere in the UI code.

### Destinations

Five, in the bottom bar: **Packs** (owned, and the custom builder behind a
segmented control) · **Timed** · **Shop** · **Binder** · **Profile**. The
wallet and the daily gift live in the app bar; Settings, Friends, the odds and
the wallet explainer hang off the Profile, because none of them is somewhere
you go — they are things you look at once. Friends keeps a badge on the
Profile tab when someone is waiting, so a request does not need finding.

---

## Accounts, cloud save and friends

A collection lives on an account, not on a phone. Sign in on a new build or a
new device and everything comes back: cards, coins, level, boosters, settings.

The backend is [Supabase](https://supabase.com) — Postgres with row-level
security and email/password auth. Rolling my own authentication would have
meant storing passwords, which is not a thing to do casually or at all.

### Setting it up

This repository is already pointed at a project: `.env.production` carries its
URL and publishable key, and Vite reads that file at build time, so a clone
builds an app that can sign in without any further setup.

To point a build at a **different** project:

1. Create one at supabase.com (the free tier is plenty).
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`,
   and run it. That creates the tables, the policies and the three functions.
3. Take the **Project URL** and the **publishable** key (`sb_publishable_...`)
   from **Project Settings → API**, and put them either in `.env.production`
   (committed, what this repo does) or in a local `.env.local` (ignored by git,
   and it wins over `.env.production`). `.env.example` is the template.

Never use the `sb_secret_...` key anywhere in this app. It bypasses every
policy below, and the app has no need of it.

Do not also pass these in as CI environment variables: Vite gives `process.env`
precedence over `.env` files, so a variable set from an unset repository secret
arrives as an empty string and silently blanks them out — which ships an APK
whose sign-in screen cannot work. The workflow greps the built bundle for the
project URL and fails the build rather than publishing one of those.

### Email links, and why you probably want confirmation off

The app is a WebView with no address bar and no website behind it, so any email
Supabase sends that works by *link* has nowhere to land. Two settings follow
from that:

- **Turn off "Confirm email"** under **Authentication → Providers → Email**.
  Sign-up then hands you straight in. Leave it on and the app still behaves
  correctly — it tells you to go and confirm, and creates the profile on your
  first sign-in instead — but you have to open the link on the same device and
  then come back, which is a poor first minute.
- **Password reset is a link too.** It goes to the project's **Site URL**
  (Authentication → URL Configuration), which by default is `localhost`. Set it
  to somewhere real if you deploy the web build; otherwise the reset email
  arrives and the link goes nowhere, and the way back into an account is to
  make a new one and paste the save in from Settings → Transfer save.

The app never claims more than it can do here: the reset screen says a link is
on its way and nothing about it working.

**A build with no keys still works.** It skips the gate entirely, plays
offline, hides Friends, and says so in Settings. Shipping an APK whose sign-in
screen no key can open would be shipping a brick.

### What is stored, and who can read it

Three tables:

| table | what | who can read it |
| --- | --- | --- |
| `profiles` | username and the stats a friend sees | any signed-in player — this is what username search *is* |
| `saves` | the whole save blob | **only its owner** |
| `friendships` | one row per request | the two people in it |

A friend's cards do **not** come from reading their save row: nobody can read
anyone else's. They come from `friend_cards()`, a `security definer` function
that checks the friendship itself and returns the one key holding the
collection. The wallet, the settings, the daily-gift record and the language
are in the same blob and stay unreadable — which is the difference between
"a friend can see your cards" and "a friend can see everything".

Both functions pin `search_path` and are revoked from `public` before being
granted to `authenticated`, so neither can be reached anonymously or hijacked
by a schema the caller controls.

The publishable key ships inside the APK, and is committed to this repository
for the same reason: it identifies the project, not the player, and grants
nothing on its own. Anyone who could read it here could already unzip it out of
a published APK. The policies are the security boundary. The secret key
(`sb_secret_...`, formerly `service_role`), which bypasses them, is never used
by this app and must never be committed, pasted into a chat, or put in `.env`.
If one is ever exposed, rotate it in **Project Settings → API Keys**.

### How syncing works

The local save stays authoritative while you play; the server is a copy.

- **On sign-in**, the account's save replaces the device's. That is what makes
  a fresh install come up with the collection already in it. The one exception
  is an account with nothing stored yet, where the device's save is uploaded
  instead of being thrown away — which is how a pre-account collection is
  carried in.
- **While playing**, every write to game state is noticed in one place
  (`writeJson` in `collection.js`, which every save goes through) and a push is
  debounced by four seconds. Opening a booster writes storage half a dozen
  times in a second; that is one upload, not six.
- **Leaving the app** flushes immediately rather than waiting out the
  debounce, because the WebView is about to be frozen.
- **A failed push is not fatal.** It is recorded, shown in Settings, and
  retried on the next change or the next time the app comes to the
  foreground. Losing a sync is survivable; blocking the game on one is not.

Public stats go up alongside every push, so a friend list is one read rather
than one save download per friend.

### What this does not do

The client is authoritative. There is no server-side validation of what a card
is worth or how a booster was obtained, so a determined player can edit their
own save and their friends will see the result. For a single-player collecting
game played among people who know each other, that is the right trade; it
would be the wrong one for anything with a leaderboard.

---

## Timed boosters

A three-card booster accrues on a timer whether the app is open or not, up to a
cap. This is the floor of the game: a player with no cards and no money still
has something to open in ten minutes.

They must not become the whole game, so the odds start heavily nerfed. Level 1
multiplies each tier's weight by `0.55^rank`, which barely moves the expected
value — commons dominate that — but makes an Artifact **42x scarcer**, one in
28,000 rather than one in 667. The nerf is entirely at the top, which is where
it belongs.

Levelling the track improves all three axes at once:

| Level | Every | Holds | Top tier |
|---|---|---|---|
| 1 | 10 min | 7 | 42x scarcer |
| 5 | 7 min | 13 | 7x scarcer |
| 10 | 3 min | 20 | standard odds |

Level 10 needs **2,100 opened boosters**, and the steps grow the whole way
(20, 55, 110, 200, 340, 560, 900, 1,400, 2,100). At a realistic thirty to fifty
a day that is a couple of months, which is the intent: it is a long track, not
a weekend.

---

## Levels and XP

XP comes from **cards**, never from money or from buying things, so the only
way to level is to open boosters and see what is inside. A card is worth XP by
its tier, on roughly the same curve as its price: 12 for a Common up to 1,300
for an Artifact, averaging about 33 a card under the standard table.

The requirement per level is mostly linear with a gentle curve on top
(180 XP for level 1, ~2,400 at level 100, ~12,400 at level 499). Reaching the
cap of **level 500** is around three million XP, or eighteen thousand boosters.

Every level pays something: coins on most, a booster every fifth, a rarity
booster every tenth, and coins plus a booster every twenty-fifth. The values
are small next to the shop stipend on purpose — levelling sets a pace, it is
not an income stream. Ten ranks (Newcomer through Encyclopedist) name where you
are.

Gaining XP shows a small rising number. A level-up waits for the pack to finish
revealing, then walks the bar from the old level to the new one with the reward
to claim.

---

## The daily gift

Thirty slots to a board, one claim per calendar day, and you always claim **the
next unclaimed slot** rather than the slot matching today's date. Miss Tuesday
and Wednesday still hands you slot 2. Finish a board and the next one is
generated, so the ladder never ends; later boards pay a little more, capped
after ten of them.

Boards come from a seeded PRNG keyed to the board number, so the whole month is
visible in advance and the eleventh gift is the same gift whenever you get to
it. Claimed days are replaced by a tick, so the board doubles as a record.

A month of gifts is worth roughly two days of stipend. The feature exists so a
player with nothing left can always get moving again, not so that logging in is
the way to get rich.

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
across reloads and restocks on its own — no server involved. Each booster's
size is rolled between 3 and 7 cards, and price scales with both size and tier
automatically, because it is derived from the booster's own expected contents.

Two shelves are always present: **Free every restock**, and **Boosters you
built** if you have made any custom packs. The rest of the shop is five to
seven shelves drawn from a pool of nine kinds — by tier, by subject, mixed,
cheap, jumbo, a two-subject matchup, one subject climbing the tiers, wildcards
only, and a single-size bundle — so no two windows look quite alike.

The free shelf is the anti-lockout guarantee: two three-card boosters,
occasionally upgraded to a low tier. It runs on its own **four-hour** clock
rather than the shop's two-hour one, so its contents sit still through a
restock and the shop turning over does not hand out another pair. Both the
shelf's seed and the record of what you have taken key off that four-hour
window; using the shop's window for either would quietly halve the cooldown.
Selling everything out of both is worth around 230 Buckarooz, well under a
single stipend, so it is a floor rather than a faucet.

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

Name a game, book, film or show and Wiklodo builds a booster entirely out of
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

Building one does **not** give you a booster. It used to, which was a free
openable pack out of thin air for anyone who typed a name, and the cards inside
could be sold. Creating a pack now puts it on sale in the Shop, on its own
shelf, where it is bought like anything else.

### Getting a picture out of Fandom

Three separate things made custom cards come out blurry, wrong, or blank, and
all three are handled:

- **`pageimages` returns a fifty-pixel thumbnail.** Blown up to fill a card
  slot that is the blurry, over-zoomed mess it looked like. A thumbnail under
  180px wide is now treated as no thumbnail, and the URL is asked for a bigger
  version before it is believed.
- **The picture list is led by chrome.** When `pageimages` is empty the app
  asks what images the page actually *uses* — but that list is in page order,
  and the first image on a Fandom article is usually a nav icon or an infobox
  glyph. It now asks for each image's real dimensions, throws away anything
  too small, too thin or named like furniture, and takes the largest, which on
  a Fandom article is reliably the subject.
- **The CDN URL says what size you get.** Fandom serves images through a
  resizing CDN, so `/scale-to-width-down/50` really is fifty pixels and
  `/smart/width/80/height/80` really is a hard square crop. Both are rewritten
  to ask for 640px of the uncropped image.

If a picture still arrives smaller than its frame, the card fits it inside
rather than magnifying it.

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

The **balance button in the top bar** is also the explainer: tap it and a panel
says what Buckarooz are, the two ways to get them (selling duplicates, and the
free stipend that accrues over time) and what they are for (boosters in the
Shop). It is there because the currency is invented and nothing else on screen
would otherwise say so.

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

The stack that the cards settle into uses `perspective`, deliberately *not*
`transform-style: preserve-3d`. A shared 3D context makes the stacked cards
coplanar siblings, which retires `z-index` and lets the face-down cards behind
the top one paint straight through it the moment it leans. Each card carries
its own perspective instead, so the flip still reads as three-dimensional while
the stack itself stays flat and correctly ordered.

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

The **card detail sheet is built narrow-first** and only goes side-by-side at
780px and up. It used to be the other way round — a row layout undone by a
`max-width: 720px` query — which meant anything that made the layout viewport
wider than 720px skipped the breakpoint entirely and a phone got the desktop
layout: an 860px panel hanging off the side of a 400px screen. Building up
rather than down means the narrow case is the one that cannot be missed.

That is also why `MainActivity` now calls `setUseWideViewPort(true)`. Without
it the Android WebView ignores `<meta name="viewport" content="width=device-width">`
and lays the page out at its own default width, so **every** `max-width` query
in the stylesheet is measured against the wrong number. That was the actual
root cause of the sheet hanging off the screen in the APK.

There is exactly **one** fullscreen card view, reached three ways: off the
reveal stack, off the pack summary, and out of the binder. All three call the
same function and are styled by the same rules, and a test asserts the three
are identical down to the pixel, so one cannot drift from the others.

---

## Battery

Continuous animation is the single biggest thing this app can do to a battery:
a shop shelf is twenty-odd boosters, several wearing a rarity treatment that
never stops moving. Four brakes:

- **One clock.** Everything that needs a timer shares a single 1 Hz interval,
  and it only runs when the tab is visible *and* a screen that wants it is on
  display. Rendering the shop once used to leave an interval running for the
  life of the session, redrawing a countdown nobody was looking at.
- **Off-screen screens animate nothing.** `animation-play-state: paused` on
  anything inside an inactive screen, which is free.
- **Audio parks itself.** A running `AudioContext` keeps the audio thread alive
  even in silence, so it is suspended when the app goes to the background.
- **The backdrop is governed hard.** It stops when the document is hidden, and
  it stops during a takeover, so the frame budget while cards are flying goes
  entirely to the cards. It renders at a capped pixel ratio, and at half
  resolution on the themes whose look survives it — they are soft, blurred
  fields, and nobody sees the difference at arm's length.
- **Battery saver**, in Settings, paints one static backdrop frame and never
  runs the loop, stops the ambient motion everywhere, and drops the blurs.
  Transitions and one-shot animations still run, so the app still feels alive;
  it just stops repainting when nothing has happened.

Two things in the backdrops are deliberately cheap rather than obvious. Noir's
film grain comes from **one 128px tile**, generated once and blitted at a new
offset every eighth of a second; scattering grain across the screen per pixel
per frame is tens of thousands of trigonometric calls a frame, which is exactly
the sort of thing that warms a handset. Arcade's scanlines are a **CSS overlay**
rather than a few hundred `fillRect` calls a frame. All four themes hold 60fps
with the backdrop running.

The rest of the app pulls in the same direction: the theme's `--motion-scale`
means Arcade's animations are less than half the length of Aurora's, so the
snappiest theme is also the cheapest.

Playtime is measured between visibility changes rather than by a stopwatch —
a timer ticking once a second purely to add one to a number is exactly the sort
of background work this should not be doing.

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

## Settings

Four switches, each with a line saying what turning it off actually does
rather than how it is built:

| Setting | What it does |
|---|---|
| Sound | Mutes the app completely, menu taps included |
| Screen flash | Stops the screen lighting up on a rare pull |
| Battery saver | Stops the glow, shimmer and drift; plainer, cooler, cheaper |
| On-screen hints | Hides the swipe tips once you no longer need them |

Above them sits the theme picker (see **Themes**).

**Data → Transfer your save** turns everything you own into one block of text
you can copy out and paste back. It is the only bridge across a reinstall or a
move to another phone, and the format is deliberately dull — a JSON envelope
with a version and the raw stored strings — because a save you cannot inspect
is a save you cannot rescue by hand.

Importing validates before it touches anything and replaces the whole save
rather than merging, so a half-recognised blob cannot leave you with neither
your old save nor the new one. It arms and then confirms, like selling a card.

Below them, the language is shown but locked (see below), and **Erase
everything** uses the same arm-then-confirm shape as selling a card: the button
is its own dialog.

---

## Intentionally missing (this is a debug build)

- **Local persistence only.** The collection lives in this browser's
  localStorage. No account, no server, no automatic sync between devices;
  clearing site data wipes it. **Settings → Data → Transfer your save** is the
  manual way across, and on Android the system backup covers the rest.
- **No cross-pack dedupe.** Titles are de-duplicated *within* one pack. Open
  two Animals packs and you can pull Tardigrade twice — it becomes a `×2`.
- **Two languages**, English and French, chosen once and then locked.
- **No trading, no accounts, no sync.** Everything is one browser.
- **Rarity is not tied to the article.** It's an independent roll, so a stub
  can come out Artifact and a featured article can come out Common. Only the
  price knows how popular a page is.
- **Timers trust the device clock.** Timed boosters and the daily gift are
  measured against local time, so moving the clock forward moves them forward.
  With no server there is nothing else to measure against.

## Natural next steps

- **Trading** — export a card (or a whole binder) as a share code, import
  someone else's.
- **Daily goals** — a reason to open a specific subject, on top of the daily
  gift and the timed trickle.
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
