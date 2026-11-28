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
reset role;
