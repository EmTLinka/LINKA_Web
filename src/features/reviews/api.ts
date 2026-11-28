import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

type Rpc = Database['public']['Functions']
export type PlaceReview = Rpc['place_review_feed']['Returns'][number]

const MAX = 400

export type ReviewQuery = {
  /** One place. Omit to read across every place. */
  placeId?: string
  /** Only notes strictly older than this instant. */
  before?: string
  /** At most this many. The database caps a page at 300. */
  limit?: number
}

/**
 * Public notes, newest first. The nickname comes along; the author id does not.
 * A place page also carries `total`, how many notes that place has.
 */
export async function fetchReviews(query: ReviewQuery = {}): Promise<PlaceReview[]> {
  const args: Database['public']['Functions']['place_review_feed']['Args'] = {}
  if (query.placeId) args.p_place_id = query.placeId
  if (query.before) args.p_before = query.before
  if (query.limit) args.p_limit = query.limit
  const { data, error } = await (await getSupabase()).rpc('place_review_feed', args)
  if (error) throw error
  return data
}

export async function createReview(placeId: string | null, body: string): Promise<void> {
  const { error } = await (await getSupabase()).from('place_reviews').insert({ place_id: placeId, body: clean(body) })
  if (error) throw error
}

export async function updateReview(id: string, body: string): Promise<void> {
  const { error } = await (await getSupabase()).from('place_reviews').update({ body: clean(body) }).eq('id', id)
  if (error) throw error
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await (await getSupabase()).from('place_reviews').delete().eq('id', id)
  if (error) throw error
}

function clean(body: string): string {
  const text = body.trim()
  if (text.length < 1 || text.length > MAX) throw new Error('review length')
  return text
}
