/* The save envelope and the key-by-key merge. */
import { check, done, fakeStorage } from './lib.mjs';
fakeStorage();
const { SAVE_KEYS, applySave, envelope, exportSave, importSave, loadStamps, mergeSaves, parseSave, touch } = await import('../../src/save.js');

const COL = 'wikster.collection.v3', WALLET = 'wikster.wallet.v1', THEME = 'wikster.theme';

// A version 1 envelope: every key is taken to have changed when it was written.
const v1 = parseSave(JSON.stringify({ format: 'wikster-save', version: 1, at: 1000, data: { [COL]: '{"a":1}', [WALLET]: '50' } }));
check('a version 1 save parses', Boolean(v1));
check('its keys are stamped with the envelope time', v1.stamps[COL] === 1000 && v1.stamps[WALLET] === 1000);
check('the version is read as 1', v1.version === 1);

// A version 2 envelope keeps its stamps.
const v2 = parseSave(JSON.stringify(envelope({ [COL]: '{"a":2}', [THEME]: 'noir' }, { [COL]: 5000, [THEME]: 3000 })));
check('a version 2 save keeps its stamps', v2.stamps[COL] === 5000 && v2.stamps[THEME] === 3000);
check('the envelope says version 2', v2.version === 2);

// The merge: newest per key, ties to the remote, keys one side lacks are kept.
const m = mergeSaves(v1, v2);
check('the newer collection wins', m.data[COL] === '{"a":2}', m.data[COL]);
check('a key only the local side has is kept', m.data[WALLET] === '50');
check('a key only the remote side has is kept', m.data[THEME] === 'noir');
check('the remote-newer key is reported', m.fromRemote.includes(COL) && m.fromRemote.includes(THEME));
check('the local-only key is reported as local', m.fromLocal.includes(WALLET) && !m.fromLocal.includes(COL));
const tie = mergeSaves(
  { data: { [WALLET]: '1' }, stamps: { [WALLET]: 7 } },
  { data: { [WALLET]: '2' }, stamps: { [WALLET]: 7 } });
check('a tie goes to the account', tie.data[WALLET] === '2');
const same = mergeSaves({ data: { [WALLET]: '9' }, stamps: { [WALLET]: 1 } }, { data: { [WALLET]: '9' }, stamps: { [WALLET]: 9 } });
check('an equal value is not reported as a change', !same.fromLocal.length && !same.fromRemote.length);

// Touching a key stamps it; the export carries the stamps.
localStorage.setItem(WALLET, '123');
touch(WALLET);
const out = parseSave(exportSave());
check('a touched key is stamped now', Date.now() - out.stamps[WALLET] < 5000);
check('an untouched key is stamped 0', out.stamps[COL] === undefined);
check('SAVE_KEYS is the list of keys exported', SAVE_KEYS.includes(WALLET));

// Applying merged keys writes the values and their stamps.
applySave(m.data, m.stamps, m.fromRemote);
check('applySave writes the keys', localStorage.getItem(COL) === '{"a":2}' && localStorage.getItem(THEME) === 'noir');
check('and their stamps', loadStamps()[COL] === 5000);

// Importing a backup now stamps everything now.
importSave(JSON.stringify(envelope({ [WALLET]: '77' }, { [WALLET]: 1 })), { stampNow: true });
check('a restored save is stamped now', Date.now() - loadStamps()[WALLET] < 5000);
check('and clears keys it does not carry', localStorage.getItem(COL) === null);
done();
