// Admin-only place endpoint. No page links here; call it with curl.
//
//   POST /functions/v1/admin-places
//   Authorization: Bearer <access token of a profiles.role = admin user>
//   apikey: <publishable key>
//
//   { "action": "lookup", "query": "トキの森公園" }
//   { "action": "lookup", "placeId": "ChIJ...", "part": "englishName" }
//   { "action": "create", "place": { ...columns from lookup, or typed by hand } }
//
// A text search runs once, in Japanese. English displayName is a separate
// Place Details call for the one chosen id, masked to id and displayName,
// so it does not repeat the higher search SKU.
//
// lookup needs the secret GOOGLE_MAPS_API_KEY (Places API (New)).
// create does not: it calls admin_create_place as the same user, which
// refuses anyone who is not admin. A non-admin never reaches Google.

import { englishPlaceName, mapGooglePlace, type GooglePlace } from './mapGooglePlace.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const SEARCH_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.addressComponents',
  'places.formattedAddress',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.timeZone',
  'places.regularOpeningHours',
].join(',')

/** English name only. Opening hours and website would bill a higher SKU. */
const ENGLISH_NAME_MASK = 'id,displayName'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type LookupBody = {
  action?: string
  query?: string
  placeId?: string
  part?: string
  place?: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function placeIdOf(value: string): string | null {
  const bare = value.trim().replace(/^places\//, '')
  return /^[A-Za-z0-9_-]{8,200}$/.test(bare) ? bare : null
}

function projectEnv(): { url: string; anon: string } | Response {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if (!url || !anon) return json({ error: 'supabase_not_configured' }, 500)
  return { url, anon }
}

async function requireAdmin(request: Request, url: string, anon: string): Promise<Response | null> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'not_authenticated' }, 401)

  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anon },
  })
  if (!userResponse.ok) return json({ error: 'not_authenticated' }, 401)

  const adminResponse = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!adminResponse.ok || (await adminResponse.json()) !== true) {
    return json({ error: 'admin_required' }, 403)
  }
  return null
}

async function google<T>(url: string, method: 'GET' | 'POST', fieldMask: string, key: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(10000),
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let payload: { error?: { message?: string } } | null = null
  if (text) {
    try {
      payload = JSON.parse(text) as { error?: { message?: string } }
    } catch {
      payload = null
    }
  }
  if (!response.ok) {
    throw new GoogleError(payload?.error?.message ?? 'google_places_failed', response.status)
  }
  return payload as T
}

class GoogleError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function searchPlaces(query: string, key: string): Promise<GooglePlace[]> {
  const found = await google<{ places?: GooglePlace[] }>(
    'https://places.googleapis.com/v1/places:searchText',
    'POST',
    SEARCH_MASK,
    key,
    { textQuery: query, languageCode: 'ja', maxResultCount: 5 },
  )
  return found.places ?? []
}

async function englishName(id: string, key: string): Promise<Response> {
  const place = await google<GooglePlace>(
    `https://places.googleapis.com/v1/places/${id}?languageCode=en`,
    'GET',
    ENGLISH_NAME_MASK,
    key,
  )
  return json(englishPlaceName(place.displayName?.text))
}

async function lookup(body: LookupBody, key: string): Promise<Response> {
  const checkedAt = new Date().toISOString()
  if (body.query && body.placeId) return json({ error: 'lookup_conflict' }, 400)

  if (body.placeId) {
    if (body.part !== 'englishName') return json({ error: 'unknown_part' }, 400)
    const id = placeIdOf(body.placeId)
    if (!id) return json({ error: 'invalid_place_id' }, 400)
    return englishName(id, key)
  }

  const query = body.query?.trim() ?? ''
  if (!query || query.length > 200) return json({ error: 'query_required' }, 400)
  const japanese = await searchPlaces(query, key)
  return json({
    candidates: japanese.map((place) => ({
      googlePlaceId: place.id ?? null,
      place: mapGooglePlace(place, null, checkedAt),
    })),
  })
}

function httpStatus(code: string | undefined): number {
  if (code === '28000') return 401
  if (code === '42501') return 403
  if (code === '23505') return 409
  if (code === 'P0002') return 404
  if (code === '22023' || code === '22007' || code === '22008' || code === '22P02' || code === '23514') return 400
  return 400
}

async function createPlace(place: unknown, authorization: string, url: string, anon: string): Promise<Response> {
  if (place === null || typeof place !== 'object' || Array.isArray(place)) {
    return json({ error: 'place_required' }, 400)
  }
  const response = await fetch(`${url}/rest/v1/rpc/admin_create_place`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_place: place }),
  })
  const text = await response.text()
  let payload: { code?: string; message?: string } | null = null
  if (text) {
    try {
      payload = JSON.parse(text) as { code?: string; message?: string }
    } catch {
      payload = null
    }
  }
  if (!response.ok) {
    return json({ error: payload?.message ?? 'create_failed', code: payload?.code ?? null }, httpStatus(payload?.code))
  }
  return json(payload)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const env = projectEnv()
  if (env instanceof Response) return env
  const denied = await requireAdmin(request, env.url, env.anon)
  if (denied) return denied

  let body: LookupBody
  try {
    body = (await request.json()) as LookupBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  try {
    if (body.action === 'lookup') {
      const key = Deno.env.get('GOOGLE_MAPS_API_KEY')
      if (!key) return json({ error: 'google_maps_not_configured' }, 503)
      return await lookup(body, key)
    }
    if (body.action === 'create') {
      const authorization = request.headers.get('Authorization')
      if (!authorization) return json({ error: 'not_authenticated' }, 401)
      return await createPlace(body.place, authorization, env.url, env.anon)
    }
    return json({ error: 'unknown_action' }, 400)
  } catch (error) {
    if (error instanceof GoogleError) {
      const status = error.status === 404 ? 404 : 502
      return json({ error: error.message }, status)
    }
    return json({ error: 'admin_places_failed' }, 500)
  }
})
