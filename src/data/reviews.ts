import { fetchReviews } from '@/features/reviews/api'
import { useResource } from '@/data/store'

/**
 * Notes are read two ways. The shared screen asks for the newest across
 * every place. A profile asks for one place, a short page: four are shown
 * and `total` says how many more there are, so an older place is not crowded
 * out by notes written somewhere else.
 */
const KEY = 'public:reviews'
const TTL_MS = 30_000

/** Only real place ids are asked about. A non-uuid never reaches the database. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useReviews() {
  return useResource(KEY, () => fetchReviews(), TTL_MS)
}

export function usePlaceReviews(placeId: string | null, limit: number) {
  const real = placeId && UUID.test(placeId) ? placeId : null
  return useResource(real ? `${KEY}:${real}:${limit}` : null, () => fetchReviews({ placeId: real!, limit }), TTL_MS)
}

export const REVIEWS_KEY = KEY
