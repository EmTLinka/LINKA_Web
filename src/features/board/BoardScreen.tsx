import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'

import LoadFailed from '@/components/ui/LoadFailed'
import { privateKey, useResource } from '@/data/store'
import { usePlaces } from '@/data/places'
import { useAuth } from '@/features/auth/useAuth'
import { useSignInToAct } from '@/features/auth/useSignInToAct'
import {
  addCommentPhoto,
  boardPhotoUrl,
  boardProblem,
  createComment,
  deleteComment,
  fetchComments,
  heartComment,
  removeCommentPhoto,
  unheartComment,
  updateComment,
  type BoardComment,
  type BoardPhoto,
} from '@/features/board/api'
import CommunityFrame from '@/features/community/components/CommunityFrame'
import { thumbPathOf, randomName } from '@/features/memories/photos'
import type { LocalizedPlace } from '@/features/places/localize'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/LocaleContext'
import type { Locale } from '@/lib/i18n/locale'
import { useMessages } from '@/lib/i18n/useMessages'

const MAX_PHOTOS = 4

type DraftPhoto = { key: string; file: File; src: string }

/**
 * /board — the Sado noticeboard.
 *
 * Notes are impressions of a place. They do not take replies. A heart is the
 * only response, photographs are optional, and only the author can revise or
 * remove what they wrote. Guests can read; writing and hearting ask for an account.
 */
