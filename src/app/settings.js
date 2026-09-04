/* settings: split out of main.js */

import { LANGUAGES, getLanguage, t, tx } from '../i18n.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { canRedeem, codeByInput, codeLook, codeSpec, hasRedeemed, timesRedeemed } from '../codes.js';
import { DEFAULT_THEME, THEMES } from '../ui/themes.js';
import { BADGES, badgeSvg } from '../badges.js';
import { FRAME_STYLES, frameSvg, frameTier, frameUnlocked } from '../frames.js';
import { RARITIES, rarityFromPopularity } from '../data/rarities.js';
import { DEFAULT_FX, FX_STYLES, fxCost, fxUnlocked } from '../data/fx.js';
import * as account from '../account.js';
import { copyText, describeSave, exportSave, importSave, parseSave, readText } from '../save.js';
import { STARTER_COINS } from '../economy.js';
import { music } from '../ui/music.js';
import { backdrop } from '../ui/backdrop.js';
import { reportQuest } from './arcade.js';
import { renderBinder } from './binder.js';
import { renderCardIndex } from './cardindex.js';
import { THEME_KEY, el, esc, money, openSheet, refreshWallet, settings, showScreen, showUpdateBar, state, storedTheme, toast, useTheme } from './core.js';
import { currentStats, describeError, flushSync, leaveAccount, signedIn, syncSoon, syncTimer, userId } from './gate.js';
import { live } from './live.js';
import { gainBooster } from './open.js';
import { buildBooster, renderPacks } from './packs.js';
import { frameStyle, pickFrameStyle, updateBadges, wearBadge } from './regalia.js';
import { renderShop } from './shop.js';
import { openAvatarPicker, paintAvatarInto } from './social.js';

/* --- settings ------------------------------------------------------------------------------------------- */

export function settingRow(key, titleKey, noteKey) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="switch row-action" type="button" role="switch"><span class="switch-knob"></span></button>`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);

  const button = row.querySelector('.switch');
  const paint = () => {
    const on = Boolean(settings()[key]);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-checked', String(on));
    button.setAttribute('aria-label', `${t(titleKey)}: ${on ? t('on') : t('off')}`);
  };
  paint();
  button.addEventListener('click', () => {
    settings()[key] = !settings()[key];
    store.saveProfile(state.profile);
    applySettings();
    paint();
    // Fires after the setting is applied, so turning sound on is audible and
    // turning it off is the last thing you hear.
    if (settings()[key] || key !== 'sound') { synth.resume(); synth.playToggle(Boolean(settings()[key])); }
  });
  return row;
}

export function renderSettings() {
  el.settingsTitle.textContent = t('tabSettings');
  el.prefsLabel.textContent = t('prefsTitle');
  el.accountLabel.textContent = t('settingsAccount');
  el.dataLabel.textContent = t('settingsData');

  // --- preferences: how the app behaves -----------------------------------
  const language = document.createElement('div');
  language.className = 'row';
  language.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action"></span>`;
  language.querySelector('h4').textContent = t('settingsLanguage');
  language.querySelector('p').textContent = t('settingsLanguageNote');
  language.querySelector('.chip').innerHTML =
    `${iconSvg('lock', { size: 13 })}<span>${LANGUAGES.find((l) => l.id === getLanguage())?.label ?? ''}</span>`;

  el.settingsList.replaceChildren(
    settingRow('sound', 'settingsSound', 'settingsSoundNote'),
    sliderRow('volume', 'settingsVolume', 'settingsVolumeNote',
      { preview: () => { synth.resume(); synth.playTap(); } }),
    settingRow('music', 'settingsMusic', 'settingsMusicNote'),
    sliderRow('musicVolume', 'settingsMusicVolume', 'settingsMusicVolumeNote'),
    settingRow('flash', 'settingsFlash', 'settingsFlashNote'),
    settingRow('tilt', 'settingsTilt', 'settingsTiltNote'),
    settingRow('haptics', 'settingsHaptics', 'settingsHapticsNote'),
    settingRow('awake', 'settingsAwake', 'settingsAwakeNote'),
    settingRow('prices', 'settingsPrices', 'settingsPricesNote'),
    settingRow('lowPower', 'settingsLowPower', 'settingsLowPowerNote'),
    settingRow('hints', 'settingsHints', 'settingsHintsNote'),
    settingRow('blurAdult', 'settingsBlurAdult', 'settingsBlurAdultNote'),
    language
  );

  // --- account: who you are to the server ---------------------------------
  el.accountList.replaceChildren(...accountRows());

  // --- data: the save itself ----------------------------------------------
  // Transferring a save is the only bridge across a reinstall or a new phone,
  // so it sits above the button that destroys one.
  const transferRow = document.createElement('div');
  transferRow.className = 'row';
  transferRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  transferRow.querySelector('h4').textContent = t('saveTitle');
  transferRow.querySelector('p').textContent = t('saveNote');
  const transferBtn = transferRow.querySelector('button');
  transferBtn.textContent = t('saveOpen');
  press(transferBtn, { sound: null });
  transferBtn.addEventListener('click', openTransfer);

  // Two destructive buttons, mild first: one empties the collection, the other
  // ends the save. They are deliberately worded so the difference between them
  // is readable before either is armed.
  const wipeRow = document.createElement('div');
  wipeRow.className = 'row';
  wipeRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  wipeRow.querySelector('h4').textContent = t('settingsCardWipe');
  wipeRow.querySelector('p').textContent = t('settingsCardWipeNote');
  const wipeBtn = wipeRow.querySelector('button');
  press(wipeBtn, { sound: null });
  paintResetButton(wipeBtn, 'cards');
  wipeBtn.addEventListener('click', () => handleReset(wipeBtn, 'cards'));

  const resetRow = document.createElement('div');
  resetRow.className = 'row';
  resetRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  resetRow.querySelector('h4').textContent = t('settingsReset');
  resetRow.querySelector('p').textContent = t('settingsResetNote');
  const resetBtn = resetRow.querySelector('button');
  press(resetBtn, { sound: null });
  paintResetButton(resetBtn, 'all');
  resetBtn.addEventListener('click', () => handleReset(resetBtn, 'all'));

  // Deleting the account is a different kind of ending from erasing a save, so
  // it sits last and on its own: erasing leaves the address able to sign back
  // in, this takes the address with it.
  const accountRow = document.createElement('div');
  accountRow.className = 'row';
  accountRow.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-danger row-action" type="button"></button>`;
  accountRow.querySelector('h4').textContent = t('settingsDeleteAccount');
  accountRow.querySelector('p').textContent = t('settingsDeleteAccountNote');
  const accountBtn = accountRow.querySelector('button');
  press(accountBtn, { sound: null });
  paintResetButton(accountBtn, 'account');
  accountBtn.addEventListener('click', () => handleReset(accountBtn, 'account'));

  el.dataList.replaceChildren(transferRow, wipeRow, resetRow, ...(signedIn() ? [accountRow] : []));

  // --- secret codes: a booster someone handed you ---------------------------
  el.redeemLabel.textContent = t('redeemTitle');
  el.redeemList.replaceChildren(redeemRow());
}
/**
 * The redeem row: one field, one button, one line of news underneath. A code
 * is looked up in src/codes.js, spent once per save, and what it hands over
 * is an ordinary booster in the player's inventory, openable like any other.
 */

