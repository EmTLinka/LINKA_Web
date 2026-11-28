-- A profile reads one place. The shared screen reads across places.
--
-- place_review_feed() used to return the newest 300 notes anywhere, and both
-- screens then kept the rows for one place. Past that window an older place
-- lost its notes, and "ほかN件" counted only what the window still held.
--
-- The place branch is a separate query so place_id is a plain equality.
-- place_reviews_place_created_idx (place_id, created_at desc) can then walk
-- that place newest-first and stop at the limit. A profile asks for five:
-- four are shown, and `total` — the size of the set, not of the page, and
-- not moved by the cursor — is how many the place actually has.
-- p_before keeps notes strictly older than that instant.

drop function public.place_review_feed();

create function public.place_review_feed(
  p_place_id uuid default null,
  p_before timestamptz default null,
  p_limit integer default 300
)
returns table (
  id uuid,
  place_id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  mine boolean,
  total integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 300), 1), 300);
begin
  if p_place_id is not null then
    return query
    select
      r.id,
      r.place_id,
      r.body,
      r.created_at,
      nullif(btrim(pr.display_name), ''),
      r.user_id is not distinct from auth.uid(),
      (select count(*)::integer
       from public.place_reviews c
       join public.places cp on cp.id = c.place_id
       where c.place_id = p_place_id
         and cp.status = 'published'
         and cp.kind = 'destination')
    from public.place_reviews r
    join public.places pl on pl.id = r.place_id
    left join public.profiles pr on pr.id = r.user_id
    where r.place_id = p_place_id
      and pl.status = 'published'
      and pl.kind = 'destination'
      and (p_before is null or r.created_at < p_before)
    order by r.created_at desc
    limit lim;
  else
    return query
    select
      r.id,
      r.place_id,
      r.body,
      r.created_at,
      nullif(btrim(pr.display_name), ''),
      r.user_id is not distinct from auth.uid(),
      (select count(*)::integer
       from public.place_reviews c
       left join public.places cp on cp.id = c.place_id
       where c.place_id is null
          or (cp.status = 'published' and cp.kind = 'destination'))
    from public.place_reviews r
    left join public.places pl on pl.id = r.place_id
    left join public.profiles pr on pr.id = r.user_id
    where (r.place_id is null or (pl.status = 'published' and pl.kind = 'destination'))
      and (p_before is null or r.created_at < p_before)
    order by r.created_at desc
    limit lim;
  end if;
end;
$$;

revoke all on function public.place_review_feed(uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.place_review_feed(uuid, timestamptz, integer) to anon, authenticated, service_role;
