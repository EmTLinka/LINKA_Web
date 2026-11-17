-- ============================================================================
-- One real Touch Point for every published destination that does not have one.
--
-- public_id is left to generate_public_id(): 22 unreadable characters, a
-- different value on every row. It is the URL written on that place's tag
-- (/t/:public_id). An existing point is left alone, including トキの森公園.
--
-- is_test stays false, so a check-in is a real visit. A region (佐渡) is not
-- a Touch Point. Idempotent on place_id.
-- ============================================================================

insert into public.touchpoints
  (place_id, name, code, touchpoint_type, access_mode, is_active, is_test, public_id, latitude, longitude)
select p.id, 'Main / General', p.slug || '-main', 'place', 'account_first', true, false,
       public.generate_public_id(), p.latitude, p.longitude
from public.places p
where p.status = 'published'
  and p.kind = 'destination'
  and not exists (
    select 1 from public.touchpoints t
    where t.place_id = p.id
  );
