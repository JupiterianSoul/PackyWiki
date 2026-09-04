/* filter: split out of wiki.js */

import { popularityFromViews, popularityFromWordCount } from '../pricing.js';
import { getLanguage } from '../i18n.js';

/* --- shared filtering ---------------------------------------------------- */

export const BAD_TITLE =
  /^(List of|Index of|Outline of|Timeline of|Glossary of|Liste de|Liste des|Chronologie|Portail|Category:|Catégorie:|Template:|Modèle:|File:|Fichier:|Help:|Aide:)/i;

export const BAD_SUFFIX = /\((disambiguation|homonymie|surname|given name|nom de famille|prénom)\)$/i;

export function isUsableText(title, extract) {
  if (!title || BAD_TITLE.test(title) || BAD_SUFFIX.test(title)) return false;
  if (!extract || extract.trim().length < 80) return false;
  return true;
}

export function toCard({ sourceId, sourceName, pageId, title, description, extract, thumbnail, url, views, wordCount }) {
  const popularity = Number.isFinite(views) && views > 0
    ? popularityFromViews(views)
    : popularityFromWordCount(wordCount);
  return {
    key: `${sourceId}:${pageId ?? title}`,
    sourceId, sourceName, pageId, title,
    description: description ?? '',
    extract: extract.trim(),
    thumbnail: thumbnail ?? null,
    url,
    lang: getLanguage(),
    views: Number.isFinite(views) ? views : null,
    wordCount: wordCount ?? null,
    popularity
  };
}
