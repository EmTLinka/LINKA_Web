import { useId, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'

import Button from '@/components/ui/Button'
import LoadingScreen from '@/components/ui/LoadingScreen'
import TextField from '@/components/ui/TextField'
import { createPlace, lookupEnglishName, lookupPlaces, type CreatedPlace, type PlaceCandidate } from '@/features/admin/api'
import { emptyPlaceForm, formFromFetched, placeFromForm, type PlaceForm } from '@/features/admin/placeForm'
import { pendingReturn } from '@/features/auth/pendingReturn'
import { useAuth } from '@/features/auth/useAuth'
import { useProfileContext } from '@/features/onboarding/useProfileContext'

const RETURN_PATH = '/admin/addplaces'
/** The page sits on paper, so typed text has to be graphite. Sand disappears into it. */
const INPUT = 'text-graphite! font-medium'

/**
 * /admin/addplaces — staff page for adding a place. Nothing in the app links
 * here. Lookup and save both POST /functions/v1/admin-places.
 */
export default function AddPlaceScreen() {
  const { session, loading } = useAuth()
  const { profile, loading: profileLoading } = useProfileContext()

  if (loading || (session && profileLoading)) {
    return <LoadingScreen label="Opening the place form" />
  }

  if (!session) {
    pendingReturn.write(RETURN_PATH)
    return <Navigate to="/auth" replace />
  }

  if (profile?.role !== 'admin') {
    return (
      <main className="flex min-h-full items-center px-7">
        <p className="mx-auto max-w-sm text-lg text-sand">このアカウントでは開けません。</p>
      </main>
    )
  }

  return <AddPlaceForm accessToken={session.access_token} />
}

function AddPlaceForm({ accessToken }: { accessToken: string }) {
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<PlaceForm>(emptyPlaceForm)
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const picked = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedPlace | null>(null)

  function update<K extends keyof PlaceForm>(key: K, value: PlaceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function search(event: FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setSearching(true)
    setError(null)
    setCreated(null)
    try {
      const found = await lookupPlaces(accessToken, trimmed)
      setCandidates(found)
      if (found.length === 0) setError('見つかりませんでした。下の欄に手入力できます。')
    } catch (cause) {
      setCandidates([])
      setError(cause instanceof Error ? cause.message : 'lookup_failed')
    } finally {
      setSearching(false)
    }
  }

  async function applyCandidate(candidate: PlaceCandidate) {
    const token = candidate.googlePlaceId ?? candidate.place.native_name ?? ''
    picked.current = token
    setForm(formFromFetched(candidate.place))
    setError(null)
    setCreated(null)
    if (!candidate.googlePlaceId) return
    try {
      const names = await lookupEnglishName(accessToken, candidate.googlePlaceId)
      if (picked.current !== token) return
      setForm((current) => ({
        ...current,
        ...(names.romanized_name ? { romanized_name: names.romanized_name } : {}),
        ...(names.slug ? { slug: names.slug } : {}),
      }))
    } catch {
      if (picked.current === token) setError('英語名は取れませんでした。slug は手入力できます。')
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const latitude = Number(form.latitude)
    const longitude = Number(form.longitude)
    if (!form.slug.trim() || !form.native_name.trim() || !form.latitude.trim() || !form.longitude.trim()
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError('slug、現地語の名前、緯度、経度は必須です。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      setCreated(await createPlace(accessToken, placeFromForm(form)))
    } catch (cause) {
      setCreated(null)
      setError(cause instanceof Error ? cause.message : 'create_failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-full px-7 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-lg flex-col">
        <h1 className="text-3xl font-light tracking-tight text-sand">場所を追加</h1>
        <p className="mt-3 text-sm leading-relaxed text-sand-muted">
          地図から取るか、欄を手で埋めます。公開した destination だけ、NFC の URL が作られます。
        </p>

        <form onSubmit={search} className="mt-10 flex flex-col gap-6">
          <TextField
            label="地図で探す"
            name="query"
            value={query}
            placeholder="トキの森公園"
            className={INPUT}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" loading={searching} busyLabel="検索しています" disabled={!query.trim()}>
            地図から取得
          </Button>
        </form>

        {candidates.length > 0 && (
          <ul className="mt-6 flex flex-col gap-2">
            {candidates.map((candidate) => {
              const name = candidate.place.native_name || candidate.googlePlaceId || '名称なし'
              const where = candidate.place.translations?.[0]?.locality
              return (
                <li key={candidate.googlePlaceId ?? name}>
                  <button
                    type="button"
                    onClick={() => applyCandidate(candidate)}
                    className="w-full rounded-2xl border border-ink-line px-4 py-3 text-left transition-colors hover:border-glow"
                  >
                    <span className="block text-sand">{name}</span>
                    {where ? <span className="mt-1 block text-sm text-sand-faint">{where}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <form onSubmit={save} className="mt-12 flex flex-col gap-8">
          <TextField className={INPUT} label="slug" name="slug" value={form.slug} hint="英小文字とハイフン" onChange={(event) => update('slug', event.target.value)} />
          <TextField className={INPUT} label="parent_slug" name="parent_slug" value={form.parent_slug} hint="親の slug。佐渡なら sado" onChange={(event) => update('parent_slug', event.target.value)} />
          <Choice
            label="kind"
            value={form.kind}
            onChange={(value) => update('kind', value === 'region' ? 'region' : 'destination')}
            options={[
              { value: 'destination', label: 'destination' },
              { value: 'region', label: 'region' },
            ]}
          />
          <TextField className={INPUT} label="native_name" name="native_name" value={form.native_name} onChange={(event) => update('native_name', event.target.value)} />
          <TextField className={INPUT} label="native_locale" name="native_locale" value={form.native_locale} onChange={(event) => update('native_locale', event.target.value)} />
          <TextField className={INPUT} label="romanized_name" name="romanized_name" value={form.romanized_name} onChange={(event) => update('romanized_name', event.target.value)} />
          <TextField className={INPUT} label="latitude" name="latitude" inputMode="decimal" value={form.latitude} onChange={(event) => update('latitude', event.target.value)} />
          <TextField className={INPUT} label="longitude" name="longitude" inputMode="decimal" value={form.longitude} onChange={(event) => update('longitude', event.target.value)} />
          <TextField className={INPUT} label="timezone" name="timezone" value={form.timezone} onChange={(event) => update('timezone', event.target.value)} />
          <TextField className={INPUT} label="official_url" name="official_url" value={form.official_url} hint="https のみ" onChange={(event) => update('official_url', event.target.value)} />
          <Choice
            label="status"
            value={form.status}
            onChange={(value) => update('status', value === 'published' || value === 'archived' ? value : 'draft')}
            options={[
              { value: 'draft', label: 'draft' },
              { value: 'published', label: 'published' },
              { value: 'archived', label: 'archived' },
            ]}
          />
          <label className="flex items-center gap-3 text-sm text-sand">
            <input
              type="checkbox"
              checked={form.discovery_enabled}
              onChange={(event) => update('discovery_enabled', event.target.checked)}
              className="size-4 accent-glow"
            />
            discovery_enabled
          </label>
          <Choice
            label="partner_status"
            value={form.partner_status}
            onChange={(value) => update('partner_status', value === 'partner' ? 'partner' : 'none')}
            options={[
              { value: 'none', label: 'none' },
              { value: 'partner', label: 'partner' },
            ]}
          />
          <Choice
            label="label_side"
            value={form.label_side}
            onChange={(value) => update('label_side', value === 'left' || value === 'right' || value === 'below' ? value : '')}
            options={[
              { value: '', label: '未設定' },
              { value: 'left', label: 'left' },
              { value: 'right', label: 'right' },
              { value: 'below', label: 'below' },
            ]}
          />

          <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-sand-faint">日本語</h2>
          <TextField className={INPUT} label="name" name="translation_name" value={form.translation_name} onChange={(event) => update('translation_name', event.target.value)} />
          <TextField className={INPUT} label="locality" name="locality" value={form.locality} onChange={(event) => update('locality', event.target.value)} />
          <Area label="short_description" value={form.short_description} onChange={(value) => update('short_description', value)} />
          <Area label="practical_info.hours" value={form.hours} onChange={(value) => update('hours', value)} />
          <TextField className={INPUT} label="source_url" name="translation_source_url" value={form.translation_source_url} onChange={(event) => update('translation_source_url', event.target.value)} />

          <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-sand-faint">出典</h2>
          <TextField className={INPUT} label="url" name="source_url" value={form.source_url} onChange={(event) => update('source_url', event.target.value)} />
          <TextField className={INPUT} label="publisher" name="source_publisher" value={form.source_publisher} onChange={(event) => update('source_publisher', event.target.value)} />
          <Area label="note" value={form.source_note} onChange={(value) => update('source_note', value)} />

          <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-sand-faint">画像（任意）</h2>
          <TextField className={INPUT} label="hero_image_path" name="hero_image_path" value={form.hero_image_path} onChange={(event) => update('hero_image_path', event.target.value)} />
          <TextField className={INPUT} label="hero_image_credit" name="hero_image_credit" value={form.hero_image_credit} onChange={(event) => update('hero_image_credit', event.target.value)} />
          <TextField className={INPUT} label="hero_image_source_url" name="hero_image_source_url" value={form.hero_image_source_url} onChange={(event) => update('hero_image_source_url', event.target.value)} />
          <TextField className={INPUT} label="hero_image_license" name="hero_image_license" value={form.hero_image_license} onChange={(event) => update('hero_image_license', event.target.value)} />
          <TextField className={INPUT} label="hero_image_license_url" name="hero_image_license_url" value={form.hero_image_license_url} onChange={(event) => update('hero_image_license_url', event.target.value)} />

          {error ? (
            <p role="alert" className="text-sm text-red-300">{error}</p>
          ) : null}
          {created ? <Created created={created} /> : null}

          <Button type="submit" loading={saving} busyLabel="追加しています">
            places に追加
          </Button>
        </form>
      </div>
    </main>
  )
}

function Created({ created }: { created: CreatedPlace }) {
  const path = created.touchpoint?.path
  return (
    <div role="status" className="rounded-2xl border border-ink-line px-4 py-4 text-sm leading-relaxed text-sand">
      <p>{created.place?.slug ? `${created.place.slug} を追加しました。` : '追加しました。'}</p>
      {path ? (
        <p className="mt-2 text-glow">{path}</p>
      ) : (
        <p className="mt-2 text-sand-muted">下書きです。status を published にすると NFC の URL が作られます。</p>
      )}
    </div>
  )
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const id = useId()
  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-[0.16em] text-sand-faint">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full border-b border-ink-line bg-transparent pb-3 text-lg font-medium text-graphite outline-none focus:border-glow"
      >
        {options.map((option) => (
          <option key={option.value || 'empty'} value={option.value} className="bg-paper-lit text-graphite">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-[0.16em] text-sand-faint">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full resize-y border-b border-ink-line bg-transparent pb-3 text-lg font-medium text-graphite outline-none focus:border-glow"
      />
    </div>
  )
}
