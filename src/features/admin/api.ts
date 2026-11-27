import { env } from '@/lib/env'

import type { FetchedPlace } from '@/features/admin/placeForm'

export type PlaceCandidate = {
  googlePlaceId: string | null
  place: FetchedPlace
}

type LookupPayload = {
  candidates?: PlaceCandidate[]
  candidate?: PlaceCandidate
  error?: string
  message?: string
}

export type CreatedPlace = {
  place?: { id?: string; slug?: string; status?: string }
  touchpoint?: { id?: string; public_id?: string; path?: string } | null
  error?: string
  message?: string
}

function failureMessage(payload: { error?: string; message?: string } | null, status: number): string {
  return payload?.error || payload?.message || `request_failed (${status})`
}

/** POST /functions/v1/admin-places as the signed-in admin. */
export async function postAdminPlaces(accessToken: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${env.supabaseUrl()}/functions/v1/admin-places`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: env.supabasePublishableKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null
  if (!response.ok) {
    throw new Error(failureMessage(payload, response.status))
  }
  return payload
}

export async function lookupPlaces(accessToken: string, query: string): Promise<PlaceCandidate[]> {
  const payload = (await postAdminPlaces(accessToken, { action: 'lookup', query })) as LookupPayload | null
  if (payload?.candidate) return [payload.candidate]
  return payload?.candidates ?? []
}

export async function createPlace(accessToken: string, place: Record<string, unknown>): Promise<CreatedPlace> {
  return (await postAdminPlaces(accessToken, { action: 'create', place })) as CreatedPlace
}
