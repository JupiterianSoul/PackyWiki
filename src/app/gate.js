/* gate: split out of main.js */

import { languageChosen, t } from '../i18n.js';
import * as account from '../account.js';
import { iconSvg, logoSvg } from '../data/icons.js';
import { Segmented, press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { RARITIES } from '../data/rarities.js';
import { rankFor } from '../progression.js';
import { canClaim } from '../daily.js';
import { RETIRED_CODES } from '../codes.js';
import { DEFAULT_THEME, THEMES } from '../ui/themes.js';
import { DEFAULT_FRAME_STYLE, FRAME_STYLES } from '../frames.js';
import { renderBinder } from './binder.js';
import { endSplash, showWelcome } from './boot.js';
import { SPECIAL_FIX_KEY, VIEWS_FIX_KEY, applyStrings, el, refreshWallet, showScreen, showUpdateBar, state, storedTheme, toast, useTheme } from './core.js';
import { openDaily } from './daily.js';
import { live } from './live.js';
import { dropReady, warmDrawer } from './open.js';
import { renderPacks } from './packs.js';
import { refreshLevelBadge, updateBadges } from './regalia.js';
import { applySettings, renderAccountRow } from './settings.js';
import { payStipend, renderShop } from './shop.js';
import { syncSocial } from './social.js';

/* --- the account gate -------------------------------------------------------------------------------------- */

/*
 * Signing in is required, so this sits in front of everything until there is a
 * session. The one exception is a build with no backend configured at all
 * (see account.configured): shipping a gate no key can open would be a brick,
 * so those builds play offline and say so in Settings.
 */

export function signedIn() {
  return (Boolean(state.account.session));
}

export function userId() {
  return (state.account.session?.user?.id ?? null);
}

export function gateStatus(key, kind = '', vars = {}) {
  el.gateStatus.textContent = key ? t(key, vars) : '';
  el.gateStatus.className = `gate-status${kind ? ` is-${kind}` : ''}`;
}
/**
 * What to show for a failure.
 *
 * A message this build recognises is translated; anything else is shown as the
 * server wrote it. Passing an unrecognised failure off as a known one is worse
 * than being technical: it sends the reader looking in the wrong place.
 */

export function describeError(error) {
  const key = account.readableError(error);
  if (key) return t(key);
  const raw = String(error?.message ?? error ?? '').trim();
  return raw || t('authUnknown');
}

export function gateMessage(text, kind = 'error') {
  el.gateStatus.textContent = text;
  el.gateStatus.className = `gate-status${kind ? ` is-${kind}` : ''}`;
}
/** One labelled input, built here rather than in the HTML because the set changes. */

export function field(name, labelKey, { type = 'text', icon = 'profile', hintKey = null, autocomplete = '' } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.innerHTML = `
    <span class="field-label"></span>
    <span class="field-box"><span>${iconSvg(icon, { size: 17 })}</span>
      <input name="${name}" type="${type}" autocomplete="${autocomplete}" spellcheck="false" />
    </span>
    ${hintKey ? '<span class="field-hint"></span>' : ''}`;
  wrap.querySelector('.field-label').textContent = t(labelKey);
  if (hintKey) wrap.querySelector('.field-hint').textContent = t(hintKey);
  return wrap;
}

export function buildGateForm() {
  const creating = state.account.mode === 'signup';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = t(creating ? 'gateSignUp' : 'gateSignIn');
  press(submit, { sound: null });

  // Email and password only. The username is its own step, after the account
  // exists - see showNameGate().
  el.gateForm.replaceChildren(
    field('email', 'gateEmail', { type: 'email', icon: 'mail', autocomplete: 'email' }),
    field('password', 'gatePassword', {
      type: 'password', icon: 'key',
      hintKey: creating ? 'gatePasswordHint' : null,
      autocomplete: creating ? 'new-password' : 'current-password'
    }),
    submit
  );

  el.gateAlt.textContent = t(creating ? 'gateHaveAccount' : 'gateForgot');
  gateStatus(null);
}

export function setGateMode(mode) {
  state.account.mode = mode;
  live.gateSeg?.select(mode, { silent: true });
  buildGateForm();
}

export function showGate() {
  el.gateMark.innerHTML = logoSvg({ size: 56 });
  el.gateTitle.textContent = t('gateTitle');
  el.gateBody.textContent = t('gateBody');
  el.gateFoot.textContent = t('gateFoot');
  // showNameGate() borrows this card; put back what it changed.
  el.gateSeg.parentElement.hidden = false;
  el.gateForm.onsubmit = submitGate;
  el.gateAlt.onclick = gateAltAction;

  if (!live.gateSeg) {
    live.gateSeg = new Segmented(el.gateSeg, [
      { id: 'signin', label: t('gateSignIn') },
      { id: 'signup', label: t('gateSignUp') }
    ], (mode) => setGateMode(mode));
  }
  setGateMode(state.account.mode);
  el.gate.hidden = false;
}

export function hideGate() { el.gate.hidden = true; }

export function fieldValue(name) {
  return (el.gateForm.elements[name]?.value ?? '');
}

export let gateBusy = false;

export async function submitGate(event) {
  event.preventDefault();
  if (gateBusy) return;

  const email = fieldValue('email').trim();
  const password = fieldValue('password');
  const creating = state.account.mode === 'signup';

  if (!email || !password) return gateStatus('authUnknown', 'error');

  gateBusy = true;
  gateStatus('gateWorking', 'working');
  synth.playTap();
  try {
    if (creating) {
      const result = await account.signUp(email, password);
      if (result.needsConfirmation) {
        gateStatus('gateConfirm', 'ok');
        setGateMode('signin');
        return;
      }
      gateStatus('gateSignedUp', 'ok');
      // onSession finds an account with no profile and asks for a username.
    } else {
      await account.signIn(email, password);
    }
    synth.playFanfare();
    // onAuthChange takes it from here: it pulls the save and starts the app.
  } catch (error) {
    gateMessage(describeError(error));
    synth.playDenied();
  } finally {
    gateBusy = false;
  }
}
/** The alternate action under the form: reset a password, or go and sign in. */

export async function gateAltAction() {
  if (state.account.mode === 'signup') { setGateMode('signin'); synth.playTap(); return; }

  const email = fieldValue('email').trim();
  if (!email) return gateStatus('gateResetNeedEmail', 'error');
  try {
    gateStatus('gateWorking', 'working');
    await account.sendReset(email);
  } catch { /* deliberately not reported: it would say whether the address exists */ }
  // Always the same answer, for the same reason.
  gateStatus('gateResetSent', 'ok');
}
/**
 * Step two of creating an account: take a username.
 *
 * Reached whenever a signed-in account has no profile - which is every new
 * account, and also an older one whose chosen name was taken while its email
 * was being confirmed. There is no way past it but to pick a name or sign out,
 * because everything social is keyed on having one.
 */

export function showNameGate() {
  el.gateMark.innerHTML = logoSvg({ size: 56 });
  el.gateTitle.textContent = t('gateNameTitle');
  el.gateBody.textContent = t('gateNameBody');
  el.gateFoot.textContent = t('gateFoot');
  el.gateSeg.parentElement.hidden = true;
  el.gateAlt.textContent = t('accountSignOut');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = t('gateNameSave');
  press(submit, { sound: null });
  el.gateForm.replaceChildren(
    field('username', 'gateUsername', { hintKey: 'gateUsernameHint', autocomplete: 'username' }),
    submit
  );
  gateStatus(null);
  el.gate.hidden = false;

  el.gateForm.onsubmit = async (event) => {
    event.preventDefault();
    const name = fieldValue('username').trim();
    if (!account.USERNAME_RE.test(name)) return gateStatus('authBadName', 'error');
    gateStatus('gateWorking', 'working');
    try {
      const profile = await account.claimUsername(userId(), name);
      if (!profile) return gateStatus('authNameTaken', 'error');
      state.account.profile = profile;
      synth.playFanfare();
      await enterApp();
    } catch (error) {
      gateMessage(describeError(error));
    }
  };
  el.gateAlt.onclick = () => leaveAccount();
}
/* --- session and cloud sync --------------------------------------------------------------------------------- */

export const SYNC_DEBOUNCE = 4000;

export let syncTimer = null;

export let syncQueued = false;
/** What a friend is allowed to see about you. Published with every push. */

export function currentStats() {
  const entries = store.allEntries(state.collection);
  const counts = state.profile.rarityCounts ?? {};
  const best = RARITIES.filter((r) => (counts[r.id] ?? 0) > 0).pop();
  return {
    level: state.profile.progress.level ?? 1,
    rank: rankFor(state.profile.progress.level ?? 1).name.en,
    cards: entries.reduce((sum, e) => sum + e.count, 0),
    uniqueCards: entries.length,
    boostersOpened: state.profile.boostersOpened ?? 0,
    value: entries.reduce((sum, e) => sum + e.price * e.count, 0),
    bestRarity: best?.id ?? null,
    playMs: state.profile.playMs ?? 0
  };
}
/**
 * Push the save and the public stats.
 *
 * Debounced hard: opening a booster writes storage half a dozen times in a
 * second, and every one of those is the same save a moment apart. A failure is
 * recorded and left for the next change or the next foreground to retry -
 * losing a sync is survivable, and blocking the game on one is not.
 */

export async function flushSync() {
  if (!signedIn() || !state.account.profile) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  if (state.account.syncing) { syncQueued = true; return; }

  state.account.syncing = true;
  renderAccountRow();
  try {
    const pushed = await account.pushSave(userId());
    // An older build than the one that last saved this account: play on,
    // never write. Said once, on screen, with the way out.
    if (pushed === 'outdated') { state.account.outdated = true; showUpdateBar('outdated'); return; }
    // Another device wrote meanwhile and some of its keys were newer: they
    // are in storage now, and the screen has to be read back from it.
    if (pushed === 'merged') takeMerge();
    await account.publishStats(userId(), currentStats());
    state.account.syncedAt = Date.now();
    state.account.failed = false;
  } catch {
    state.account.failed = true;
  } finally {
    state.account.syncing = false;
    renderAccountRow();
    if (syncQueued) { syncQueued = false; syncSoon(); }
  }
}

/**
 * Storage just took keys from another device. Read the state back from it
 * and repaint, unless a booster is being opened: then it waits for the
 * takeover to end (showScreen picks it up), because the reveal is writing
 * the collection as it goes and must not have it swapped underneath.
 */
export function takeMerge() {
  if (state.tab === 'open' || el.openScreen?.classList.contains('is-active')) { state.account.mergePending = true; return; }
  state.account.mergePending = false;
  reloadFromStorage();
  toast(t('syncMerged'));
}

export function syncSoon() {
  if (!signedIn() || !state.account.profile) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushSync, SYNC_DEBOUNCE);
}
/*
 * A slow poll for anything that arrives from someone else.
 *
 * A friend request is the one thing in the app that happens without you doing
 * it, so waiting until you next open the Friends screen to find out is no use
 * - the bell would only ever be right by accident. One read a minute while the
 * app is actually on screen is cheap, and it stops entirely in the background.
 */

