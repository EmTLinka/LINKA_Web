import { fetchReviews } from '@/features/reviews/api'
import { useResource } from '@/data/store'

/** One feed for every profile card and the shared writing screen. */
const KEY = 'public:reviews'
const TTL_MS = 30_000

export function useReviews() {
  return useResource(KEY, fetchReviews, TTL_MS)
}

export const REVIEWS_KEY = KEY
