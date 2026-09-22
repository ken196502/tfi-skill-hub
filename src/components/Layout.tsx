/**
 * Application shell: sticky header, navigation, theme + language switches and
 * footer. Mirrors the original `Layout` component, including the `?embed=1`
 * mode that renders pages without chrome for iframe embedding.
 */

import { useState, useEffect, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useLogout, useSession } from '../lib/auth'

type Lang = 'zh' | 'en'

/** The subset of UI strings the shell needs; the full catalogue lives in i18n. */
const STRINGS: Record<Lang, Record<string, string>> = {
  zh: {
    skills: '技能',
    features: 'Features',
    login: '登录',
    logout: '退出',
    footer: 'TFI SKILL HUB — AI 智能体技能注册中心。',
    toggleTheme: '切换主题',
    switchLang: '切换语言',
  },
  en: {
    skills: 'Skills',
    features: 'Features',
    login: 'Log in',
    logout: 'Log out',
    footer: 'TFI SKILL HUB — the agent skill registry.',
    toggleTheme: 'Toggle theme',
    switchLang: 'Switch language',
  },
}

const LANG_KEY = 'skillhub.lang'
const THEME_KEY = 'skillhub.theme'

function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false
  return (
    new URLSearchParams(window.location.search).get('embed') === '1' ||
    window.self !== window.top
  )
}

export function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => {
    const saved = window.localStorage.getItem(LANG_KEY) as Lang | null
    if (saved === 'zh' || saved === 'en') setLang(saved)
  }, [])
  const toggle = () =>
    setLang((current) => {
      const next: Lang = current === 'zh' ? 'en' : 'zh'
      window.localStorage.setItem(LANG_KEY, next)
      return next
    })
  return [lang, toggle]
}

function ThemeToggle({ label }: { label: string }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY)
    const initial =
      saved === 'light' || saved === 'dark'
        ? saved
        : 'dark'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const flip = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      window.localStorage.setItem(THEME_KEY, next)
      return next
    })
  }

  return (
    <button className="icon-btn theme-toggle" onClick={flip} title={label} type="button">
      {theme === 'dark' ? '\u263D' : '\u2600'}
    </button>
  )
}

function LangSwitch({ lang, toggle }: { lang: Lang; toggle: () => void }) {
  return (
    <button className="icon-btn" onClick={toggle} title={STRINGS[lang].switchLang} type="button">
      {lang === 'zh' ? 'EN' : '中'}
    </button>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, refresh } = useSession()
  const logout = useLogout()
  const [lang, toggleLang] = useLang()
  const [isScrolled, setIsScrolled] = useState(false)
  const t = STRINGS[lang]
  const embedded = isEmbedded()

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [])

  if (embedded) {
    return <main className="embedded-main">{children}</main>
  }

  const onLogout = async () => {
    await logout()
    await refresh()
  }

  return (
    <>
      <header className={`header${isScrolled ? ' scrolled' : ''}`}>
        <div className="container header-inner">
          <Link to="/" className="logo">
            <span className="logo-icon" aria-hidden="true">
              <svg className="logo-spark" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1.5 14.1 9.9 22.5 12l-8.4 2.1L12 22.5l-2.1-8.4L1.5 12l8.4-2.1L12 1.5Z" />
              </svg>
            </span>
            <span>TFI SKILL HUB</span>
          </Link>
          <nav className="nav">
            <Link to="/skills">{t.skills}</Link>
            {user ? (
              <>
                {user.role === 'admin' && <Link to="/admin">{t.features}</Link>}
                <span className="nav-user">{user.handle}</span>
                <button className="btn btn-secondary btn-small" onClick={onLogout} type="button">
                  {t.logout}
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-secondary btn-small">
                {t.login}
              </Link>
            )}
            <LangSwitch lang={lang} toggle={toggleLang} />
            <ThemeToggle label={t.toggleTheme} />
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="footer">
        <div className="container">{t.footer}</div>
      </footer>
    </>
  )
}

export { isEmbedded }
