import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Lang } from './translations'
import { translations, type Messages } from './translations'

const STORAGE_KEY = 'tododay:lang'

type I18nContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Messages
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readStoredLang(): Lang {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s === 'en' || s === 'fr' || s === 'pt') return s
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined') {
    const n = navigator.language?.toLowerCase() ?? ''
    if (n.startsWith('fr')) return 'fr'
    if (n.startsWith('en')) return 'en'
    if (n.startsWith('pt')) return 'pt'
  }
  return 'pt'
}

function langToHtmlLang(lang: Lang): string {
  if (lang === 'pt') return 'pt'
  if (lang === 'fr') return 'fr'
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    document.documentElement.lang = langToHtmlLang(next)
    document.title = translations[next].documentTitle
  }, [])

  useEffect(() => {
    document.documentElement.lang = langToHtmlLang(lang)
    document.title = translations[lang].documentTitle
  }, [lang])

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: translations[lang],
    }),
    [lang, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
