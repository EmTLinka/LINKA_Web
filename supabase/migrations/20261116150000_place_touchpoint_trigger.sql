-- ============================================================================
-- A published destination gains one Touch Point when it is added, or when a
-- draft becomes published. public_id comes from the column default
-- (generate_public_id()). A place that already has a point is left alone.
-- Regions are not Touch Points. Existing rows are not backfilled here.
-- ============================================================================

create or replace function public.ensure_place_touchpoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'destination' and new.status = 'published'
     and not exists (select 1 from public.touchpoints t where t.place_id = new.id)
  then
    insert into public.touchpoints
      (place_id, name, code, touchpoint_type, access_mode, latitude, longitude)
    values
      (new.id, 'Main / General', new.slug || '-main', 'place', 'account_first', new.latitude, new.longitude);
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_place_touchpoint() from public, anon, authenticated;

drop trigger if exists places_ensure_touchpoint on public.places;

create trigger places_ensure_touchpoint
  after insert or update of kind, status, slug, latitude, longitude
  on public.places
  for each row
  execute function public.ensure_place_touchpoint();
