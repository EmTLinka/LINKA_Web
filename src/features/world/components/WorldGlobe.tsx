import { useId, type CSSProperties } from 'react'

import type { LandPaths, WorldFrame } from '@/features/world/geo/orthographic'
import { neighbourhoodGreen } from '@/features/world/touchDepth'

/** One checkpoint's green on the globe. Small on purpose: the neighbourhood, not the country. */
export type Bloom = {
  id: string
  /** The place this Touch Point belongs to — what a tap on the bloom opens. */
  placeId: string
  x: number
  y: number
  r: number
  /** Which watercolor edge this bloom is painted with — keeps them from repeating. */
  variant: number
  /** False while an arriving touch has not spread yet. */
  open: boolean
  /** 0–1, already capped and relative. 1 is the darkest leaf this map allows. */
  depth: number
}

type WorldGlobeProps = {
  /** A frame of a camera move: draw without SVG filters. */
  moving?: boolean
  width: number
  height: number
  frame: WorldFrame
  land: LandPaths
  blooms: readonly Bloom[]
  /**
   * 1 → 0 as the camera approaches a country: the glass — its air, its sheen
   * and its rim — thins away and leaves the land. At rest it is always 1.
   */
  atmosphere?: number
}

const EDGE_SEEDS = [7, 23, 41] as const

/** Colours are read from theme tokens so the world and the UI share one palette. */
const tone = (token: string, opacity = 1): CSSProperties => ({
  stopColor: `var(--color-${token})`,
  stopOpacity: opacity,
})

/**
 * The world itself.
 *
 * Before any touch it is soft glass: a pale, translucent sphere with the land
 * only frosted into it, no coastline drawn. A touch paints a small green
 * neighbourhood around that Touch Point. More touches make that green darker,
 * up to one leaf and no further. Where two neighbourhoods overlap, the busier
 * one lies on top.
 */
