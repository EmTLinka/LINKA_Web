/**
 * How dark the green around a checkpoint is, on the globe and on a country.
 *
 * The count is logarithmic, then taken against the busiest checkpoint on the
 * map. The reference never drops below SATURATION, so one place with a single
 * touch stays a light green, and a place with far more touches stops at the
 * same leaf — it does not keep darkening. Overlap is handled by the map:
 * circles are painted lightest first, so a busier neighbour covers a quieter
 * one instead of the two transparencies adding past the leaf.
 */

/** Touches at which a checkpoint, if it is the busiest, reaches the darkest green. */
export const TOUCH_SATURATION = 8

const PALE = [0xd7, 0xe8, 0xd2] as const
const LEAF = [0x5d, 0x6e, 0x59] as const
/** Even one touch is already this far from paper toward the leaf. */
const FLOOR = 0.45

export type TouchFix = {
  touchpointId: string
  placeId: string
  lat: number | null
  lng: number | null
}

export type TouchCheckpoint = {
  id: string
  placeId: string
  lat: number
  lng: number
  touches: number
}

/** 0–1 shade for each count. The busiest is 1 once it reaches SATURATION. */
export function touchDepths(counts: readonly number[]): number[] {
  const heaviest = counts.reduce((max, count) => (count > max ? count : max), 0)
  const denom = Math.log1p(Math.max(heaviest, TOUCH_SATURATION))
  return counts.map((count) => (count <= 0 || denom === 0 ? 0 : Math.min(1, Math.log1p(count) / denom)))
}

/** Leaf green for a depth from `touchDepths`. Depth 1 is the leaf, never darker. */
export function neighbourhoodGreen(depth: number): string {
  const t = FLOOR + (1 - FLOOR) * Math.min(1, Math.max(0, depth))
  const channel = (index: number) => Math.round(PALE[index] + (LEAF[index] - PALE[index]) * t)
  return `#${channel(0).toString(16).padStart(2, '0')}${channel(1).toString(16).padStart(2, '0')}${channel(2).toString(16).padStart(2, '0')}`
}

/**
 * One green neighbourhood per Touch Point the user has recorded.
 * A point with no coordinates of its own sits on its place. A visited place
 * with no loaded touch row still gets a single light neighbourhood, so the
 * map is never coloured by a visit and then left blank.
 */
export function checkpointsFromFixes(
  fixes: readonly TouchFix[],
  places: readonly { id: string; lat: number; lng: number }[],
): TouchCheckpoint[] {
  const placeAt = new Map(places.map((place) => [place.id, place]))
  const grouped = new Map<string, TouchCheckpoint>()
  const placesWithAPoint = new Set<string>()

  for (const fix of fixes) {
    const place = placeAt.get(fix.placeId)
    if (!place) continue
    placesWithAPoint.add(place.id)
    const found = grouped.get(fix.touchpointId)
    if (found) {
      found.touches += 1
      continue
    }
    grouped.set(fix.touchpointId, {
      id: fix.touchpointId,
      placeId: place.id,
      lat: fix.lat ?? place.lat,
      lng: fix.lng ?? place.lng,
      touches: 1,
    })
  }

  for (const place of places) {
    if (placesWithAPoint.has(place.id)) continue
    grouped.set(`place:${place.id}`, {
      id: `place:${place.id}`,
      placeId: place.id,
      lat: place.lat,
      lng: place.lng,
      touches: 1,
    })
  }

  return [...grouped.values()]
}