export function redeemRow() {
  const row = document.createElement('div');
  row.className = 'row row-stack';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <form class="redeem-form" autocomplete="off">
      <input class="creator-input" type="text" maxlength="32" spellcheck="false" data-code>
      <button class="btn btn-sm btn-primary" type="submit"></button>
    </form>
    <p class="find-status" role="status" aria-live="polite" data-status></p>`;
  row.querySelector('h4').textContent = t('redeemTitle');
  row.querySelector('p').textContent = t('redeemNote');
  const form = row.querySelector('form');
  const input = row.querySelector('[data-code]');
  const status = row.querySelector('[data-status]');
  const button = row.querySelector('button');
  input.placeholder = t('redeemPlaceholder');
  button.textContent = t('redeemGo');
  press(button, { sound: null });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const entry = codeByInput(input.value);
    if (!entry) {
      synth.playDenied();
      status.textContent = t('redeemUnknown');
      status.className = 'find-status is-error';
      return;
    }
    if (!canRedeem(state.profile, entry)) {
      synth.playDenied();
      status.textContent = t('redeemUsed');
      status.className = 'find-status is-error';
      return;
    }
    state.profile.codesRedeemed = state.profile.codesRedeemed ?? {};
    state.profile.codesRedeemed[entry.id] = timesRedeemed(state.profile, entry.id) + 1;
    store.saveProfile(state.profile);
    // A regalia code carries no cards, so it puts no booster on the shelf. The
    // Creator's code is the only one of these: what it hands over is the badge,
    // the frame, the theme and the icon.
    if (!entry.regalia) gainBooster(codeSpec(entry), 1);
    // The theme goes on now, and the badge is worn now: the whole gift at
    // once, not a booster and a note saying there is more in the menus.
    const theme = THEMES.find((th) => th.code === entry.id);
    if (theme) useTheme(theme.id);
    const badge = BADGES.find((b) => b.code === entry.id);
    if (badge) wearBadge(badge.id);
    // A frame that arrives with a code goes on at once too, the same as the
    // theme and the badge: the whole gift, not a hint that there is more in
    // the menus.
    const frame = FRAME_STYLES.find((f) => f.code === entry.id);
    if (frame) pickFrameStyle(frame.id);
    syncSoon();
    input.value = '';
    status.textContent = t('redeemDone', { name: codeLook(entry).name });
    status.className = 'find-status is-ok';
    synth.playTheme();
    renderPacks();
    updateBadges();
    openReveal(entry, { theme, badge });
  });
  return row;
}
/**
 * The reveal: what a secret code just handed over, laid out as the event it
 * is. The person's message first, in their colour; then the booster, the six
 * cards by name, the theme that is now on, the badge now worn.
 */

export function openReveal(entry, { theme, badge }) {
  const look = codeLook(entry);
  openSheet(t('revealTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'reveal';
    wrap.style.setProperty('--accent', look.accent);
    wrap.style.setProperty('--accent2', look.accent2);
    wrap.style.setProperty('--light', look.light);
    wrap.innerHTML = `
      <p class="reveal-message"></p>
      <div class="reveal-booster">
        <div class="reveal-pack"></div>
        <div class="reveal-copy"><span class="label"></span><h3></h3><p></p></div>
      </div>
      <div class="reveal-grants">
        <div class="reveal-grant" data-theme-grant hidden>
          <span class="reveal-swatch"></span>
          <span class="reveal-grant-copy"><span class="label"></span><b></b></span>
        </div>
        <div class="reveal-grant" data-badge-grant hidden>
          <span class="reveal-badge"></span>
          <span class="reveal-grant-copy"><span class="label"></span><b></b></span>
        </div>
      </div>
      <p class="reveal-where"></p>
      <div class="reveal-actions">
        <button class="btn btn-primary" type="button" data-go></button>
        <button class="btn btn-ghost" type="button" data-later></button>
      </div>`;
    wrap.querySelector('.reveal-message').textContent = tx(entry.message);
    // A regalia code has no booster to show, so the whole row goes rather than
    // standing there empty with a label over nothing.
    if (entry.regalia) {
      wrap.querySelector('.reveal-booster').remove();
    } else {
      wrap.querySelector('.reveal-pack').appendChild(buildBooster(codeSpec(entry), { size: 'is-small' }));
      wrap.querySelector('.reveal-copy .label').textContent = t('revealBooster');
      wrap.querySelector('.reveal-copy h3').textContent = look.name;
      wrap.querySelector('.reveal-copy p').textContent = look.tagline;
    }
    // What is inside stays a surprise until the pack is torn open.
    if (theme) {
      const grant = wrap.querySelector('[data-theme-grant]');
      grant.hidden = false;
      grant.querySelector('.reveal-swatch').innerHTML =
        theme.swatch.map((c) => `<span style="background:${c}"></span>`).join('');
      grant.querySelector('.label').textContent = t('revealTheme');
      grant.querySelector('b').textContent = tx(theme.name);
    }
    if (badge) {
      const grant = wrap.querySelector('[data-badge-grant]');
      grant.hidden = false;
      grant.querySelector('.reveal-badge').innerHTML = badgeSvg(badge, 1, 1, { size: 52 });
      grant.querySelector('.label').textContent = t('revealBadge');
      grant.querySelector('b').textContent = tx(badge.name);
    }
    wrap.querySelector('.reveal-where').textContent = t('revealWhere');
    const go = wrap.querySelector('[data-go]');
    const later = wrap.querySelector('[data-later]');
    go.textContent = t('revealTake');
    later.textContent = t('revealClose');
    press(go, { sound: null });
    press(later, { sound: null });
    go.textContent = entry.regalia ? t('revealSeeIt') : t('revealTake');
    go.addEventListener('click', () => {
      live.sheet.hide();
      // Regalia goes to Customization, where the frame and the theme now live.
      // Everything else goes to the shelf its booster is on.
      if (entry.regalia) { showScreen('customize'); renderCustomize(); return; }
      // The screen first: the segmented control measures its buttons when
      // it moves, and a hidden screen measures as nothing.
      showScreen('packs');
      state.packMode = 'custom';
      live.packsSeg?.select('custom', { silent: true });
      renderPacks();
    });
    later.addEventListener('click', () => live.sheet.hide());
    body.appendChild(wrap);
  });
}
/**
 * CUSTOMIZATION - everything about how things look, pulled out of Settings:
 * the theme, your picture, your name, and one day the frame around your
 * level. Settings keeps the switches; this screen keeps the mirror.
 */

export function renderCustomize() {
  el.customizeTitle.textContent = t('tabCustomize');
  el.themeLabel.textContent = t('themeTitle');
  el.identityLabel.textContent = t('identityTitle');

  // The theme picker previews each theme rather than naming it.
  const current = storedTheme();
  el.themeGrid.replaceChildren(...THEMES.filter((theme) => !theme.code || hasRedeemed(state.profile, theme.code)).map((theme) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `theme-card${theme.id === current ? ' is-on' : ''}`;
    card.dataset.theme = theme.id;
    card.innerHTML = `
      <span class="theme-swatch">${theme.swatch.map((c) => `<span style="background:${c}"></span>`).join('')}</span>
      <h4></h4><p></p>
      <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
    card.querySelector('h4').textContent = tx(theme.name);
    card.querySelector('p').textContent = tx(theme.blurb);
    if (theme.code) {
      const note = document.createElement('span');
      note.className = 'theme-note';
      note.textContent = t('themeLockedNote');
      card.querySelector('p').after(note);
    }
    press(card, { sound: null });
    card.addEventListener('click', () => {
      if (theme.id === storedTheme()) return;
      useTheme(theme.id, { announce: true });
      renderCustomize();
      // Everything already on screen has to be rebuilt in the new shape.
      renderPacks();
      renderShop();
      renderBinder();
    });
    return card;
  }));

  el.identityList.replaceChildren(...identityRows());

  // --- level frames: pick the style your level wears -----------------------
  el.framesLabel.textContent = t('framesTitle');
  const level = state.profile.progress.level ?? 1;
  const tier = frameTier(level);
  el.framesNote.hidden = true;
  const wearing = frameStyle();
  // A frame behind a secret code is not shown at all until that code is
  // redeemed: the same rule the special themes and badges follow, so nothing
  // in the picker hints at a code the player has not been given.
  const offered = FRAME_STYLES.filter((style) => !style.code || hasRedeemed(state.profile, style.code));
  el.frameStyles.replaceChildren(...offered.map((style) => {
    const open = style.code ? true : frameUnlocked(style, level);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `frame-card${style.id === wearing ? ' is-on' : ''}${tier < 1 ? ' is-dim' : ''}${open ? '' : ' is-locked'}`;
    card.dataset.frame = style.id;
    card.innerHTML = `
      <span class="frame-prev">
        <span class="frame-prev-core">${level}</span>
        <span class="frame-overlay" aria-hidden="true">${frameSvg(style.id, Math.max(tier, 1))}</span>
      </span>
      <span class="frame-copy"><h4></h4><small></small></span>
      <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
    card.querySelector('h4').textContent = tx(style.name);
    card.querySelector('small').textContent = open ? '' : t('frameLocked', { level: style.minLevel });
    press(card, { sound: null });
    card.addEventListener('click', () => {
      if (!open) {
        synth.playDenied();
        toast(esc(t('frameLocked', { level: style.minLevel })), 'error');
        return;
      }
      if (style.id === frameStyle()) return;
      synth.playTap();
      pickFrameStyle(style.id);
      toast(t('frameEquipped', { name: tx(style.name) }));
      renderCustomize();
    });
    return card;
  }));

  renderCardFx();
}
/**
 * CARD EFFECTS: one row per rarity, one chip per style.
 *
 * The choice is per rarity on purpose. A single setting for the whole
 * collection would make every card look the same and take the ladder's
 * legibility with it; this way a player dresses the tiers they actually
 * collect, and a locked chip says exactly how many cards of that tier open it.
 */

export function renderCardFx() {
  el.fxLabel.textContent = t('fxTitle');
  el.fxNote.textContent = t('fxNote');

  // How many of each tier are in the collection: what unlocks a style.
  const held = {};
  for (const entry of Object.values(state.collection.entries ?? {})) {
    if (entry?.special) continue;
    const id = entry.rarityId ?? rarityFromPopularity(entry.popularity ?? 0).id;
    held[id] = (held[id] ?? 0) + (entry.count ?? 1);
  }

  el.fxTiers.replaceChildren(...RARITIES.map((rarity) => {
    const owned = held[rarity.id] ?? 0;
    const row = document.createElement('div');
    row.className = 'fx-tier';
    row.innerHTML = `<div class="fx-tier-head"><span class="fx-tier-name"></span>
      <span class="fx-tier-count tabular"></span></div><div class="fx-chips"></div>`;
    const name = row.querySelector('.fx-tier-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarity.color;
    row.querySelector('.fx-tier-count').textContent = t('fxOwned', { n: owned.toLocaleString() });

    row.querySelector('.fx-chips').replaceChildren(...FX_STYLES.map((style) => {
      const cost = fxCost(style.id, rarity.id);
      const open = fxUnlocked(style.id, rarity.id, owned);
      const worn = (state.cardFx[rarity.id] ?? DEFAULT_FX) === style.id;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `fx-chip${worn ? ' is-on' : ''}${open ? '' : ' is-locked'}`;
      chip.style.setProperty('--rarity', rarity.color);
      chip.innerHTML = `<span class="fx-chip-name"></span><span class="fx-chip-sub"></span>`;
      chip.querySelector('.fx-chip-name').textContent = tx(style.name);
      chip.querySelector('.fx-chip-sub').textContent = open
        ? tx(style.note)
        : t('fxLocked', { n: cost, rarity: tx(rarity.name) });
      press(chip, { sound: null });
      chip.addEventListener('click', () => {
        if (!open) { synth.playDenied(); toast(esc(t('fxLocked', { n: cost, rarity: tx(rarity.name) })), 'error'); return; }
        synth.playTap();
        if (style.id === DEFAULT_FX) delete state.cardFx[rarity.id];
        else state.cardFx[rarity.id] = style.id;
        store.saveCardFx(state.cardFx);
        reportQuest('fx');
        toast(esc(t('fxEquipped', { name: tx(style.name), rarity: tx(rarity.name) })));
        renderCardFx();
        // Anything already drawn is wearing the old look.
        renderBinder();
        renderCardIndex?.();
      });
      return chip;
    }));
    return row;
  }));
}
/* --- settings & customization rows ---------------------------------------- */

export function settingsRowShell(titleKey, noteKey) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);
  return row;
}

export function settingsRowButton(row, label, run) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-ghost row-action';
  btn.textContent = label;
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); run(btn); });
  row.appendChild(btn);
  return btn;
}
/**
 * A build with no backend says so plainly instead of pretending to have one:
 * there is nothing the player can do about it, but knowing their collection is
 * device-only is what tells them to use the save transfer in Settings.
 */

export function offlineAccountRow() {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action">${iconSvg('cloud', { size: 13 })}</span>`;
  row.querySelector('h4').textContent = t('accountOfflineTitle');
  row.querySelector('p').textContent = t('accountOfflineNote');
  return row;
}
/** The old-schema warning: the server cannot store what this row would edit. */

export function staleSchemaRow() {
  const row = document.createElement('div');
  row.className = 'row is-warning';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>
    <span class="chip row-action">${iconSvg('cloud', { size: 13 })}</span>`;
  row.querySelector('h4').textContent = t('schemaOldTitle');
  row.querySelector('p').textContent = t('schemaOldNote');
  return row;
}
/**
 * Who you look like: picture and name, on the Customization screen. A
 * project still on the older schema cannot store a picture, so rather than
 * offering a control that fails on tap, say plainly what is missing.
 * Changing your name works on every schema, so that row always stays.
 */

export function identityRows() {
  if (!account.configured) return [offlineAccountRow()];

  const rows = [];
  if (account.socialSchemaReady()) {
    const avatarRow = settingsRowShell('avatarTitle', 'avatarNote');
    const face = document.createElement('span');
    face.className = 'person-mark row-action';
    paintAvatarInto(face, state.account.profile,
      { frame: { style: frameStyle(), tier: frameTier(state.profile.progress.level) } });
    face.style.cursor = 'pointer';
    face.addEventListener('click', () => { synth.playTap(); openAvatarPicker(); });
    avatarRow.appendChild(face);
    rows.push(avatarRow);
  } else {
    rows.push(staleSchemaRow());
  }

  const nameRow = settingsRowShell('usernameTitle', 'usernameNote');
  settingsRowButton(nameRow, t('usernameChange'), () => openUsernameChange());
  rows.push(nameRow);
  return rows;
}
/**
 * The account block in Settings: who you are, whether the last change
 * reached the server, who can see you, and the way out.
 */

export function accountRows() {
  if (!account.configured) return [offlineAccountRow()];

  const who = document.createElement('div');
  who.className = 'row';
  who.dataset.account = 'sync';
  who.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  who.querySelector('h4').textContent = t('accountSyncTitle');
  const syncBtn = who.querySelector('button');
  syncBtn.textContent = t('accountSyncNow');
  press(syncBtn, { sound: null });
  syncBtn.addEventListener('click', () => { synth.playTap(); flushSync(); });

  const out = document.createElement('div');
  out.className = 'row';
  out.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="btn btn-sm btn-ghost row-action" type="button"></button>`;
  out.querySelector('h4').textContent =
    t('accountSignedInAs', { name: state.account.profile?.username ?? '' });
  out.querySelector('p').textContent = t('accountSignOutNote');
  const outBtn = out.querySelector('button');
  outBtn.textContent = t('accountSignOut');
  press(outBtn, { sound: null });
  outBtn.addEventListener('click', () => { synth.playTap(); leaveAccount(); });

  paintSyncLine(who);

  // Visibility and presence live on the newer schema only.
  if (!account.socialSchemaReady()) return [who, out];

  const visRow = settingsRowShell('visibilityTitle', 'visibilityNote');
  const visOrder = ['public', 'friends', 'private'];
  const visLabel = (v) => t(`visibility_${v}`);
  settingsRowButton(visRow, visLabel(state.account.profile?.visibility ?? 'public'), async (btn) => {
    const current = state.account.profile?.visibility ?? 'public';
    const next = visOrder[(visOrder.indexOf(current) + 1) % visOrder.length];
    btn.disabled = true;
    try {
      await account.updateProfileFields(userId(), { visibility: next });
      state.account.profile.visibility = next;
      btn.textContent = visLabel(next);
    } catch (error) { toast(esc(describeError(error)), 'error'); }
    btn.disabled = false;
  });

  const presRow = settingsRowShell('presenceTitle', 'presenceNote');
  const presLabel = (v) => (v === 'hidden' ? t('presence_hidden') : t('presence_online'));
  settingsRowButton(presRow, presLabel(state.account.profile?.presence ?? 'online'), async (btn) => {
    const next = (state.account.profile?.presence ?? 'online') === 'online' ? 'hidden' : 'online';
    btn.disabled = true;
    try {
      await account.updateProfileFields(userId(), { presence: next });
      state.account.profile.presence = next;
      btn.textContent = presLabel(next);
    } catch (error) { toast(esc(describeError(error)), 'error'); }
    btn.disabled = false;
  });

  return [who, visRow, presRow, out];
}
/** A new name, checked and claimed. */

export function openUsernameChange() {
  openSheet(t('usernameTitle'), (body) => {
    body.innerHTML = `
      <p class="muted" style="font-size:.86rem;margin-bottom:14px" data-note></p>
      <input class="creator-input" type="text" maxlength="20" data-name
        autocapitalize="off" autocomplete="off" spellcheck="false" />
      <p class="find-status" data-status role="status" style="margin-top:8px"></p>
      <button class="btn btn-primary btn-block" type="button" data-save style="margin-top:12px"></button>`;
    body.querySelector('[data-note]').textContent = t('usernameSheetNote');
    const input = body.querySelector('[data-name]');
    input.value = state.account.profile?.username ?? '';
    const status = body.querySelector('[data-status]');
    const saveBtn = body.querySelector('[data-save]');
    saveBtn.textContent = t('usernameSave');
    press(saveBtn, { sound: null });
    saveBtn.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!account.USERNAME_RE.test(name)) {
        status.textContent = t('usernameRules');
        status.className = 'find-status is-error';
        return;
      }
      saveBtn.disabled = true;
      status.textContent = t('usernameChecking');
      status.className = 'find-status is-working';
      try {
        const updated = await account.changeUsername(userId(), name);
        if (!updated) {
          status.textContent = t('authNameTaken');
          status.className = 'find-status is-error';
          saveBtn.disabled = false;
          return;
        }
        state.account.profile = updated;
        toast(t('usernameChanged', { name: esc(name) }));
        synth.playResolved();
        live.sheet.hide();
        renderCustomize();
      } catch (error) {
        status.textContent = describeError(error);
        status.className = 'find-status is-error';
        saveBtn.disabled = false;
      }
    });
  });
}
/** When the save last reached the server, in words. */

