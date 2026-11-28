-- A note may belong to one published destination, or to no place at all.
-- The shared screen posts the second kind when no place is chosen.

alter table public.place_reviews alter column place_id drop not null;

drop policy if exists "Authors write reviews of published places" on public.place_reviews;

create policy "Authors write reviews of published places"
  on public.place_reviews for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      place_id is null
      or exists (
        select 1 from public.places p
        where p.id = place_id and p.status = 'published' and p.kind = 'destination'
      )
    )
  );

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
  left join public.places pl on pl.id = r.place_id
  left join public.profiles p on p.id = r.user_id
  where r.place_id is null
    or (pl.status = 'published' and pl.kind = 'destination')
  order by r.created_at desc
  limit 300
$$;
