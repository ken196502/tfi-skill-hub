/**
 * Language context: the single source of truth for the zh/en switch.
 *
 * `LangProvider` owns the current language, persists it to localStorage and
 * mirrors it onto `<html lang>`. Components read it via `useLang()` and pick
 * copy via `useT()`:
 *
 *   const t = useT()
 *   <h1>{t('技能', 'Skills')}</h1>
 *
 * Passing both languages inline keeps every page's copy next to its markup —
 * there is no central key registry to fall out of sync.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Lang = 'zh' | 'en'

export const LANG_KEY = 'skillhub.lang'

interface LangContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  toggle: () => {},
})

function readSavedLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  const saved = window.localStorage.getItem(LANG_KEY)
  return saved === 'zh' ? 'zh' : 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(readSavedLang)

  useEffect(() => {
    document.documentElement.lang = lang
    window.localStorage.setItem(LANG_KEY, lang)
  }, [lang])

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      toggle: () => setLang((current) => (current === 'zh' ? 'en' : 'zh')),
    }),
    [lang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

/** Current language plus the setter. Defaults to English until saved otherwise. */
export function useLang(): LangContextValue {
  return useContext(LangContext)
}

/** Inline copy picker: `t('中文', 'English')`. */
export function useT(): (zh: string, en: string) => string {
  const { lang } = useLang()
  return (zh, en) => (lang === 'zh' ? zh : en)
}

/**
 * Localized display name / summary for catalogue entities (skills & plugins).
 * Falls back to the base (Chinese / author-supplied) value when no English
 * variant is stored, so user-published entries never render blank.
 */
export function localizedName(
  entity: { displayName?: string; displayNameEn?: string; slug: string },
  lang: Lang,
): string {
  if (lang === 'en' && entity.displayNameEn && entity.displayNameEn.trim() !== '') {
    return entity.displayNameEn
  }
  return entity.displayName && entity.displayName.trim() !== '' ? entity.displayName : entity.slug
}

/** Localized summary; empty string when neither language has one. */
export function localizedSummary(
  entity: { summary?: string; summaryEn?: string },
  lang: Lang,
): string {
  if (lang === 'en' && entity.summaryEn && entity.summaryEn.trim() !== '') {
    return entity.summaryEn
  }
  return entity.summary ?? ''
}
