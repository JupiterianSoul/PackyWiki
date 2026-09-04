/* boot: split out of main.js */

import { iconSvg, logoSvg } from '../data/icons.js';
import { LANGUAGES, getLanguage, languageChosen, setLanguage, t, tx } from '../i18n.js';
import { Bar, NavBar, Odometer, Rail, Ring, Segmented, Sheet, press, trackDrag } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { THEME_PACKS } from '../data/packs.js';
import { STARTER_COINS, STARTER_PACKS, STARTER_PACK_CARDS, drawCapsFor } from '../economy.js';
import { SPECIAL_RARITY_ID, codeByInput, hasRedeemed } from '../codes.js';
import { popularityFromViews, popularityFromWordCount, priceFor } from '../pricing.js';
import { RARITIES, rarityById, rarityFromPopularity } from '../data/rarities.js';
import { DEFAULT_THEME, THEMES, themeById } from '../ui/themes.js';
import { backdrop } from '../ui/backdrop.js';
import { specId, specName, toDrawPack } from '../booster.js';
import * as quests from '../quests.js';
import * as account from '../account.js';
import { canClaim } from '../daily.js';
import { music } from '../ui/music.js';
import { onSaveChanged } from '../save.js';
import * as wikdle from '../wikdle.js';
import { drawArticles } from '../wiki.js';
import { generateShop } from '../shop.js';
import * as odds from '../data/odds.js';
import { addXp } from '../progression.js';
import { timedTopTier } from '../timed.js';
import { reportAlbums } from './arcade.js';
import { openFilters, renderBinder, turnAlbumPage } from './binder.js';
import { $, THEME_KEY, WIDE, applyStrings, bind, debug, el, flushPlaytime, lookForUpdate, migrateLanguages, migrateSpecialCards, migrateViews, money, placeDrawerLinks, refreshWallet, showScreen, shuffle, state, storedTheme, syncTicker, toast, useTheme, wait } from './core.js';
import { openDaily, openOdds, openWallet } from './daily.js';
import { tilt } from './detail.js';
import { buildDrawer, closeDrawer, openDrawer, openHelp, openNotifications, paintDrawerLinks } from './drawer.js';
import { flushSync, gateAltAction, onSession, purgeRetiredCodes, purgeRetiredThemes, resumeAccount, showGate, stopSocialPoll, submitGate, syncSoon } from './gate.js';
import { live } from './live.js';
import { openSellSheet } from './market.js';
import { applyRarityVars, drainLevelUps, gainBooster, homeTabFor, initSwipe, paintOpenHint, showLevelUp, warmDrawer } from './open.js';
import { buildBooster, createCustomPack, paintForgeSeal, paintPackCaption, renderPacks, renderTimed, syncTimed } from './packs.js';
import { renderProfile } from './profile.js';
import { leaveQuiz } from './quiz.js';
import { refreshLevelBadge, updateBadges } from './regalia.js';
import { applySettings, renderCustomize, sayWipeNote, wipeEverything } from './settings.js';
import { payStipend, renderShop } from './shop.js';
import { chatTyped, keepChatBottom, loadFriends, openFriend, renderFriends, runSearch, sendChat, socialAction, syncSocial } from './social.js';