export default function WorldGlobe({
  width,
  height,
  frame,
  land,
  blooms,
  atmosphere = 1,
  moving = false,
}: WorldGlobeProps) {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `${uid}-${name}`
  const url = (name: string) => `url(#${id(name)})`
  // SVG filters (the pencil wobble, the watercolour edge, the soft blooms)
  // are what a camera move cannot afford in Safari/WebKit: they are
  // re-rasterised on the CPU every frame (measured: World → Japan fell to 5
  // frames in 2.6 s). While the view moves they are left off; the resting
  // frame is drawn with every one of them, exactly as before.
  const fx = (name: string) => (moving ? undefined : url(name))
  const { cx, cy, r } = frame

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0"
      focusable="false"
    >
      <defs>
        <radialGradient id={id('air')} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r + 44}>
          <stop offset={r / (r + 44)} style={tone('mist', 0.9)} />
          <stop offset="1" style={tone('mist', 0)} />
        </radialGradient>

        {/* Lit from the upper left, the way the door's daylight fell. */}
        <radialGradient id={id('glass')} cx="0.36" cy="0.26" r="0.78">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" style={tone('mist')} />
          <stop offset="0.86" style={tone('mist-deep', 0.62)} />
          <stop offset="1" style={tone('mist-deep', 0.9)} />
        </radialGradient>

        {blooms.map((bloom) => (
          <radialGradient key={bloom.id} id={id(`wash-${svgId(bloom.id)}`)}>
            <stop offset="0" stopColor={neighbourhoodGreen(bloom.depth)} stopOpacity="0.92" />
            <stop offset="0.7" stopColor={neighbourhoodGreen(bloom.depth)} stopOpacity="0.62" />
            <stop offset="1" stopColor={neighbourhoodGreen(bloom.depth)} stopOpacity="0" />
          </radialGradient>
        ))}

        <radialGradient id={id('pool')}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.88" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>

        {/* Watercolor edges: a wandering outline, never a perfect circle. */}
        {EDGE_SEEDS.map((seed, i) => (
          <filter key={seed} id={id(`edge-${i}`)} x="-35%" y="-35%" width="170%" height="170%">
            <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed={seed} />
            <feDisplacementMap in="SourceGraphic" scale="12" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        ))}

        <filter id={id('pen')} x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="11" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        <filter id={id('soft')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={Math.max(6, r * 0.03)} />
        </filter>

        <clipPath id={id('sphere')}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>

        <mask id={id('reveal')} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect width={width} height={height} fill="#000" />
          {blooms.map((bloom) => (
            <g key={bloom.id} style={bloomMotion(bloom, 350)}>
              <circle
                cx={bloom.x}
                cy={bloom.y}
                r={bloom.r}
                fill={url('pool')}
                filter={fx(`edge-${bloom.variant}`)}
              />
            </g>
          ))}
        </mask>
      </defs>

      {/* Atmosphere: breathing so slowly it reads as air, not animation. */}
      <g opacity={atmosphere}>
        <circle cx={cx} cy={cy} r={r + 44} fill={url('air')} className="animate-air" />
      </g>

      {/* The glass world. */}
      <circle cx={cx} cy={cy} r={r} fill={url('glass')} opacity={0.94 * atmosphere} />

      <g clipPath={url('sphere')}>
        {/* Untouched land: frosted into the glass, no line drawn. */}
        <LandFill land={land} fill="#ffffff" opacity={0.44} />

        {/* Green around each Touch Point. Lighter circles are painted first, so a busier one covers them. */}
        {blooms.map((bloom) => (
          <g key={bloom.id} style={bloomMotion(bloom, 0)}>
            <g filter={fx(`edge-${bloom.variant}`)}>
              <circle cx={bloom.x} cy={bloom.y} r={bloom.r} fill={url(`wash-${svgId(bloom.id)}`)} />
            </g>
          </g>
        ))}

        {/* A little meadow inside each touch. The coast is drawn over the green, so a country keeps its shape. */}
        <g mask={url('reveal')}>
          <LandFill land={land} fill="var(--color-meadow)" opacity={0.55} />
        </g>
        <path
          d={land.coast}
          fill="none"
          stroke="var(--color-graphite)"
          strokeOpacity="0.32"
          strokeWidth="0.65"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={fx('pen')}
        />

        {/* One highlight on the glass. */}
        <ellipse
          opacity={0.5 * atmosphere}
          cx={cx - r * 0.34}
          cy={cy - r * 0.62}
          rx={r * 0.36}
          ry={r * 0.13}
          transform={`rotate(-22 ${cx - r * 0.34} ${cy - r * 0.62})`}
          fill="#ffffff"
          filter={fx('soft')}
        />
      </g>

      {/* The rim: light on the edge, and a hair of blue beyond it. */}
      <g opacity={atmosphere}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff" strokeWidth="1.4" opacity="0.95" />
        <circle
          cx={cx}
          cy={cy}
          r={r + 1}
          fill="none"
          stroke="var(--color-mist-deep)"
          strokeWidth="0.8"
          opacity="0.8"
        />
      </g>
    </svg>
  )
}

/** All the land, including any that wraps round the far side of the world. */
function LandFill({ land, fill, opacity }: { land: LandPaths; fill: string; opacity?: number }) {
  return (
    <g fill={fill} opacity={opacity}>
      <path d={land.fill} />
      {land.fillInverse.map((d, i) => (
        <path key={i} d={d} fillRule="evenodd" />
      ))}
    </g>
  )
}

/**
 * A bloom spreads from its own centre; closed, it is a speck and invisible.
 * The geography's mask trails the pigment slightly, so the land resolves
 * inside a wash that is already there rather than arriving with it.
 */
function svgId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '')
}

function bloomMotion(bloom: Bloom, delayMs: number): CSSProperties {
  return {
    transformOrigin: `${bloom.x}px ${bloom.y}px`,
    transform: bloom.open ? 'scale(1)' : 'scale(0.12)',
    opacity: bloom.open ? 1 : 0,
    transition: `transform 2200ms var(--ease-calm) ${delayMs}ms, opacity 1200ms var(--ease-calm) ${delayMs}ms`,
  }
}