export function paintSyncLine(row) {
  const line = row?.querySelector('p');
  if (!line) return;
  if (state.account.syncing) { line.textContent = t('accountSyncing'); return; }
  if (state.account.failed) { line.textContent = t('accountSyncFailed'); return; }
  if (!state.account.syncedAt) { line.textContent = t('accountSyncNote'); return; }
  const mins = Math.floor((Date.now() - state.account.syncedAt) / 60000);
  line.textContent = t('accountSynced', {
    when: mins < 1 ? t('accountJustNow') : t('accountMinsAgo', { n: mins })
  });
}
/** Repaint just the sync line, which changes without the screen being rebuilt. */

export function renderAccountRow() {
  return (paintSyncLine(el.dataList.querySelector('[data-account="sync"]')));
}
/**
 * Copy the save out, or paste one back in.
 *
 * Presented as text rather than a file because a WebView cannot reliably hand
 * the player a download, and because text survives being pasted into a note,
 * a message to yourself, or anywhere else that will still be there after the
 * app is gone.
 */

export function openTransfer() {
  openSheet(t('saveTitle'), (body) => {
    body.innerHTML = `
      <p style="margin-bottom:16px" data-intro></p>

      <div class="row" style="display:grid;gap:12px">
        <div class="row-copy"><h4 data-out-t></h4><p data-out-n></p></div>
        <textarea class="filter-input no-drag" data-out rows="4" readonly spellcheck="false"
                  style="font-family:ui-monospace,monospace;font-size:.7rem;resize:none"></textarea>
        <button class="btn btn-sm btn-primary" type="button" data-copy></button>
      </div>

      <div class="row" style="display:grid;gap:12px;margin-top:10px">
        <div class="row-copy"><h4 data-in-t></h4><p data-in-n></p></div>
        <textarea class="filter-input no-drag" data-in rows="4" spellcheck="false"
                  style="font-family:ui-monospace,monospace;font-size:.7rem;resize:none"></textarea>
        <p class="muted" style="font-size:.76rem;min-height:1.2em" data-status></p>
        <button class="btn btn-sm btn-ghost" type="button" data-load></button>
      </div>`;

    body.querySelector('[data-intro]').textContent = t('saveIntro');
    body.querySelector('[data-out-t]').textContent = t('saveExport');
    body.querySelector('[data-out-n]').textContent = t('saveExportNote');
    body.querySelector('[data-in-t]').textContent = t('saveImport');
    body.querySelector('[data-in-n]').textContent = t('saveImportNote');

    const out = body.querySelector('[data-out]');
    out.value = exportSave();
    out.addEventListener('focus', () => out.select());

    const copy = body.querySelector('[data-copy]');
    copy.textContent = t('saveCopy');
    press(copy, { sound: null });
    copy.addEventListener('click', async () => {
      const ok = await copyText(out.value);
      copy.textContent = ok ? t('saveCopied') : t('saveCopyManually');
      if (ok) synth.playCoins(); else { out.focus(); out.select(); synth.playDenied(); }
      setTimeout(() => { copy.textContent = t('saveCopy'); }, 2600);
    });

    const input = body.querySelector('[data-in]');
    input.placeholder = t('savePastePlaceholder');
    const status = body.querySelector('[data-status]');
    const load = body.querySelector('[data-load]');
    load.textContent = t('saveLoad');
    press(load, { sound: null });

    let armed = false;
    const paint = () => {
      load.textContent = armed ? t('saveLoadConfirm') : t('saveLoad');
      load.classList.toggle('btn-danger', armed);
      load.classList.toggle('is-armed', armed);
    };

    // Offer to fill it from the clipboard where the WebView allows it.
    readText().then((text) => {
      if (text && parseSave(text) && !input.value) {
        input.value = text;
        input.dispatchEvent(new Event('input'));
      }
    });

    input.addEventListener('input', () => {
      armed = false;
      paint();
      const text = input.value.trim();
      if (!text) { status.textContent = ''; status.style.color = ''; return; }
      const summary = describeSave(text);
      if (!summary) {
        status.textContent = t('saveUnreadable');
        status.style.color = 'var(--negative)';
        return;
      }
      status.innerHTML = t('saveFound', {
        cards: summary.cards.toLocaleString(),
        level: summary.level,
        amount: money(summary.wallet)
      });
      status.style.color = 'var(--positive)';
    });

    // Arm then confirm: importing replaces everything already here.
    load.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!describeSave(text)) {
        status.textContent = t('saveUnreadable');
        status.style.color = 'var(--negative)';
        synth.playDenied();
        return;
      }
      if (!armed) {
        armed = true;
        paint();
        synth.playArm();
        setTimeout(() => { armed = false; paint(); }, 5000);
        return;
      }
      const before = exportSave();
      if (!importSave(text)) {
        status.textContent = t('saveUnreadable');
        synth.playDenied();
        return;
      }
      // Signed in, the account is what gets read on the next launch, so an
      // import that only reached the device would be overwritten by it. Take
      // the imported save up before reloading, and put the old one back if
      // that fails rather than leaving a save that is about to be discarded.
      if (signedIn() && state.account.profile) {
        clearTimeout(syncTimer);
        status.textContent = t('accountSyncing');
        status.style.color = '';
        try {
          await account.pushSave(userId());
        } catch (error) {
          importSave(before);
          status.textContent = describeError(error);
          status.style.color = 'var(--negative)';
          synth.playDenied();
          return;
        }
      }
      location.reload();
    });
    paint();
  });
}
/**
 * Two different destructive buttons, so two arming states. Sharing one would
 * let a tap that armed the mild button confirm the ruinous one.
 */