export const SOCIAL_POLL = 60000;

export let socialTimer = null;

export function startSocialPoll() {
  stopSocialPoll();
  if (!signedIn() || document.visibilityState !== 'visible') return;
  socialTimer = setInterval(syncSocial, SOCIAL_POLL);
}

export function stopSocialPoll() {
  clearInterval(socialTimer);
  socialTimer = null;
}
/**
 * Foregrounding the app: pick up the profile if the last attempt failed, push
 * anything that has not landed, and refresh the friend lists.
 */

export async function resumeAccount() {
  if (!signedIn()) return;
  // The database may have been updated while we were away.
  account.forgetSchemaProbe();
  const had = Boolean(state.account.profile);
  await fetchAccountProfile();
  // A profile that only just arrived means nothing has ever been pushed on
  // this run, so push rather than waiting for the next change.
  if (state.account.failed || !had) syncSoon();
  syncSocial();
  startSocialPoll();
}
/**
 * Sign in has happened. Pull the account's save over the local one, then start
 * the app on whatever that turns out to contain - which is what makes a fresh
 * install on a new phone come up with the collection already in it.
 */

export async function enterApp() {
  try {
    await account.syncOnLogin(userId());
  } catch {
    // Offline at sign-in: play on what is on the device and push when it
    // reconnects, rather than refusing to start.
    state.account.failed = true;
  }
  hideGate();
  reloadFromStorage();
  // The shelf may have just arrived from the account: draw ahead for it.
  setTimeout(warmDrawer, 1500);
  if (!state.account.failed) state.account.syncedAt = Date.now();
  // A save last written by an OLDER build (or one from before builds were
  // stamped) may carry back what this build already repaired on another
  // device, so the repairs are allowed to run again here.
  if (!state.account.failed && account.saveFromOlderBuild()) {
    for (const key of [SPECIAL_FIX_KEY, VIEWS_FIX_KEY]) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } }
  }
  if (!state.account.failed && account.saveFromNewerBuild()) { state.account.outdated = true; showUpdateBar('outdated'); }
  syncSocial();
  startSocialPoll();

  if (!languageChosen() || !state.profile.started) showWelcome();
  else {
    payStipend();
    if (canClaim(state.profile.daily)) openDaily({ auto: true });
  }
}
/**
 * A withdrawn code leaves nothing behind. Everything it handed over goes:
 * its cards, its booster on the shelf, its badge from the loadout, its
 * theme and frame if they are worn, and the redemption itself, so the save
 * reads as if the code had never been typed. Runs on what is in memory,
 * so it is called after every load, local or from the cloud. Returns
 * whether anything was removed.
 */
