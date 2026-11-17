-- A public memory offers its photographs to the place, and nothing else.
-- The note, the mood, the remembered date, the author and the visit stay on
-- the owner's row.
--
-- `authenticated` already holds table-wide SELECT on memories. A public
-- SELECT policy therefore handed a signed-in reader every column of someone
-- else's shared memory. That policy is gone. Photographs are read through
-- shared_memory_photos, which returns only the fields a picture needs.

drop policy if exists "Anyone reads public memories" on public.memories;
revoke select (id, place_id, note, visibility, created_at, cover_photo_id) on public.memories from anon;

drop policy if exists "Anyone reads photos of public memories" on public.memory_photos;
revoke select (id, memory_id, storage_path, width, height, position) on public.memory_photos from anon;

-- True when this object key belongs to a photograph of a public memory.
-- Storage policies run as the caller, who can no longer see that memory row,
-- so the check has to run as the owner of the tables.
create or replace function public.memory_photo_is_shared(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memory_photos ph
    join public.memories m on m.id = ph.memory_id
    where ph.storage_path = p_path
      and m.visibility = 'public'
  );
$$;

-- The photographs a place was offered, oldest memory first. No note, no author,
-- no mood, no date of remembering, no visit.
create or replace function public.shared_memory_photos(p_place_id uuid)
returns table (
  id uuid,
  memory_id uuid,
  storage_path text,
  width integer,
  height integer,
  position smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.id, ph.memory_id, ph.storage_path, ph.width, ph.height, ph.position
  from public.memory_photos ph
  join public.memories m on m.id = ph.memory_id
  where m.place_id = p_place_id
    and m.visibility = 'public'
  order by m.created_at, ph.position;
$$;

revoke all on function public.memory_photo_is_shared(text) from public, anon, authenticated, service_role;
revoke all on function public.shared_memory_photos(uuid) from public, anon, authenticated, service_role;
grant execute on function public.memory_photo_is_shared(text) to anon, authenticated, service_role;
grant execute on function public.shared_memory_photos(uuid) to anon, authenticated, service_role;

drop policy if exists "Public memory photos are readable" on storage.objects;
create policy "Public memory photos are readable"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'memory-photos'
    and public.memory_photo_is_shared(name)
  );
