/**
 * THE DAILY QUESTS
 * ----------------------------------------------------------------------------
 * Three quests a day, dealt here so a phone's clock or a patched client
 * cannot deal itself an easy day. The deal is a function of the UTC date and
 * the player's id, so asking twice on the same day answers the same three,
 * and a day begins at 00:00 UTC for everyone at once: a row belongs to a day
 * and carries the moment that day ends.
 *
 *   today     deal (or return) today's three, with progress and claim flags
 *   progress  record progress the client reports, capped at each target
 *   claim     mark a quest claimed, once, and only when its target is met
 *
 * The book of quests is the client's (src/data/quests.js); this only needs
 * their ids, tiers and targets, kept in step by tools/sync-game-tables.mjs.
 *
 *   supabase functions deploy quests
 */
import { CORS, json, callerId, admin, utcDay } from '../_shared/caller.ts';
import { QUESTS, TIER_WEIGHTS, QUESTS_PER_DAY } from '../_shared/quests.ts';

/** A small deterministic generator seeded from the day and the player. */
function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's three for this player: a tier by weight, then a quest of that tier, no repeats. */
export function dealFor(userId: string, day: string) {
  const rng = seeded(`quests:${day}:${userId}`);
  const tiers = Object.entries(TIER_WEIGHTS);
  const total = tiers.reduce((s, [, w]) => s + w, 0);
  const picked: typeof QUESTS = [];
  for (let n = 0; n < QUESTS_PER_DAY && picked.length < QUESTS.length; n++) {
    let ticket = rng() * total;
    let tier = tiers[0][0];
    for (const [id, w] of tiers) { ticket -= w; if (ticket <= 0) { tier = id; break; } }
    const pool = QUESTS.filter((q) => q.tier === tier && !picked.includes(q));
    const fallback = QUESTS.filter((q) => !picked.includes(q));
    const from = pool.length ? pool : fallback;
    picked.push(from[Math.floor(rng() * from.length)]);
  }
  return picked;
}

const endOfDay = (day: string) => new Date(`${day}T00:00:00Z`).getTime() + 86400000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const who = await callerId(req);
  if (!who) return json({ error: 'SIGN_IN' }, 401);

  let body: { action?: string; updates?: Record<string, number>; questId?: string } = {};
  try { body = await req.json(); } catch { return json({ error: 'BAD_JSON' }, 400); }
  const day = utcDay();
  const expiresAt = new Date(endOfDay(day)).toISOString();

  // Today's rows, dealt if missing. Idempotent: the deal is deterministic and
  // the primary key is (user, day, quest), so two callers cannot deal twice.
  const dealt = dealFor(who, day);
  const rows = dealt.map((q) => ({ user_id: who, day, quest_id: q.id, target: q.target, progress: 0, claimed: false, expires_at: expiresAt }));
  const seeding = await admin('quests?on_conflict=user_id,day,quest_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows)
  });
  if (!seeding.ok) return json({ error: 'DEAL_FAILED', detail: await seeding.text() }, 500);

  if (body.action === 'progress' && body.updates && typeof body.updates === 'object') {
    // Progress only ever grows, and never past the target.
    for (const [questId, value] of Object.entries(body.updates)) {
      const quest = dealt.find((q) => q.id === questId);
      const n = Math.max(0, Math.min(quest?.target ?? 0, Math.floor(Number(value) || 0)));
      if (!quest || n <= 0) continue;
      await admin(`quests?user_id=eq.${who}&day=eq.${day}&quest_id=eq.${questId}&progress=lt.${n}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ progress: n })
      });
    }
  }

  if (body.action === 'claim' && typeof body.questId === 'string') {
    // Claimed once, and only with the target met: the update is conditional
    // on the row's own state, so a second claim finds nothing to change.
    const res = await admin(`quests?user_id=eq.${who}&day=eq.${day}&quest_id=eq.${body.questId}&claimed=is.false`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ claimed: true })
    });
    const changed = res.ok ? await res.json() : [];
    const row = changed[0];
    if (!row) return json({ error: 'NOT_CLAIMABLE' }, 409);
    if (row.progress < row.target) {
      // Put it back: the target was not met after all.
      await admin(`quests?user_id=eq.${who}&day=eq.${day}&quest_id=eq.${body.questId}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ claimed: false })
      });
      return json({ error: 'NOT_DONE' }, 409);
    }
  }

  const listing = await admin(`quests?user_id=eq.${who}&day=eq.${day}&select=quest_id,target,progress,claimed,expires_at&order=quest_id`);
  const quests = listing.ok ? await listing.json() : [];
  return json({ day, expiresAt, quests });
});
