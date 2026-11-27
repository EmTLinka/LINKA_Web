-- ============================================================================
-- Sado board — a public noticeboard of impressions, not a conversation.
--
-- One flat note per row. There is no parent, no reply, and no thread: a note
-- is a remark about a place, and the only response it takes is a heart.
-- Hearts are one per account; heart_count is kept by a trigger and is never
-- a column a client can write. The author's display name is copied onto the
-- note by a trigger, so the board can be read without opening profiles
-- (those stay private: age, nationality, gender).
--
-- A note names a published place on Sado — the island itself, or one of its
-- destinations. Photos are the author's, re-encoded by the app before upload,
-- and shown to anyone who can read the board.
-- ============================================================================

create table public.place_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  -- Maintained by place_comment_hearts. Clients are not granted this column.
  heart_count integer not null default 0 check (heart_count >= 0),
  -- Copied from profiles.display_name. Empty when the author has no name;
  -- the app says "traveller" in the reader's language. Not client-writable.
  author_name text not null default '' check (char_length(author_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index place_comments_recent_idx on public.place_comments (created_at desc);
create index place_comments_place_idx on public.place_comments (place_id, created_at desc);
create index place_comments_user_idx on public.place_comments (user_id, created_at desc);

-- One heart per account. The row is the vote; the number on the note is a cache.
create table public.place_comment_hearts (
  comment_id uuid not null references public.place_comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index place_comment_hearts_user_idx on public.place_comment_hearts (user_id);

-- At most four photographs, kept as `c/<comment id>/<file>.jpg` in board-photos.
create table public.place_comment_photos (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.place_comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  position smallint not null default 0 check (position between 0 and 3),
  created_at timestamptz not null default now(),
  constraint place_comment_photos_path check (
    storage_path ~ '^c/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.jpg$'
    and storage_path like 'c/' || comment_id::text || '/%'
  )
);

create index place_comment_photos_comment_idx on public.place_comment_photos (comment_id, position);
create index place_comment_photos_user_idx on public.place_comment_photos (user_id);

-- ─── who may write, and what they may change ───────────────────────────────

create or replace function public.place_comment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'not_authenticated' using errcode = '42501';
    end if;
    new.user_id := auth.uid();
    new.heart_count := 0;
    new.author_name := coalesce(left(nullif(btrim((
      select p.display_name from public.profiles p where p.id = auth.uid()
    )), ''), 80), '');
    return new;
  end if;

  -- The heart trigger touches only the count. Anyone's heart may do that;
  -- it must not be able to ride along and change the words.
  if new.heart_count is distinct from old.heart_count
     and new.body is not distinct from old.body
     and new.place_id is not distinct from old.place_id
     and new.user_id is not distinct from old.user_id
     and new.author_name is not distinct from old.author_name
     and new.created_at is not distinct from old.created_at
     and new.id is not distinct from old.id
  then
    new.updated_at := old.updated_at;
    return new;
  end if;

  if auth.uid() is not null and old.user_id is distinct from auth.uid() then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  new.id := old.id;
  new.user_id := old.user_id;
  new.heart_count := old.heart_count;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.author_name := coalesce(left(nullif(btrim((
    select p.display_name from public.profiles p where p.id = old.user_id
  )), ''), 80), '');
  return new;
end;
$$;

revoke execute on function public.place_comment_guard() from public, anon, authenticated;

create trigger place_comments_guard
  before insert or update on public.place_comments
  for each row execute function public.place_comment_guard();

create or replace function public.place_comment_photo_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.place_comments c
    where c.id = new.comment_id and c.user_id = auth.uid()
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if (select count(*) from public.place_comment_photos ph where ph.comment_id = new.comment_id) >= 4 then
    raise exception 'too_many_photos' using errcode = '23514';
  end if;
  new.user_id := auth.uid();
  return new;
end;
$$;

revoke execute on function public.place_comment_photo_guard() from public, anon, authenticated;

create trigger place_comment_photos_guard
  before insert on public.place_comment_photos
  for each row execute function public.place_comment_photo_guard();

create or replace function public.place_comment_heart_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.place_comments set heart_count = heart_count + 1 where id = new.comment_id;
  else
    update public.place_comments set heart_count = greatest(heart_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.place_comment_heart_count() from public, anon, authenticated;

create trigger place_comment_hearts_count
  after insert or delete on public.place_comment_hearts
  for each row execute function public.place_comment_heart_count();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- The words, the count, the name and the photographs are public, signed in
-- or not. Who hearted a note is not: a reader sees only their own heart, so
-- the app can draw it pressed. The count is the public part.

alter table public.place_comments enable row level security;
alter table public.place_comment_hearts enable row level security;
alter table public.place_comment_photos enable row level security;

create policy "Comments on the board are public"
  on public.place_comments for select to anon, authenticated
  using (true);

create policy "Authors comment on a published Sado place"
  on public.place_comments for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.places p
      left join public.places parent on parent.id = p.parent_id
      where p.id = place_id
        and p.status = 'published'
        and (p.slug = 'sado' or parent.slug = 'sado')
    )
  );

create policy "Authors revise their own comments"
  on public.place_comments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.places p
      left join public.places parent on parent.id = p.parent_id
      where p.id = place_id
        and p.status = 'published'
        and (p.slug = 'sado' or parent.slug = 'sado')
    )
  );