export const resetArm = { cards: false, all: false, account: false };

export const resetTimers = { cards: null, all: null, account: null };

export const RESET_LABELS = { cards: 'settingsCardWipe', all: 'settingsReset', account: 'settingsDeleteAccount' };

export function paintResetButton(button, which) {
  const armed = resetArm[which];
  button.textContent = armed ? t('settingsResetConfirm') : t(RESET_LABELS[which]);
  button.classList.toggle('is-armed', armed);
}
/** Same arm-then-confirm shape as selling a card: the button is the dialog. */

export function handleReset(button, which) {
  if (!resetArm[which]) {
    resetArm[which] = true;
    paintResetButton(button, which);
    synth.playArm();
    clearTimeout(resetTimers[which]);
    resetTimers[which] = setTimeout(() => {
      resetArm[which] = false;
      paintResetButton(button, which);
    }, 5000);
    return;
  }
  if (which === 'cards') removeAllCards();
  else if (which === 'account') deleteAccountForGood(button);
  else wipeEverything();
}
/**
 * Remove the account, not just what is in it.
 *
 * Erasing a save empties the account and signs out; the address stays
 * registered, so signing in gets it back empty. This gets rid of the account
 * itself: the row in the auth table goes, the address stops working, and it is
 * free to sign up with again as a genuinely new player.
 *
 * The device is cleared FIRST-ish and unconditionally afterwards, because a
 * local save left behind would be pushed up under a brand new account the
 * moment somebody signed up with the same address.
 */

