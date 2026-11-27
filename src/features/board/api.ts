import { getSupabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { preparePhoto, randomName, thumbPathOf } from '@/features/memories/photos'

const BUCKET = 'board-photos'

export type BoardPhoto = {
  id: string
  storage_path: string
  width: number
  height: number
  position: number
}

export type BoardComment = {
  id: string
  user_id: string
  place_id: string
  body: string
  heart_count: number
  author_name: string
  created_at: string
  updated_at: string
  photos: BoardPhoto[]
  /** The signed-in reader has hearted this note. Always false for a guest. */
  hearted: boolean
}

type RawPhoto = BoardPhoto
type RawComment = Omit<BoardComment, 'photos' | 'hearted'> & {
  place_comment_photos: RawPhoto[] | null
  place_comment_hearts: { user_id: string }[] | null
}

const COMMENT_COLUMNS =
  'id, user_id, place_id, body, heart_count, author_name, created_at, updated_at, place_comment_photos!place_comment_photos_comment_id_fkey(id, storage_path, width, height, position), place_comment_hearts!place_comment_hearts_comment_id_fkey(user_id)'

function asComment(row: RawComment): BoardComment {
  const { place_comment_photos, place_comment_hearts, ...note } = row
  return {
    ...note,
    photos: [...(place_comment_photos ?? [])].sort((a, b) => a.position - b.position),
    hearted: (place_comment_hearts ?? []).length > 0,
  }
}

/** The latest notes on the board. Hearts embedded here are only the reader's. */
export async function fetchComments(): Promise<BoardComment[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('place_comments')
    .select(COMMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(400)
  if (error) throw error
  return ((data ?? []) as unknown as RawComment[]).map(asComment)
}

export async function createComment(placeId: string, body: string): Promise<BoardComment> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('place_comments')
    .insert({ place_id: placeId, body })
    .select(COMMENT_COLUMNS)
    .single()
  if (error) throw error
  return asComment(data as unknown as RawComment)
}

export async function updateComment(id: string, placeId: string, body: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.from('place_comments').update({ place_id: placeId, body }).eq('id', id)
  if (error) throw error
}

/** Removes the photographs first, while the note still proves who owns them. */
export async function deleteComment(id: string, paths: readonly string[]): Promise<void> {
  const supabase = await getSupabase()
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.flatMap((path) => [path, thumbPathOf(path)]))
    if (error) throw error
  }
  const { error } = await supabase.from('place_comments').delete().eq('id', id)
  if (error) throw error
}

export async function addCommentPhoto(commentId: string, file: File, position: number): Promise<BoardPhoto> {
  const supabase = await getSupabase()
  const { blob, width, height, thumb } = await preparePhoto(file)
  const path = `c/${commentId}/${randomName()}.jpg`

  const upload = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (upload.error) throw upload.error
  if (thumb) {
    await supabase.storage.from(BUCKET).upload(thumbPathOf(path), thumb, { contentType: 'image/jpeg', upsert: false }).catch(() => {})
  }

  const { data, error } = await supabase
    .from('place_comment_photos')
    .insert({ comment_id: commentId, storage_path: path, width, height, position })
    .select('id, storage_path, width, height, position')
    .single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([path, thumbPathOf(path)])
    throw error
  }
  return data
}

export async function removeCommentPhoto(photo: BoardPhoto): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.from('place_comment_photos').delete().eq('id', photo.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([photo.storage_path, thumbPathOf(photo.storage_path)]).catch(() => {})
}

export async function heartComment(id: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.from('place_comment_hearts').insert({ comment_id: id })
  if (error) throw error
}

export async function unheartComment(id: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.from('place_comment_hearts').delete().eq('comment_id', id)
  if (error) throw error
}

/** A public object in board-photos. Thumbnails sit beside the photograph. */
export function boardPhotoUrl(path: string): string {
  return `${env.supabaseUrl()}/storage/v1/object/public/board-photos/${path.split('/').map(encodeURIComponent).join('/')}`
}

export type BoardProblem = 'rate_limited' | 'too_many_photos' | 'offline' | 'unknown'

export function boardProblem(error: unknown): BoardProblem {
  const e = (error ?? {}) as { code?: string; message?: string; status?: number }
  if (e.code === 'PT429' || e.message === 'rate_limited' || e.status === 429) return 'rate_limited'
  if (e.message === 'too_many_photos') return 'too_many_photos'
  if (error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'offline'
  return 'unknown'
}
