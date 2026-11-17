-- Photographs offered to a place do not carry the author's account id.
-- walker 1111… shares one new photograph and one stored under the account id.

select t.as_user('11111111-1111-4111-8111-111111111111');
set role authenticated;
select 1 from record_touch('e2eTokiGate000000001');
select 1 from record_touch('e2eKinzanGate0000003');
insert into memories (visit_id, place_id, visibility)
  select id, place_id, 'public' from visits where user_id = '11111111-1111-4111-8111-111111111111';
insert into memory_photos (memory_id, storage_path, width, height, position)
  select id, 'm/' || id || '/one.jpg', 800, 600, 0
  from memories where user_id = '11111111-1111-4111-8111-111111111111' and place_id = t.place('toki-no-mori');
insert into memory_photos (memory_id, storage_path, width, height, position)
  select id, 'm/' || id || '/two.jpg', 800, 600, 0
  from memories where user_id = '11111111-1111-4111-8111-111111111111' and place_id = t.place('sado-kinzan');
insert into memory_photos (memory_id, storage_path, width, height, position)
  select id, user_id::text || '/' || id || '/old.jpg', 800, 600, 1
  from memories where user_id = '11111111-1111-4111-8111-111111111111' and place_id = t.place('toki-no-mori');
select t.ok(
  memory_photo_folder_owned('m/' || id || '/one.jpg'),
  'the author may store a photograph under its memory'
) from memories where user_id = '11111111-1111-4111-8111-111111111111' and place_id = t.place('toki-no-mori');
reset role;
insert into t.kv
  select 'toki_memory', id::text from memories
  where user_id = '11111111-1111-4111-8111-111111111111' and place_id = t.place('toki-no-mori');

select t.as_user('33333333-3333-4333-8333-333333333333');
set role authenticated;
select t.ok(
  not memory_photo_folder_owned('m/' || (select v from t.kv where k = 'toki_memory') || '/one.jpg'),
  'another account may not store under that memory'
);
select t.fails(
  format(
    $$insert into memory_photos (memory_id, storage_path, width, height) values (%L, %L, 10, 10)$$,
    (select v from t.kv where k = 'toki_memory'),
    'm/' || (select v from t.kv where k = 'toki_memory') || '/stolen.jpg'
  ),
  '42501',
  'another account cannot attach a photograph to that memory'
);
reset role;

select t.as_user(null);
set role anon;
select t.ok(
  (select count(*) from shared_memory_photos(t.place('toki-no-mori'))) = 1,
  'the account-keyed photograph is not offered to the place'
);
select t.ok(
  (select storage_path from shared_memory_photos(t.place('toki-no-mori'))) like 'm/%',
  'the offered key starts with the memory, not an account'
);
select t.ok(
  (select storage_path from shared_memory_photos(t.place('toki-no-mori'))) not like '%11111111-1111-4111-8111-111111111111%',
  'the author account id is not in the offered key'
);
select t.ok(
  (select split_part(storage_path, '/', 2) from shared_memory_photos(t.place('toki-no-mori')))
    is distinct from
  (select split_part(storage_path, '/', 2) from shared_memory_photos(t.place('sado-kinzan'))),
  'the same author at two places does not share an identifying key'
);
select t.fails($$select storage_path from memory_photos$$, '42501', 'anon cannot read photograph rows directly');
select t.fails(
  $$select memory_photo_folder_owned('m/x/y.jpg')$$,
  '42501',
  'anon cannot ask who owns a memory folder'
);
reset role;

select t.as_user('11111111-1111-4111-8111-111111111111');
set role authenticated;
select t.ok((select count(*) from memory_photos) = 3, 'the author still sees the account-keyed photograph');
reset role;
