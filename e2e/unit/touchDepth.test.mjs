// How checkpoint green is weighed: logarithmic, relative to the busiest,
// and capped so one heavily touched place cannot turn solid.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  TOUCH_SATURATION,
  checkpointsFromFixes,
  neighbourhoodGreen,
  touchDepths,
} from '../../src/features/world/touchDepth.ts'

test('a single touch stays lighter than the cap', () => {
  const [depth] = touchDepths([1])
  assert.ok(depth > 0.2 && depth < 0.5, `depth ${depth}`)
})

test('the busiest place reaches the cap only at the saturation count', () => {
  assert.ok(touchDepths([TOUCH_SATURATION])[0] === 1)
  assert.ok(touchDepths([TOUCH_SATURATION - 1])[0] < 1)
  assert.equal(touchDepths([TOUCH_SATURATION * 20])[0], 1)
})

test('shade is relative and logarithmic, so a huge count does not crush the rest', () => {
  const [once, many] = touchDepths([1, 100])
  assert.equal(many, 1)
  assert.ok(once > 0.1 && once < 0.25, `once ${once}`)
  assert.ok(once > 1 / 100)
})

test('more touches are strictly darker, and zero is uncoloured', () => {
  const [none, few, more] = touchDepths([0, 2, 5])
  assert.equal(none, 0)
  assert.ok(few > 0 && few < more && more < 1)
})

test('the darkest green is the leaf, and a lighter depth is paler', () => {
  assert.equal(neighbourhoodGreen(1), '#5d6e59')
  const pale = Number.parseInt(neighbourhoodGreen(0.2).slice(1, 3), 16)
  const leaf = Number.parseInt(neighbourhoodGreen(1).slice(1, 3), 16)
  assert.ok(pale > leaf)
})

test('checkpoints keep their own coordinates and counts, and a visit without a row still shows', () => {
  const spots = checkpointsFromFixes(
    [
      { touchpointId: 'gate', placeId: 'toki', lat: 38.04, lng: 138.42 },
      { touchpointId: 'gate', placeId: 'toki', lat: 38.04, lng: 138.42 },
      { touchpointId: 'pier', placeId: 'toki', lat: null, lng: null },
      { touchpointId: 'other', placeId: 'missing', lat: 1, lng: 2 },
    ],
    [
      { id: 'toki', lat: 38.03, lng: 138.4 },
      { id: 'kinzan', lat: 38.041, lng: 138.256 },
    ],
  )
  const gate = spots.find((spot) => spot.id === 'gate')
  const pier = spots.find((spot) => spot.id === 'pier')
  const kinzan = spots.find((spot) => spot.placeId === 'kinzan')
  assert.equal(gate?.touches, 2)
  assert.equal(gate?.lat, 38.04)
  assert.equal(pier?.touches, 1)
  assert.equal(pier?.lat, 38.03)
  assert.equal(kinzan?.touches, 1)
  assert.equal(spots.some((spot) => spot.placeId === 'missing'), false)
})
