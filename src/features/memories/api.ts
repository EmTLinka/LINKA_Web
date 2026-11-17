import { onPrivateReset } from '@/data/store'
import { preparePhoto, randomName, thumbPathOf } from '@/features/memories/photos'
import type { Mood } from '@/lib/i18n/journeyMessages'
import { getSupabase } from '@/lib/supabase'
import type { Tables, TablesUpdate } from '@/types/database.types'

/**
 * A person's own memories: the note, the mood and the photographs of a visit.
 *
 * A memory is private unless its author marks it public. RLS lets a user read
 * and write only their own rows. Anyone may read the photographs of a public
 * memory — not its note, mood, dates, author or visit — and sign a URL for
 * one of those photographs. Every other object in `memory-photos` stays in
 * that user's folder.
 */

export type MemoryPhotoRow = Pick<Tables<'memory_photos'>, 'id' | 'storage_path' | 'width' | 'height' | 'position'>

/**
 * A memory is one of two kinds, never confused:
 *
 *   visit — the memory of a verified Visit (one per visit; the database
 *           enforces it). Its date is the visit's local date.
 *   past  — a journal entry: a place and a time the person records
 *           themselves, with no visit. It can never colour the map, count as
 *           a verified place or reach analytics — the database gives it no
 *           visit and no way to gain one (`kind` is not updatable).
 *
 * `touch_event_id` is only set on memories created before visits existed; it
 * stays readable, but nothing new is keyed by it.
 */
export type MemoryRecord = Pick<
  Tables<'memories'>,
  | 'id'
  | 'note'
  | 'place_id'
  | 'visit_id'
  | 'touch_event_id'
  | 'cover_photo_id'
  | 'created_at'
  | 'updated_at'
  | 'kind'
  | 'place_label'
  | 'remembered_on'
  | 'date_precision'
  | 'visibility'
> & {
  /** Present once the mood migration is applied. */
  mood?: Mood | null
  memory_photos: MemoryPhotoRow[]
}

/**
 * `memories` and `memory_photos` are joined by two foreign keys (a photo's
 * memory_id, and a memory's cover_photo_id), so the embed must name which one
 * it means. Left bare, PostgREST refuses the whole request (PGRST201) — which
 * silently broke saving memories, uploading photos and Moments.
 */
const MEMORY_COLUMNS = '*, memory_photos!memory_photos_memory_id_fkey(id, storage_path, width, height, position)'

export async function fetchMyMemories(): Promise<MemoryRecord[]> {
  const { data, error } = await (await getSupabase())
    .from('memories')
    .select(MEMORY_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as MemoryRecord[]
}

/** Photographs a memory's author offered to a place. The words stay with the author. */
export type PublicMemory = {
  id: string
  memory_photos: MemoryPhotoRow[]
}

/**
 * Photographs of one place that their authors marked public, oldest memory first.
 * Private memories are not in this result — the database refuses them. The note
 * is not part of this read.
 */
export async function fetchPublicMemories(placeId: string): Promise<PublicMemory[]> {
  const supabase = await getSupabase()
  const shared = await supabase.rpc('shared_memory_photos', { p_place_id: placeId })
  if (!shared.error) return groupSharedPhotos(shared.data ?? [])
  // The photograph-only function is not on this database yet. Read the pictures
  // without the note; the place's own photograph does not come from here.
  const { data, error } = await supabase
    .from('memories')
    .select('id, memory_photos!memory_photos_memory_id_fkey(id, storage_path, width, height, position)')
    .eq('place_id', placeId)
    .eq('visibility', 'public')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).flatMap((memory) => {
    const photos = [...(memory.memory_photos ?? [])].sort((a, b) => a.position - b.position)
    return photos.length > 0 ? [{ id: memory.id, memory_photos: photos }] : []
  })
}