export async function deleteAccountForGood(button) {
  if (!signedIn()) { toast(esc(t('settingsDeleteNoAccount')), 'error'); synth.playDenied(); return; }
  clearTimeout(syncTimer);
  button.disabled = true;
  try {
    await account.deleteAccount();
  } catch (error) {
    button.disabled = false;
    toast(esc(describeError(error)), 'error');
    synth.playDenied();
    return;
  }
  // The account is gone; the session token that named it is meaningless now.
  store.freezeWrites();
  await account.signOut().catch(() => { /* the row is already deleted */ });
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* nothing to clear */ }
  location.reload();
}
/**
 * Empty the collection without touching who the player is.
 *
 * The mild reset: cards, money, boosters, worn badges and the chosen theme go
 * back to the start, while level, experience, achievements and the codes this
 * save has redeemed stay exactly where they were. A special booster's cards
 * are the one thing here that belongs to the account rather than the run, so
 * they survive too, along with the unopened special boosters and the albums
 * built from them. Wiping those would take away something a code can only
 * hand over once.
 */

export async function removeAllCards() {
  const kept = {};
  for (const [key, entry] of Object.entries(state.collection.entries ?? {})) {
    if (entry?.special) kept[key] = entry;
  }
  state.collection.entries = kept;
  store.saveCollection(state.collection);

  // Unopened special boosters stay; everything else on the shelf goes.
  for (const [id, slot] of Object.entries(state.inventory)) {
    if (slot?.spec?.kind !== 'code') delete state.inventory[id];
  }
  store.saveInventory(state.inventory);

  store.saveWallet(STARTER_COINS);
  store.saveBadgeLoadout(null);
  state.badgeLoadout = null;
  store.saveWishlist([]);
  try { localStorage.setItem(THEME_KEY, DEFAULT_THEME); } catch { /* session only */ }

  // The server holds the same save, so it has to hear about this BEFORE the
  // reload, or the next launch pulls the cards straight back down. That is
  // exactly what happened when this only queued a sync and reloaded: the
  // reload killed the queued push, and the wipe looked like it had done
  // nothing. If the push cannot be made now, the device keeps its wiped
  // save, the sync keeps trying, and the reload waits for it.
  if (signedIn()) {
    clearTimeout(syncTimer);
    let pushed = null;
    try { pushed = await account.pushSave(userId()); } catch { pushed = null; }
    if (pushed !== 'pushed') {
      if (pushed === 'outdated') showUpdateBar('outdated');
      else { toast(esc(t('syncFailedKept')), 'error'); syncSoon(); }
      renderPacks(); renderBinder(); refreshWallet();
      return;
    }
    account.publishStats(userId(), currentStats()).catch(() => {});
  }
  toast(esc(t('settingsCardWipeDone')), 'ok');
  location.reload();
}
/**
 * Erase everything - including the copy on the server.
 *
 * Clearing only the device would erase nothing: the account's save would be
 * pulled straight back down on the next launch. The server goes first, so a
 * failure there leaves the player exactly where they were rather than
 * half-erased.
 *
 * Every wikster key goes, not a hand-written list of them: the list had
 * already fallen behind the wishlist, the badge shelf, the frame and the
 * saved bids, all of which outlived an erase that claimed to remove
 * everything. Redeemed codes live in the profile, so they go too, and a
 * secret code can be redeemed again on the save that comes after this.
 */

