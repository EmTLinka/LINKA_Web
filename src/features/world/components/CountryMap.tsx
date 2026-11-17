import { useId, useMemo } from 'react'

import { getDetailedLand } from '@/features/world/geo/atlas'
import { screenReach } from '@/features/world/geo/caps'
import { clippedLand, screenRect } from '@/features/world/geo/draw'
import type { WorldFrame } from '@/features/world/geo/orthographic'
import { neighbourhoodGreen } from '@/features/world/touchDepth'

/** A Touch Point's green neighbourhood, as a wash on screen. */
export type AreaWash = { id: string; x: number; y: number; r: number; variant: number; depth: number }

type CountryMapProps = {
  width: number
  height: number
  frame: WorldFrame
  washes: readonly AreaWash[]
  opacity: number
  /** A frame of a move: draw in whole pixels. */
  moving: boolean
}

const EDGE_SEEDS = [5, 19, 37] as const

/**
 * A country, seen whole.
 *
 * The world is already there: every coast is drawn, in a light graphite line
 * on pale, colourless land and sea — readable, quiet, entirely present. What
 * a touch adds is green around that Touch Point. More touches there make the
 * green darker, up to one leaf and no further.
 *
 *   The world is already there. Your experiences give it colour.
 */
export default function CountryMap({ width, height, frame, washes, opacity, moving }: CountryMapProps) {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `${uid}-${name}`
  const url = (name: string) => `url(#${id(name)})`
  // SVG filters (the pencil wobble, the watercolour edge, the soft blooms)
  // are what a camera move cannot afford in Safari/WebKit: they are
  // re-rasterised on the CPU every frame (measured: World → Japan fell to 5
  // frames in 2.6 s). While the view moves they are left off; the resting
  // frame is drawn with every one of them, exactly as before.
  const fx = (name: string) => (moving ? undefined : url(name))

  const land = useMemo(
    () =>
      clippedLand(
        frame,
        getDetailedLand(),
        screenRect(width, height),
        screenReach(frame, width, height),
        moving,
      ),
    [frame, width, height, moving],
  )

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0"
      style={{ opacity }}
      focusable="false"
    >
      <defs>
        {/* Sea without colour: a cool, barely-there grey. */}
        <radialGradient id={id('sea')} cx="0.5" cy="0.52" r="0.75">
          <stop offset="0" stopColor="#eef0ef" />
          <stop offset="1" stopColor="#f3f3f1" />
        </radialGradient>

        {/* Haze toward the screen's edges, so the country in the middle reads first. */}
        <radialGradient id={id('haze')} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.45" stopColor="#fcfbf8" stopOpacity="0" />
          <stop offset="1" stopColor="#fcfbf8" stopOpacity="0.72" />
        </radialGradient>

        {washes.map((wash) => (
          <radialGradient key={wash.id} id={id(`wash-${svgId(wash.id)}`)}>
            <stop offset="0" stopColor={neighbourhoodGreen(wash.depth)} stopOpacity="0.96" />
            <stop offset="0.72" stopColor={neighbourhoodGreen(wash.depth)} stopOpacity="0.7" />
            <stop offset="1" stopColor={neighbourhoodGreen(wash.depth)} stopOpacity="0" />
          </radialGradient>
        ))}

        <radialGradient id={id('pool')}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>

        {EDGE_SEEDS.map((seed, i) => (
          <filter key={seed} id={id(`edge-${i}`)} x="-35%" y="-35%" width="170%" height="170%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed={seed} />
            <feDisplacementMap in="SourceGraphic" scale="16" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
        ))}

        <filter id={id('pen')} x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" />
          <feDisplacementMap in="SourceGraphic" scale="1.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        <filter id={id('soft')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>

        <mask id={id('reveal')} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect width={width} height={height} fill="#000" />
          {washes.map((wash) => (
            <circle
              key={wash.id}
              cx={wash.x}
              cy={wash.y}
              r={wash.r}
              fill={url('pool')}
              filter={fx(`edge-${wash.variant}`)}
            />
          ))}
        </mask>
      </defs>

      <rect width={width} height={height} fill={url('sea')} />

      {/* Land as it is: pale paper, so the coast — drawn last — is what names the country. */}
      <path d={land.fill} fill="#f7f4ee" />

      <rect width={width} height={height} fill={url('haze')} />

      {washes.map((wash) => (
        <circle
          key={wash.id}
          cx={wash.x}
          cy={wash.y}
          r={wash.r}
          fill={url(`wash-${svgId(wash.id)}`)}
          filter={fx(`edge-${wash.variant}`)}
        />
      ))}

      {/* Meadow only inside a touch. The coast stays above the green, so the country keeps its shape. */}
      <g mask={url('reveal')}>
        <path d={land.fill} fill="var(--color-meadow)" />
      </g>
      <path
        d={land.coast}
        fill="none"
        stroke="var(--color-graphite)"
        strokeOpacity="0.36"
        strokeWidth="0.85"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={fx('pen')}
      />
    </svg>
  )
}

function svgId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '')
}