bind({
  screens: {
    packs: $('#screen-packs'), timed: $('#screen-timed'), shop: $('#screen-shop'),
    binder: $('#screen-binder'), profile: $('#screen-profile'),
    settings: $('#screen-settings'), friends: $('#screen-friends'),
    friend: $('#screen-friend'), chat: $('#screen-chat'), ach: $('#screen-ach'),
    updates: $('#screen-updates'), quiz: $('#screen-quiz'),
    customize: $('#screen-customize'), badges: $('#screen-badges'),
    market: $('#screen-market'), cardindex: $('#screen-cardindex'),
    glossary: $('#screen-glossary'), open: $('#screen-open'),
    games: $('#screen-games'), wikdle: $('#screen-wikdle'), slots: $('#screen-slots'),
    quests: $('#screen-quests'), leaderboard: $('#screen-leaderboard')
  },
  gamesTitle: $('#games-title'), gamesSub: $('#games-sub'), gamesList: $('#games-list'),
  wikdleTitle: $('#wikdle-title'), wikdleBody: $('#wikdle-body'), wikdleBack: $('#wikdle-back'),
  slotsTitle: $('#slots-title'), slotsBody: $('#slots-body'), slotsBack: $('#slots-back'),
  questsTitle: $('#quests-title'), questsSub: $('#quests-sub'), questsBody: $('#quests-body'),
  leaderboardTitle: $('#leaderboard-title'), leaderboardSeg: $('#leaderboard-seg'),
  leaderboardBody: $('#leaderboard-body'), leaderboardMe: $('#leaderboard-me'),
  backdrop: $('#backdrop'), navbar: $('#navbar'),
  menuBtn: $('#menu-btn'), menuIcon: $('#menu-icon'),
  giftBtn: $('#gift-btn'), giftIcon: $('#gift-icon'), giftDot: $('#gift-dot'),
  levelBadge: $('#level-badge'),
  wallet: $('#wallet'), walletMark: $('#wallet-mark'), walletAmount: $('#wallet-amount'),
  bell: $('#bell'), bellIcon: $('#bell-icon'), bellCount: $('#bell-count'),

  drawer: $('#drawer'), drawerScrim: $('#drawer .drawer-scrim'), drawerPanel: $('#drawer .drawer-panel'),
  drawerMark: $('#drawer-mark'), drawerWho: $('#drawer-who'), drawerLinks: $('#drawer-links'),
  updatesTitle: $('#updates-title'), updatesSub: $('#updates-sub'), updatesList: $('#updates-list'),
  quizTitle: $('#quiz-title'), quizBody: $('#quiz-body'), quizBack: $('#quiz-back'),
  splash: $('#splash'), splashMark: $('#splash-mark'),

  packsSeg: $('#packs-seg'), packsRail: $('#packs-rail'), packsCaption: $('#packs-caption'),
  packsName: $('#packs-name'), packsSub: $('#packs-sub'), packsOwn: $('#packs-own'),
  packsActions: $('#packs-actions'), packsOpen: $('#packs-open'), packsHint: $('#packs-hint'),
  packsEmpty: $('#packs-empty'), packsEmptyMark: $('#packs-empty-mark'),
  packsEmptyText: $('#packs-empty-text'), packsEmptyCta: $('#packs-empty-cta'),
  creatorWrap: $('#creator-wrap'), creator: $('#creator'), forgeSeal: $('#forge-seal'),
  forgeTitle: $('#forge-title'), forgeNote: $('#forge-note'), forgeIdeas: $('#forge-ideas'),
  creatorInput: $('#creator-input'), creatorGo: $('#creator-go'), creatorStatus: $('#creator-status'),
  creatorMineLabel: $('#creator-mine-label'),
  creatorMine: $('#creator-mine'), creatorEmpty: $('#creator-empty'),
  creatorEmptyMark: $('#creator-empty-mark'), creatorEmptyText: $('#creator-empty-text'),

  timedTitle: $('#timed-title'), timedOpen: $('#timed-open'),
  freeRing: $('#free-ring'), freeCount: $('#free-count'), freeCap: $('#free-cap'),
  freeState: $('#free-state'), freePips: $('#free-pips'), freeFoot: $('#free-foot'),
  freeTrackLabel: $('#free-track-label'), freePerks: $('#free-perks'),
  trackLevel: $('#track-level'), trackRemaining: $('#track-remaining'), trackBar: $('#track-bar'),
  trackNext: $('#track-next'),

  shopTitle: $('#shop-title'), restock: $('#restock'), shopMarket: $('#shop-market'),
  shopPurse: $('#shop-purse'), shopPurseLabel: $('#shop-purse-label'),
  shopRestockLabel: $('#shop-restock-label'),

  oddsBtn: $('#odds-btn'), oddsIcon: $('#odds-icon'),

  binderTitle: $('#binder-title'), binderStats: $('#binder-stats'),
  albumShelf: $('#album-shelf'), albumView: $('#album-view'), albumBack: $('#album-back'),
  albumName: $('#album-name'), albumProgress: $('#album-progress'),
  binderSeg: $('#binder-seg'), binderSegWrap: $('#binder-seg-wrap'),
  binderTools: $('#binder-tools'), classicView: $('#classic-view'),
  classicFilter: $('#classic-filter'), classicFilterCount: $('#classic-filter-count'),
  classicCount: $('#classic-count'),
  classicSearch: $('#classic-search'), classicSearchWrap: $('#classic-search-wrap'),
  classicSearchMark: $('#classic-search-mark'),
  albumBook: $('#album-book'), albumLeaf: $('#album-leaf'),
  pageSlots: $('#page-slots'), pageno: $('#pageno'),
  albumDots: $('#album-dots'), albumHint: $('#album-hint'),
  achTitle: $('#ach-title'), achSub: $('#ach-sub'), achList: $('#ach-list'),
  friendActions: $('#friend-actions'), friendAlbums: $('#friend-albums'),
  tradesHead: $('#trades-head'), tradesLabel: $('#trades-label'), tradesList: $('#trades-list'),
  friendsStale: $('#friends-stale'),
  chatBack: $('#chat-back'), chatAvatar: $('#chat-avatar'), chatName: $('#chat-name'),
  chatPresence: $('#chat-presence'), chatLog: $('#chat-log'),
  chatWho: $('#chat-who'), chatTools: $('#chat-tools'), chatTyping: $('#chat-typing'),
  chatForm: $('#chat-form'), chatInput: $('#chat-input'), chatSend: $('#chat-send'),
  binderEmpty: $('#binder-empty'), binderEmptyMark: $('#binder-empty-mark'),
  binderEmptyText: $('#binder-empty-text'),
  filterOpen: $('#filter-open'), filterCount: $('#filter-count'),

  profileRing: $('#profile-ring'), profileLevel: $('#profile-level'), profileRank: $('#profile-rank'),
  xpBar: $('#xp-bar'), xpLine: $('#xp-line'), nextRewardLabel: $('#next-reward-label'),
  nextReward: $('#next-reward'), statsLabel: $('#stats-label'), statGrid: $('#stat-grid'),
  rarityLabel: $('#rarity-label'), rarityBars: $('#rarity-bars'),

  settingsTitle: $('#settings-title'), themeLabel: $('#theme-label'), themeGrid: $('#theme-grid'),
  customizeTitle: $('#customize-title'), identityLabel: $('#identity-label'), identityList: $('#identity-list'),
  framesLabel: $('#frames-label'), framesNote: $('#frames-note'), frameStyles: $('#frame-styles'),
  fxLabel: $('#fx-label'), fxNote: $('#fx-note'), fxTiers: $('#fx-tiers'),
  badgesLabel: $('#badges-label'), badgeGrid: $('#badge-grid'),
  badgesTitle: $('#badges-title'), badgesIntro: $('#badges-intro'), badgesAll: $('#badges-all'),
  indexTitle: $('#index-title'), indexIntro: $('#index-intro'), indexCounts: $('#index-counts'),
  indexSearch: $('#index-search'), indexRarities: $('#index-rarities'), indexSorts: $('#index-sorts'),
  indexStatus: $('#index-status'), indexList: $('#index-list'), indexMore: $('#index-more'),
  glossaryTitle: $('#glossary-title'), glossaryIntro: $('#glossary-intro'), glossaryList: $('#glossary-list'),
  marketTitle: $('#market-title'), marketIntro: $('#market-intro'), marketSeg: $('#market-seg'),
  marketStatus: $('#market-status'), marketList: $('#market-list'), marketSell: $('#market-sell'),
  openPrev: $('#open-prev'), openNext: $('#open-next'),
  prefsLabel: $('#prefs-label'), settingsList: $('#settings-list'),
  accountLabel: $('#account-label'), accountList: $('#account-list'),
  dataLabel: $('#data-label'), dataList: $('#data-list'),
  redeemLabel: $('#redeem-label'), redeemList: $('#redeem-list'),

  openScreen: $('#screen-open'), openBack: $('#open-back'), openTitle: $('#open-title'),
  burstLayer: $('#burst-layer'),
  openProgress: $('#open-progress'), openStage: $('#open-stage'), boosterSlot: $('#booster-slot'),
  cardStack: $('#card-stack'), summary: $('#summary'), openHint: $('#open-hint'), openDone: $('#open-done'),

  sheet: $('#sheet'), sheetTitle: $('#sheet-title'), sheetBody: $('#sheet-body'), sheetClose: $('#sheet-close'),

  friendsTitle: $('#friends-title'), friendsIntro: $('#friends-intro'),
  find: $('#find'), findMark: $('#find-mark'), findInput: $('#find-input'),
  findGo: $('#find-go'), findStatus: $('#find-status'), findResults: $('#find-results'),
  resultsHead: $('#results-head'), resultsLabel: $('#results-label'),
  incomingHead: $('#incoming-head'), incomingLabel: $('#incoming-label'), incomingList: $('#incoming-list'),
  friendsHead: $('#friends-head'), friendsLabel: $('#friends-label'), friendsList: $('#friends-list'),
  outgoingHead: $('#outgoing-head'), outgoingLabel: $('#outgoing-label'), outgoingList: $('#outgoing-list'),
  friendsEmpty: $('#friends-empty'), friendsEmptyMark: $('#friends-empty-mark'),
  friendsEmptyText: $('#friends-empty-text'),

  friendBack: $('#friend-back'), friendName: $('#friend-name'), friendRing: $('#friend-ring'),
  friendLevel: $('#friend-level'), friendRank: $('#friend-rank'), friendStats: $('#friend-stats'),
  friendCardsLabel: $('#friend-cards-label'), friendCardsStatus: $('#friend-cards-status'),
  friendStatsLabel: $('#friend-stats-label'), friendRarityLabel: $('#friend-rarity-label'),
  friendRarityBars: $('#friend-rarity-bars'), friendSeg: $('#friend-seg'),
  friendSegWrap: $('#friend-seg-wrap'), friendClassic: $('#friend-classic'),
   friendRemove: $('#friend-remove'),

  gate: $('#gate'), gateMark: $('#gate-mark'), gateTitle: $('#gate-title'), gateBody: $('#gate-body'),
  gateSeg: $('#gate-seg'), gateForm: $('#gate-form'), gateStatus: $('#gate-status'),
  gateAlt: $('#gate-alt'), gateFoot: $('#gate-foot'),

  welcome: $('#welcome'), welcomeMark: $('#welcome-mark'), welcomeTitle: $('#welcome-title'),
  welcomeBody: $('#welcome-body'), langChoices: $('#lang-choices'), starter: $('#starter'),
  starterTitle: $('#starter-title'), starterBody: $('#starter-body'),
  starterLoot: $('#starter-loot'), starterGo: $('#starter-go'),

  flash: $('#flash'), toast: $('#toast'), xpPop: $('#xp-pop')
});
/* --- first run --------------------------------------------------------------------------------------------------- */

