// @ts-check
/**
 * THE SHAPES
 * ============================================================================
 * The objects the app passes around, named once so a module can say what it
 * takes and gives (`@param {Card} card`) and the checker (npm run typecheck)
 * can hold it to that. Nothing here runs: this file is documentation the
 * tools can read. Fields marked optional are the ones an older save may lack.
 */

/**
 * A card as drawn: one Wikipedia article, graded and priced.
 * @typedef {object} Card
 * @property {string} key          `lang:Title` with underscores, the card's identity
 * @property {string} title
 * @property {string} rarityId     one of RARITIES' ids
 * @property {number} price        in Buckarooz
 * @property {number} [views]      monthly readership the grade came from
 * @property {number} [popularity] 0..1, the readership on the odds curve
 * @property {string} [thumbnail]  image URL or data URI
 * @property {string} [description]
 * @property {string} [extract]
 * @property {string} [lang]       the Wikipedia it was drawn from
 * @property {string} [packId]     `theme|animals`, `custom|...`, the booster it came from
 * @property {string} [packName]
 * @property {string} [sourceId]   `wiki:<host>` for a card from another wiki
 * @property {string} [special]    a personal card's id, when it is one
 */

/**
 * A card in the album: a Card plus what the player did with it.
 * @typedef {Card & {
 *   count: number,
 *   favorite?: boolean,
 *   firstPulledAt: number,
 *   lastPulledAt: number,
 *   checkedAt?: number,
 *   gone?: boolean
 * }} Entry
 */

/**
 * @typedef {object} Collection
 * @property {Record<string, Entry>} entries  by card key
 */

/**
 * What a booster is: where its cards come from and how many.
 * @typedef {object} PackSpec
 * @property {'theme'|'open'|'custom'|'timed'} kind
 * @property {string|null} themeId
 * @property {string|null} rarityId   the guaranteed tier, if any
 * @property {number} cards
 */

/**
 * The save envelope written to the cloud and to the clipboard.
 * @typedef {object} SaveEnvelope
 * @property {'wikster-save'} format
 * @property {number} version
 * @property {number} at
 * @property {{ sha: string, at: number } | null} [build]
 * @property {Record<string, string>} data      storage key -> raw value
 * @property {Record<string, number>} stamps    storage key -> when it last changed
 */

/**
 * One rung of the rarity ladder.
 * @typedef {object} Rarity
 * @property {string} id
 * @property {{ en: string, fr: string } | string} name
 * @property {number} rank
 */

export {};