/**
 * A subject that has been withdrawn from the game.
 *
 * A pack can be taken off the shelf by deleting it from THEME_PACKS, but the
 * cards it already dealt stay in saves, in an album that no longer exists.
 * Retiring it here removes them too: the cards, any booster of it still on
 * the shelf, and the wishes for cards from it, at every launch and after
 * every cloud load, so a save restored from before the withdrawal is cleaned
 * the same way.
 */

export const RETIRED_THEMES = ['darwin'];

export function purgeRetiredThemes() {
  const retired = new Set(RETIRED_THEMES);
  const fromRetired = (packId) => retired.has(String(packId ?? '').split('|')[1] ?? '');
  let changed = false;
  try {
    const entries = state.collection?.entries ?? {};
    for (const [key, entry] of Object.entries(entries)) {
      if (fromRetired(entry?.packId)) { delete entries[key]; changed = true; }
    }
    if (changed) store.saveCollection(state.collection);
    let shelf = false;
    for (const [id, slot] of Object.entries(state.inventory ?? {})) {
      if (slot?.spec?.kind !== 'code' && retired.has(slot?.spec?.themeId)) {
        delete state.inventory[id];
        dropReady(id);
        shelf = true;
      }
    }
    if (shelf) { store.saveInventory(state.inventory); changed = true; }
    if (changed) { console.info('A withdrawn subject was removed from this save'); syncSoon(); }
  } catch (error) {
    console.warn('could not remove a withdrawn subject', error);
  }
  return changed;
}

