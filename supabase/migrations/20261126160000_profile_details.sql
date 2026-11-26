-- Optional details gathered one question at a time after an account is created.
-- Every column stays nullable: skipping a question stores nothing.
--
-- residence_country is an ISO 3166-1 alpha-2 code. A prefecture is only
-- meaningful inside Japan, and only as a JIS code (01 Hokkaido … 47 Okinawa).
-- travel_frequency and household are the app's own closed sets.

alter table public.profiles
  add column if not exists residence_country text,
  add column if not exists residence_prefecture text,
  add column if not exists travel_frequency text,
  add column if not exists household text,
  add column if not exists profile_details_completed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_residence_country_check') then
    alter table public.profiles
      add constraint profiles_residence_country_check
      check (residence_country is null or residence_country ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_residence_prefecture_check') then
    alter table public.profiles
      add constraint profiles_residence_prefecture_check
      check (
        residence_prefecture is null
        or (residence_country = 'JP' and residence_prefecture ~ '^(0[1-9]|[1-3][0-9]|4[0-7])$')
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_travel_frequency_check') then
    alter table public.profiles
      add constraint profiles_travel_frequency_check
      check (travel_frequency is null or travel_frequency = any (array['rarely', 'yearly', 'several', 'monthly', 'often']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_household_check') then
    alter table public.profiles
      add constraint profiles_household_check
      check (household is null or household = any (array['alone', 'partner', 'children', 'parents', 'extended', 'other']));
  end if;
end
$$;

-- Column grants, matching the existing profile writes: role stays unreachable.
grant insert (
  residence_country,
  residence_prefecture,
  travel_frequency,
  household,
  profile_details_completed_at
) on public.profiles to authenticated;

grant update (
  residence_country,
  residence_prefecture,
  travel_frequency,
  household,
  profile_details_completed_at
) on public.profiles to authenticated;
