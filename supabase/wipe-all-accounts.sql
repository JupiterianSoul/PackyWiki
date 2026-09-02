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

-- Run this ONE STATEMENT AT A TIME if anything errors.
--
-- It is deliberately NOT wrapped in begin/commit. A transaction rolls the
-- whole thing back the moment one statement fails, which is how a wipe can
-- report an error and leave every account exactly where it was. Each line
-- stands alone here, so a table this project does not have simply errors on
-- its own line and the rest still run.

-- The game's tables, child rows first.
delete from public.auctions;
delete from public.trades;
delete from public.deliveries;
delete from public.messages;
delete from public.friendships;
delete from public.wishlists;
delete from public.saves;

-- The shared card index: every card anyone has ever pulled.
delete from public.codex;

-- Usernames, avatars, levels, presence.
delete from public.profiles;

-- The accounts themselves. This is the one that frees the email addresses.
-- If it errors, see the note at the bottom.
delete from auth.users;

-- Check: every one of these should be 0.
select
  (select count(*) from auth.users)       as accounts,
  (select count(*) from public.profiles)  as profiles,
  (select count(*) from public.saves)     as saves,
  (select count(*) from public.codex)     as codex_cards;

-- =============================================================================
-- IF `delete from auth.users` REFUSES
-- =============================================================================
-- Some projects do not let the SQL editor's role touch the auth schema. In that
-- case delete the accounts from the dashboard instead, which always works:
--
--   Authentication  ->  Users  ->  tick each row  ->  Delete user
--
-- There are only a handful, and everything above has already cleared what they
-- owned. Deleting the user there also frees the address to sign up again.
-- =============================================================================