export async function wipeEverything() {
  clearTimeout(syncTimer);
  // Signed in is decided by the SESSION, not by whether the profile happens to
  // be loaded. Gating on the profile meant a reset run before it arrived left
  // the account untouched, and the next launch pulled the whole save back
  // down: the button looked like it had done nothing.
  // The device is wiped WHATEVER the server says. This used to stop at the
  // first refusal from the server and leave the device untouched, so a
  // player whose account could not be reached (a deleted account, a schema
  // behind the app, no connection) pressed Erase, saw an error or nothing,
  // and kept every level, badge and stat they were trying to be rid of.
  // Now the server is asked, its answer is remembered, and the device is
  // emptied and the app restarted regardless; if the server refused, the
  // next launch says so, because signing back into THAT account could pull
  // its old save down again.
  let serverFailed = false;
  // From here on nothing may be written back, whatever unload handlers run.
  store.freezeWrites();
  if (signedIn()) {
    try {
      await account.hardReset(userId());
    } catch {
      serverFailed = true;
    }
    // Signing out takes the session with it, so the app comes back at the
    // welcome screen the way a new install does. Signing in again finds an
    // account with nothing stored against it.
    await account.signOut().catch(() => { /* the local wipe still stands */ });
  }
  try {
    // EVERY key, not the app's own prefix. The prefix left the session token
    // behind, so the app woke up still signed in and half of "a new account"
    // was untrue the moment it launched.
    localStorage.clear();
    sessionStorage.clear();
    if (serverFailed) localStorage.setItem(WIPE_NOTE_KEY, 'server');
  } catch { /* storage unavailable: nothing to remove */ }
  location.reload();
}
/** Left behind by a wipe the server refused, so the next launch can say so. */