export function showWelcome() {
  el.welcomeMark.innerHTML = logoSvg({ size: 62 });
  el.welcomeTitle.textContent = t('welcomeTitle');
  el.welcomeBody.textContent = t('welcomeBody');
  el.langChoices.replaceChildren(...LANGUAGES.map((lang) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice lang-choice${lang.id === getLanguage() ? ' is-on' : ''}`;
    button.dataset.lang = lang.id;
    button.innerHTML = `<span>${lang.label}</span><span>${iconSvg('chevron', { size: 16 })}</span>`;
    press(button, { sound: null });
    button.addEventListener('click', () => {
      setLanguage(lang.id);
      synth.resume();
      synth.playTap();
      showStarter();
    });
    return button;
  }));
  el.starter.hidden = true;
  el.welcome.hidden = false;
}

export function showStarter() {
  applyStrings();
  el.welcomeTitle.textContent = t('welcomeTitle');
  el.welcomeBody.textContent = t('welcomeBody');
  el.langChoices.querySelectorAll('.lang-choice').forEach((b) =>
    b.classList.toggle('is-on', b.dataset.lang === getLanguage()));

  store.grantStarter(state.profile);
  const starters = shuffle(THEME_PACKS).slice(0, STARTER_PACKS).map((theme) => ({
    kind: 'theme', themeId: theme.id, rarityId: null, cards: STARTER_PACK_CARDS
  }));
  starters.forEach((spec) => gainBooster(spec, 1));
  refreshWallet();

  el.starterTitle.textContent = t('starterTitle');
  el.starterBody.innerHTML = t('starterBody', { coins: money(STARTER_COINS), packs: STARTER_PACKS });
  el.starterLoot.replaceChildren(...starters.map((spec) => buildBooster(spec, { size: 'is-tiny' })));
  el.starterGo.textContent = t('letsGo');
  el.starter.hidden = false;
  synth.playFanfare();

  renderPacks();
  renderShop();
  renderBinder();
  updateBadges();
}
/* --- wiring ------------------------------------------------------------------------------------------------------------ */

/**
 * The collection, priced. The print is the card's own and is never touched
 * here; a card written before prints existed, with no tier on it, is graded
 * once from its fame so it comes up with a tier at all. Prices follow fame
 * and print, and the profile's per-rarity tallies are rebuilt to match what
 * is owned.
 */

export function regradeCollection() {
  let changed = 0;
  for (const entry of Object.values(state.collection.entries ?? {})) {
    // A special card keeps its tier for good.
    if (entry.special) { if (entry.rarityId !== SPECIAL_RARITY_ID) { entry.rarityId = SPECIAL_RARITY_ID; changed++; } continue; }
    let pop = entry.popularity;
    if (!Number.isFinite(pop)) {
      pop = Number.isFinite(entry.views) && entry.views > 0
        ? popularityFromViews(entry.views)
        : popularityFromWordCount(entry.wordCount);
      entry.popularity = pop;
    }
    const rarity = entry.rarityId ? rarityById(entry.rarityId) : rarityFromPopularity(pop);
    const price = priceFor(pop, rarity);
    if (entry.rarityId !== rarity.id || entry.price !== price) {
      entry.rarityId = rarity.id;
      entry.price = price;
      changed++;
    }
  }
  if (!changed) return 0;
  const counts = {};
  for (const entry of Object.values(state.collection.entries ?? {})) {
    counts[entry.rarityId] = (counts[entry.rarityId] ?? 0) + Math.max(1, entry.count ?? 1);
  }
  state.profile.rarityCounts = counts;
  store.saveCollection(state.collection);
  store.saveProfile(state.profile);
  return changed;
}

export function init() {
  // The idle open screen carries a live connection warning, so it follows the
  // connection rather than whatever was true when the screen was built.
  window.addEventListener('online', paintOpenHint);
  window.addEventListener('offline', paintOpenHint);
  // The rail swallows the drawer on a wide screen, and hands it back on a
  // narrow one, including when a window is dragged across the threshold.
  // Built here rather than on first open, because on a wide screen there is no
  // button left to open it with: the rail IS it, so it has to exist from the
  // start rather than the first time somebody reaches for a menu.
  buildDrawer();
  WIDE.addEventListener('change', () => { buildDrawer(); });

  // A special theme belongs to whoever redeemed its code. A save that lost
  // the code (an erased save, a transfer that went the other way) wakes up
  // in the default theme rather than one it has no right to.
  const wanted = themeById(storedTheme());
  if (wanted.code && !hasRedeemed(state.profile, wanted.code)) {
    try { localStorage.setItem(THEME_KEY, DEFAULT_THEME); } catch { /* session only */ }
  }
  useTheme(storedTheme());
  el.splashMark.innerHTML = logoSvg({ size: 78 });
  backdrop.mount(el.backdrop).setTheme(storedTheme());

  // Cards without a picture no longer exist: draws refuse them now, and any
  // already in the collection are swept out once here.
  // A custom pack that goes missing takes its shop shelf with it, and the
  // player rebuilds it: two packs, two albums, one subject. Put back
  // whatever the collection still remembers, and collapse the duplicates.
  // An open that never finished (a lost connection, a phone that killed the
  // app mid-tear) gets its booster back rather than eating it.
  const owed = store.reclaimOpenInFlight(state.inventory);
  if (owed) setTimeout(() => toast(t('openRecovered', { name: specName(owed) }), 'ok'), 2400);

  const healed = store.healCustomPacks(state.collection);
  if (healed) state.customPacks = store.loadCustomPacks();

  const pruned = store.pruneImagelessCards(state.collection);
  if (pruned) console.info(`Removed ${pruned} pictureless card(s) from the collection`);

  // A withdrawn code and a withdrawn subject leave nothing behind, before
  // anything else looks at the collection.
  purgeRetiredCodes();
  purgeRetiredThemes();
  // Prices follow fame and print; a card from before prints existed gets its
  // tier here. Silent on purpose: it runs on every launch and changes
  // nothing on a save that is already right.
  regradeCollection();

  // Cards in the wrong language are swapped for their translation in the
  // background, a few at a time, so launch is never held up by the network.
  setTimeout(migrateLanguages, 3200);
  // Special cards drawn from the wrong wiki are repaired in the same spirit:
  // in the background, after launch, and never more than once when it works.
  setTimeout(migrateSpecialCards, 1600);
  // Cards graded while their readership request failed are re-graded from
  // the readership they actually have. Same spirit: background, budgeted.
  setTimeout(migrateViews, 5200);
  // Whether a newer build is out: asked once at launch, and again whenever
  // the app comes back to the foreground after a while away.
  setTimeout(lookForUpdate, 4000);
  setTimeout(warmDrawer, 2500);
  sayWipeNote();
  // The arcade's back buttons, and the quests' chip in the drawer.
  el.wikdleBack.addEventListener('click', () => { synth.playTap(); showScreen('games'); });
  el.slotsBack.addEventListener('click', () => { synth.playTap(); showScreen('games'); });
  quests.onQuestsChange(() => paintDrawerLinks());
  reportAlbums();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lookForUpdate();
  });

  live.walletOdo = new Odometer(el.walletAmount);
  live.levelRing = new Ring(el.levelBadge, { size: 40, width: 3 });
  live.profileRing = new Ring(el.profileRing, { size: 62, width: 4 });
  live.friendRing = new Ring(el.friendRing, { size: 62, width: 4 });
  live.freeRing = new Ring(el.freeRing, { size: 132, width: 8 });
  live.xpBar = new Bar(el.xpBar);
  live.trackBar = new Bar(el.trackBar);

  packsRail = new Rail(el.packsRail, { onFocus: paintPackCaption });
  live.sheet = new Sheet(el.sheet);

  live.packsSeg = new Segmented(el.packsSeg, [
    { id: 'owned', label: t('owned') },
    { id: 'custom', label: t('tabCustom') }
  ], (mode) => { state.packMode = mode; renderPacks(); });

  live.nav = new NavBar(el.navbar, [
    { id: 'shop', icon: iconSvg('gem', { size: 21 }) },
    { id: 'timed', icon: iconSvg('clock', { size: 21 }) },
    { id: 'packs', icon: iconSvg('packs', { size: 21 }) },
    { id: 'binder', icon: iconSvg('collection', { size: 21 }) },
    { id: 'profile', icon: iconSvg('profile', { size: 21 }) }
  ], (id) => {
    // Every destination repaints on arrival: the shelf, the wallet and the
    // counters can all have changed while the player was somewhere else.
    if (id === 'packs') renderPacks();
    if (id === 'binder') renderBinder();
    if (id === 'shop') { payStipend(); renderShop(); }
    if (id === 'timed') renderTimed();
    // A friend request arrives while you are elsewhere, so the count on the
    // way past the Profile is refreshed rather than remembered.
    if (id === 'profile') { renderProfile(); loadFriends(); }
    showScreen(id);
  });

  // The rail exists now, so the drawer's list has somewhere to be moved to.
  // Called here as well as from buildDrawer because that runs before the
  // NavBar is constructed, and a rail that does not exist yet cannot be
  // filled.
  placeDrawerLinks();

  applySettings();
  applyStrings();
  refreshWallet();
  refreshLevelBadge();
  updateBadges();
  initSwipe();
  tilt.init();

  renderPacks();
  renderShop();
  renderBinder();
  // Pack art is language-specific, so it waits until a language exists.

  [el.wallet, el.menuBtn, el.bell, el.giftBtn, el.levelBadge, el.packsOpen, el.timedOpen,
   el.filterOpen, el.openBack, el.openDone, el.sheetClose, el.starterGo,
   el.packsEmptyCta, el.creatorGo, el.findGo, el.friendBack,
   el.friendRemove, el.gateAlt, el.oddsBtn, el.albumBack, el.chatBack, el.quizBack].forEach((node) => press(node));

  el.wallet.addEventListener('click', openWallet);
  el.bell.addEventListener('click', openNotifications);
  el.giftBtn.addEventListener('click', () => openDaily());
  el.menuBtn.addEventListener('click', () => (el.drawer.hidden ? openDrawer() : closeDrawer()));
  el.drawerScrim.addEventListener('click', closeDrawer);
  el.levelBadge.addEventListener('click', () => { renderProfile(); showScreen('profile'); });

  el.oddsIcon.innerHTML = iconSvg('gem', { size: 15 });
  // Wrapped: passed straight, the click event would arrive as the rarity.
  // The sheet shows the row for the booster on the open screen when there is
  // one, and the basic row while browsing.
  el.oddsBtn.addEventListener('click', () => {
    const onOpen = el.openScreen?.classList.contains('is-active');
    openOdds(onOpen ? (state.spec?.rarityId ?? null) : null);
  });
  el.marketSell.addEventListener('click', () => { synth.playTap(); openSellSheet(); });
  press(el.marketSell, { sound: null });
  document.querySelectorAll('.help-btn').forEach((button) => {
    press(button, { sound: null });
    button.addEventListener('click', () => { synth.playTap(); openHelp(button.dataset.help); });
  });
  el.filterOpen.addEventListener('click', openFilters);
  el.classicFilter.addEventListener('click', openFilters);
  el.quizBack.addEventListener('click', leaveQuiz);
  // Scrolling is the one moment the backdrop must get out of the way.
  document.getElementById('app')?.addEventListener('scroll', () => backdrop.markBusy(), { passive: true });
  el.chatBack.addEventListener('click', () => {
    clearInterval(live.chatTimer);
    state.chat = null;
    renderFriends();
    showScreen('friends');
  });
  el.chatForm.addEventListener('submit', sendChat);
  el.chatInput.addEventListener('input', chatTyped);
  // The keyboard rising shrinks the room; the newest line must stay in it.
  el.chatInput.addEventListener('focus', () => setTimeout(keepChatBottom, 260));
  window.visualViewport?.addEventListener('resize', keepChatBottom);
  window.addEventListener('resize', keepChatBottom);
  press(el.chatWho, { sound: null });
  el.chatWho.addEventListener('click', () => {
    const entry = state.chat;
    if (!entry) return;
    synth.playTap();
    openFriend(entry);
  });
  el.albumBack.addEventListener('click', () => {
    synth.playSheet(false);
    state.album = null;
    renderBinder();
  });
  // Turning pages is a swipe across the open book.
  el.albumBook.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.card')) { /* a tap on a card still opens it */ }
    trackDrag(event, {
      onMove: () => {},
      onEnd: (dx) => { if (Math.abs(dx) > 42) turnAlbumPage(dx < 0 ? 1 : -1); }
    });
  });
  el.packsEmptyCta.addEventListener('click', () => { payStipend(); renderShop(); showScreen('shop'); });
  el.creator.addEventListener('submit', createCustomPack);
  el.creatorInput.addEventListener('input', () => paintForgeSeal(el.creatorInput.value));

  const leaveOpen = () => {
    const home = homeTabFor(state.spec);
    if (home === 'timed') renderTimed();
    else renderPacks();
    showScreen(home);
  };
  el.openBack.addEventListener('click', leaveOpen);
  el.openDone.addEventListener('click', leaveOpen);

  el.sheetClose.addEventListener('click', () => live.sheet.hide());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.drawer.hidden) closeDrawer();
    else if (live.sheet.open) live.sheet.hide();
  });

  // Accounts and friends.
  el.gateForm.onsubmit = submitGate;
  el.gateAlt.onclick = gateAltAction;
  el.find.addEventListener('submit', runSearch);
  el.friendBack.addEventListener('click', () => {
    state.viewing = null;
    synth.playTap();
    renderFriends();
    showScreen('friends');
  });
  el.friendRemove.addEventListener('click', () => {
    const entry = state.viewing;
    if (!entry) return;
    // Armed the same way selling a card is: the second tap is the one that acts.
    if (el.friendRemove.dataset.armed !== '1') {
      el.friendRemove.dataset.armed = '1';
      el.friendRemove.textContent = t('friendsRemoveConfirm');
      el.friendRemove.classList.add('btn-danger');
      synth.playArm();
      setTimeout(() => {
        el.friendRemove.dataset.armed = '';
        el.friendRemove.textContent = t('friendsRemove');
        el.friendRemove.classList.remove('btn-danger');
      }, 4000);
      return;
    }
    el.friendRemove.dataset.armed = '';
    el.friendRemove.textContent = t('friendsRemove');
    el.friendRemove.classList.remove('btn-danger');
    state.viewing = null;
    showScreen('friends');
    socialAction(() => account.removeFriendship(entry.id), 'friendsRemoved');
  });

  el.starterGo.addEventListener('click', () => {
    el.welcome.hidden = true;
    synth.playTap();
    showScreen('packs');
    if (canClaim(state.profile.daily)) openDaily({ auto: true });
  });

  // Playtime is measured between visibility changes, and both the clock and
  // the backdrop are parked entirely while the app is in the background.
  // Autoplay rules: music may only start inside a gesture, so every tap
  // offers it the chance. A playing track makes this a no-op.
  // Prime the first track while the splash is still up, then try to play at
  // once: the APK allows it outright, and a browser that holds out for a
  // gesture is caught by the listeners below rather than waiting for a tap
  // that may be seconds away.
  music.prime();
  music.poke();
  for (const gesture of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(gesture, () => music.poke(), { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    if (visible) {
      live.visibleSince = Date.now();
      syncTimed();
      updateBadges();
      music.unpark();
      // Coming back is the natural moment to retry anything that did not land,
      // and to pick up what happened while the app was away.
      resumeAccount();
    } else {
      stopSocialPoll();
      flushPlaytime();
      live.visibleSince = null;
      synth.suspend();
      music.park();
      // Leaving is the last chance to get the save up before the WebView is
      // frozen, so this one does not wait out the debounce.
      flushSync();
    }
    backdrop.setPaused(!visible || document.documentElement.classList.contains('is-immersive'));
    syncTicker();
  });
  window.addEventListener('pagehide', () => { flushPlaytime(); flushSync(); });

  backdrop.start();
  startSession();
}
/**
 * Decide what the player sees first.
 *
 * With a backend: nothing until there is a session, because the account is
 * what everything else is filed under. Without one, the app is exactly what it
 * was before accounts existed - local, and honest about it in Settings.
 */

export async function startSession() {
  if (!account.configured) {
    if (!languageChosen() || !state.profile.started) showWelcome();
    else {
      payStipend();
      if (canClaim(state.profile.daily)) openDaily({ auto: true });
    }
    return endSplash();
  }

  onSaveChanged(syncSoon);
  // Fires on every sign-in and sign-out, so there is one path into the app
  // rather than two. It also reports the stored session at launch, but that
  // is not guaranteed across client versions, so the session is read directly
  // as well; onSession() ignores the second of the two.
  account.onAuthChange((session) => { onSession(session); });

  /*
   * Read the stored session BEFORE deciding what to show.
   *
   * The gate used to be painted immediately and taken away once the session
   * came back, which meant a sign-in card flashed up on every single launch
   * for anyone already signed in. Reading the session is a local, fast
   * operation, so the splash covers it and nothing else is shown until the
   * answer is known.
   */
  try {
    await onSession(await account.currentSession());
  } catch {
    showGate();
    endSplash();
  }
}
/* --- the splash ---------------------------------------------------------------------
 *
 * Covers the first moment of a launch: the mark draws itself in while the
 * stored session is read, so the app appears already decided rather than
 * flickering through the gate on its way to the shelf.
 */

export const SPLASH_MIN = 900;

export const splashStart = performance.now();

export let splashDone = false;

export function endSplash() {
  if (splashDone) return;
  splashDone = true;
  // Hold it long enough to be an entrance rather than a flash of colour, but
  // never add waiting on a launch that was already slow.
  const wait = Math.max(0, SPLASH_MIN - (performance.now() - splashStart));
  setTimeout(() => {
    el.splash.classList.add('is-going');
    setTimeout(() => { el.splash.hidden = true; }, 460);
  }, wait);
}

export let packsRail;

live.binderSeg = undefined;

init();

window.__wikster = {
  state, store, debug, RARITIES, synth, music, backdrop, THEMES, THEME_PACKS, regrade: regradeCollection,
  levelUp: showLevelUp, wikdle,
  codeByInput,
  draw: drawArticles, generateShop, syncSocial, drawCaps: drawCapsFor, drawPack: toDrawPack, odds, specId,
  setTheme: (id) => { useTheme(id); renderPacks(); renderShop(); renderBinder(); renderCustomize(); },
  debugRarity(id) {
    const forced = rarityById(id);
    document.querySelectorAll('.card').forEach((card) => {
      applyRarityVars(card, forced);
      const badge = card.querySelector('.rarity-badge');
      if (badge) badge.textContent = tx(forced.name);
    });
    return forced;
  },
  grant(amount = 10000) { store.saveWallet(store.loadWallet() + amount); refreshWallet(); },
  giveBooster(spec) { gainBooster(spec, 1); renderPacks(); },
  giveTimed(n = 5) { state.profile.timed.count += n; store.saveProfile(state.profile); renderTimed(); updateBadges(); },
  addXp(amount = 5000) {
    const levels = addXp(state.profile.progress, amount);
    if (levels.length) state.profile.pendingLevels.push(...levels);
    store.saveProfile(state.profile);
    refreshLevelBadge();
    drainLevelUps();
    return state.profile.progress;
  },
  timedTopTier,
  resetAll: wipeEverything
};
