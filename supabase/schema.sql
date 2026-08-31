-- ============================================================================
-- WIKLODO - database schema
-- ============================================================================
-- Run this once, whole, in your Supabase project's SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- Three tables:
--   profiles      one public row per player: username and the stats a friend
--                 is allowed to see. Readable by any signed-in player, because
--                 that is what username search needs.
--   saves         the private save blob. Readable ONLY by its owner. A friend
--                 sees the cards through friend_cards() below, which hands back
--                 that one key and nothing else in the blob.
--   friendships   one row per request, from requester to addressee.
--
-- Every table has row-level security on. The anon key shipped in the app is
-- public by design; these policies, not the key, are what keep one player out
-- of another's data. Nothing below trusts the client.
-- ============================================================================

-- --- profiles ---------------------------------------------------------------
--
-- Usernames are plain text with a unique index on lower(username), rather than
-- the citext extension. Same effect - one person may hold "Ada" and nobody
-- else may hold "ada" - with nothing to install, so this script cannot fail on
-- an extension the project will not grant.

create table if not exists public.profiles (
  id                uuid primary key references auth.users on delete cascade,
  username          text not null
                      check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- The stats a friend sees. Denormalised on purpose: a friend list should be
  -- one cheap read, not one save download per friend.
  level             integer not null default 1,
  rank              text,
  cards             integer not null default 0,
  unique_cards      integer not null default 0,
  boosters_opened   integer not null default 0,
  collection_value  bigint  not null default 0,
  best_rarity       text,
  play_ms           bigint  not null default 0
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

-- Any signed-in player can read any profile. This is what makes "add a friend
-- by username" possible at all, and it is limited to the columns above.
drop policy if exists "profiles are readable by signed-in players" on public.profiles;
create policy "profiles are readable by signed-in players"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "a player writes only their own profile" on public.profiles;
create policy "a player writes only their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "a player updates only their own profile" on public.profiles;
create policy "a player updates only their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --- friendships -------------------------------------------------------------

create table if not exists public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references auth.users on delete cascade,
  addressee   uuid not null references auth.users on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  -- One request per direction, and never to yourself.
  unique (requester, addressee),
  check (requester <> addressee)
);

create index if not exists friendships_requester_idx on public.friendships (requester);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;

drop policy if exists "you see friendships you are part of" on public.friendships;
create policy "you see friendships you are part of"
  on public.friendships for select
  to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);

-- You may only ever send a request AS yourself, and only as pending. Accepting
-- is a separate, addressee-only action below.
drop policy if exists "you send requests as yourself" on public.friendships;
create policy "you send requests as yourself"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requester and status = 'pending');

-- Only the person who received a request may accept it.
drop policy if exists "only the addressee accepts" on public.friendships;
create policy "only the addressee accepts"
  on public.friendships for update
  to authenticated
  using (auth.uid() = addressee)
  with check (auth.uid() = addressee and status = 'accepted');

-- Either side may withdraw or remove.
drop policy if exists "either side removes a friendship" on public.friendships;
create policy "either side removes a friendship"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = requester or auth.uid() = addressee);

-- --- saves --------------------------------------------------------------------

create table if not exists public.saves (
  user_id     uuid primary key references auth.users on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.saves enable row level security;

/*
 * Whether two players are accepted friends.
 *
 * security definer so the check runs regardless of the caller's view of the
 * friendships table, and search_path is pinned so the function cannot be
 * hijacked by a schema the caller controls. It reads nothing it does not need.
 */
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b)
        or (f.requester = b and f.addressee = a))
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Nobody reads anyone else's save row. Friends go through friend_cards().
drop policy if exists "you read your own save, and your friends'" on public.saves;
drop policy if exists "you read only your own save" on public.saves;
create policy "you read only your own save"
  on public.saves for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "you write only your own save" on public.saves;
create policy "you write only your own save"
  on public.saves for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "you update only your own save" on public.saves;
create policy "you update only your own save"
  on public.saves for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

/*
 * A friend's cards, and nothing else.
 *
 * The save blob holds the wallet, the settings, the daily-gift record and the
 * language as well as the collection. A friend has no business with any of
 * that, so rather than opening the row up, this hands back the single key the
 * friends screen actually renders. security definer because the caller cannot
 * read the row at all; the friendship check inside is what authorises it.
 */
create or replace function public.friend_cards(target uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- allowed is answered separately from cards, so "we are not friends" and
  -- "they have not pulled anything yet" are not both a bare null.
  select case
    when auth.uid() = target or public.are_friends(auth.uid(), target) then
      jsonb_build_object('allowed', true, 'cards', (
        select s.data -> 'data' ->> 'packywiki.collection.v3'
        from public.saves s where s.user_id = target
      ))
    else jsonb_build_object('allowed', false)
  end;
$$;

revoke all on function public.friend_cards(uuid) from public;
grant execute on function public.friend_cards(uuid) to authenticated;

-- --- username availability -------------------------------------------------------

/*
 * Is a username free?
 *
 * A plain select against profiles would work, but this keeps sign-up from
 * needing to read the table at all and returns a straight yes or no.
 */
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.profiles p where lower(p.username) = lower(name)
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- --- keep updated_at honest --------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before update on public.saves
  for each row execute function public.touch_updated_at();

-- --- tell PostgREST about all of the above ------------------------------------------
--
-- The API keeps a cached picture of the schema and does not always notice DDL
-- straight away. Without this, everything above can be present and correct and
-- the app still gets "Could not find the table 'public.profiles' in the schema
-- cache" until the cache happens to refresh.

notify pgrst, 'reload schema';

-- ============================================================================
-- V2 - social: visibility, presence, avatars, chat, trades, gifts
-- ============================================================================
-- Everything below is idempotent; re-run the whole file freely.

-- --- profile additions -------------------------------------------------------

alter table public.profiles
  add column if not exists visibility text not null default 'public'
    check (visibility in ('private', 'friends', 'public')),
  add column if not exists presence text not null default 'online'
    check (presence in ('online', 'hidden')),
  add column if not exists last_seen_at timestamptz not null default now(),
  -- The chosen card artwork and its crop, e.g. {"url": ..., "x": 50, "y": 30}.
  add column if not exists avatar jsonb;

-- Visibility now decides who can read a profile:
--   public   anyone signed in (search finds you)
--   friends  your accepted friends, plus anyone you have a pending row with
--            (they must see the request to answer it)
--   private  only you
drop policy if exists "profiles are readable by signed-in players" on public.profiles;
create policy "profiles are readable by signed-in players"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = id
    or visibility = 'public'
    or (visibility = 'friends' and exists (
      select 1 from public.friendships f
      where (f.requester = auth.uid() and f.addressee = id)
         or (f.requester = id and f.addressee = auth.uid())
    ))
  );