create policy "Authors delete their own comments"
  on public.place_comments for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "A reader sees only their own heart"
  on public.place_comment_hearts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Readers heart a comment once"
  on public.place_comment_hearts for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Readers withdraw their own heart"
  on public.place_comment_hearts for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Comment photographs are public"
  on public.place_comment_photos for select to anon, authenticated
  using (true);

create policy "Authors attach photographs to their comments"
  on public.place_comment_photos for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.place_comments c
      where c.id = comment_id and c.user_id = (select auth.uid())
    )
  );

create policy "Authors remove their own photographs"
  on public.place_comment_photos for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.place_comments, public.place_comment_hearts, public.place_comment_photos from anon, authenticated, service_role;

grant select on public.place_comments, public.place_comment_photos to anon, authenticated;
-- Anon may select hearts so a comment query can embed them, but no policy
-- matches: a guest's embed is empty. The count on the comment is the public part.
grant select on public.place_comment_hearts to anon, authenticated;
grant insert (place_id, body) on public.place_comments to authenticated;
grant update (place_id, body) on public.place_comments to authenticated;
grant delete on public.place_comments to authenticated;
grant insert (comment_id) on public.place_comment_hearts to authenticated;
grant delete on public.place_comment_hearts to authenticated;
grant insert (comment_id, storage_path, width, height, position) on public.place_comment_photos to authenticated;
grant delete on public.place_comment_photos to authenticated;
grant select, insert, update, delete on public.place_comments, public.place_comment_hearts, public.place_comment_photos to service_role;

-- ─── storage ────────────────────────────────────────────────────────────────
-- Public read: a note's photograph is part of the note. The key is
-- `c/<comment id>/<file>.jpg` (and `.thumb.jpg` beside it) — the author's
-- account id is not in the path. Only the author of that comment can write
-- or remove objects there, and only while the comment still exists.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-photos', 'board-photos', true, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Board photos: public read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'board-photos');

create policy "Board photos: author uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'board-photos'
    and name ~ '^c/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}(\.thumb)?\.jpg$'
    and exists (
      select 1 from public.place_comments c
      where c.id = ((storage.foldername(name))[2])::uuid
        and c.user_id = (select auth.uid())
    )
  );

create policy "Board photos: author deletes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'board-photos'
    and name ~ '^c/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}(\.thumb)?\.jpg$'
    and exists (
      select 1 from public.place_comments c
      where c.id = ((storage.foldername(name))[2])::uuid
        and c.user_id = (select auth.uid())
    )
  );

-- ─── the same per-account limits as the rest of the public writing ─────────

alter table public.community_rate_limits drop constraint if exists community_rate_limits_action_check;

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'community_rate_limits'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%suggestion_submit%';
  if v_name is not null then
    execute format('alter table public.community_rate_limits drop constraint %I', v_name);
  end if;
end $$;

alter table public.community_rate_limits
  add constraint community_rate_limits_action_check
  check (action in (
    'suggestion_submit', 'suggestion_support', 'suggestion_photo',
    'board_comment', 'board_heart', 'board_photo'
  ));

insert into public.community_rate_limits (action, window_length, max_count) values
  ('board_comment', interval '1 day', 20),
  ('board_comment', interval '30 days', 100),
  ('board_heart', interval '1 hour', 60),
  ('board_heart', interval '1 day', 150),
  ('board_photo', interval '1 day', 40);

-- Guard runs first (g < r), so a refused note does not spend the limit.
create trigger place_comments_rate_limit
  before insert on public.place_comments
  for each row execute function public.community_rate_limit('board_comment');

create trigger place_comment_hearts_rate_limit
  before insert on public.place_comment_hearts
  for each row execute function public.community_rate_limit('board_heart');

create trigger place_comment_photos_rate_limit
  before insert on public.place_comment_photos
  for each row execute function public.community_rate_limit('board_photo');