export default function BoardScreen() {
  const copy = useMessages()
  const t = copy.board
  const { locale } = useLocale()
  const { user, loading } = useAuth()
  const signIn = useSignInToAct()
  const { index } = usePlaces()
  const places = useMemo(() => sadoPlaces(index?.all ?? [], index?.bySlug.get('sado')?.id ?? null), [index])
  const names = useMemo(() => new Map(places.map((place) => [place.id, place.name])), [places])

  const key = loading ? null : user ? privateKey(user.id, 'board:sado') : 'public:board:sado'
  const board = useResource(key, fetchComments)
  const comments = board.data

  const [query, setQuery] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState<BoardComment | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [hearting, setHearting] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [photo, setPhoto] = useState<{ src: string; label: string } | null>(null)
  const searchId = useId()
  const placeFilterId = useId()

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (comments ?? []).filter((comment) => {
      if (placeId && comment.place_id !== placeId) return false
      if (!q) return true
      return comment.body.toLowerCase().includes(q) || comment.author_name.toLowerCase().includes(q)
    })
  }, [comments, placeId, query])

  async function toggleHeart(comment: BoardComment) {
    if (!user) {
      signIn()
      return
    }
    setHearting(comment.id)
    setBanner(null)
    try {
      if (comment.hearted) await unheartComment(comment.id)
      else await heartComment(comment.id)
      board.reload()
    } catch (error) {
      setBanner(problemText(t, error))
    } finally {
      setHearting(null)
    }
  }

  async function remove(comment: BoardComment) {
    setDeleting(comment.id)
    setBanner(null)
    try {
      await deleteComment(comment.id, comment.photos.map((item) => item.storage_path))
      setConfirming(null)
      if (editing?.id === comment.id) setEditing(null)
      board.reload()
    } catch (error) {
      setBanner(problemText(t, error))
    } finally {
      setDeleting(null)
    }
  }

  const empty = comments !== undefined && shown.length === 0
  const emptyText = query.trim() ? t.emptySearch : placeId ? t.emptyPlace : t.empty

  return (
    <CommunityFrame back="/home?at=jp/sado" backLabel={copy.nav.map} nav="map">
      <header className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0">
          <h1 className="mt-1 text-[1.7rem] font-extralight tracking-[0.12em] text-graphite">{t.title}</h1>
          <p className="mt-2 text-[0.82rem] font-light leading-relaxed text-graphite-soft">{t.lead}</p>
        </div>
        {!writing && !editing && (
          <button
            type="button"
            aria-label={user ? t.write : t.writeSignIn}
            onClick={() => {
              if (!user) {
                signIn('/auth/signup')
                return
              }
              setBanner(null)
              setWriting(true)
            }}
            className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-[1.25rem] leading-none text-graphite outline-none focus-visible:ring-2 focus-visible:ring-graphite/40"
          >
            ＋
          </button>
        )}
      </header>

      <div className="sticky top-[env(safe-area-inset-top)] z-10 mt-4 bg-paper-lit/95 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <label htmlFor={searchId} className="sr-only">
            {t.searchLabel}
          </label>
          <input
            id={searchId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
            autoComplete="off"
            enterKeyHint="search"
            className={cn(fieldClass, 'min-w-0 flex-1 py-2.5')}
          />
          <div className="relative w-[42%] max-w-40 shrink-0">
            <label htmlFor={placeFilterId} className="sr-only">
              {t.placeLabel}
            </label>
            <select
              id={placeFilterId}
              value={placeId}
              onChange={(event) => setPlaceId(event.target.value)}
              className={cn(fieldClass, 'appearance-none py-2.5 pr-8')}
            >
              <option value="">{t.allPlaces}</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>
        {comments && (
          <p className="mt-2 text-[0.66rem] tracking-[0.08em] text-graphite-faint">{t.count(shown.length)}</p>
        )}
      </div>

      <div className="px-5">
        {banner && (
          <p role="status" className="mt-4 rounded-xl bg-[#fbf3de] px-4 py-3 text-[0.76rem] leading-relaxed text-graphite ring-1 ring-[#e8d49a]">
            {banner}
          </p>
        )}

        {board.error !== null && comments === undefined && (
          <LoadFailed onRetry={board.reload} />
        )}
        {comments === undefined && board.error === null && (
          <div className="mt-6 h-40 animate-pulse rounded-xl bg-graphite/[0.04] motion-reduce:animate-none" />
        )}
        {empty && <p className="mt-8 text-center text-[0.82rem] font-light leading-relaxed text-graphite-soft">{emptyText}</p>}

        <ol className="-mx-5 mt-4">
          {shown.map((comment) => (
              <li key={comment.id} className="border-b border-graphite/15 px-5 py-4 last:border-b-0">
                <article>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[0.84rem] text-graphite">{comment.author_name.trim() || t.traveller}</p>
                    <time dateTime={comment.created_at} className="shrink-0 text-[0.66rem] text-graphite-faint">
                      {formatWhen(comment.created_at, locale)}
                      {wasEdited(comment) && <span className="ml-1.5">{t.edited}</span>}
                    </time>
                  </div>
                  {names.get(comment.place_id) && (
                    <p className="mt-1 text-[0.66rem] tracking-[0.08em] text-graphite-soft">{names.get(comment.place_id)}</p>
                  )}
                  <p className="mt-3 whitespace-pre-wrap break-words text-[0.92rem] font-light leading-relaxed text-graphite">{comment.body}</p>
                  {comment.photos.length > 0 && (
                    <ul className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                      {comment.photos.map((item, index) => (
                        <li key={item.id} className="shrink-0">
                          <button
                            type="button"
                            onClick={() => setPhoto({ src: boardPhotoUrl(item.storage_path), label: copy.place.photoOf(index + 1, comment.photos.length) })}
                            aria-label={copy.place.viewPhoto}
                            className="block overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-graphite/40"
                          >
                            <PhotoThumb path={item.storage_path} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      aria-pressed={comment.hearted}
                      aria-label={comment.hearted ? t.hearted : t.heart}
                      disabled={hearting === comment.id}
                      onClick={() => void toggleHeart(comment)}
                      className="flex min-h-11 items-center gap-1.5 rounded-full px-1 text-[0.8rem] text-graphite outline-none focus-visible:ring-2 focus-visible:ring-graphite/30 disabled:opacity-50"
                    >
                      <Heart filled={comment.hearted} />
                      <span className="tabular-nums">{comment.heart_count}</span>
                    </button>
                    {user?.id === comment.user_id && confirming !== comment.id && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => { setWriting(false); setEditing(comment); setBanner(null) }} className="min-h-11 px-2 text-[0.72rem] text-graphite-soft underline decoration-graphite/25 underline-offset-4">
                          {t.edit}
                        </button>
                        <button type="button" onClick={() => setConfirming(comment.id)} className="min-h-11 px-2 text-[0.72rem] text-graphite-soft underline decoration-graphite/25 underline-offset-4">
                          {t.remove}
                        </button>
                      </div>
                    )}
                    {confirming === comment.id && (
                      <div className="flex items-center gap-2">
                        <p className="text-[0.68rem] text-graphite-soft">{t.confirmDelete}</p>
                        <button
                          type="button"
                          disabled={deleting === comment.id}
                          onClick={() => void remove(comment)}
                          className="min-h-11 px-2 text-[0.72rem] text-[#a0442c] underline underline-offset-4 disabled:opacity-50"
                        >
                          {deleting === comment.id ? t.deleting : t.remove}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="min-h-11 px-2 text-[0.72rem] text-graphite-soft">
                          {t.keep}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              </li>
          ))}
        </ol>
      </div>

      {(writing || editing) && (
        <CommentForm
          title={editing ? t.edit : t.write}
          commentId={editing?.id}
          places={places}
          initialPlaceId={editing?.place_id ?? (placeId || places[0]?.id || '')}
          initialBody={editing?.body ?? ''}
          existing={editing?.photos ?? []}
          submitLabel={editing ? t.save : t.post}
          onCancel={() => {
            setWriting(false)
            setEditing(null)
          }}
          onSaved={(notice) => {
            setWriting(false)
            setEditing(null)
            setBanner(notice)
            board.reload()
          }}
        />
      )}

      {photo && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-graphite/80 p-4" role="dialog" aria-modal="true" aria-label={photo.label}>
          <button type="button" onClick={() => setPhoto(null)} className="absolute inset-0" aria-label={t.closePhoto} />
          <img src={photo.src} alt="" className="relative max-h-[85dvh] max-w-full rounded-lg object-contain" />
          <button type="button" onClick={() => setPhoto(null)} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex size-11 items-center justify-center rounded-full bg-paper-lit text-graphite">
            <span aria-hidden>×</span>
            <span className="sr-only">{t.closePhoto}</span>
          </button>
        </div>
      )}
    </CommunityFrame>
  )
}

function CommentForm({
  title,
  commentId,
  places,
  initialPlaceId,
  initialBody = '',
  existing = [],
  submitLabel,
  onCancel,
  onSaved,
}: {
  title: string
  /** Set when this form revises a note that is already on the board. */
  commentId?: string
  places: readonly LocalizedPlace[]
  initialPlaceId: string
  initialBody?: string
  existing?: readonly BoardPhoto[]
  submitLabel: string
  onCancel: () => void
  /** A notice when the words were saved but a photograph was not. Null when everything saved. */
  onSaved: (notice: string | null) => void
}) {
  const t = useMessages().board
  const placeField = useId()
  const bodyField = useId()
  const library = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    bodyRef.current?.focus()
  }, [])
  const [placeId, setPlaceId] = useState(initialPlaceId)
  useEffect(() => {
    if (!placeId && initialPlaceId) setPlaceId(initialPlaceId)
  }, [placeId, initialPlaceId])
  const [body, setBody] = useState(initialBody)
  const [kept, setKept] = useState<BoardPhoto[]>([...existing])
  const [drafts, setDrafts] = useState<DraftPhoto[]>([])
  const [busy, setBusy] = useState<'idle' | 'saving' | 'uploading'>('idle')
  const [error, setError] = useState<string | null>(null)
  const draftsRef = useRef(drafts)
  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])
  useEffect(() => () => draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.src)), [])

  const room = MAX_PHOTOS - kept.length - drafts.length

  function addFiles(list: FileList | null) {
    const next = Array.from(list ?? []).slice(0, Math.max(0, room))
    if (library.current) library.current.value = ''
    if (next.length === 0) return
    setDrafts((current) => [
      ...current,
      ...next.map((file) => ({ key: randomName(), file, src: URL.createObjectURL(file) })),
    ])
  }

  function dropDraft(key: string) {
    setDrafts((current) => {
      const found = current.find((draft) => draft.key === key)
      if (found) URL.revokeObjectURL(found.src)
      return current.filter((draft) => draft.key !== key)
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!placeId || !text || busy !== 'idle') return
    setBusy('saving')
    setError(null)
    const removed = existing.filter((photo) => !kept.some((item) => item.id === photo.id))
    let id = commentId ?? ''
    try {
      if (commentId) await updateComment(commentId, placeId, text)
      else id = (await createComment(placeId, text)).id
      for (const photo of removed) await removeCommentPhoto(photo)
    } catch (cause) {
      setError(problemText(t, cause))
      setBusy('idle')
      return
    }

    if (drafts.length === 0) {
      onSaved(null)
      return
    }

    setBusy('uploading')
    let notice: string | null = null
    for (const [index, draft] of drafts.entries()) {
      try {
        await addCommentPhoto(id, draft.file, kept.length + index)
      } catch (cause) {
        const problem = boardProblem(cause)
        notice = problem === 'rate_limited' || problem === 'too_many_photos' ? problemText(t, cause) : t.photosPartial
        break
      }
    }
    onSaved(notice)
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper-lit" role="dialog" aria-modal="true" aria-label={title}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onCancel} disabled={busy !== 'idle'} className="min-h-11 justify-self-start px-3 text-[0.84rem] text-graphite-soft disabled:opacity-40">
          {t.cancel}
        </button>
        <h2 className="text-[0.84rem] tracking-[0.08em] text-graphite">{title}</h2>
        <span aria-hidden />
      </div>
      <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <label htmlFor={placeField} className="sr-only">
          {t.place}
        </label>
        <div className="relative">
          <select id={placeField} value={placeId} onChange={(event) => setPlaceId(event.target.value)} required className={cn(fieldClass, 'appearance-none py-2.5 pr-10')}>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
          <Chevron />
        </div>

        <label htmlFor={bodyField} className="sr-only">
          {t.body}
        </label>
        <textarea
          ref={bodyRef}
          id={bodyField}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          required
          placeholder={t.bodyPlaceholder}
          className="mt-4 min-h-40 w-full flex-1 resize-none bg-transparent text-[16px] font-light leading-relaxed text-graphite outline-none placeholder:text-graphite-faint"
        />

        {(kept.length > 0 || drafts.length > 0) && (
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {kept.map((item) => (
              <li key={item.id} className="relative shrink-0">
                <PhotoThumb path={item.storage_path} />
                <RemovePhoto label={t.removePhoto} onClick={() => setKept((current) => current.filter((photo) => photo.id !== item.id))} />
              </li>
            ))}
            {drafts.map((draft) => (
              <li key={draft.key} className="relative shrink-0">
                <img src={draft.src} alt="" className="h-24 w-24 rounded-lg object-cover" />
                <RemovePhoto label={t.removePhoto} onClick={() => dropDraft(draft.key)} />
              </li>
            ))}
          </ul>
        )}

        {room > 0 && (
          <div className="mt-2">
            <input ref={library} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} />
            <button type="button" onClick={() => library.current?.click()} className="min-h-11 text-[0.76rem] text-graphite underline decoration-graphite/25 underline-offset-4">
              {t.addPhoto}
            </button>
            <p className="text-[0.66rem] text-graphite-faint">{t.photoLimit}</p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[0.76rem] text-[#a0442c]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy !== 'idle' || !placeId || body.trim().length === 0}
          className="mt-auto flex min-h-12 w-full shrink-0 items-center justify-center rounded-full bg-graphite text-[0.86rem] text-paper-lit disabled:opacity-40"
        >
          {busy === 'idle' ? submitLabel : busy === 'uploading' ? t.uploading : t.posting}
        </button>
      </form>
    </div>
  )
}

function sadoPlaces(all: readonly LocalizedPlace[], regionId: string | null): LocalizedPlace[] {
  if (!regionId) return []
  const region = all.find((place) => place.id === regionId)
  const spots = all.filter((place) => place.parentId === regionId).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  return region ? [region, ...spots] : spots
}

function wasEdited(comment: BoardComment): boolean {
  return new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 2000
}

function formatWhen(iso: string, locale: Locale): string {
  const tag = locale === 'zh-Hans' ? 'zh-CN' : locale
  return new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

function problemText(t: ReturnType<typeof useMessages>['board'], error: unknown): string {
  const problem = boardProblem(error)
  if (problem === 'rate_limited') return t.rateLimited
  if (problem === 'too_many_photos') return t.tooManyPhotos
  if (problem === 'offline') return t.offline
  return t.failed
}

function PhotoThumb({ path }: { path: string }) {
  const [src, setSrc] = useState(() => boardPhotoUrl(thumbPathOf(path)))
  return (
    <img
      src={src}
      alt=""
      width={96}
      height={96}
      loading="lazy"
      decoding="async"
      className="h-24 w-24 rounded-lg object-cover"
      onError={() => {
        const full = boardPhotoUrl(path)
        if (src !== full) setSrc(full)
      }}
    />
  )
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 14 14" aria-hidden className={cn('size-4', filled ? 'text-[#a4543a]' : 'text-graphite-soft')}>
      <path
        d="M7 12.1 2.35 7.45a2.9 2.9 0 0 1 4.1-4.1L7 3.9l.55-.55a2.9 2.9 0 0 1 4.1 4.1Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 10 6" className="pointer-events-none absolute right-3.5 top-1/2 h-1.5 w-2.5 -translate-y-1/2 text-graphite-soft">
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function RemovePhoto({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-paper-lit/90 text-[0.8rem] text-graphite shadow-sm"
    >
      ×
    </button>
  )
}

const fieldClass =
  'block w-full rounded-xl bg-white/90 px-3.5 py-3 text-[16px] font-light text-graphite outline-none ring-1 ring-graphite/12 placeholder:text-graphite-faint focus:ring-graphite/35'