-- --- messages (friend chat) --------------------------------------------------

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references auth.users on delete cascade,
  recipient   uuid not null references auth.users on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (sender <> recipient)
);

create index if not exists messages_pair_idx
  on public.messages (least(sender, recipient), greatest(sender, recipient), created_at);
create index if not exists messages_recipient_unread_idx
  on public.messages (recipient) where read_at is null;

alter table public.messages enable row level security;

drop policy if exists "you read conversations you are in" on public.messages;
create policy "you read conversations you are in"
  on public.messages for select
  to authenticated
  using (auth.uid() = sender or auth.uid() = recipient);

-- You write as yourself, to a friend.
drop policy if exists "you message friends as yourself" on public.messages;
create policy "you message friends as yourself"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = sender and public.are_friends(sender, recipient));

-- Only the recipient marks a message read, and that is all they may change.
drop policy if exists "the recipient marks messages read" on public.messages;
create policy "the recipient marks messages read"
  on public.messages for update
  to authenticated
  using (auth.uid() = recipient)
  with check (auth.uid() = recipient);

-- --- deliveries --------------------------------------------------------------
--
-- The one-way postbox that makes gifts and trades safe with client-owned
-- saves: whoever GIVES removes the goods from their own save and posts a
-- delivery; the recipient's app claims it and adds the goods to its own save.
-- No client ever writes another player's save.

create table if not exists public.deliveries (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references auth.users on delete cascade,
  recipient   uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('card', 'booster', 'trade-return')),
  -- card:   the full card entry snapshot
  -- booster:{spec: {...}}
  payload     jsonb not null,
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);

create index if not exists deliveries_recipient_idx
  on public.deliveries (recipient) where claimed_at is null;

alter table public.deliveries enable row level security;

drop policy if exists "you see deliveries you sent or received" on public.deliveries;
create policy "you see deliveries you sent or received"
  on public.deliveries for select
  to authenticated
  using (auth.uid() = sender or auth.uid() = recipient);

drop policy if exists "you send deliveries as yourself to friends" on public.deliveries;
create policy "you send deliveries as yourself to friends"
  on public.deliveries for insert
  to authenticated
  with check (auth.uid() = sender
    and (public.are_friends(sender, recipient) or sender = recipient));

drop policy if exists "the recipient claims a delivery" on public.deliveries;
create policy "the recipient claims a delivery"
  on public.deliveries for update
  to authenticated
  using (auth.uid() = recipient)
  with check (auth.uid() = recipient);

-- --- trades ------------------------------------------------------------------
--
-- WikiMaster-style: I offer cards, I ask for cards, you accept or decline.
-- The offered cards leave the proposer's save the moment the trade is posted
-- (escrow, held in `offer`). On accept, the recipient removes the asked cards
-- from their own save, takes the offered ones, and posts the asked cards back
-- as a delivery to the proposer. On decline/cancel the proposer's app
-- restores the escrowed cards from `offer`.

create table if not exists public.trades (
  id           uuid primary key default gen_random_uuid(),
  proposer     uuid not null references auth.users on delete cascade,
  recipient    uuid not null references auth.users on delete cascade,
  offer        jsonb not null,     -- [card entry snapshots]
  ask          jsonb not null,     -- [{key, title, rarityId}]
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'cancelled', 'closed')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  check (proposer <> recipient)
);

create index if not exists trades_proposer_idx on public.trades (proposer);
create index if not exists trades_recipient_idx on public.trades (recipient);

alter table public.trades enable row level security;

drop policy if exists "you see trades you are part of" on public.trades;
create policy "you see trades you are part of"
  on public.trades for select
  to authenticated
  using (auth.uid() = proposer or auth.uid() = recipient);

drop policy if exists "you propose trades as yourself to friends" on public.trades;
create policy "you propose trades as yourself to friends"
  on public.trades for insert
  to authenticated
  with check (auth.uid() = proposer
    and status = 'pending'
    and public.are_friends(proposer, recipient));

-- The recipient answers a pending trade; the proposer cancels a pending one
-- or closes an answered one after restoring/collecting.
drop policy if exists "trade parties update their side" on public.trades;
create policy "trade parties update their side"
  on public.trades for update
  to authenticated
  using (auth.uid() = proposer or auth.uid() = recipient)
  with check (auth.uid() = proposer or auth.uid() = recipient);

-- Presence: whether a player counts as online right now. Their own presence
-- switch decides whether anyone may know.
create or replace function public.is_online(p public.profiles)
returns boolean
language sql
stable
as $$
  select p.presence = 'online' and p.last_seen_at > now() - interval '2 minutes';
$$;

notify pgrst, 'reload schema';