export const WIPE_NOTE_KEY = 'wikster.wipeNote';

export function sayWipeNote() {
  let note = null;
  try { note = localStorage.getItem(WIPE_NOTE_KEY); localStorage.removeItem(WIPE_NOTE_KEY); } catch { /* storage unavailable */ }
  if (note) setTimeout(() => toast(esc(t('wipeServerRefused')), 'error'), 1800);
}
/*
 * HAPTICS. A short pulse under the taps that already make a sound, so a phone
 * on silent still answers. Vibration is not on desktop and not on iOS Safari,
 * and asking for it there throws nothing, so no capability test is needed
 * beyond the one below.
 */

export function buzz(ms = 12) {
  if (settings().haptics === false) return;
  try { navigator.vibrate?.(ms); } catch { /* no vibrator on this device */ }
}
/*
 * KEEP THE SCREEN AWAKE while a booster is being opened.
 *
 * A rip is a slow gesture followed by a card at a time, and a phone whose
 * screen times out mid-pack takes the reveal with it. The lock is held only
 * for the open screen and dropped everywhere else, because a lock held for a
 * whole session is a flat battery.
 */

export let wakeLock = null;

export async function holdWakeLock() {
  if (settings().awake === false || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock?.request('screen') ?? null;
    // The system drops it whenever the app leaves the screen; forget it so the
    // next open asks again rather than believing it still holds one.
    wakeLock?.addEventListener?.('release', () => { wakeLock = null; });
  } catch { /* unsupported, or refused while backgrounded */ }
}

