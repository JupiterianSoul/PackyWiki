// @ts-check
/**
 * ADULT CONTENT, AND THE SETTING THAT HIDES IT
 * ============================================================================
 * Cards are drawn from the whole encyclopaedia, and the whole encyclopaedia
 * includes articles nobody wants opening on a bus. There is no classifier to
 * ask, so this is what it says on the tin: a word list read against the
 * card's own title, description and opening, with the terms chosen to be
 * unambiguous. Anatomy and medicine are deliberately NOT on it; an article
 * about a disease or a body part is an encyclopaedia article, and blurring
 * it would teach the player to turn the setting off.
 *
 * The setting only ever hides a picture. Nothing is removed, no card is
 * refused, and the collection is exactly the same with it on or off: a
 * blurred card is tapped through in the detail view when the player asks
 * for it.
 */

/* Whole words, matched case-insensitively against the card's text. Anything
   here has to be a term that cannot mean something innocent in a title. */
const TERMS = [
  'pornograph', 'pornstar', 'porn film', 'porn actor', 'porn actress',
  'hardcore porn', 'softcore', 'erotica', 'erotic film', 'erotic art',
  'sexual intercourse', 'sexual position', 'sex position', 'oral sex',
  'anal sex', 'group sex', 'sexual act', 'sex act', 'sex toy', 'sex doll',
  'sex worker', 'sex industry', 'sex shop', 'prostitut', 'brothel',
  'strip club', 'stripper', 'nudity', 'nude photograph', 'nude model',
  'topless', 'full frontal', 'fetish', 'bdsm', 'bondage', 'sadomasochis',
  'masturbat', 'orgasm', 'ejaculat', 'genital', 'nsfw', 'adult film',
  'adult video', 'adult magazine', 'adult entertainment', 'playboy playmate',
  'penthouse pet', 'hentai', 'lingerie model', 'glamour model',
  'burlesque dancer', 'obscen', 'lewd', 'aphrodisiac'
];

const PATTERN = new RegExp(TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

/**
 * Whether a card is one the blur setting is for. Only the words the card
 * carries are read: its title, what the encyclopaedia calls it, and the
 * opening of its article.
 */
export function isSensitive(card) {
  if (!card) return false;
  const text = [card.title, card.description, card.sourceName, card.extract]
    .filter(Boolean).join(' · ');
  return PATTERN.test(text);
}
