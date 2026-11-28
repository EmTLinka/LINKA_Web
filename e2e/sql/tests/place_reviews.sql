-- Visitor notes: public to read, only the author can change them, only on a published destination.

set role authenticated;
select t.as_user('11111111-1111-4111-8111-111111111111');
insert into place_reviews (place_id, body) values (t.place('shukunegi'), '風が強かった');
select t.ok((select author_name from place_review_feed() where body = '風が強かった') = 'Walker', 'the feed names the author');
select t.ok((select mine from place_review_feed() where body = '風が強かった'), 'the author is told it is theirs');
select t.fails($$select user_id from place_review_feed()$$, '42703', 'the feed has no user id');

select t.fails($$insert into place_reviews (place_id, body) values (t.place('shukunegi'), '   ')$$, '23514', 'a blank note is refused');
select t.fails(format($$insert into place_reviews (place_id, body) values (%L, '島全体')$$, t.place('sado')), '42501', 'a region is not a profile that takes notes');
insert into place_reviews (place_id, body) values (null, '島の印象');
select t.ok((select count(*) from place_review_feed() where body = '島の印象') = 1, 'a note can belong to no place');

set role anon;
select t.as_user(null);
select t.ok((select count(*) from place_review_feed() where body = '風が強かった') = 1, 'a guest can read a note');
select t.ok(not (select mine from place_review_feed() where body = '風が強かった'), 'a guest does not own it');
select t.fails($$select * from place_reviews$$, '42501', 'a guest cannot read the table');
select t.fails(format($$insert into place_reviews (place_id, body) values (%L, 'ゲスト')$$, t.place('shukunegi')), '42501', 'a guest cannot write');

set role authenticated;
select t.as_user('33333333-3333-4333-8333-333333333333');
update place_reviews set body = '書き換え' where body = '風が強かった';
select t.ok((select body from place_review_feed() where body = '風が強かった') = '風が強かった', 'another person cannot edit it');
delete from place_reviews where body = '風が強かった';
select t.ok((select count(*) from place_review_feed() where body = '風が強かった') = 1, 'another person cannot delete it');

select t.as_user('11111111-1111-4111-8111-111111111111');
update place_reviews set body = '静かだった' where body = '風が強かった';
select t.ok((select count(*) from place_review_feed() where body = '静かだった') = 1, 'the author can edit');
delete from place_reviews where body = '静かだった';
select t.ok((select count(*) from place_review_feed() where body = '静かだった') = 0, 'the author can delete');
delete from place_reviews where body = '島の印象';
select t.ok((select count(*) from place_review_feed() where body = '島の印象') = 0, 'the author can delete a note with no place');

-- An older place keeps its own page when newer notes elsewhere fill the shared one.
insert into place_reviews (place_id, body) values (t.place('shukunegi'), '宿根木の古い話');
insert into place_reviews (place_id, body)
select t.place('toki-no-mori'), '森の話' || g
from generate_series(1, 300) as g;
reset role;
update place_reviews set created_at = timestamptz '2020-01-01+00' where body = '宿根木の古い話';

select t.ok((select count(*) from place_review_feed() where body = '宿根木の古い話') = 0, 'the shared page is only the newest notes');
select t.ok((select count(*) from place_review_feed(null, null, 1000)) = 300, 'a page cannot ask for more than 300');
select t.ok((select count(*) from place_review_feed(t.place('shukunegi')) where body = '宿根木の古い話') = 1, 'the place page still has the older note');
select t.ok((select count(*) from place_review_feed(t.place('shukunegi')) where place_id is distinct from t.place('shukunegi')) = 0, 'a place page contains only that place');
select t.ok((select count(*) from place_review_feed(t.place('toki-no-mori'), null, 5)) = 5, 'a profile takes five notes');
select t.ok((select distinct total from place_review_feed(t.place('toki-no-mori'), null, 5)) = 300, 'those five still report the place''s real number');
select t.ok((select count(*) from place_review_feed(t.place('shukunegi'), timestamptz '2020-06-01+00') where body = '宿根木の古い話') = 1, 'a cursor keeps an older note');
select t.ok((select count(*) from place_review_feed(t.place('shukunegi'), timestamptz '2019-01-01+00') where body = '宿根木の古い話') = 0, 'a cursor drops a note that is not before it');
select t.fails($$select user_id from place_review_feed(t.place('shukunegi'), null, 5)$$, '42703', 'a place page has no user id');
