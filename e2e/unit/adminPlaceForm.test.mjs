import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formFromFetched, normalizeSlug, placeFromForm } from '../../src/features/admin/placeForm.ts'

test('a typed name is stored as the places slug', () => {
  assert.equal(normalizeSlug('Toki no Mori Park'), 'toki-no-mori-park')
  assert.equal(normalizeSlug('トキの森公園'), null)
})

test('a lookup result fills the form and still posts as place columns', () => {
  const form = formFromFetched({
    slug: 'toki-no-mori-park',
    native_name: 'トキの森公園',
    native_locale: 'ja',
    romanized_name: 'Toki no Mori Park',
    latitude: 38.03711,
    longitude: 138.42129,
    timezone: 'Asia/Tokyo',
    official_url: 'https://example.com/toki',
    status: 'draft',
    kind: 'destination',
    translations: [{
      name: 'トキの森公園',
      locality: '佐渡市 新穂',
      practical_info: { hours: '月曜日: 8:30～17:00' },
      source_url: 'https://example.com/toki',
    }],
    sources: [{
      url: 'https://maps.google.com/?cid=1',
      covers: ['coordinates', 'name'],
      publisher: 'Google Maps',
      checked_at: '2026-11-27T03:00:00.000Z',
      note: 'place_id:ChIJ',
    }],
  })

  form.parent_slug = 'sado'
  const place = placeFromForm(form)

  assert.equal(place.slug, 'toki-no-mori-park')
  assert.equal(place.parent_slug, 'sado')
  assert.equal(place.native_name, 'トキの森公園')
  assert.equal(place.latitude, 38.03711)
  assert.equal(place.longitude, 138.42129)
  assert.equal(place.official_url, 'https://example.com/toki')
  assert.equal(place.hero_image_path, null)
  assert.deepEqual(place.translations, [{
    locale: 'ja',
    name: 'トキの森公園',
    locality: '佐渡市 新穂',
    short_description: null,
    practical_info: { hours: '月曜日: 8:30～17:00' },
    source_url: 'https://example.com/toki',
  }])
  assert.equal(place.sources[0].url, 'https://maps.google.com/?cid=1')
  assert.equal(place.sources[0].checked_at, '2026-11-27T03:00:00.000Z')
})

test('a hand entry without a translation or source omits those arrays', () => {
  const form = formFromFetched({ native_name: '手入力湾', latitude: 38.1, longitude: 138.2 })
  form.slug = 'manual-cove'
  const place = placeFromForm(form)

  assert.deepEqual(place.translations, [])
  assert.deepEqual(place.sources, [])
  assert.equal(place.parent_slug, null)
  assert.equal(place.status, 'draft')
  assert.equal(place.kind, 'destination')
})
