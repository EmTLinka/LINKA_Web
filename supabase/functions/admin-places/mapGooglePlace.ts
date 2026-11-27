// Maps a Places API (New) place onto the columns admin_create_place accepts.
// Pure: no network. Japanese details are the place's own name; an English
// details response, when it actually uses Latin letters, fills romanized_name
// and a slug suggestion. Anything Google does not know stays null for a person
// to type. Photos and editorial summaries are not copied.

export type GooglePlace = {
  id?: string
  displayName?: { text?: string; languageCode?: string }
  location?: { latitude?: number; longitude?: number }
  addressComponents?: { longText?: string; types?: string[] }[]
  formattedAddress?: string
  websiteUri?: string
  googleMapsUri?: string
  timeZone?: { id?: string }
  regularOpeningHours?: { weekdayDescriptions?: string[] }
}

export type PlaceDraft = {
  slug: string | null
  parent_id: null
  parent_slug: null
  kind: 'destination'
  native_name: string | null
  native_locale: string
  romanized_name: string | null
  latitude: number | null
  longitude: number | null
  timezone: string
  official_url: string | null
  status: 'draft'
  discovery_enabled: false
  partner_status: 'none'
  hero_image_path: null
  hero_image_credit: null
  hero_image_source_url: null
  hero_image_license: null
  hero_image_license_url: null
  label_side: null
  translations: {
    locale: 'ja'
    name: string | null
    official_name: null
    locality: string | null
    short_description: null
    description: null
    practical_info: { hours: string } | null
    practical_info_as_of: null
    source_url: string | null
    content_checked_at: null
    hero_image_alt: null
  }[]
  sources: {
    url: string
    covers: string[]
    publisher: 'Google Maps'
    checked_at: string
    note: string | null
  }[]
}

const LOCALE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/

/** A URL-safe slug, or null when the name is not Latin. */
export function suggestSlug(name: string | null | undefined): string | null {
  if (!name) return null
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null
}

function httpsUrl(value: string | undefined): string | null {
  const url = value?.trim()
  return url && url.startsWith('https://') ? url : null
}

function component(place: GooglePlace, type: string): string | null {
  const found = place.addressComponents?.find((part) => part.types?.includes(type))
  const text = found?.longText?.trim()
  return text || null
}

function localityOf(place: GooglePlace): string | null {
  const city = component(place, 'locality')
  const sub = component(place, 'sublocality_level_1') ?? component(place, 'sublocality')
  const parts = [city, sub].filter((part): part is string => Boolean(part))
  if (parts.length > 0) return parts.join(' ')
  return component(place, 'administrative_area_level_1')
}

function latinName(name: string | undefined): string | null {
  const text = name?.trim()
  if (!text || !/[A-Za-z]/.test(text)) return null
  return text
}

/** English displayName → romanized_name and slug. A Japanese name stays empty. */
export function englishPlaceName(displayName: string | null | undefined): {
  romanized_name: string | null
  slug: string | null
} {
  const romanized = latinName(displayName ?? undefined)
  return { romanized_name: romanized, slug: suggestSlug(romanized) }
}

function nativeLocale(languageCode: string | undefined): string {
  if (languageCode === 'zh' || languageCode === 'zh-CN' || languageCode === 'zh-Hans') return 'zh-Hans'
  if (languageCode && LOCALE.test(languageCode)) return languageCode
  return 'ja'
}

/**
 * One candidate, shaped as the body of admin_create_place.
 * `checkedAt` is stamped on the Google source row.
 */
export function mapGooglePlace(ja: GooglePlace, en: GooglePlace | null, checkedAt: string): PlaceDraft {
  const native = ja.displayName?.text?.trim() || null
  const romanized = latinName(en?.displayName?.text)
  const latitude = typeof ja.location?.latitude === 'number' ? ja.location.latitude : null
  const longitude = typeof ja.location?.longitude === 'number' ? ja.location.longitude : null
  const timezone = ja.timeZone?.id?.trim() || 'Asia/Tokyo'
  const timezoneFromGoogle = Boolean(ja.timeZone?.id?.trim())
  const official = httpsUrl(ja.websiteUri)
  const maps = httpsUrl(ja.googleMapsUri)
  const hours = ja.regularOpeningHours?.weekdayDescriptions?.map((line) => line.trim()).filter(Boolean) ?? []
  const locality = localityOf(ja)
  const sourceUrl = official ?? maps

  const covers = [
    latitude !== null && longitude !== null ? 'coordinates' : null,
    native ? 'name' : null,
    timezoneFromGoogle ? 'timezone' : null,
  ].filter((item): item is string => Boolean(item))

  const note = [ja.id ? `place_id:${ja.id}` : null, ja.formattedAddress?.trim() || null]
    .filter((item): item is string => Boolean(item))
    .join('\n')

  return {
    slug: suggestSlug(romanized),
    parent_id: null,
    parent_slug: null,
    kind: 'destination',
    native_name: native,
    native_locale: nativeLocale(ja.displayName?.languageCode),
    romanized_name: romanized,
    latitude,
    longitude,
    timezone,
    official_url: official,
    status: 'draft',
    discovery_enabled: false,
    partner_status: 'none',
    hero_image_path: null,
    hero_image_credit: null,
    hero_image_source_url: null,
    hero_image_license: null,
    hero_image_license_url: null,
    label_side: null,
    translations: native || locality || hours.length > 0
      ? [{
          locale: 'ja',
          name: native,
          official_name: null,
          locality,
          short_description: null,
          description: null,
          practical_info: hours.length > 0 ? { hours: hours.join('\n') } : null,
          practical_info_as_of: null,
          source_url: sourceUrl,
          content_checked_at: null,
          hero_image_alt: null,
        }]
      : [],
    sources: maps
      ? [{
          url: maps,
          covers,
          publisher: 'Google Maps',
          checked_at: checkedAt,
          note: note || null,
        }]
      : [],
  }
}
