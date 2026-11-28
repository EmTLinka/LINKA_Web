-- The first place_reviews policy counted the author's rows for the day by
-- selecting from place_reviews itself. That re-enters the policy and Postgres
-- rejects the insert with 42P17. The place check stays; the self-read goes.

drop policy "Authors write reviews of published places" on public.place_reviews;

create policy "Authors write reviews of published places"
  on public.place_reviews for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.places p
      where p.id = place_id and p.status = 'published' and p.kind = 'destination'
    )
  );
