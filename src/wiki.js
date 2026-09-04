/**
 * WIKIPEDIA, AS A DECK OF CARDS
 *
 * The draw layer, split by concern under src/wiki: filter (what makes a page a
 * card), fetch (the Wikipedia calls, relevance, pageviews), draw (a whole
 * booster within its budget), custom (any MediaWiki as a booster), translate
 * (a card the player owns, in another language), repair (a card whose article
 * moved or went away) and core (the budget, the
 * request count and drawArticles itself). This file is the public face: the
 * app imports from here and nothing else needs to know where a function lives.
 */
export { takeRequestCount, drawArticles } from './wiki/core.js';
export { candidateSlugs, resolveCustomWiki, fetchArticleText } from './wiki/custom.js';
export { fetchViewsFor } from './wiki/fetch.js';
export { translateCard, refreshTitleCard } from './wiki/translate.js';
export { REPAIR_EVERY, repairCard } from './wiki/repair.js';
