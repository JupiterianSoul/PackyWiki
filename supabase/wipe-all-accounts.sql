-- =============================================================================
-- WIPE EVERY ACCOUNT
-- =============================================================================
--
-- Run this ONCE, by hand, in the Supabase SQL editor. It is not part of
-- schema.sql and nothing in the app can call it: deleting other people's rows
-- needs privileges the app is deliberately never given.
--
-- What it does: removes every player, every save, every card anyone has ever
-- pulled into the shared index, and every account in the auth table. Email
-- addresses become free to sign up with again, and the next person to open the
-- app is the first player.
--
-- THERE IS NO UNDO. There is no backup unless you took one.
--
-- Why by hand: the anon key the app ships with cannot do this, and the service
-- key that can must never be in the repository or in an APK. The SQL editor
-- already runs as the owner, which is exactly the privilege this needs and the
-- only place it should exist.
--
-- Afterwards, every secret code works again for everyone, because a code is
-- spent per save and there are no saves left.
-- =============================================================================

begin;

-- The game's own tables. Ordered child-first so nothing trips a foreign key on
-- a database where the cascades were not applied.
delete from public.auctions;
delete from public.trades;
delete from public.deliveries;
delete from public.messages;
delete from public.friendships;
delete from public.wishlists;
delete from public.saves;

-- The shared card index. This is the record of every card anyone has pulled;
-- keeping it would leave the new first player looking at a full index on an
-- empty game, so it goes too.
delete from public.codex;

-- Profiles: usernames, avatars, levels, presence. Every row.
delete from public.profiles;

-- The accounts themselves. Everything above references auth.users with
-- `on delete cascade`, so this would take most of it anyway; it runs last so
-- that a cascade failure cannot leave the game's tables half-emptied.
delete from auth.users;

commit;

-- Check: all of these should be 0.
select
  (select count(*) from auth.users)       as accounts,
  (select count(*) from public.profiles)  as profiles,
  (select count(*) from public.saves)     as saves,
  (select count(*) from public.codex)     as codex_cards;
