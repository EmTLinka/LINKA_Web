-- admin_create_place: only an admin profile can insert a place, by hand.
-- walker 1111… starts as a normal user. legacy 2222… stays one.

set role anon;
select t.as_user(null);
select t.fails(
  $$select admin_create_place('{"slug":"x","native_name":"X","latitude":1,"longitude":1}'::jsonb)$$,
  '42501',
  'anon cannot call admin_create_place'
);
reset role;

set role authenticated;
select t.as_user('11111111-1111-4111-8111-111111111111');
select t.fails_with(
  $$select admin_create_place('{"slug":"x","native_name":"X","latitude":1,"longitude":1}'::jsonb)$$,
  '42501',
  'admin_required',
  'a signed-in user who is not admin cannot add a place'
);
reset role;

update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111';

set role authenticated;
select t.as_user('22222222-2222-4222-8222-222222222222');
select t.fails_with(
  $$select admin_create_place('{"slug":"x","native_name":"X","latitude":1,"longitude":1}'::jsonb)$$,
  '42501',
  'admin_required',
  'another account is still refused'
);
select t.as_user('11111111-1111-4111-8111-111111111111');

select t.fails_with(
  $$select admin_create_place('{"slug":"Bad Slug","native_name":"X","latitude":1,"longitude":1}'::jsonb)$$,
  '22023', 'invalid_slug', 'slug must be the places pattern'
);
select t.fails_with(
  $$select admin_create_place('{"slug":"http-cove","native_name":"X","latitude":1,"longitude":1,"official_url":"http://example.com"}'::jsonb)$$,
  '22023', 'invalid_official_url', 'official_url must be https'
);
select t.fails_with(
  $$select admin_create_place('{"slug":"no-parent","native_name":"X","latitude":1,"longitude":1,"parent_slug":"missing-region"}'::jsonb)$$,
  'P0002', 'parent_not_found', 'an unknown parent slug is refused'
);
select t.fails_with(
  $$select admin_create_place('{"slug":"bad-region","kind":"region","native_name":"X","latitude":1,"longitude":1,"parent_slug":"sado"}'::jsonb)$$,
  '22023', 'region_cannot_have_parent', 'a region cannot sit under a parent'
);
select t.fails_with(
  $$select admin_create_place('{"slug":"bad-tz","native_name":"X","latitude":1,"longitude":1,"timezone":"Not/AZone"}'::jsonb)$$,
  '22023', 'invalid_timezone', 'timezone must be a real zone'
);

insert into t.kv select 'draft', admin_create_place($p${
  "slug": "manual-cove",
  "parent_slug": "sado",
  "native_name": "手入力湾",
  "romanized_name": "Manual Cove",
  "latitude": 38.11,
  "longitude": 138.22,
  "official_url": "https://example.com/cove",
  "label_side": "left",
  "translations": [{
    "locale": "ja",
    "name": "手入力湾",
    "locality": "佐渡市",
    "short_description": "手が書いた短い説明。",
    "source_url": "https://example.com/cove"
  }],
  "sources": [{
    "url": "https://example.com/cove",
    "covers": ["coordinates", "name"],
    "publisher": "example"
  }]
}$p$::jsonb)::text;

insert into t.kv select 'live', admin_create_place($p${
  "slug": "published-cove",
  "kind": "destination",
  "native_name": "公開湾",
  "latitude": 38.2,
  "longitude": 138.3,
  "status": "published"
}$p$::jsonb)::text;

insert into t.kv select 'region', admin_create_place($p${
  "slug": "admin-test-region",
  "kind": "region",
  "native_name": "テスト地域",
  "latitude": 38.5,
  "longitude": 138.5,
  "status": "published"
}$p$::jsonb)::text;

select t.fails(
  $$select admin_create_place('{"slug":"manual-cove","native_name":"もう一つ","latitude":1,"longitude":1}'::jsonb)$$,
  '23505',
  'a slug already in places is refused'
);
reset role;

select t.ok(
  (select status = 'draft' and kind = 'destination' and native_name = '手入力湾'
     and romanized_name = 'Manual Cove' and timezone = 'Asia/Tokyo'
     and native_locale = 'ja' and parent_id = t.place('sado')
     and official_url = 'https://example.com/cove' and label_side = 'left'
     and discovery_enabled = false and latitude = 38.11 and longitude = 138.22
   from places where slug = 'manual-cove'),
  'hand entry lands on the places columns, under its parent, still a draft'
);
select t.ok(
  (select locality = '佐渡市' and short_description = '手が書いた短い説明。'
   from place_translations where place_id = t.place('manual-cove') and locale = 'ja'),
  'the ja translation is stored with the place'
);
select t.ok(
  (select publisher = 'example' and covers = array['coordinates', 'name']
   from place_sources where place_id = t.place('manual-cove')),
  'the source row is stored'
);
select t.ok(
  not exists (select 1 from touchpoints where place_id = t.place('manual-cove')),
  'a draft does not gain a Touch Point'
);
select t.ok(
  (select (v::jsonb)->'touchpoint' = 'null'::jsonb from t.kv where k = 'draft'),
  'the draft response says there is no Touch Point yet'
);

select t.ok(
  (select status = 'published' and kind = 'destination' from places where slug = 'published-cove'),
  'publishing is a column on the same call'
);
select t.ok(
  (select count(*) = 1 from touchpoints where place_id = t.place('published-cove')),
  'a published destination gains one Touch Point'
);
select t.ok(
  (select tp.public_id = (kv.v::jsonb)->'touchpoint'->>'public_id'
     and (kv.v::jsonb)->'touchpoint'->>'path' = '/t/' || tp.public_id
   from touchpoints tp, t.kv kv
   where tp.place_id = t.place('published-cove') and kv.k = 'live'),
  'the response includes the NFC path, which the Data API does not'
);
select t.ok(
  (select tp.latitude = 38.2 and tp.longitude = 138.3 and tp.code = 'published-cove-main'
   from touchpoints tp where tp.place_id = t.place('published-cove')),
  'the Touch Point copies the place coordinates'
);
select t.ok(
  not exists (select 1 from touchpoints where place_id = t.place('admin-test-region')),
  'a published region is not a Touch Point'
);