export function purgeRetiredCodes() {
  let changed = false;
  const retired = new Set(RETIRED_CODES);
  try {
    const entries = state.collection?.entries ?? {};
    for (const [key, entry] of Object.entries(entries)) {
      if (entry?.special && retired.has(entry.special)) { delete entries[key]; changed = true; }
    }
    if (changed) store.saveCollection(state.collection);
    let shelf = false;
    for (const [id, slot] of Object.entries(state.inventory ?? {})) {
      if (slot?.spec?.kind === 'code' && retired.has(slot.spec.codeId)) { delete state.inventory[id]; dropReady(id); shelf = true; }
    }
    if (shelf) { store.saveInventory(state.inventory); changed = true; }
    const profile = state.profile ?? {};
    for (const id of retired) {
      if (profile.codesRedeemed?.[id] != null) { delete profile.codesRedeemed[id]; changed = true; }
    }
    if (Array.isArray(state.badgeLoadout) && state.badgeLoadout.some((b) => retired.has(String(b).replace(/^special-/, '')))) {
      state.badgeLoadout = state.badgeLoadout.filter((b) => !retired.has(String(b).replace(/^special-/, '')));
      store.saveBadgeLoadout(state.badgeLoadout);
      changed = true;
    }
    if (changed) store.saveProfile(profile);
    // A theme or a frame the code brought is taken off; the picker no longer offers them.
    const worn = THEMES.find((th) => th.id === storedTheme());
    if (!worn || (worn.code && retired.has(worn.code))) { useTheme(DEFAULT_THEME); changed = true; }
    const frame = FRAME_STYLES.find((f) => f.id === state.frameStyle);
    if (!frame || (frame.code && retired.has(frame.code))) { state.frameStyle = DEFAULT_FRAME_STYLE; store.saveFrameStyle(DEFAULT_FRAME_STYLE); changed = true; }
    if (changed) { console.info('A withdrawn code was removed from this save'); syncSoon(); }
  } catch (error) {
    console.warn('purge failed', error);
  }
  return changed;
}
/** Re-read everything from storage, after an import or a sign-in pull. */

