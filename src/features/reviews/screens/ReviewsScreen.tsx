import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { REVIEWS_KEY, usePlaceReviews, useReviews } from '@/data/reviews'
import { invalidate } from '@/data/store'
import { usePlaces } from '@/data/places'
import { useAuth } from '@/features/auth/useAuth'
import { useSignInToAct } from '@/features/auth/useSignInToAct'
import { createReview, deleteReview, updateReview, type PlaceReview } from '@/features/reviews/api'
import LoadFailed from '@/components/ui/LoadFailed'
import AppShell from '@/layouts/AppShell'
import { worldHref, worldPathOf } from '@/features/world/geo/regions'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { formatCalendarDate } from '@/lib/i18n/locale'
import { useMessages } from '@/lib/i18n/useMessages'

/** A note that is not about one place. The composer uses this as its empty value. */
const OVERALL = ''

/**
 * The one place notes are written.
 *
 * Each profile card only reads its own. Here they are gathered, still
 * separated by the place they belong to. A note can also belong to no place.
 * The place this screen was opened from is read on its own, so its older
 * notes are not dropped because newer notes were written somewhere else.
 */
export default function ReviewsScreen() {
  const copy = useMessages()
  const { locale } = useLocale()
  const { session } = useAuth()
  const signIn = useSignInToAct()
  const { index } = usePlaces()
  const feed = useReviews()
  const [params] = useSearchParams()
  const focusId = params.get('place')
  const focusedPage = usePlaceReviews(focusId, 300)

  const places = useMemo(
    () => (index?.all ?? []).filter((place) => place.kind === 'destination').sort((a, b) => a.name.localeCompare(b.name, locale)),
    [index, locale],
  )
  const placeName = useMemo(() => new Map(places.map((place) => [place.id, place])), [places])

  // Only a published destination may be the composer's place. A region, an
  // unpublished place, or an unknown id is absent from the select, and
  // submitting it is refused. The index can arrive after the first paint, so
  // a real destination is filled in once, without disturbing a later choice.
  const composerPlace = focusId && placeName.has(focusId) ? focusId : OVERALL
  const [placeId, setPlaceId] = useState(composerPlace)
  const [trackedFocus, setTrackedFocus] = useState(focusId)
  const [placesReady, setPlacesReady] = useState(index !== null)
  if (focusId !== trackedFocus || (index !== null && !placesReady)) {
    setTrackedFocus(focusId)
    setPlacesReady(index !== null)
    setPlaceId(composerPlace)
  }

  const groups = useMemo(() => {
    const byPlace = new Map<string, PlaceReview[]>()
    for (const review of feed.data ?? []) {
      const id = review.place_id ?? OVERALL
      const list = byPlace.get(id) ?? []
      list.push(review)
      byPlace.set(id, list)
    }
    if (focusId && focusedPage.data) byPlace.set(focusId, focusedPage.data)
    const focused = focusId && focusId !== OVERALL && (placeName.has(focusId) || byPlace.has(focusId)) ? [focusId] : []
    const rest = [...byPlace.keys()].filter((id) => id !== OVERALL && id !== focusId)
    const showOverall = byPlace.has(OVERALL) || placeId === OVERALL
    const order = [...focused, ...(showOverall ? [OVERALL] : []), ...rest]
    return order.map((id) => ({ id, place: id ? (placeName.get(id) ?? null) : null, notes: byPlace.get(id) ?? [] }))
  }, [feed.data, focusId, focusedPage.data, placeId, placeName])

  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  async function publish(event: FormEvent) {
    event.preventDefault()
    if (!session) {
      signIn('/auth/signin')
      return
    }
    const body = text.trim()
    if (body.length < 1 || body.length > 400 || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await createReview(placeId || null, body)
      setText('')
      invalidate(REVIEWS_KEY)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(id: string) {
    const body = draft.trim()
    if (body.length < 1 || body.length > 400) return
    setSaving(true)
    setFailed(false)
    try {
      await updateReview(id, body)
      setEditing(null)
      invalidate(REVIEWS_KEY)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setSaving(true)
    setFailed(false)
    try {
      await deleteReview(id)
      setConfirming(null)
      invalidate(REVIEWS_KEY)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const returning = focusId ? (placeName.get(focusId) ?? null) : null

  return (
    <AppShell active="map">
      <div className="h-full overflow-y-auto overscroll-contain bg-paper-lit">
        <div className="mx-auto max-w-md px-5 pb-36 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <Link to={backHref(params.get('from'), returning)} className="inline-flex min-h-11 items-center text-[0.72rem] tracking-[0.08em] text-graphite-soft">
            ‹ {returning ? returning.name : copy.reviews.back}
          </Link>
          <h1 className="mt-2 text-[1.7rem] font-extralight tracking-[0.12em] text-graphite">{copy.reviews.title}</h1>

          <form onSubmit={publish} className="mt-6 rounded-2xl bg-white/70 p-4 ring-1 ring-graphite/[0.08]">
            <label className="block text-[0.58rem] uppercase tracking-[0.22em] text-graphite-soft" htmlFor="review-place">
              {copy.reviews.placeLabel}
            </label>
            <select
              id="review-place"
              value={placeId}
              onChange={(event) => setPlaceId(event.target.value)}
              className="mt-1.5 block min-h-11 w-full rounded-xl bg-paper-lit px-3 text-[0.86rem] normal-case tracking-normal text-graphite ring-1 ring-graphite/15 outline-none focus-visible:ring-graphite/40"
            >
              <option value={OVERALL}>{copy.reviews.overall}</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {placeOptionLabel(place)}
                </option>
              ))}
            </select>
            <label className="mt-4 block text-[0.58rem] uppercase tracking-[0.22em] text-graphite-soft" htmlFor="review-body">
              {copy.reviews.title}
            </label>
            <textarea
              id="review-body"
              value={text}
              maxLength={400}
              rows={4}
              placeholder={placeId ? copy.reviews.placeholder : copy.reviews.overallPlaceholder}
              onChange={(event) => setText(event.target.value)}
              className="mt-1.5 w-full resize-none rounded-xl bg-paper-lit px-3.5 py-3 text-[0.9rem] font-light leading-relaxed normal-case tracking-normal text-graphite ring-1 ring-graphite/15 outline-none placeholder:text-graphite-faint focus-visible:ring-graphite/40"
            />
            {session ? (
              <button
                type="submit"
                disabled={saving || text.trim().length < 1}
                className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-graphite px-5 text-[0.78rem] tracking-[0.06em] text-paper-lit outline-none focus-visible:ring-2 focus-visible:ring-graphite/40 disabled:opacity-40"
              >
                {saving ? copy.reviews.posting : copy.reviews.post}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => signIn('/auth/signin')}
                className="mt-3 flex min-h-11 items-center justify-center rounded-full bg-graphite px-5 text-[0.78rem] tracking-[0.06em] text-paper-lit"
              >
                {copy.reviews.signIn}
              </button>
            )}
            {failed && <p className="mt-2 text-[0.72rem] text-graphite-soft">{copy.reviews.failed}</p>}
          </form>

          {feed.error && !feed.data ? (
            <LoadFailed onRetry={feed.reload} />
          ) : (
            <div className="mt-8 space-y-8">
              {groups.length === 0 && feed.data && <p className="text-[0.8rem] font-light text-graphite-faint">{copy.reviews.empty}</p>}
              {groups.map((group) => (
                <section key={group.id || 'overall'} aria-label={group.place?.name ?? copy.reviews.overall}>
                  <h2 lang={group.place ? 'ja' : undefined} className="text-[1.05rem] font-light tracking-[0.08em] text-graphite">
                    {group.place?.name ?? copy.reviews.overall}
                  </h2>
                  {group.place?.nameLatin && (
                    <p className="mt-0.5 text-[0.6rem] uppercase tracking-[0.2em] text-graphite-soft">{group.place.nameLatin}</p>
                  )}
                  {group.notes.length === 0 ? (
                    <p className="mt-3 text-[0.76rem] font-light text-graphite-faint">{group.place ? copy.reviews.groupEmpty : copy.reviews.overallEmpty}</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-graphite/10 border-t border-graphite/10">
                      {group.notes.map((review) => (
                        <li key={review.id} className="py-3">
                          {editing === review.id ? (
                            <div>
                              <textarea
                                value={draft}
                                maxLength={400}
                                rows={3}
                                onChange={(event) => setDraft(event.target.value)}
                                className="w-full resize-none rounded-xl bg-white/70 px-3.5 py-3 text-[0.9rem] font-light leading-relaxed text-graphite ring-1 ring-graphite/15 outline-none focus-visible:ring-graphite/40"
                              />
                              <div className="mt-2 flex gap-3">
                                <button type="button" onClick={() => saveEdit(review.id)} disabled={saving || draft.trim().length < 1} className="min-h-9 text-[0.74rem] text-graphite underline decoration-graphite/30 underline-offset-4 disabled:opacity-40">
                                  {copy.reviews.save}
                                </button>
                                <button type="button" onClick={() => setEditing(null)} className="min-h-9 text-[0.74rem] text-graphite-soft">
                                  {copy.reviews.cancel}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-[0.9rem] font-light leading-relaxed text-graphite">{review.body}</p>
                              <p className="mt-1.5 text-[0.62rem] tracking-[0.04em] text-graphite-soft">
                                {review.author_name || copy.reviews.traveller}
                                <span className="mx-1.5 text-graphite-faint">·</span>
                                <time dateTime={review.created_at}>{formatCalendarDate(review.created_at, locale)}</time>
                              </p>
                              {review.mine && confirming !== review.id && (
                                <div className="mt-1 flex gap-4">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditing(review.id)
                                      setDraft(review.body)
                                      setConfirming(null)
                                    }}
                                    className="min-h-9 text-[0.7rem] text-graphite-soft"
                                  >
                                    {copy.reviews.edit}
                                  </button>
                                  <button type="button" onClick={() => setConfirming(review.id)} className="min-h-9 text-[0.7rem] text-graphite-soft">
                                    {copy.reviews.remove}
                                  </button>
                                </div>
                              )}
                              {confirming === review.id && (
                                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                                  <p className="text-[0.72rem] text-graphite-soft">{copy.reviews.confirmRemove}</p>
                                  <button type="button" onClick={() => remove(review.id)} disabled={saving} className="min-h-9 text-[0.74rem] text-graphite underline decoration-graphite/30 underline-offset-4">
                                    {copy.reviews.remove}
                                  </button>
                                  <button type="button" onClick={() => setConfirming(null)} className="min-h-9 text-[0.74rem] text-graphite-soft">
                                    {copy.reviews.cancel}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

/** Back to the profile that opened this screen, never an address outside LINKA. */
function backHref(from: string | null, place: { slug: string; lat: number; lng: number } | null): string {
  if (from && isProfilePath(from)) return from
  if (place) return worldHref(worldPathOf(place), place.slug)
  return '/home'
}

/** トキの森公園（Toki no Mori Kōen）— the romanization stored with the place. */
function placeOptionLabel(place: { name: string; romanizedName: string | null }): string {
  const romaji = place.romanizedName?.trim()
  if (!romaji || romaji === place.name) return place.name
  return `${place.name}（${romaji}）`
}

function isProfilePath(from: string): boolean {
  if (!from.startsWith('/') || from.startsWith('//') || from.includes('\\') || from.includes('://')) return false
  const path = from.split('?')[0]
  return path === '/home' || path.startsWith('/place/') || path.startsWith('/t/')
}
