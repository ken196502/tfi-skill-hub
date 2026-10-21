/**
 * Application shell: sticky header, navigation, theme + language switches and
 * footer. Mirrors the original `Layout` component, including the `?embed=1`
 * mode that renders pages without chrome for iframe embedding.
 */

import { useState, useEffect, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useLogout, useSession } from '../lib/auth'
import { useLang, useT } from '../lib/i18n'

const THEME_KEY = 'skillhub.theme'

function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false
  return (
    new URLSearchParams(window.location.search).get('embed') === '1' ||
    window.self !== window.top
  )
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

function LangSwitch({ lang, toggle }: { lang: string; toggle: () => void }) {
  const t = useT()
  return (
    <button className="icon-btn" onClick={toggle} title={t('切换语言', 'Switch language')} type="button">
      {lang === 'zh' ? 'EN' : '中'}
    </button>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { user, refresh } = useSession()
  const logout = useLogout()
  const { lang, toggle: toggleLang } = useLang()
  const t = useT()
  const [isScrolled, setIsScrolled] = useState(false)
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
    await navigate({ to: '/login' })
  }

  return (
    <>
      <header className={`header${isScrolled ? ' scrolled' : ''}`}>
        <div className="container header-inner">
          <Link to="/" className="logo" aria-label="TFI SKILL HUB">
            <span className="logo-mark" aria-hidden="true" />
            <span className="logo-text">SKILLHUB</span>
          </Link>
          <nav className="nav">
            <Link to="/">{t('首页', 'Home')}</Link>
            <Link to="/skills">{t('技能', 'Skills')}</Link>
            <Link to="/knowledge-bases">{t('知识库', 'Knowledge bases')}</Link>
            <Link to="/favorites">{t('收藏', 'Favorites')}</Link>
            {user ? (
              <>
                {user.role === 'admin' && <Link to="/admin">{t('管理', 'Admin')}</Link>}
                <span className="nav-user" title={user.handle}>
                  <span className="nav-user-avatar" aria-hidden="true">
                    {(user.displayName || user.handle).charAt(0).toUpperCase()}
                  </span>
                  {user.displayName || user.handle}
                  {/* Labelled here so it is obvious at a glance which account is
                      signed in — admin and ordinary user are the only roles. */}
                  {user.role === 'admin' && <span className="nav-role-chip">{t('管理员', 'Admin')}</span>}
                </span>
                <button className="btn btn-secondary btn-small" onClick={onLogout} type="button">
                  {t('退出', 'Log out')}
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-secondary btn-small">
                {t('登录', 'Log in')}
              </Link>
            )}
            <LangSwitch lang={lang} toggle={toggleLang} />
            <ThemeToggle label={t('切换主题', 'Toggle theme')} />
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="footer">
        <div className="container">
          {t('TFI SKILL HUB — AI 智能体技能与知识库注册中心。', 'TFI SKILL HUB — the agent skill and knowledge base registry.')}
        </div>
      </footer>
    </>
  )
}

export { isEmbedded }
