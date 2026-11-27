/** What the add-place page edits, and what it posts as `place`. */

export type PlaceKind = 'destination' | 'region'
export type PlaceStatus = 'draft' | 'published' | 'archived'
export type PartnerStatus = 'none' | 'partner'
export type LabelSide = '' | 'left' | 'right' | 'below'

export type PlaceForm = {
  slug: string
  parent_slug: string
  kind: PlaceKind
  native_name: string
  native_locale: string
  romanized_name: string
  latitude: string
  longitude: string
  timezone: string
  official_url: string
  status: PlaceStatus
  discovery_enabled: boolean
  partner_status: PartnerStatus
  label_side: LabelSide
  hero_image_path: string
  hero_image_credit: string
  hero_image_source_url: string
  hero_image_license: string
  hero_image_license_url: string
  translation_name: string
  locality: string
  short_description: string
  hours: string
  translation_source_url: string
  source_url: string
  source_publisher: string
  source_note: string
  source_covers: string[]
  source_checked_at: string
}

/** A place object as `admin-places` lookup returns it. */
export type FetchedPlace = {
  slug?: string | null
  parent_slug?: string | null
  kind?: PlaceKind | null
  native_name?: string | null
  native_locale?: string | null
  romanized_name?: string | null
  latitude?: number | null
  longitude?: number | null
  timezone?: string | null
  official_url?: string | null
  status?: PlaceStatus | null
  discovery_enabled?: boolean | null
  partner_status?: PartnerStatus | null
  hero_image_path?: string | null
  hero_image_credit?: string | null
  hero_image_source_url?: string | null
  hero_image_license?: string | null
  hero_image_license_url?: string | null
  label_side?: Exclude<LabelSide, ''> | null
  translations?: {
    name?: string | null
    locality?: string | null
    short_description?: string | null
    practical_info?: { hours?: string } | null
    source_url?: string | null
  }[]
  sources?: {
    url?: string
    covers?: string[]
    publisher?: string | null
    checked_at?: string
    note?: string | null
  }[]
}

export function emptyPlaceForm(): PlaceForm {
  return {
    slug: '',
    parent_slug: '',
    kind: 'destination',
    native_name: '',
    native_locale: 'ja',
    romanized_name: '',
    latitude: '',
    longitude: '',
    timezone: 'Asia/Tokyo',
    official_url: '',
    status: 'draft',
    discovery_enabled: false,
    partner_status: 'none',
    label_side: '',
    hero_image_path: '',
    hero_image_credit: '',
    hero_image_source_url: '',
    hero_image_license: '',
    hero_image_license_url: '',
    translation_name: '',
    locality: '',
    short_description: '',
    hours: '',
    translation_source_url: '',
    source_url: '',
    source_publisher: '',
    source_note: '',
    source_covers: [],
    source_checked_at: '',
  }
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

/** Copy a lookup result into the form. Empty columns stay editable. */
export function formFromFetched(place: FetchedPlace): PlaceForm {
  const translation = place.translations?.[0]
  const source = place.sources?.[0]
  const blank = emptyPlaceForm()
  return {
    ...blank,
    slug: text(place.slug),
    parent_slug: text(place.parent_slug),
    kind: place.kind === 'region' ? 'region' : 'destination',
    native_name: text(place.native_name),
    native_locale: text(place.native_locale) || 'ja',
    romanized_name: text(place.romanized_name),
    latitude: typeof place.latitude === 'number' ? String(place.latitude) : '',
    longitude: typeof place.longitude === 'number' ? String(place.longitude) : '',
    timezone: text(place.timezone) || 'Asia/Tokyo',
    official_url: text(place.official_url),
    status: place.status === 'published' || place.status === 'archived' ? place.status : 'draft',
    discovery_enabled: place.discovery_enabled === true,
    partner_status: place.partner_status === 'partner' ? 'partner' : 'none',
    label_side: place.label_side === 'left' || place.label_side === 'right' || place.label_side === 'below' ? place.label_side : '',
    hero_image_path: text(place.hero_image_path),
    hero_image_credit: text(place.hero_image_credit),
    hero_image_source_url: text(place.hero_image_source_url),
    hero_image_license: text(place.hero_image_license),
    hero_image_license_url: text(place.hero_image_license_url),
    translation_name: text(translation?.name),
    locality: text(translation?.locality),
    short_description: text(translation?.short_description),
    hours: text(translation?.practical_info?.hours),
    translation_source_url: text(translation?.source_url),
    source_url: text(source?.url),
    source_publisher: text(source?.publisher),
    source_note: text(source?.note),
    source_covers: source?.covers ?? [],
    source_checked_at: text(source?.checked_at),
  }
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * The places slug rule: lowercase latin, digits, and single hyphens.
 * "Toki no Mori Park" becomes "toki-no-mori-park". Japanese-only text cannot.
 */
export function normalizeSlug(value: string): string | null {
  const slug = value
    .trim()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return SLUG.test(slug) ? slug : null
}

/** The `place` object posted to `admin-places` `create`. */
export function placeFromForm(form: PlaceForm): Record<string, unknown> {
  const hours = form.hours.trim()
  const translation = {
    locale: 'ja',
    name: emptyToNull(form.translation_name),
    locality: emptyToNull(form.locality),
    short_description: emptyToNull(form.short_description),
    practical_info: hours ? { hours } : null,
    source_url: emptyToNull(form.translation_source_url),
  }
  const hasTranslation = Boolean(
    translation.name || translation.locality || translation.short_description || translation.practical_info || translation.source_url,
  )
  const sourceUrl = emptyToNull(form.source_url)

  return {
    slug: normalizeSlug(form.slug) ?? form.slug.trim(),
    parent_slug: emptyToNull(form.parent_slug),
    kind: form.kind,
    native_name: form.native_name.trim(),
    native_locale: form.native_locale.trim() || 'ja',
    romanized_name: emptyToNull(form.romanized_name),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    timezone: form.timezone.trim() || 'Asia/Tokyo',
    official_url: emptyToNull(form.official_url),
    status: form.status,
    discovery_enabled: form.discovery_enabled,
    partner_status: form.partner_status,
    label_side: form.label_side || null,
    hero_image_path: emptyToNull(form.hero_image_path),
    hero_image_credit: emptyToNull(form.hero_image_credit),
    hero_image_source_url: emptyToNull(form.hero_image_source_url),
    hero_image_license: emptyToNull(form.hero_image_license),
    hero_image_license_url: emptyToNull(form.hero_image_license_url),
    translations: hasTranslation ? [translation] : [],
    sources: sourceUrl
      ? [{
          url: sourceUrl,
          covers: form.source_covers,
          publisher: emptyToNull(form.source_publisher),
          ...(form.source_checked_at.trim() ? { checked_at: form.source_checked_at.trim() } : {}),
          note: emptyToNull(form.source_note),
        }]
      : [],
  }
}
