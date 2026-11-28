-- Visitor notes (口コミ) on a place's profile.
--
-- A note is a short impression of one published destination. It is not a
-- suggestion, a reply, or a private memory. Anyone may read the words and
-- the author's nickname. The table itself stays closed: the public reads
-- through place_review_feed(), which never returns user_id. The author
-- writes, edits and deletes only their own rows.

create table public.place_reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 400 and body = btrim(body)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index place_reviews_place_created_idx on public.place_reviews (place_id, created_at desc);
create index place_reviews_user_created_idx on public.place_reviews (user_id, created_at desc);

create trigger place_reviews_set_updated_at
  before update on public.place_reviews
  for each row execute function public.set_updated_at();

alter table public.place_reviews enable row level security;

create policy "Authors read own reviews"
  on public.place_reviews for select to authenticated
  using ((select auth.uid()) = user_id);

-- The check must not read place_reviews. A subquery on the same table
-- re-enters this policy and Postgres raises 42P17 (infinite recursion).
create policy "Authors write reviews of published places"
  on public.place_reviews for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.places p
      where p.id = place_id and p.status = 'published' and p.kind = 'destination'
    )
  );

create policy "Authors update own reviews"
  on public.place_reviews for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Authors delete own reviews"
  on public.place_reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.place_reviews from anon, authenticated;
grant select (id, place_id, body, created_at, updated_at) on public.place_reviews to authenticated;
grant insert (place_id, body) on public.place_reviews to authenticated;
grant update (body) on public.place_reviews to authenticated;
grant delete on public.place_reviews to authenticated;
grant select, insert, update, delete on public.place_reviews to service_role;

-- Public read model: the words, when, the nickname, and whether this viewer wrote it.
create or replace function public.place_review_feed()
returns table (
  id uuid,
  place_id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.place_id,
    r.body,
    r.created_at,
    nullif(btrim(p.display_name), ''),
    r.user_id is not distinct from auth.uid()
  from public.place_reviews r
  join public.places pl on pl.id = r.place_id
  left join public.profiles p on p.id = r.user_id
  where pl.status = 'published' and pl.kind = 'destination'
  order by r.created_at desc
  limit 300
$$;

revoke execute on function public.place_review_feed() from public, anon, authenticated;
grant execute on function public.place_review_feed() to anon, authenticated, service_role;
