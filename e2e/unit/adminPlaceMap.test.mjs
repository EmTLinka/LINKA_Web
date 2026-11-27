// The Google → places column map. No network: a saved Places API (New) shape.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mapGooglePlace, suggestSlug } from '../../supabase/functions/admin-places/mapGooglePlace.ts'

const CHECKED = '2026-11-27T03:00:00.000Z'

const JA = {
  id: 'ChIJtoki',
  displayName: { text: 'トキの森公園', languageCode: 'ja' },
  location: { latitude: 38.03711, longitude: 138.42129 },
  addressComponents: [
    { longText: '新潟県', types: ['administrative_area_level_1', 'political'] },
    { longText: '佐渡市', types: ['locality', 'political'] },
    { longText: '新穂', types: ['sublocality_level_1', 'political'] },
  ],
  formattedAddress: '日本、〒952-0101 新潟県佐渡市新穂',
  websiteUri: 'https://www.city.sado.niigata.jp/site/tokinomori/1161.html',
  googleMapsUri: 'https://maps.google.com/?cid=1',
  timeZone: { id: 'Asia/Tokyo' },
  regularOpeningHours: { weekdayDescriptions: ['月曜日: 8:30～17:00', '火曜日: 定休日'] },
}

test('suggestSlug keeps Latin names and refuses Japanese', () => {
  assert.equal(suggestSlug('Toki no Mori Park'), 'toki-no-mori-park')
  assert.equal(suggestSlug('Ōnogame'), 'onogame')
  assert.equal(suggestSlug('佐渡'), null)
  assert.equal(suggestSlug(''), null)
  assert.equal(suggestSlug('---'), null)
})

test('a Google place fills places columns and leaves the rest to be typed', () => {
  const draft = mapGooglePlace(JA, { displayName: { text: 'Toki no Mori Park', languageCode: 'en' } }, CHECKED)

  assert.equal(draft.slug, 'toki-no-mori-park')
  assert.equal(draft.kind, 'destination')
  assert.equal(draft.status, 'draft')
  assert.equal(draft.native_name, 'トキの森公園')
  assert.equal(draft.native_locale, 'ja')
  assert.equal(draft.romanized_name, 'Toki no Mori Park')
  assert.equal(draft.latitude, 38.03711)
  assert.equal(draft.longitude, 138.42129)
  assert.equal(draft.timezone, 'Asia/Tokyo')
  assert.equal(draft.official_url, 'https://www.city.sado.niigata.jp/site/tokinomori/1161.html')
  assert.equal(draft.parent_slug, null)
  assert.equal(draft.discovery_enabled, false)
  assert.equal(draft.hero_image_path, null)
  assert.equal(draft.label_side, null)

  assert.equal(draft.translations.length, 1)
  assert.equal(draft.translations[0].locale, 'ja')
  assert.equal(draft.translations[0].locality, '佐渡市 新穂')
  assert.equal(draft.translations[0].practical_info.hours, '月曜日: 8:30～17:00\n火曜日: 定休日')
  assert.equal(draft.translations[0].practical_info_as_of, null)
  assert.equal(draft.translations[0].description, null)
  assert.equal(draft.translations[0].source_url, draft.official_url)

  assert.equal(draft.sources.length, 1)
  assert.deepEqual(draft.sources[0].covers, ['coordinates', 'name', 'timezone'])
  assert.equal(draft.sources[0].publisher, 'Google Maps')
  assert.equal(draft.sources[0].checked_at, CHECKED)
  assert.match(draft.sources[0].note, /place_id:ChIJtoki/)
})

test('http websites and a Japanese-only name stay empty for hand entry', () => {
  const draft = mapGooglePlace(
    {
      displayName: { text: '大野亀', languageCode: 'ja' },
      location: { latitude: 38.32, longitude: 138.46 },
      websiteUri: 'http://insecure.example/place',
      googleMapsUri: 'https://maps.google.com/?cid=2',
    },
    { displayName: { text: '大野亀', languageCode: 'en' } },
    CHECKED,
  )

  assert.equal(draft.slug, null)
  assert.equal(draft.romanized_name, null)
  assert.equal(draft.official_url, null)
  assert.equal(draft.timezone, 'Asia/Tokyo')
  assert.deepEqual(draft.sources[0].covers, ['coordinates', 'name'])
  assert.equal(draft.translations[0].source_url, 'https://maps.google.com/?cid=2')
  assert.equal(draft.translations[0].practical_info, null)
})
