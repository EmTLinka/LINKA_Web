import { Link, useLocation } from 'react-router-dom'

import { usePlaceReviews } from '@/data/reviews'
import { usePlaces } from '@/data/places'
import { worldPathOf } from '@/features/world/geo/regions'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { formatCalendarDate } from '@/lib/i18n/locale'
import { useMessages } from '@/lib/i18n/useMessages'

const ON_CARD = 4

/**
 * The notes on one place's profile. Reading only: writing happens on the
 * shared screen, where every place's notes are gathered.
 *
 * The card shows four. The page is five rows, and `total` is how many that
 * place has, which is what "ほかN件" counts.
 */
export default function PlaceReviews({ placeId }: { placeId: string }) {
  const copy = useMessages()
  const { locale } = useLocale()
  const { pathname, search } = useLocation()
  const { index } = usePlaces()
  const feed = usePlaceReviews(placeId, ON_CARD + 1)
  const writeTo = reviewHref(placeId, index?.byId.get(placeId) ?? null, pathname, search)
  const notes = feed.data ?? []
  const shown = notes.slice(0, ON_CARD)
  const rest = Math.max(0, (notes[0]?.total ?? notes.length) - shown.length)

  return (
    <section className="mt-8 border-t border-graphite/15 pt-5" aria-label={copy.reviews.title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[1.15rem] font-medium tracking-[0.08em] text-graphite">{copy.reviews.title}</h3>
        <Link
          to={writeTo}
          className="inline-flex min-h-11 items-center rounded-full bg-graphite px-4 text-[0.86rem] tracking-[0.04em] text-paper-lit outline-none focus-visible:ring-2 focus-visible:ring-graphite/40"
        >
          {copy.reviews.write}
        </Link>
      </div>

      {feed.error ? (
        <button type="button" onClick={feed.reload} className="min-h-9 text-[0.72rem] text-graphite-soft underline decoration-graphite/25 underline-offset-4">
          {copy.loadFailed} {copy.retry}
        </button>
      ) : feed.data ? (
        shown.length === 0 ? (
          <p className="text-[0.76rem] font-light text-graphite-faint">{copy.reviews.empty}</p>
        ) : (
          <ul className="divide-y divide-graphite/10">
            {shown.map((review) => (
              <li key={review.id} className="py-2.5">
                <p className="text-[0.84rem] font-light leading-relaxed text-graphite">{review.body}</p>
                <p className="mt-1 text-[0.62rem] tracking-[0.04em] text-graphite-soft">
                  {review.author_name || copy.reviews.traveller}
                  <span className="mx-1.5 text-graphite-faint">·</span>
                  <time dateTime={review.created_at}>{formatCalendarDate(review.created_at, locale)}</time>
                </p>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div aria-hidden className="h-8 animate-pulse rounded bg-graphite/[0.05]" />
      )}

      {rest > 0 && (
        <Link to={writeTo} className="mt-1 inline-flex min-h-9 items-center text-[0.72rem] text-graphite-soft">
          {copy.reviews.more(rest)}
        </Link>
      )}
    </section>
  )
}

/** Where 記入する returns to: this profile, on the page or the map the person left. */
function reviewHref(
  placeId: string,
  place: { slug: string; lat: number; lng: number } | null,
  pathname: string,
  search: string,
): string {
  const params = new URLSearchParams()
  params.set('place', placeId)
  params.set('from', profileReturn(place, pathname, search))
  return `/reviews?${params}`
}

function profileReturn(
  place: { slug: string; lat: number; lng: number } | null,
  pathname: string,
  search: string,
): string {
  if (pathname === '/home') {
    const current = new URLSearchParams(search)
    if (place) {
      const path = worldPathOf(place)
      if (path.length > 0) current.set('at', path.join('/'))
      current.set('place', place.slug)
    }
    const query = current.toString().replace(/%2F/g, '/')
    return query ? `/home?${query}` : '/home'
  }
  return `${pathname}${search}`
}
