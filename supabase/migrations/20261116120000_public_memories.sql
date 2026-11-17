-- A memory stays private unless its author marks it public. A public memory,
-- and only that one, may be read with the place: its photographs and its note
-- appear on the place profile. The private bucket stays private for everything
-- else; a public photograph is readable because its memory says so.

alter table public.memories drop constraint if exists memories_visibility_check;
alter table public.memories
  add constraint memories_visibility_check check (visibility in ('private', 'public'));

-- The author chooses, on insert and later. Nothing else about the row moves.
grant insert (visibility) on public.memories to authenticated;
grant update (visibility) on public.memories to authenticated;

-- Anyone looking at a place may read what was offered to it. Owner policies
-- still cover private rows; these add the public ones. Anon sees the note and
-- the photograph, not who wrote them.
grant select (id, place_id, note, visibility, created_at, cover_photo_id) on public.memories to anon;
grant select (id, memory_id, storage_path, width, height, position) on public.memory_photos to anon;

create policy "Anyone reads public memories"
  on public.memories for select to anon, authenticated
  using (visibility = 'public');

create policy "Anyone reads photos of public memories"
  on public.memory_photos for select to anon, authenticated
  using (
    exists (
      select 1 from public.memories m
      where m.id = memory_id and m.visibility = 'public'
    )
  );

-- Signed URLs check this. The object is readable only when a public memory
-- points at that exact path — never the rest of the owner's folder.
create policy "Public memory photos are readable"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'memory-photos'
    and exists (
      select 1 from public.memory_photos ph
      join public.memories m on m.id = ph.memory_id
      where ph.storage_path = name and m.visibility = 'public'
    )
  );
