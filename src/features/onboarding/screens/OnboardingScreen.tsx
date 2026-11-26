import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Button from '@/components/ui/Button'
import Screen from '@/components/ui/Screen'
import { useAuth } from '@/features/auth/useAuth'
import { saveProfileDetails, type Profile, type ProfileDetails } from '@/features/onboarding/api'
import { COUNTRIES, flagOf } from '@/features/onboarding/data/nationalities'
import { AGE_RANGES, GENDERS, HOUSEHOLDS, TRAVEL_FREQUENCIES } from '@/features/onboarding/data/options'
import { PREFECTURES, prefectureName } from '@/features/onboarding/data/prefectures'
import { nextStepFor } from '@/routes/nextStep'
import { cn } from '@/lib/cn'
import { useAuthMessages } from '@/lib/i18n/authMessages'
import { useLocale } from '@/lib/i18n/LocaleContext'

type OnboardingScreenProps = {
  /** Existing row, when the user got partway through before. */
  profile: Profile | null
  onSaved: (profile: Profile) => void
}

const STEPS = ['age', 'gender', 'residence', 'travel', 'household'] as const

/**
 * After the account exists: five questions, one at a time.
 *
 * Every answer is optional. Skipping stores null. Finishing — even with
 * nothing answered — is what lets the account continue to the map.
 */
