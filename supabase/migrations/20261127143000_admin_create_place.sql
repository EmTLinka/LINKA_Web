-- ============================================================================
-- Staff-only place creation.
--
-- places has no insert policy for the browser. This function is the write:
-- it runs as definer, and only after is_admin() is true for the caller.
-- A published destination still gains its Touch Point from
-- places_ensure_touchpoint; the return value includes that point's public_id
-- (hidden from the Data API) so the NFC URL can be written down.
--
-- Call with the signed-in admin's access token:
--   POST /rest/v1/rpc/admin_create_place
--   { "p_place": { ...columns, "translations": [], "sources": [] } }
-- Lookup from Google is a different URL (the admin-places Edge Function),
-- which posts the same object here. Either path refuses a non-admin.
-- ============================================================================

create or replace function public.admin_create_place(p_place jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_slug text;
  v_kind text;
  v_native_name text;
  v_native_locale text;
  v_romanized text;
  v_lat double precision;
  v_lng double precision;
  v_tz text;
  v_official_url text;
  v_status text;
  v_discovery boolean;
  v_partner text;
  v_hero_path text;
  v_hero_credit text;
  v_hero_source text;
  v_hero_license text;
  v_hero_license_url text;
  v_label_side text;
  v_parent uuid;
  v_parent_slug text;
  v_place public.places%rowtype;
  v_tr jsonb;
  v_src jsonb;
  v_locale text;
  v_info jsonb;
  v_as_of date;
  v_checked timestamptz;
  v_covers text[];
  v_translations jsonb;
  v_sources jsonb;
  v_touch jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_place is null or jsonb_typeof(p_place) <> 'object' then
    raise exception 'place_required' using errcode = '22023';
  end if;

  v_slug := nullif(btrim(p_place->>'slug'), '');
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  v_native_name := nullif(btrim(p_place->>'native_name'), '');
  if v_native_name is null then
    raise exception 'native_name_required' using errcode = '22023';
  end if;

  v_kind := coalesce(nullif(btrim(p_place->>'kind'), ''), 'destination');
  if v_kind not in ('region', 'destination') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  v_native_locale := coalesce(nullif(btrim(p_place->>'native_locale'), ''), 'ja');
  if v_native_locale !~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$' then
    raise exception 'invalid_native_locale' using errcode = '22023';
  end if;

  v_romanized := nullif(btrim(p_place->>'romanized_name'), '');

  if nullif(p_place->>'latitude', '') is null or nullif(p_place->>'longitude', '') is null then
    raise exception 'coordinates_required' using errcode = '22023';
  end if;
  begin
    v_lat := (p_place->>'latitude')::double precision;
    v_lng := (p_place->>'longitude')::double precision;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid_coordinates' using errcode = '22023';
  end;
  if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
    raise exception 'invalid_coordinates' using errcode = '22023';
  end if;

  v_tz := coalesce(nullif(btrim(p_place->>'timezone'), ''), 'Asia/Tokyo');
  begin
    perform (now() at time zone v_tz);
  exception
    when invalid_parameter_value then
      raise exception 'invalid_timezone' using errcode = '22023';
  end;

  v_official_url := nullif(btrim(p_place->>'official_url'), '');
  if v_official_url is not null and v_official_url !~ '^https://' then
    raise exception 'invalid_official_url' using errcode = '22023';
  end if;

  v_status := coalesce(nullif(btrim(p_place->>'status'), ''), 'draft');
  if v_status not in ('draft', 'published', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  if not (p_place ? 'discovery_enabled') or p_place->'discovery_enabled' = 'null'::jsonb then
    v_discovery := false;
  elsif jsonb_typeof(p_place->'discovery_enabled') <> 'boolean' then
    raise exception 'invalid_discovery_enabled' using errcode = '22023';
  else
    v_discovery := (p_place->>'discovery_enabled')::boolean;
  end if;

  v_partner := coalesce(nullif(btrim(p_place->>'partner_status'), ''), 'none');
  if v_partner not in ('none', 'partner') then
    raise exception 'invalid_partner_status' using errcode = '22023';
  end if;

  v_hero_path := nullif(btrim(p_place->>'hero_image_path'), '');
  v_hero_credit := nullif(btrim(p_place->>'hero_image_credit'), '');
  v_hero_source := nullif(btrim(p_place->>'hero_image_source_url'), '');
  v_hero_license := nullif(btrim(p_place->>'hero_image_license'), '');
  v_hero_license_url := nullif(btrim(p_place->>'hero_image_license_url'), '');
  if v_hero_source is not null and v_hero_source !~ '^https://' then
    raise exception 'invalid_hero_image_source_url' using errcode = '22023';
  end if;
  if v_hero_license_url is not null and v_hero_license_url !~ '^https://' then
    raise exception 'invalid_hero_image_license_url' using errcode = '22023';
  end if;

  v_label_side := nullif(btrim(p_place->>'label_side'), '');
  if v_label_side is not null and v_label_side not in ('left', 'right', 'below') then
    raise exception 'invalid_label_side' using errcode = '22023';
  end if;

  if nullif(btrim(p_place->>'parent_id'), '') is not null
     and nullif(btrim(p_place->>'parent_slug'), '') is not null then
    raise exception 'parent_conflict' using errcode = '22023';
  end if;
  if nullif(btrim(p_place->>'parent_id'), '') is not null then
    begin
      v_parent := btrim(p_place->>'parent_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'invalid_parent_id' using errcode = '22023';
    end;
    if not exists (select 1 from public.places where id = v_parent) then
      raise exception 'parent_not_found' using errcode = 'P0002';
    end if;
  else
    v_parent_slug := nullif(btrim(p_place->>'parent_slug'), '');
    if v_parent_slug is not null then
      select id into v_parent from public.places where slug = v_parent_slug;
      if not found then
        raise exception 'parent_not_found' using errcode = 'P0002';
      end if;
    end if;
  end if;
  if v_kind = 'region' and v_parent is not null then
    raise exception 'region_cannot_have_parent' using errcode = '22023';
  end if;

  if p_place ? 'translations' and jsonb_typeof(p_place->'translations') <> 'array' then
    raise exception 'invalid_translations' using errcode = '22023';
  end if;
  if p_place ? 'sources' and jsonb_typeof(p_place->'sources') <> 'array' then
    raise exception 'invalid_sources' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct value->>'locale')
    from jsonb_array_elements(coalesce(p_place->'translations', '[]'::jsonb))
  ) then
    raise exception 'duplicate_locale' using errcode = '22023';
  end if;

  insert into public.places (
    slug, parent_id, kind, native_name, native_locale, romanized_name,
    latitude, longitude, timezone, official_url, status, discovery_enabled,
    partner_status, hero_image_path, hero_image_credit, hero_image_source_url,
    hero_image_license, hero_image_license_url, label_side
  ) values (
    v_slug, v_parent, v_kind, v_native_name, v_native_locale, v_romanized,
    v_lat, v_lng, v_tz, v_official_url, v_status, v_discovery,
    v_partner, v_hero_path, v_hero_credit, v_hero_source,
    v_hero_license, v_hero_license_url, v_label_side
  ) returning * into v_place;

  for v_tr in select value from jsonb_array_elements(coalesce(p_place->'translations', '[]'::jsonb))
  loop
    if jsonb_typeof(v_tr) <> 'object' then
      raise exception 'invalid_translation' using errcode = '22023';
    end if;
    v_locale := nullif(btrim(v_tr->>'locale'), '');
    if v_locale is null or v_locale !~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$' then
      raise exception 'invalid_locale' using errcode = '22023';
    end if;
    if not (v_tr ? 'practical_info') or v_tr->'practical_info' = 'null'::jsonb then
      v_info := null;
    elsif jsonb_typeof(v_tr->'practical_info') <> 'object' then
      raise exception 'invalid_practical_info' using errcode = '22023';
    else
      v_info := v_tr->'practical_info';
    end if;
    if nullif(v_tr->>'practical_info_as_of', '') is null then
      v_as_of := null;
    else
      begin
        v_as_of := (v_tr->>'practical_info_as_of')::date;
      exception
        when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
          raise exception 'invalid_practical_info_as_of' using errcode = '22023';
      end;
    end if;
    if v_as_of is not null and v_info is null then
      raise exception 'practical_info_required' using errcode = '22023';
    end if;
    if nullif(btrim(v_tr->>'source_url'), '') is not null
       and btrim(v_tr->>'source_url') !~ '^https://' then
      raise exception 'invalid_source_url' using errcode = '22023';
    end if;

    insert into public.place_translations (
      place_id, locale, name, official_name, locality, short_description, description,
      practical_info, practical_info_as_of, source_url, content_checked_at, hero_image_alt
    ) values (
      v_place.id,
      v_locale,
      nullif(btrim(v_tr->>'name'), ''),
      nullif(btrim(v_tr->>'official_name'), ''),
      nullif(btrim(v_tr->>'locality'), ''),
      nullif(btrim(v_tr->>'short_description'), ''),
      nullif(btrim(v_tr->>'description'), ''),
      v_info,
      v_as_of,
      nullif(btrim(v_tr->>'source_url'), ''),
      case
        when nullif(v_tr->>'content_checked_at', '') is null then null
        else (v_tr->>'content_checked_at')::timestamptz
      end,
      nullif(btrim(v_tr->>'hero_image_alt'), '')
    );
  end loop;

  for v_src in select value from jsonb_array_elements(coalesce(p_place->'sources', '[]'::jsonb))
  loop
    if jsonb_typeof(v_src) <> 'object' then
      raise exception 'invalid_source' using errcode = '22023';
    end if;
    if nullif(btrim(v_src->>'url'), '') is null or btrim(v_src->>'url') !~ '^https://' then
      raise exception 'invalid_source_url' using errcode = '22023';
    end if;
    if not (v_src ? 'covers') or v_src->'covers' = 'null'::jsonb then
      v_covers := '{}';
    elsif jsonb_typeof(v_src->'covers') <> 'array' then
      raise exception 'invalid_source_covers' using errcode = '22023';
    else
      select coalesce(array_agg(c.item order by c.ord), '{}'::text[]) into v_covers
      from jsonb_array_elements_text(v_src->'covers') with ordinality as c(item, ord);
    end if;
    if nullif(v_src->>'checked_at', '') is null then
      v_checked := now();
    else
      begin
        v_checked := (v_src->>'checked_at')::timestamptz;
      exception
        when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
          raise exception 'invalid_checked_at' using errcode = '22023';
      end;
    end if;

    insert into public.place_sources (place_id, url, covers, publisher, checked_at, note)
    values (
      v_place.id,
      btrim(v_src->>'url'),
      v_covers,
      nullif(btrim(v_src->>'publisher'), ''),
      v_checked,
      nullif(btrim(v_src->>'note'), '')
    );
  end loop;

  select to_jsonb(t) into v_touch
  from (
    select id, public_id, '/t/' || public_id as path
    from public.touchpoints
    where place_id = v_place.id
    order by created_at
    limit 1
  ) t;

  select coalesce(jsonb_agg(to_jsonb(tr) order by tr.locale), '[]'::jsonb)
    into v_translations
  from public.place_translations tr
  where tr.place_id = v_place.id;

  select coalesce(jsonb_agg(to_jsonb(src) order by src.url), '[]'::jsonb)
    into v_sources
  from public.place_sources src
  where src.place_id = v_place.id;

  return jsonb_build_object(
    'place', to_jsonb(v_place),
    'translations', v_translations,
    'sources', v_sources,
    'touchpoint', v_touch
  );
end;
$$;

revoke all on function public.admin_create_place(jsonb) from public, anon, authenticated;
grant execute on function public.admin_create_place(jsonb) to authenticated;