function groupSharedPhotos(
  photos: { id: string; memory_id: string; storage_path: string; width: number; height: number; position: number }[],
): PublicMemory[] {
  const memories: PublicMemory[] = []
  for (const photo of photos) {
    const row: MemoryPhotoRow = {
      id: photo.id,
      storage_path: photo.storage_path,
      width: photo.width,
      height: photo.height,
      position: photo.position,
    }
    const last = memories[memories.length - 1]
    if (last?.id === photo.memory_id) last.memory_photos.push(row)
    else memories.push({ id: photo.memory_id, memory_photos: [row] })
  }
  return memories
}

export async function fetchMemoryForVisit(visitId: string): Promise<MemoryRecord | null> {
  const { data, error } = await (await getSupabase())
    .from('memories')
    .select(MEMORY_COLUMNS)
    .eq('visit_id', visitId)
    .maybeSingle()
  if (error) throw error
  return data as unknown as MemoryRecord | null
}

/** The insert lost to a memory that already exists for this visit (`memories_visit_id_key`). */
function isVisitAlreadyRemembered(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && error.code === '23505' && error.message?.includes('memories_visit_id_key'))
}

/** The server does not have the mood column yet (its migration is pending). */
function isMissingMoodColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === 'PGRST204' || error.code === '42703') && error.message?.includes('mood'))
}

/**
 * The server still only allows `private`, or the client may not write
 * `visibility` yet. The note is saved without it; the caller is told.
 */
function isVisibilityRejected(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return (
    (error.code === '23514' && message.includes('visibility')) ||
    error.code === '42501' ||
    ((error.code === 'PGRST204' || error.code === '42703') && message.includes('visibility'))
  )
}

/**
 * `recovered`: the caller did not know this visit already had a memory, so
 * the one that existed was updated instead — and it may hold words or a mood
 * the caller has not shown yet.
 */
export type SavedMemory = { memory: MemoryRecord; moodSkipped: boolean; shareSkipped: boolean; recovered: boolean }

export type MemoryVisibility = 'private' | 'public'

/** The visit a memory belongs to: `record_touch()`'s `visit_id` and `place_id`. */
export type VisitRef = { visitId: string; placeId: string }

/**
 * Create or update the memory of one visit. Empty fields stay empty: nothing
 * is filled in on the user's behalf.
 *
 * A visit has at most one memory. If the caller did not know one already
 * existed — a second tab, a save racing the initial load, a photo and a save
 * at once — the insert is refused by the database and the existing memory is
 * updated instead, so a visit never gains a second memory. That update only
 * adds what the caller supplied: an empty note or no mood keeps what is there.
 *
 * If the server cannot store a mood yet, the note and photos are still saved
 * and the caller is told (`moodSkipped`) so it can say so — never silently.
 * A rejected visibility write is retried without that column, which leaves the
 * stored value. `shareSkipped` is true when that value is not the one asked for,
 * including a public memory that could not be made private.
 */
export async function saveMemory(
  existing: MemoryRecord | null,
  visit: VisitRef,
  input: { note: string; mood: Mood | null; visibility?: MemoryVisibility },
): Promise<SavedMemory> {
  const supabase = await getSupabase()
  let target = existing
  let fields = input
  const write = (withMood: boolean, withVisibility: boolean) => {
    const values: { note: string | null; mood?: Mood | null; visibility?: MemoryVisibility } = {
      note: fields.note.trim() || null,
    }
    if (withMood && (fields.mood || target?.mood)) values.mood = fields.mood
    // Omitted, the column keeps its default (`private`) or the value already stored.
    if (withVisibility && fields.visibility) values.visibility = fields.visibility
    // `mood` joins the generated types once its migration is applied.
    const row = values as TablesUpdate<'memories'>
    const query = target
      ? supabase.from('memories').update(row).eq('id', target.id)
      : supabase.from('memories').insert({ ...row, visit_id: visit.visitId, place_id: visit.placeId })
    return query.select(MEMORY_COLUMNS).single()
  }

  let { data, error } = await write(true, true)
  let recovered = false
  if (!target && isVisitAlreadyRemembered(error)) {
    target = await fetchMemoryForVisit(visit.visitId)
    if (target) {
      recovered = true
      fields = {
        note: input.note.trim() ? input.note : (target.note ?? ''),
        mood: input.mood ?? target.mood ?? null,
        visibility: input.visibility ?? (target.visibility === 'public' ? 'public' : undefined),
      }
      ;({ data, error } = await write(true, true))
    }
  }
  let moodSkipped = false
  if (isMissingMoodColumn(error) && fields.mood) {
    ;({ data, error } = await write(false, true))
    moodSkipped = true
  }
  let shareSkipped = false
  if (isVisibilityRejected(error) && fields.visibility) {
    ;({ data, error } = await write(!moodSkipped, false))
    // Omitting the column keeps the stored value. A new row defaults to private;
    // an existing public row stays public. Either can differ from what was asked.
    shareSkipped = !error && (data as { visibility?: string } | null)?.visibility !== fields.visibility
  }
  if (error) throw error
  return { memory: data as unknown as MemoryRecord, moodSkipped, shareSkipped, recovered }
}

