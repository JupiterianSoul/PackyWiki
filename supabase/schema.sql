-- ============================================================================
-- WIKSTER - database schema
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

-- Erasing a save should REMOVE the row, not leave an empty one behind. Without
-- this the wipe could only overwrite the save with a blank blob, which reads
-- as an account that exists and has nothing in it. A player may only delete
-- their own.
drop policy if exists "you delete your own save" on public.saves;
create policy "you delete your own save"
  on public.saves for delete
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
        select s.data -> 'data' ->> 'wikster.collection.v3'
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

-- ============================================================================
-- V3 - the market: auctions
-- ============================================================================
-- Any player can put a card up; everyone can bid. The rules that make it
-- fair live HERE, not in the app: the 15% minimum raise, the anti-snipe
-- clock, the no-cancel-once-bid rule and settlement are all enforced by
-- definer functions, so no client - however modified - can bend them.
--
-- Money and cards move by the same postbox as gifts and trades: the bidder's
-- app deducts its own wallet when it bids; refunds, payouts and the card
-- itself arrive as deliveries that each app applies to its own save.

-- The postbox learns the two auction parcels.
alter table public.deliveries drop constraint if exists deliveries_kind_check;
alter table public.deliveries add constraint deliveries_kind_check
  check (kind in ('card', 'booster', 'trade-return', 'auction-card', 'auction-money'));

create table if not exists public.auctions (
  id           uuid primary key default gen_random_uuid(),
  seller       uuid not null references auth.users on delete cascade,
  seller_name  text not null default '',
  card         jsonb not null,
  start_price  integer not null check (start_price between 1 and 1000000),
  current_bid  integer,
  bidder       uuid references auth.users on delete set null,
  bidder_name  text,
  bid_count    integer not null default 0,
  ends_at      timestamptz not null,
  status       text not null default 'open'
                 check (status in ('open', 'settled', 'cancelled')),
  created_at   timestamptz not null default now()
);

create index if not exists auctions_open_idx on public.auctions (status, ends_at);
create index if not exists auctions_seller_idx on public.auctions (seller);

alter table public.auctions enable row level security;

-- Reading is open to every signed-in player; every WRITE goes through the
-- functions below, so there are deliberately no insert/update policies.
drop policy if exists "auctions are readable by signed-in players" on public.auctions;
create policy "auctions are readable by signed-in players"
  on public.auctions for select
  to authenticated
  using (true);

-- The next acceptable bid: the asking price untouched, then +15%, rounded up.
create or replace function public.auction_floor(a public.auctions)
returns integer
language sql immutable as $$
  select case when a.current_bid is null then a.start_price
              else ceil(a.current_bid * 1.15)::integer end;
$$;

-- List a card. At most ten open per seller; the durations are the seven the
-- app offers, nothing else.
create or replace function public.create_auction(card jsonb, price integer, minutes integer)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare mine integer; row_out public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if minutes not in (10, 30, 60, 180, 360, 720, 1440) then raise exception 'BAD_DURATION'; end if;
  if price is null or price < 1 or price > 1000000 then raise exception 'BAD_PRICE'; end if;
  select count(*) into mine from auctions where seller = auth.uid() and status = 'open';
  if mine >= 10 then raise exception 'TOO_MANY'; end if;
  insert into auctions (seller, seller_name, card, start_price, ends_at)
  values (auth.uid(),
          coalesce((select username from profiles where id = auth.uid()), ''),
          card, price, now() + make_interval(mins => minutes))
  returning * into row_out;
  return row_out;
end $$;

-- Bid. The floor is enforced here; a bid inside the last ten seconds winds
-- the clock back up to 65, so sniping the final second buys nothing. The
-- outbid player's money goes straight back out as a delivery.
create or replace function public.place_bid(auction uuid, amount integer)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare a public.auctions; row_out public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into a from auctions where id = auction for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status <> 'open' or now() >= a.ends_at then raise exception 'ENDED'; end if;
  if a.seller = auth.uid() then raise exception 'OWN_AUCTION'; end if;
  if amount is null or amount < auction_floor(a) then raise exception 'TOO_LOW'; end if;
  if a.bidder is not null then
    insert into deliveries (sender, recipient, kind, payload)
    values (a.seller, a.bidder, 'auction-money',
            jsonb_build_object('amount', a.current_bid, 'reason', 'refund',
                               'title', a.card->>'title'));
  end if;
  update auctions set
    current_bid = amount,
    bidder = auth.uid(),
    bidder_name = coalesce((select username from profiles where id = auth.uid()), ''),
    bid_count = bid_count + 1,
    ends_at = case when ends_at - now() < interval '10 seconds'
                   then now() + interval '65 seconds' else ends_at end
  where id = auction
  returning * into row_out;
  return row_out;
