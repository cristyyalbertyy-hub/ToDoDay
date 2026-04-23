import type { Lang } from './translations'
import { useI18n } from './I18nContext'
import './LanguageSwitcher.css'

const OPTIONS: { code: Lang; label: string }[] = [
  { code: 'pt', label: 'PT' },
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
]

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n()

  return (
    <div className={`lang-switch ${className}`.trim()} role="group" aria-label="Language">
      {OPTIONS.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          className={`lang-switch__btn ${lang === code ? 'lang-switch__btn--active' : ''}`}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
