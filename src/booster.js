/**
 * Booster specs.
 *
 * A booster is no longer a fixed entry in a table — the shop invents them, so
 * one is described by a small spec that can be stored, counted in an inventory
 * and rebuilt into something openable:
 *
 *   { kind, themeId, rarityId, cards, wiki }
 *
 *   kind     'theme'  a subject booster        (themeId set)
 *            'open'   draws from all of Wikipedia
 *            'custom' draws from a subject's own wiki (wiki set)
 *   rarityId null for a normal booster, or a tier for a rarity booster
 *   cards    3–7
 *
 * `specId` is the identity used everywhere: inventory keys, shop dedupe, DOM
 * data attributes. It has to be stable across sessions, so it is derived from
 * the spec's contents rather than generated.
 */
import { THEME_PACKS, themeById } from './data/packs.js';
import { rarityById, rarityRank } from './data/rarities.js';
import { tx, t, getLanguage } from './i18n.js';
import { proceduralStyle, customSeed } from './packstyle.js';

/** Colour used for open boosters, which belong to no subject. */
const OPEN_ACCENT = { accent: '#94a3b8', accent2: '#334155' };

export function specId(spec) {
  const rarity = spec.rarityId ?? 'std';
  // A timed booster is defined entirely by its track level.
  if (spec.kind === 'timed') return `timed|${spec.timedLevel ?? 1}|std|${spec.cards}`;
  if (spec.kind === 'custom') {
    const host = spec.wiki ? new URL(spec.wiki.apiUrl).host + new URL(spec.wiki.apiUrl).pathname.replace('/api.php', '') : spec.customId;
    return `custom|${host}|${rarity}|${spec.cards}`;
  }
  return `${spec.kind}|${spec.themeId ?? 'any'}|${rarity}|${spec.cards}`;
}

/**
 * Display name. A booster tied to a subject leads with the subject and adds
 * the tier; one that isn't is named for its tier alone, because "All boosters
 * · Artifact" reads like a filter rather than a product.
 */
export function specName(spec) {
  const tier = spec.rarityId ? tx(rarityById(spec.rarityId).name) : null;

  if (spec.kind === 'timed') return t('timedBooster');
  if (spec.kind === 'custom') {
    const base = spec.customName ?? spec.wiki?.sitename ?? 'Custom';
    return tier ? `${base} · ${tier}` : base;
  }
  if (spec.themeId) {
    const base = tx(themeById(spec.themeId)?.name);
    return tier ? `${base} · ${tier}` : base;
  }
  return tier ? t('rarityBooster', { rarity: tier }) : t('wildcard');
}

export function specTagline(spec) {
  if (spec.kind === 'timed') return t('timedTagline');
  if (spec.kind === 'custom') return spec.customTagline ?? '';
  if (spec.themeId) return tx(themeById(spec.themeId)?.tagline);
  return '';
}

/**
 * Colours. A rarity booster keeps its subject's colours and wears the rarity
 * as an effect on top; a pure rarity booster has nothing else to go on, so it
 * takes the tier's own colour. A custom pack's palette is PROCEDURAL — derived
 * from its wiki's identity by src/packstyle.js — so the accents stored on old
 * packs are ignored: every custom pack owns its own colours now, and they
 * regenerate identically on every device.
 */
export function specColours(spec) {
  if (spec.kind === 'timed') return { accent: '#38bdf8', accent2: '#0c4a6e' };
  if (spec.kind === 'custom') {
    const style = proceduralStyle(customSeed(spec));
    return { accent: style.accent, accent2: style.accent2 };
  }
  const theme = themeById(spec.themeId);
  if (theme) return { accent: theme.accent, accent2: theme.accent2 };
  if (spec.rarityId) {
    const rarity = rarityById(spec.rarityId);
    return { accent: rarity.color, accent2: '#1e2233' };
  }
  return OPEN_ACCENT;
}

export const specIcon = (spec) =>
  spec.kind === 'timed' ? 'clock'
    : spec.kind === 'custom' ? (spec.icon ?? 'wand')
      : themeById(spec.themeId)?.icon ?? (spec.rarityId ? 'gem' : 'packs');

/** Hero article whose photo becomes the pack art, in the current language. */
export function specHero(spec) {
  const theme = themeById(spec.themeId);
  if (!theme) return null;
  const lang = getLanguage();
  return theme.hero[lang] ?? theme.hero.en;
}

/** Search queries for the current language, or [] for an open booster. */
export function specQueries(spec) {
  const theme = themeById(spec.themeId);
  if (!theme) return [];
  const lang = getLanguage();
  return theme.queries[lang] ?? theme.queries.en ?? [];
}

/** Turn a spec into the shape src/wiki.js expects. */
export function toDrawPack(spec) {
  return {
    name: specName(spec),
    cards: spec.cards,
    source: spec.kind === 'custom' ? 'custom' : 'wikipedia',
    queries: specQueries(spec),
    wiki: spec.wiki ?? null
  };
}

/** Every theme booster at a given size, for the shop's shelves. */
export const themeSpecs = (cards, rarityId = null) =>
  THEME_PACKS.map((theme) => ({ kind: 'theme', themeId: theme.id, rarityId, cards }));

export const isPremium = (spec) => Boolean(spec.rarityId) && rarityRank(spec.rarityId) >= 4;