export default function OnboardingScreen({ profile, onSaved }: OnboardingScreenProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const t = useAuthMessages()
  const { locale } = useLocale()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [stepIndex, setStepIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [answers, setAnswers] = useState<ProfileDetails>({
    ageRange: profile?.age_range ?? null,
    gender: profile?.gender ?? null,
    residenceCountry: profile?.residence_country ?? null,
    residencePrefecture: profile?.residence_prefecture ?? null,
    travelFrequency: profile?.travel_frequency ?? null,
    household: profile?.household ?? null,
  })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const step = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1

  useEffect(() => {
    headingRef.current?.focus()
  }, [stepIndex])

  function answered(current: ProfileDetails = answers): boolean {
    if (step === 'age') return current.ageRange !== null
    if (step === 'gender') return current.gender !== null
    if (step === 'residence') return current.residenceCountry !== null
    if (step === 'travel') return current.travelFrequency !== null
    return current.household !== null
  }

  function cleared(current: ProfileDetails): ProfileDetails {
    if (step === 'age') return { ...current, ageRange: null }
    if (step === 'gender') return { ...current, gender: null }
    if (step === 'residence') return { ...current, residenceCountry: null, residencePrefecture: null }
    if (step === 'travel') return { ...current, travelFrequency: null }
    return { ...current, household: null }
  }

  function normalized(current: ProfileDetails): ProfileDetails {
    if (current.residenceCountry !== 'JP') return { ...current, residencePrefecture: null }
    return current
  }

  function go(next: number) {
    setDirection(next > stepIndex ? 1 : -1)
    setStepIndex(next)
    setSaveError(null)
  }

  async function finish(draft: ProfileDetails) {
    if (!user) {
      setSaveError(t.onboarding.sessionExpired)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await saveProfileDetails(user.id, normalized(draft))
      onSaved(saved)
      navigate(nextStepFor(user, saved), { replace: true })
    } catch {
      setSaveError(t.onboarding.saveFailed)
      setSaving(false)
    }
  }

  function advance(mode: 'keep' | 'clear') {
    const draft = normalized(mode === 'clear' ? cleared(answers) : answers)
    setAnswers(draft)
    if (isLast) {
      void finish(draft)
      return
    }
    go(stepIndex + 1)
  }

  const hasAnswer = answered()

  return (
    <Screen align="top">
      <div className="flex flex-1 flex-col py-4">
        <div className="flex items-center justify-between">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={() => go(stepIndex - 1)}
              className="min-h-11 rounded-full px-1 text-sm text-sand-muted outline-none focus-visible:ring-2 focus-visible:ring-glow"
            >
              {t.onboarding.back}
            </button>
          ) : (
            <span />
          )}
          <p className="text-xs tracking-[0.18em] text-sand-faint">
            {t.onboarding.progress(stepIndex + 1, STEPS.length)}
          </p>
        </div>

        <div className="mt-6 flex gap-1.5" aria-hidden>
          {STEPS.map((id, index) => (
            <span
              key={id}
              className={cn('h-0.5 flex-1 rounded-full', index <= stepIndex ? 'bg-sand' : 'bg-ink-line')}
            />
          ))}
        </div>

        <div className="relative mt-8 min-h-0 flex-1 overflow-hidden">
          <div
            key={step}
            className="h-full overflow-y-auto motion-safe:animate-[linka-slide-in_320ms_var(--ease-calm)_both]"
            style={{ ['--slide-from' as string]: direction > 0 ? '1.75rem' : '-1.75rem' }}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-sand-faint">{t.onboarding.optional}</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-3 text-3xl font-light leading-snug tracking-tight text-sand outline-none"
            >
              {step === 'age' && t.onboarding.ageRange}
              {step === 'gender' && t.onboarding.gender}
              {step === 'residence' && t.onboarding.residence}
              {step === 'travel' && t.onboarding.travel}
              {step === 'household' && t.onboarding.household}
            </h1>
            {step === 'residence' && (
              <p className="mt-3 text-sm leading-relaxed text-sand-muted">{t.onboarding.residenceHint}</p>
            )}
            {stepIndex === 0 && (
              <p className="mt-3 text-sm leading-relaxed text-sand-muted">{t.onboarding.body}</p>
            )}

            <div className="mt-8 pb-4">
              {step === 'age' && (
                <Choices
                  label={t.onboarding.ageRange}
                  options={AGE_RANGES.map((option) => ({
                    value: option.value,
                    label: option.value === 'under_18' ? t.onboarding.under18 : option.label,
                  }))}
                  value={answers.ageRange}
                  onChange={(ageRange) => setAnswers((current) => ({ ...current, ageRange }))}
                />
              )}
              {step === 'gender' && (
                <Choices
                  label={t.onboarding.gender}
                  options={GENDERS.map((option) => ({
                    value: option.value,
                    label: t.onboarding.genders[option.value as keyof typeof t.onboarding.genders] ?? option.label,
                  }))}
                  value={answers.gender}
                  onChange={(gender) => setAnswers((current) => ({ ...current, gender }))}
                />
              )}
              {step === 'residence' && (
                <ResidenceFields
                  country={answers.residenceCountry}
                  prefecture={answers.residencePrefecture}
                  onCountry={(residenceCountry) =>
                    setAnswers((current) => ({
                      ...current,
                      residenceCountry,
                      residencePrefecture: residenceCountry === 'JP' ? current.residencePrefecture : null,
                    }))
                  }
                  onPrefecture={(residencePrefecture) => setAnswers((current) => ({ ...current, residencePrefecture }))}
                  locale={locale}
                />
              )}
              {step === 'travel' && (
                <Choices
                  label={t.onboarding.travel}
                  options={TRAVEL_FREQUENCIES.map((value) => ({ value, label: t.onboarding.travelOptions[value] }))}
                  value={answers.travelFrequency}
                  onChange={(travelFrequency) => setAnswers((current) => ({ ...current, travelFrequency }))}
                />
              )}
              {step === 'household' && (
                <Choices
                  label={t.onboarding.household}
                  options={HOUSEHOLDS.map((value) => ({ value, label: t.onboarding.householdOptions[value] }))}
                  value={answers.household}
                  onChange={(household) => setAnswers((current) => ({ ...current, household }))}
                />
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 shrink-0 space-y-2">
          {saveError ? (
            <p role="alert" className="mb-2 text-center text-sm text-red-300">
              {saveError}
            </p>
          ) : null}
          <Button onClick={() => advance('keep')} loading={saving} busyLabel={t.busy}>
            {isLast ? (hasAnswer ? t.onboarding.done : t.onboarding.doneSkip) : hasAnswer ? t.onboarding.next : t.onboarding.skip}
          </Button>
          {hasAnswer && !saving && (
            <button
              type="button"
              onClick={() => advance('clear')}
              className="flex h-12 w-full items-center justify-center text-sm text-sand-muted outline-none focus-visible:ring-2 focus-visible:ring-glow"
            >
              {t.onboarding.skip}
            </button>
          )}
        </div>
      </div>
    </Screen>
  )
}

function Choices({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : option.value)}
              className={cn(
                'min-h-12 rounded-full border px-5 text-left text-[0.95rem] transition-colors duration-300 ease-calm outline-none',
                'focus-visible:ring-2 focus-visible:ring-glow focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                selected ? 'border-sand bg-sand text-ink' : 'border-ink-line text-sand hover:border-sand-faint',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function ResidenceFields({
  country,
  prefecture,
  onCountry,
  onPrefecture,
  locale,
}: {
  country: string | null
  prefecture: string | null
  onCountry: (value: string | null) => void
  onPrefecture: (value: string | null) => void
  locale: 'ja' | 'en' | 'zh-Hans'
}) {
  const t = useAuthMessages()
  const countryId = useId()
  const prefectureId = useId()
  const selected = COUNTRIES.find((item) => item.code === country) ?? null

  return (
    <div className="space-y-8">
      <div>
        <label htmlFor={countryId} className="block text-xs uppercase tracking-[0.16em] text-sand-faint">
          {t.onboarding.country}
        </label>
        <div className="mt-3 flex items-center gap-3 border-b border-ink-line pb-3 focus-within:border-glow">
          <span aria-hidden className="text-2xl leading-none">
            {selected ? flagOf(selected.code) : '🌍'}
          </span>
          <select
            id={countryId}
            value={country ?? ''}
            onChange={(event) => onCountry(event.target.value || null)}
            className="w-full appearance-none bg-transparent text-lg text-sand outline-none"
          >
            <option value="" className="bg-ink-raised text-sand">
              {t.onboarding.notSpecified}
            </option>
            {COUNTRIES.map((item) => (
              <option key={item.code} value={item.code} className="bg-ink-raised text-sand">
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {country === 'JP' && (
        <div>
          <label htmlFor={prefectureId} className="block text-xs uppercase tracking-[0.16em] text-sand-faint">
            {t.onboarding.prefecture}
          </label>
          <div className="mt-3 border-b border-ink-line pb-3 focus-within:border-glow">
            <select
              id={prefectureId}
              value={prefecture ?? ''}
              onChange={(event) => onPrefecture(event.target.value || null)}
              className="w-full appearance-none bg-transparent text-lg text-sand outline-none"
            >
              <option value="" className="bg-ink-raised text-sand">
                {t.onboarding.notSpecified}
              </option>
              {PREFECTURES.map((item) => (
                <option key={item.code} value={item.code} className="bg-ink-raised text-sand">
                  {prefectureName(item, locale)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
