/**
 * Login form. Posts to `/login`, which sets the `session_token` cookie, then
 * refreshes the cached session so guards immediately see the new user.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ApiError, login } from '../lib/api'
import { homeFor, useRegistrationOpen, useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { ErrorBox } from './ui'

export function LoginPage() {
  const navigate = useNavigate()
  const { refresh } = useSession()
  const registrationOpen = useRegistrationOpen()
  const t = useT()
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canSubmit = handle.trim() !== '' && password !== '' && !busy

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) {
      setError(t('用户名和密码为必填项。', 'Username and password are required.'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await login(handle.trim(), password)
      const session = await refresh()
      // Preserve a deep link when one was supplied, else land on the catalogue.
      const redirect = new URLSearchParams(window.location.search).get('redirect')
      await navigate({ to: redirect && redirect.startsWith('/') ? redirect : homeFor(session.data ?? null) })
    } catch (e) {
      // A 403 here is about the account's state, not the credentials — those
      // only get reported once the password has already been accepted.
      if (e instanceof ApiError && e.status === 403) {
        const code = typeof e.body.code === 'string' ? e.body.code : ''
        if (code === 'account_pending') {
          setError(t('账号正在等待管理员审核，通过后即可登录。', 'This account is still waiting for approval.'))
        } else if (code === 'account_rejected') {
          setError(t('该注册申请未通过审核，如有疑问请联系管理员。', 'This registration was not approved. Please contact an administrator.'))
        } else {
          setError(t('暂时无法登录，请稍后重试。', 'Could not log in right now. Please try again.'))
        }
      } else {
        setError(t('用户名或密码不正确。', 'Incorrect username or password.'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow" />
      <div className="login-container">
        <div className="login-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="login-title">{t('登录', 'Log in')}</h1>
        <p className="login-subtitle">{t('登录以发布和管理技能与知识库。', 'Log in to publish and manage skills and knowledge bases.')}</p>

        <form className="login-form" onSubmit={onSubmit}>
          {error && <ErrorBox message={error} />}

          <div className="login-field">
            <label className="form-label" htmlFor="handle">
              {t('用户名', 'Username')}
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
                </svg>
              </span>
              <input
                id="handle"
                className="form-input login-input"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                autoComplete="username"
                placeholder={t('请输入用户名', 'Enter your username')}
              />
            </div>
          </div>

          <div className="login-field">
            <label className="form-label" htmlFor="password">
              {t('密码', 'Password')}
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <input
                id="password"
                className="form-input login-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder={t('请输入密码', 'Enter your password')}
              />
              <button
                className="login-eye-btn"
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('隐藏密码', 'Hide password') : t('显示密码', 'Show password')}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 5.2A9.7 9.7 0 0 1 12 5c5 0 9 4.5 9 7 0 .8-.5 1.8-1.4 2.9M6.1 6.9C3.9 8.3 3 10.2 3 12c0 2.5 4 7 9 7 1.3 0 2.5-.3 3.6-.8" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" />
                    <circle cx="12" cy="12" r="2.6" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button className="btn btn-primary login-submit" type="submit" disabled={!canSubmit}>
            {busy && <span className="login-spinner" />}
            {busy ? t('登录中...', 'Logging in...') : t('登录', 'Log in')}
          </button>

          {registrationOpen && (
            <p className="login-alt">
              {t('还没有账号？', 'No account yet?')}{' '}
              <Link to="/register">{t('去注册', 'Sign up')}</Link>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