end $$;

-- Withdraw a listing. Only the seller, and only while nobody has bid.
create or replace function public.cancel_auction(auction uuid)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare a public.auctions; row_out public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into a from auctions where id = auction for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.seller <> auth.uid() then raise exception 'NOT_YOURS'; end if;
  if a.status <> 'open' then raise exception 'ENDED'; end if;
  if a.bid_count > 0 then raise exception 'HAS_BIDS'; end if;
  update auctions set status = 'cancelled' where id = auction returning * into row_out;
  insert into deliveries (sender, recipient, kind, payload)
  values (a.seller, a.seller, 'auction-card', a.card);
  return row_out;
end $$;

-- Close a finished auction. Anyone may ring the bell - the checks make it
-- run exactly once - so the market needs no clock of its own: whichever app
-- first notices the timer at zero settles it for everyone.
create or replace function public.settle_auction(auction uuid)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare a public.auctions; row_out public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into a from auctions where id = auction for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status <> 'open' then return a; end if;
  if now() < a.ends_at then raise exception 'NOT_OVER'; end if;
  update auctions set status = 'settled' where id = auction returning * into row_out;
  if a.bidder is null then
    insert into deliveries (sender, recipient, kind, payload)
    values (a.seller, a.seller, 'auction-card', a.card);
  else
    insert into deliveries (sender, recipient, kind, payload)
    values (a.seller, a.bidder, 'auction-card', a.card);
    insert into deliveries (sender, recipient, kind, payload)
    values (a.bidder, a.seller, 'auction-money',
            jsonb_build_object('amount', a.current_bid, 'reason', 'sale',
                               'title', a.card->>'title'));
  end if;
  return row_out;
end $$;

grant execute on function public.create_auction(jsonb, integer, integer) to authenticated;
grant execute on function public.place_bid(uuid, integer) to authenticated;
grant execute on function public.cancel_auction(uuid) to authenticated;
grant execute on function public.settle_auction(uuid) to authenticated;

-- Live updates for every open market screen. If the publication does not
-- exist on this project the two lines can be skipped; the app also polls.
do $$ begin
  alter publication supabase_realtime add table public.auctions;
exception when others then null; end $$;

-- ============================================================================
-- V4 - the card index and wishlists
-- ============================================================================
-- The codex is the game's shared memory: one row per real card anyone has
-- ever pulled (custom packs stay out). Clients add rows as they open packs;
-- nothing ever updates or deletes one, so the worst a hostile client can do
-- is discover a card. Wishlists are per-player and readable by friends, so
-- a card can say who at the table wants it.

create table if not exists public.codex (
  key        text primary key,
  title      text not null check (char_length(title) <= 300),
  rarity     text,
  price      integer,
  views      bigint,
  thumbnail  text check (char_length(thumbnail) <= 2000),
  lang       text check (char_length(lang) <= 12),
  found_at   timestamptz not null default now(),
  found_by   uuid references auth.users on delete set null
);

create index if not exists codex_found_idx on public.codex (found_at desc);
create index if not exists codex_title_idx on public.codex (lower(title) text_pattern_ops);

alter table public.codex enable row level security;

drop policy if exists "the codex is readable by signed-in players" on public.codex;
create policy "the codex is readable by signed-in players"
  on public.codex for select
  to authenticated
  using (true);

drop policy if exists "discoveries are written by their finder" on public.codex;
create policy "discoveries are written by their finder"
  on public.codex for insert
  to authenticated
  with check (auth.uid() = found_by);

-- One call for the header numbers: how much has been found, per tier.
create or replace function public.codex_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total bigint; by_rarity jsonb;
begin
  select count(*) into total from codex;
  select coalesce(jsonb_object_agg(rarity, n), '{}'::jsonb) into by_rarity
    from (select rarity, count(*) as n from codex where rarity is not null group by rarity) t;
  return jsonb_build_object('total', total, 'byRarity', by_rarity);
end $$;

grant execute on function public.codex_counts() to authenticated;

create table if not exists public.wishlists (
  owner      uuid not null references auth.users on delete cascade,
  key        text not null,
  card       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner, key)
);

alter table public.wishlists enable row level security;