export function reloadFromStorage() {
  state.collection = store.loadCollection();
  state.inventory = store.loadInventory();
  state.profile = store.loadProfile();
  state.frameStyle = store.loadFrameStyle() ?? DEFAULT_FRAME_STYLE;
  state.badgeLoadout = store.loadBadgeLoadout();
  state.customPacks = store.loadCustomPacks();
  state.wallet = store.loadWallet();
  purgeRetiredCodes();
  purgeRetiredThemes();
  applySettings();
  applyStrings();
  refreshWallet();
  refreshLevelBadge();
  renderPacks();
  renderShop();
  renderBinder();
  updateBadges();
}
/** Sign out, and put the gate back. Local state is left for the next sign-in. */

export async function leaveAccount() {
  await flushSync().catch(() => {});
  try { await account.signOut(); } catch { /* already gone */ }
  state.account.session = null;
  state.account.profile = null;
  // Cleared here rather than waiting on the sign-out event, so signing back
  // in as the same account is not mistaken for a repeat of the same session.
  handledUser = null;
  state.social = { friends: [], incoming: [], outgoing: [], results: [], loaded: false, unread: new Map(), trades: [] };
  stopSocialPoll();
  el.welcome.hidden = true;
  showScreen('packs');
  showGate();
}
/**
 * Called on every auth change, including the one that restores a stored
 * session at launch.
 *
 * Idempotent by user id, because a token refresh reports the same session
 * again and must not re-run the sign-in pull over live play. That also makes
 * it safe to drive from both the listener and an explicit session check.
 */

export let handledUser;

export async function onSession(session) {
  const id = session?.user?.id ?? null;
  if (handledUser === id) return;
  handledUser = id;

  // Every path into the app comes through here, so this is where a session
  // is shown to the server before it is believed: the client restores the
  // last one from storage without asking anyone, and an account deleted on
  // the server would otherwise walk straight in until its token expired.
  if (session) {
    session = await account.verifySession(session);
    if (!session) {
      handledUser = null;
      // The account behind the stored session is gone from the server. The
      // device is emptied with it: what it holds belonged to that account,
      // and left in place it would be adopted, level and badges and all, by
      // the next account created on this device, which is exactly what a
      // deleted account must not come back as.
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage unavailable */ }
      reloadFromStorage();
    }
  }
  state.account.session = session ?? null;
  if (!session) { showGate(); endSplash(); return; }

  const ready = await fetchAccountProfile();
  if (ready === 'no-name') { showNameGate(); endSplash(); return; }
  await enterApp();
  endSplash();
}
/**
 * Load the profile for the current session.
 *
 * Everything that talks to the server needs it, so a failure here (which
 * offline at launch is) would otherwise leave the app signed in but unable to
 * sync or list friends for the rest of the session. It is retried whenever the
 * app comes back to the foreground.
 */

export async function fetchAccountProfile() {
  if (!signedIn() || state.account.profile) return 'ok';
  try {
    const profile = await account.profileForSession(state.account.session);
    if (!profile) return 'no-name';
    state.account.profile = profile;
    state.account.failed = false;
    return 'ok';
  } catch {
    state.account.failed = true;
    return 'offline';
  }
}
