import { getSupabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

type Rpc = Database['public']['Functions']
export type PlaceReview = Rpc['place_review_feed']['Returns'][number]

const MAX = 400

/** Every public note, newest first. The nickname comes along; the author id does not. */
export async function fetchReviews(): Promise<PlaceReview[]> {
  const { data, error } = await (await getSupabase()).rpc('place_review_feed')
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