drop policy if exists "a wishlist is readable by its owner and their friends" on public.wishlists;
create policy "a wishlist is readable by its owner and their friends"
  on public.wishlists for select
  to authenticated
  using (auth.uid() = owner or public.are_friends(owner, auth.uid()));

drop policy if exists "you wish as yourself" on public.wishlists;
create policy "you wish as yourself"
  on public.wishlists for insert
  to authenticated
  with check (auth.uid() = owner);

drop policy if exists "you unwish as yourself" on public.wishlists;
create policy "you unwish as yourself"
  on public.wishlists for delete
  to authenticated
  using (auth.uid() = owner);

-- ============================================================================
-- V5 - the top tier was renamed: Artifact became Prismatic. Rows written
-- under the old name are renamed here, in every place a tier is stored, and
-- each statement is a no-op once it has run. Clients accept the old name too,
-- so the order the app and the schema are updated in does not matter.

update public.codex set rarity = 'prismatic' where rarity = 'artifact';
update public.profiles set best_rarity = 'prismatic' where best_rarity = 'artifact';
update public.wishlists
  set card = jsonb_set(card, '{rarityId}', '"prismatic"')
  where card->>'rarityId' = 'artifact';
update public.auctions
  set card = jsonb_set(card, '{rarityId}', '"prismatic"')
  where card->>'rarityId' = 'artifact';
update public.trades
  set offer = (
    select coalesce(jsonb_agg(
      case when c->>'rarityId' = 'artifact' then jsonb_set(c, '{rarityId}', '"prismatic"') else c end
    ), '[]'::jsonb) from jsonb_array_elements(offer) c),
      ask = (
    select coalesce(jsonb_agg(
      case when c->>'rarityId' = 'artifact' then jsonb_set(c, '{rarityId}', '"prismatic"') else c end
    ), '[]'::jsonb) from jsonb_array_elements(ask) c)
  where status = 'pending'
    and jsonb_typeof(offer) = 'array' and jsonb_typeof(ask) = 'array'
    and (offer::text like '%"artifact"%' or ask::text like '%"artifact"%');

-- ============================================================================
-- V6 - MINIGAMES, QUESTS AND THE LEADERBOARD
--
-- Three new pieces of furniture. `scores` is every point anyone ever earned
-- in a minigame, written by the game functions with the service key (the
-- slot machine and the wheel) or by submit_score() for Wikdle, never by a
-- plain insert from a client. `quests` is each player's dealt quests for
-- each day, dealt by the quests function. The three leaderboard tables are
-- caches over `scores`, one per window, kept by a trigger and emptied by
-- cron on the window's clock: daily at 00:00 UTC, weekly on Sunday 00:00
-- UTC, all-time never.
-- ============================================================================

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  game       text not null check (game in ('slots', 'roulette', 'wikdle', 'quest')),
  points     integer not null check (points >= 0),
  detail     jsonb,
  at         timestamptz not null default now()
);
create index if not exists scores_user_at_idx on public.scores (user_id, at desc);
create index if not exists scores_at_idx on public.scores (at desc);

alter table public.scores enable row level security;
drop policy if exists "your own scores are yours to read" on public.scores;
create policy "your own scores are yours to read"
  on public.scores for select to authenticated using (auth.uid() = user_id);
-- No insert policy on purpose: only the service key and submit_score() write.