const BUCKET = 'memory-photos'

/**
 * Upload one photo and attach it to the memory: the photo (EXIF stripped on
 * this device) and, next to it, a thumbnail for lists and the map. Becomes
 * the cover if the memory has none.
 *
 * The object key is `m/<memory id>/<file>`. It is not the author's account
 * id: a public place is given this key, and the same author at two places
 * must not be recognisable from it. Older photographs keep a key that starts
 * with the account id; those stay on the author's own row and are not offered
 * to the place.
 */
export async function addMemoryPhoto(
  memory: MemoryRecord,
  file: File,
  position = memory.memory_photos.length,
): Promise<MemoryPhotoRow> {
  const supabase = await getSupabase()
  const { blob, width, height, thumb } = await preparePhoto(file)
  const path = `m/${memory.id}/${randomName()}.jpg`

  const upload = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (upload.error) throw upload.error
  // The thumbnail is a convenience: without it, lists show the photo itself.
  if (thumb) await supabase.storage.from(BUCKET).upload(thumbPathOf(path), thumb, { contentType: 'image/jpeg', upsert: false }).catch(() => {})

  const { data, error } = await supabase
    .from('memory_photos')
    .insert({ memory_id: memory.id, storage_path: path, width, height, position })
    .select('id, storage_path, width, height, position')
    .single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([path, thumbPathOf(path)])
    throw error
  }

  if (!memory.cover_photo_id) {
    await supabase.from('memories').update({ cover_photo_id: data.id }).eq('id', memory.id)
  }
  return data
}

export async function removeMemoryPhoto(photo: MemoryPhotoRow): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.from('memory_photos').delete().eq('id', photo.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([photo.storage_path, thumbPathOf(photo.storage_path)])
}

/** The photo shown first, in lists and on the map. */
export async function setCover(memory: MemoryRecord, photoId: string): Promise<void> {
  const { error } = await (await getSupabase()).from('memories').update({ cover_photo_id: photoId }).eq('id', memory.id)
  if (error) throw error
}

