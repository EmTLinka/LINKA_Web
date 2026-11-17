import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type TransitionEvent } from 'react'

import PhotoViewer from '@/features/memories/PhotoViewer'
import PlaceHero from '@/features/places/components/PlaceHero'
import type { Hero } from '@/features/places/localize'
import { fetchPublicMemories, signedPhotoUrls, type PublicMemory } from '@/features/memories/api'
import { cn } from '@/lib/cn'
import { useMessages } from '@/lib/i18n/useMessages'

type Slide = { key: string; kind: 'hero' } | { key: string; kind: 'photo'; path: string; width: number; height: number }

type View = { key: string; src: string; width: number; height: number; alt: string }

type Drag = { id: number; x: number; y: number; at: number; axis: 'x' | 'y' | null }

/**
 * The place's own photograph, then every memory its author marked public.
 * The photographs sit in from the edges. With more than one, a finger drag
 * moves to the next. A click — or Enter on the photograph — opens it full
 * screen, and there the left and right arrow keys move between photographs.
 * A private memory never arrives here.
 */
export default function PlaceGallery({
  placeId,
  hero,
  priority,
  tabIndex,
  overlay = null,
}: {
  placeId: string
  hero: Hero | null
  priority: boolean
  tabIndex: number
  /** The place's name and introduction, drawn on the photograph. */
  overlay?: ReactNode
}) {
  const copy = useMessages()
  const [memories, setMemories] = useState<PublicMemory[] | null>(null)
  /** Frame index. With several slides, 0 and the last frame are clones used only to wrap. */
  const [pos, setPos] = useState(0)
  /** False for the instant reset after the track has slid onto a cloned slide. */
  const [sliding, setSliding] = useState(true)
  const [dragX, setDragX] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [viewingKey, setViewingKey] = useState<string | null>(null)
  const drag = useRef<Drag | null>(null)
  const dragged = useRef(false)
  const viewport = useRef<HTMLDivElement>(null)
  const openButton = useRef<HTMLButtonElement>(null)
  /** Return focus to the photograph after the full-screen view closes. */
  const returnFocus = useRef(false)

  useEffect(() => {
    if (sliding) return
    const id = requestAnimationFrame(() => setSliding(true))
    return () => cancelAnimationFrame(id)
  }, [sliding])

  useEffect(() => {
    let active = true
    fetchPublicMemories(placeId).then(
      (rows) => active && setMemories(rows),
      () => active && setMemories([]),
    )
    return () => {
      active = false
    }
  }, [placeId])

  const slides = slidesOf(hero, memories)
  const count = slides.length
  const frames = framesOf(slides)
  const paths = slides.flatMap((slide) => (slide.kind === 'photo' ? [slide.path] : [])).join('|')
  const [scope, setScope] = useState({ placeId, count })
  if (scope.placeId !== placeId || scope.count !== count) {
    if (scope.placeId !== placeId) setViewingKey(null)
    setScope({ placeId, count })
    setPos(count > 1 ? 1 : 0)
    setSliding(true)
    setDragX(0)
  }

  useEffect(() => {
    if (!paths) return
    let active = true
    signedPhotoUrls(paths.split('|')).then(
      (next) => active && setUrls((prev) => ({ ...prev, ...next })),
      () => {},
    )
    return () => {
      active = false
    }
  }, [paths])

  const views = viewsOf(slides, hero, urls, copy.place.memoryPhoto)
  const viewingAt = views.findIndex((view) => view.key === viewingKey)
  const viewing = viewingAt >= 0 ? views[viewingAt] : null

  useEffect(() => {
    if (viewingKey !== null || !returnFocus.current) return
    returnFocus.current = false
    openButton.current?.focus()
  }, [viewingKey])

  if (count === 0) return overlay ? <div className="px-5 pt-5">{overlay}</div> : null
  const dragging = drag.current !== null && dragX !== 0

  function go(dir: -1 | 1) {
    if (count < 2 || !sliding) return
    setPos((current) => Math.min(count + 1, Math.max(0, current + dir)))
  }

  function settled(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform' || count < 2) return
    if (pos === 0) {
      setSliding(false)
      setPos(count)
      return
    }
    if (pos === count + 1) {
      setSliding(false)
      setPos(1)
    }
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    dragged.current = false
    if (count < 2 || event.button !== 0) return
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, axis: null }
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (current.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (current.axis === 'y') {
        dragged.current = true
        drag.current = null
        return
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      dragged.current = true
    }
    setDragX(dx)
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    const dx = current.axis === 'x' ? event.clientX - current.x : 0
    const width = viewport.current?.clientWidth ?? 1
    const flicked = Math.abs(dx) / Math.max(event.timeStamp - current.at, 1) > 0.45
    drag.current = null
    setDragX(0)
    if (current.axis !== 'x') return
    if (dx < 0 && (dx < -width * 0.16 || flicked)) go(1)
    else if (dx > 0 && (dx > width * 0.16 || flicked)) go(-1)
  }

  function swallowClick(event: MouseEvent<HTMLDivElement>) {
    if (!dragged.current) return
    dragged.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  function openView(key: string) {
    returnFocus.current = true
    setViewingKey(key)
  }

  function openFromClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Element) || target.closest('a, button')) return
    const slide = slides[slideAt(pos, count)]
    if (slide && views.some((view) => view.key === slide.key)) openView(slide.key)
  }

  return (
    <>
      <div
        ref={viewport}
        className="relative mx-5 mt-4 grid cursor-zoom-in overflow-hidden rounded-2xl bg-[#e9e4da]"
        style={{ touchAction: count > 1 ? 'pan-y' : undefined }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onClickCapture={swallowClick}
        onClick={openFromClick}
      >
      <div className="relative col-start-1 row-start-1">
        <div className="aspect-[16/10] w-full" />
        <div className="absolute inset-0 overflow-hidden">
          <div
            className={cn(
              'flex h-full',
              sliding && !dragging && 'transition-transform duration-[520ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]',
            )}
            style={{ transform: `translate3d(calc(${-pos * 100}% + ${dragX}px), 0, 0)` }}
            onTransitionEnd={settled}
          >
            {frames.map((frame, frameIndex) => {
              const shown = frameIndex === pos
              const viewAt = views.findIndex((view) => view.key === frame.slide.key)
              return (
                <div
                  key={frame.key}
                  className="relative h-full min-w-full shrink-0 focus-within:ring-2 focus-within:ring-inset focus-within:ring-white/80"
                  aria-hidden={!shown}
                >
                  <div className="absolute inset-0 z-[1]">
                    <SlideFrame
                      slide={frame.slide}
                      hero={hero}
                      priority={priority && frame.slide.kind === 'hero' && frameIndex === (count > 1 ? 1 : 0)}
                      tabIndex={shown ? tabIndex : -1}
                      urls={urls}
                      alt={copy.place.memoryPhoto}
                    />
                  </div>
                  {shown && viewAt >= 0 && (
                    <button
                      ref={openButton}
                      type="button"
                      tabIndex={tabIndex}
                      aria-label={openLabel(copy.place.viewPhoto, copy.place.photoOf, frame.slide, hero, viewAt, views.length)}
                      onClick={() => openView(frame.slide.key)}
                      className="pointer-events-none absolute inset-0 z-0 appearance-none border-0 bg-transparent p-0 outline-none"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {overlay && (
        <div className="pointer-events-none relative col-start-1 row-start-1 flex flex-col justify-end">
          <div className="bg-gradient-to-t from-black/85 via-black/60 to-transparent px-4 pb-4 pt-20">{overlay}</div>
        </div>
      )}
      </div>
      {viewing && (
        <PhotoViewer
          src={viewing.src}
          alt={viewing.alt}
          width={viewing.width}
          height={viewing.height}
          onClose={() => setViewingKey(null)}
          nav={
            views.length > 1
              ? {
                  index: viewingAt,
                  count: views.length,
                  label: copy.place.photoOf(viewingAt + 1, views.length),
                  onPrev: () => viewingAt > 0 && setViewingKey(views[viewingAt - 1].key),
                  onNext: () => viewingAt < views.length - 1 && setViewingKey(views[viewingAt + 1].key),
                }
              : undefined
          }
        />
      )}
    </>
  )
}

function SlideFrame({
  slide,
  hero,
  priority,
  tabIndex,
  urls,
  alt,
}: {
  slide: Slide
  hero: Hero | null
  priority: boolean
  tabIndex: number
  urls: Record<string, string>
  alt: string
}) {
  if (slide.kind === 'hero' && hero) return <PlaceHero hero={hero} priority={priority} tabIndex={tabIndex} fill />
  if (slide.kind === 'photo' && urls[slide.path]) {
    return <img src={urls[slide.path]} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
  }
  return null
}

/** The photograph on screen. Clone frames at either end stand in for the opposite end. */
function slideAt(pos: number, count: number): number {
  if (count < 2) return 0
  if (pos <= 0) return count - 1
  if (pos > count) return 0
  return pos - 1
}

function framesOf(slides: Slide[]): { key: string; slide: Slide }[] {
  if (slides.length < 2) return slides.map((slide) => ({ key: slide.key, slide }))
  const last = slides[slides.length - 1]
  const first = slides[0]
  return [
    { key: `${last.key}-before`, slide: last },
    ...slides.map((slide) => ({ key: slide.key, slide })),
    { key: `${first.key}-after`, slide: first },
  ]
}

function slidesOf(hero: Hero | null, memories: PublicMemory[] | null): Slide[] {
  const slides: Slide[] = []
  if (hero) slides.push({ key: 'hero', kind: 'hero' })
  for (const memory of memories ?? []) {
    const photos = [...memory.memory_photos].sort((a, b) => a.position - b.position)
    for (const photo of photos) {
      slides.push({ key: photo.id, kind: 'photo', path: photo.storage_path, width: photo.width, height: photo.height })
    }
  }
  return slides
}

function viewsOf(slides: Slide[], hero: Hero | null, urls: Record<string, string>, photoAlt: string): View[] {
  const views: View[] = []
  for (const slide of slides) {
    if (slide.kind === 'hero' && hero) {
      views.push({ key: slide.key, ...heroPicture(hero), alt: hero.alt || photoAlt })
    } else if (slide.kind === 'photo' && urls[slide.path]) {
      views.push({
        key: slide.key,
        src: urls[slide.path],
        width: slide.width > 0 ? slide.width : 1600,
        height: slide.height > 0 ? slide.height : 1000,
        alt: photoAlt,
      })
    }
  }
  return views
}

/** The 1600 px photograph when the place has one; the card-sized file otherwise. */
function heroPicture(hero: Hero): { src: string; width: number; height: number } {
  const large = hero.srcSet
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .find((src) => src?.endsWith('-1600.jpg'))
  if (large) return { src: large, width: 1600, height: 1000 }
  return { src: hero.src, width: 800, height: 500 }
}

function openLabel(
  viewPhoto: string,
  photoOf: (n: number, of: number) => string,
  slide: Slide,
  hero: Hero | null,
  index: number,
  count: number,
): string {
  const subject = slide.kind === 'hero' && hero?.alt ? hero.alt : null
  const position = count > 1 ? photoOf(index + 1, count) : null
  return [viewPhoto, subject, position].filter(Boolean).join(', ')
}