export function releaseWakeLock() {
  try { wakeLock?.release?.(); } catch { /* already gone */ }
  wakeLock = null;
}

export function applySettings() {
  const s = settings();
  document.documentElement.dataset.lowpower = s.lowPower ? '1' : '0';
  document.documentElement.dataset.hints = s.hints ? '1' : '0';
  document.documentElement.dataset.prices = s.prices === false ? '0' : '1';
  // Cards are marked as they are built; the switch decides whether the mark
  // means anything, so turning it on or off repaints without redrawing.
  document.documentElement.dataset.blurAdult = s.blurAdult ? '1' : '0';
  if (s.awake === false) releaseWakeLock();
  synth.setMuted(!s.sound);
  synth.setVolume(s.volume ?? 1);
  music.setVolume(s.musicVolume ?? 0.4);
  music.setOn(s.music !== false);
  backdrop.setLowPower(s.lowPower);
}
/** A slider row for the Preferences list: 0..100 over a stored 0..1. */

export function sliderRow(key, titleKey, noteKey, { preview = null } = {}) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <input class="row-slider row-action" type="range" min="0" max="100" step="5">`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);
  const slider = row.querySelector('input');
  slider.value = String(Math.round((settings()[key] ?? 1) * 100));
  slider.setAttribute('aria-label', t(titleKey));
  slider.addEventListener('input', () => {
    settings()[key] = Number(slider.value) / 100;
    applySettings();
  });
  slider.addEventListener('change', () => {
    store.saveProfile(state.profile);
    preview?.();
  });
  return row;
}