/** The order photos are shown in (`position` is the only photo field a user may change, with alt). */
export async function reorderPhotos(photos: readonly MemoryPhotoRow[]): Promise<void> {
  const supabase = await getSupabase()
  const moved = photos.map((photo, position) => ({ photo, position })).filter(({ photo, position }) => photo.position !== position)
  const results = await Promise.all(moved.map(({ photo, position }) => supabase.from('memory_photos').update({ position }).eq('id', photo.id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

export type PastMemoryInput = {
  /** A published LINKA place, or null with the person's own words in `placeLabel`. */
  placeId: string | null
  placeLabel: string | null
  /** YYYY-MM-DD; a month or year is stored as its first day, with its precision. */
  rememberedOn: string | null
  precision: 'day' | 'month' | 'year'
  note: string
  mood: Mood | null
  /** Offered to the place profile. Only meaningful when `placeId` is a LINKA place. */
  visibility?: MemoryVisibility
}

/**
 * Create or update a past journal entry. It is written with `kind = 'past'`
 * and no visit — the one shape the database accepts for it — so it can
 * never become verified presence.
 */
export async function savePastMemory(existing: MemoryRecord | null, input: PastMemoryInput): Promise<MemoryRecord> {
  const supabase = await getSupabase()
  const write = (withVisibility: boolean) => {
    const fields: {
      place_id: string | null
      place_label: string | null
      remembered_on: string | null
      date_precision: PastMemoryInput['precision']
      note: string | null
      mood: Mood | null
      visibility?: MemoryVisibility
    } = {
      place_id: input.placeId,
      place_label: input.placeId ? null : input.placeLabel?.trim() || null,
      remembered_on: input.rememberedOn,
      date_precision: input.precision,
      note: input.note.trim() || null,
      mood: input.mood,
    }
    // No LINKA place means there is no profile to offer it to.
    if (withVisibility) fields.visibility = input.placeId ? (input.visibility ?? 'private') : 'private'
    const query = existing
      ? supabase.from('memories').update(fields).eq('id', existing.id)
      : supabase.from('memories').insert({ ...fields, kind: 'past' })
    return query.select(MEMORY_COLUMNS).single()
  }
  let { data, error } = await write(true)
  // A rejected visibility write is omitted, so the stored value remains.
  if (isVisibilityRejected(error)) ({ data, error } = await write(false))
  if (error) throw error
  const saved = data as unknown as MemoryRecord
  // No LINKA place has no profile to offer the photographs to.
  const wanted: MemoryVisibility = input.placeId ? (input.visibility ?? 'private') : 'private'
  if (saved.visibility === wanted) return saved
  // The combined write can drop `visibility` (the column was not granted on
  // that statement) and still save the entry. A visit memory sets it with its
  // own update, which is what makes those photographs appear on the place.
  // Do the same here, so a journal entry asked to be public actually is.
  const fixed = await setMemoryVisibility(saved.id, wanted)
  return fixed ?? saved
}

/**
 * Set only whether this memory's photographs are offered to its place.
 * Returns null when the database refuses the column, leaving the stored value.
 */
export async function setMemoryVisibility(id: string, visibility: MemoryVisibility): Promise<MemoryRecord | null> {
  const { data, error } = await (await getSupabase())
    .from('memories')
    .update({ visibility })
    .eq('id', id)
    .select(MEMORY_COLUMNS)
    .single()
  if (error || !data) return null
  return data as unknown as MemoryRecord
}

/**
 * Delete a past journal entry and its photos. (A verified visit's memory is
 * not deleted from the app: the visit stays, and its words can be cleared.)
 */
export async function deletePastMemory(memory: MemoryRecord): Promise<void> {
  if (memory.kind !== 'past') throw new Error('Only a journal entry can be deleted.')
  const supabase = await getSupabase()
  const paths = memory.memory_photos.flatMap((p) => [p.storage_path, thumbPathOf(p.storage_path)])
  const { error } = await supabase.from('memories').delete().eq('id', memory.id)
  if (error) throw error
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths).catch(() => {})
}

const signed = new Map<string, { url: string; expires: number }>()
const SIGNED_SECONDS = 60 * 60
// Signed URLs are private data too: dropped with the rest when the account changes.
onPrivateReset(() => signed.clear())

/** Short-lived URLs for private photos, reused until shortly before they expire. */
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const missing = paths.filter((path) => (signed.get(path)?.expires ?? 0) < now + 60_000)
  if (missing.length > 0) {
    const { data, error } = await (await getSupabase()).storage.from(BUCKET).createSignedUrls(missing, SIGNED_SECONDS)
    if (error) throw error
    for (const item of data) {
      if (item.path && item.signedUrl) signed.set(item.path, { url: item.signedUrl, expires: now + SIGNED_SECONDS * 1000 })
    }
  }
  return Object.fromEntries(paths.flatMap((path) => (signed.has(path) ? [[path, signed.get(path)!.url]] : [])))
}
