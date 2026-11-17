-- A shared photograph is offered to a place without identifying its author.
--
-- The object key used to be `<account id>/<memory id>/<file>`. shared_memory_photos
-- returned that key, so anyone reading a place could lift the account id out of
-- the path and recognise the same author at another place. The account id stays
-- on the owner's row. It is no longer part of a key the public is given.
--
-- New photographs are stored at `m/<memory id>/<file>`. The memory id is already
-- how one memory's photographs are grouped, and it changes from place to place,
-- so it does not tie two places to one account. Photographs already stored under
-- an account id keep that key for their author; the public function does not
-- return them.

-- The owner may read, write and delete an object under a memory they own.
-- The row is inserted after the upload, so this checks the memory, not the
-- photograph row. Account-id keys remain the author's by the folder name.
create or replace function public.memory_photo_folder_owned(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(p_path, '/', 1) = 'm'
    and exists (
      select 1
      from public.memories m
      where m.id::text = split_part(p_path, '/', 2)
        and m.user_id = (select auth.uid())
    );
$$;

revoke all on function public.memory_photo_folder_owned(text) from public, anon, authenticated, service_role;
grant execute on function public.memory_photo_folder_owned(text) to authenticated;

alter table public.memory_photos drop constraint if exists memory_photos_path_is_owners;
alter table public.memory_photos add constraint memory_photos_path_is_owners check (
  storage_path like user_id::text || '/%'
  or storage_path like 'm/' || memory_id::text || '/%'
);

drop policy if exists "Memory photos: owner reads" on storage.objects;
create policy "Memory photos: owner reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'memory-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.memory_photo_folder_owned(name)
    )
  );

drop policy if exists "Memory photos: owner uploads" on storage.objects;
create policy "Memory photos: owner uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'memory-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.memory_photo_folder_owned(name)
    )
  );

drop policy if exists "Memory photos: owner deletes" on storage.objects;
create policy "Memory photos: owner deletes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'memory-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.memory_photo_folder_owned(name)
    )
  );

-- Same columns as before. A path whose first segment is an account id is
-- left out, including one stored under its author's own id.
create or replace function public.shared_memory_photos(p_place_id uuid)
returns table (
  id uuid,
  memory_id uuid,
  storage_path text,
  width integer,
  height integer,
  "position" smallint
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
    and split_part(ph.storage_path, '/', 1) <> m.user_id::text
    and not exists (
      select 1 from public.profiles p
      where p.id::text = split_part(ph.storage_path, '/', 1)
    )
  order by m.created_at, ph.position;
$$;