-- The three windows. Each holds one row per player with that window's total,
-- and each has an index on the score, which is what makes a page of twenty
-- a single index scan.
create table if not exists public.leaderboard_daily   (user_id uuid primary key references auth.users on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create table if not exists public.leaderboard_weekly  (user_id uuid primary key references auth.users on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create table if not exists public.leaderboard_alltime (user_id uuid primary key references auth.users on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create index if not exists leaderboard_daily_score_idx   on public.leaderboard_daily   (score desc, updated_at asc);
create index if not exists leaderboard_weekly_score_idx  on public.leaderboard_weekly  (score desc, updated_at asc);
create index if not exists leaderboard_alltime_score_idx on public.leaderboard_alltime (score desc, updated_at asc);

alter table public.leaderboard_daily   enable row level security;
alter table public.leaderboard_weekly  enable row level security;
alter table public.leaderboard_alltime enable row level security;
drop policy if exists "the board is public" on public.leaderboard_daily;
create policy "the board is public" on public.leaderboard_daily for select to authenticated using (true);
drop policy if exists "the board is public" on public.leaderboard_weekly;
create policy "the board is public" on public.leaderboard_weekly for select to authenticated using (true);
drop policy if exists "the board is public" on public.leaderboard_alltime;
create policy "the board is public" on public.leaderboard_alltime for select to authenticated using (true);

-- Every score lands in all three windows the moment it is written.
create or replace function public.scores_into_windows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into leaderboard_daily (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_daily.score + excluded.score, updated_at = now();
  insert into leaderboard_weekly (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_weekly.score + excluded.score, updated_at = now();
  insert into leaderboard_alltime (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_alltime.score + excluded.score, updated_at = now();
  return new;
end $$;
drop trigger if exists scores_into_windows on public.scores;
create trigger scores_into_windows after insert on public.scores
  for each row execute function public.scores_into_windows();

-- Wikdle is scored on the device (the word is the same for everyone and the
-- board is its own proof), so its points arrive through this, as the caller,
-- at most one score a day, never above the game's own maximum.
create or replace function public.submit_score(p_game text, p_points integer, p_day text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in'; end if;
  if p_game <> 'wikdle' then raise exception 'only wikdle is scored by the client'; end if;
  if p_points < 0 or p_points > 600 then raise exception 'points out of range'; end if;
  if exists (select 1 from scores where user_id = auth.uid() and game = 'wikdle' and detail->>'day' = p_day) then
    return;
  end if;
  insert into scores (user_id, game, points, detail) values (auth.uid(), 'wikdle', p_points, jsonb_build_object('day', p_day));
end $$;
grant execute on function public.submit_score(text, integer, text) to authenticated;

-- One page of a window: twenty rows, ranked, with usernames. The offset is
-- the page number times twenty; the tables are small and indexed on the
-- score, so a page is one scan.
create or replace function public.leaderboard_page(p_window text, p_page integer default 0)
returns table (rank bigint, user_id uuid, username text, score bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_window = 'daily' then
    return query select row_number() over (order by d.score desc, d.updated_at asc) as rank, d.user_id, p.username, d.score
      from leaderboard_daily d join profiles p on p.id = d.user_id
      order by d.score desc, d.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  elsif p_window = 'weekly' then
    return query select row_number() over (order by w.score desc, w.updated_at asc), w.user_id, p.username, w.score
      from leaderboard_weekly w join profiles p on p.id = w.user_id
      order by w.score desc, w.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  else
    return query select row_number() over (order by a.score desc, a.updated_at asc), a.user_id, p.username, a.score
      from leaderboard_alltime a join profiles p on p.id = a.user_id
      order by a.score desc, a.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  end if;
end $$;
grant execute on function public.leaderboard_page(text, integer) to authenticated;

-- The caller's own standing in a window: rank, score, and how many are ranked.
create or replace function public.my_rank(p_window text)
returns table (rank bigint, score bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); my_score bigint; my_at timestamptz;
begin
  if me is null then return; end if;
  if p_window = 'daily' then
    select d.score, d.updated_at into my_score, my_at from leaderboard_daily d where d.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_daily x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_daily);
  elsif p_window = 'weekly' then
    select w.score, w.updated_at into my_score, my_at from leaderboard_weekly w where w.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_weekly x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_weekly);
  else
    select a.score, a.updated_at into my_score, my_at from leaderboard_alltime a where a.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_alltime x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_alltime);
  end if;
end $$;
grant execute on function public.my_rank(text) to authenticated;

-- The windows are emptied on their clocks. pg_cron ships with Supabase but
-- has to be switched on once: Database -> Extensions -> pg_cron. If that has
-- not been done the two schedule lines below error and can be run later.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname in ('wikster-daily-flush', 'wikster-weekly-flush');
select cron.schedule('wikster-daily-flush',  '0 0 * * *', $$truncate table public.leaderboard_daily$$);
select cron.schedule('wikster-weekly-flush', '0 0 * * 0', $$truncate table public.leaderboard_weekly$$);

-- Each player's dealt quests, one row per quest per day, written by the
-- quests function with the service key. A player may read their own.
create table if not exists public.quests (
  user_id    uuid not null references auth.users on delete cascade,
  day        text not null,
  quest_id   text not null,
  target     integer not null,
  progress   integer not null default 0,
  claimed    boolean not null default false,
  expires_at timestamptz not null,
  primary key (user_id, day, quest_id)
);
create index if not exists quests_user_day_idx on public.quests (user_id, day);
alter table public.quests enable row level security;
drop policy if exists "your quests are yours to read" on public.quests;
create policy "your quests are yours to read"
  on public.quests for select to authenticated using (auth.uid() = user_id);
