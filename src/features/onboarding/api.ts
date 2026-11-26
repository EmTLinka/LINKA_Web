import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

export type Profile = Database['public']['Tables']['profiles']['Row']

/** The subset of `public.profiles` this sprint writes. */
export type ProfileDraft = {
  displayName: string
  avatarUrl: string | null
  ageRange: string | null
  nationality: string | null
  gender: string | null
}

/**
 * Read the signed-in user's profile row.
 *
 * Returns `null` when no row exists yet — that is the normal state for someone
 * who has just verified their first code.
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await (await getSupabase())
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

/**
 * Create or update the signed-in user's profile.
 *
 * `id` is the auth user id, so RLS ("a user may only touch their own row")
 * is what makes this safe — the client never chooses whose profile it writes.
 * Upsert covers both cases because a row may already have been created by a
 * database trigger on sign-up.
 */
export async function saveProfile(userId: string, draft: ProfileDraft): Promise<Profile> {
  const { data, error } = await (await getSupabase())
    .from('profiles')
    .upsert(
      {
        id: userId,
        display_name: draft.displayName,
        avatar_url: draft.avatarUrl,
        age_range: draft.ageRange,
        nationality: draft.nationality,
        gender: draft.gender,
      },
      { onConflict: 'id' },
    )
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

/**
 * Optional answers collected after the account exists.
 *
 * A prefecture is kept only for Japan. Finishing — including skipping every
 * question — sets `profile_details_completed_at`. Until that moment the
 * account is unfinished, and the next sign-in returns here.
 */
export type ProfileDetails = {
  ageRange: string | null
  gender: string | null
  residenceCountry: string | null
  residencePrefecture: string | null
  travelFrequency: string | null
  household: string | null
}

export async function saveProfileDetails(userId: string, details: ProfileDetails): Promise<Profile> {
  const country = details.residenceCountry
  const { data, error } = await (await getSupabase())
    .from('profiles')
    .upsert(
      {
        id: userId,
        age_range: details.ageRange,
        gender: details.gender,
        residence_country: country,
        residence_prefecture: country === 'JP' ? details.residencePrefecture : null,
        travel_frequency: details.travelFrequency,
        household: details.household,
        profile_details_completed_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

/**
 * The account may enter the map once the profile questions have been finished.
 *
 * Leaving partway through does not count: the next sign-in opens the same
 * page again. Skipping a question is still an answer — only reaching the end
 * records the profile as finished.
 */
export function isProfileComplete(profile: Profile | null): boolean {
  return Boolean(profile?.profile_details_completed_at)
}

/** Remember the account's language, so every device starts in it. */
export async function savePreferredLocale(userId: string, locale: string): Promise<Profile> {
  const { data, error } = await (await getSupabase())
    .from('profiles')
    .update({ preferred_locale: locale })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
