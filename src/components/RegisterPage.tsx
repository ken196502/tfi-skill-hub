/**
 * Sign-up form. Posts to `/register`, which creates an account that waits for
 * an admin decision — no session is issued here, so the page ends on a
 * confirmation rather than a redirect.
 */

import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { register } from '../lib/api'
import { useRegistrationOpen } from '../lib/auth'
import { useT } from '../lib/i18n'
import { ErrorBox } from './ui'

/** Mirrors the server's rule so the common cases are reported before posting. */
const HANDLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

export function RegisterPage() {
  const t = useT()
  const open = useRegistrationOpen()
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const canSubmit =
    handle.trim() !== '' && email.trim() !== '' && password !== '' && confirm !== '' && !busy

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    if (!HANDLE_PATTERN.test(handle.trim())) {
      setError(
        t(
          '用户名需为 2–32 位，可用字母、数字、点、短横线和下划线，且以字母或数字开头。',
          'Username must be 2–32 characters: letters, digits, dot, dash or underscore, starting with a letter or digit.',
        ),
      )
      return
    }
    if (email.trim() === '') {
      setError(t('请填写邮箱。', 'Please enter your email.'))
      return
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError(t('邮箱格式不正确。', 'Please enter a valid email address.'))
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t(`密码至少 ${MIN_PASSWORD_LENGTH} 位。`, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`))
      return
    }
    if (password !== confirm) {
      setError(t('两次输入的密码不一致。', 'The two passwords do not match.'))
      return
    }

    setBusy(true)
    setError('')
    try {
      await register({
        handle: handle.trim(),
        password,
        displayName: displayName.trim(),
        email: email.trim(),
      })
      setDone(true)
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : t('提交失败，请稍后重试。', 'Could not submit. Please try again.'))
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
            <circle cx="10" cy="8" r="3.5" />
            <path d="M3 20c0-3.6 3.1-6 7-6" />
            <path d="M17 13v6M14 16h6" />
          </svg>
        </div>
        <h1 className="login-title">{t('注册', 'Sign up')}</h1>
        <p className="login-subtitle">
          {t('提交后需管理员审核，通过后即可登录。', 'Your account is reviewed before you can sign in.')}
        </p>

        {!open ? (
          <div className="login-form">
            <p className="login-note">{t('注册暂未开放。', 'Sign-up is currently closed.')}</p>
            <Link className="btn btn-secondary login-submit" to="/login">
              {t('返回登录', 'Back to log in')}
            </Link>
          </div>
        ) : done ? (
          <div className="login-form">
            <p className="login-note">
              {t('已提交，正在等待管理员审核。通过后即可用该账号登录。', 'Submitted — an administrator will review it. You can sign in once it is approved.')}
            </p>
            <Link className="btn btn-primary login-submit" to="/login">
              {t('返回登录', 'Back to log in')}
            </Link>
          </div>
        ) : (
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
                  placeholder={t('设置登录用户名', 'Choose a username')}
                />
              </div>
            </div>

            <div className="login-field">
              <label className="form-label" htmlFor="displayName">
                {t('显示名称（可选）', 'Display name (optional)')}
              </label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                </span>
                <input
                  id="displayName"
                  className="form-input login-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  placeholder={t('例如：张伟', 'e.g. Jane Doe')}
                />
              </div>
            </div>

            <div className="login-field">
              <label className="form-label" htmlFor="email">
                {t('邮箱', 'Email')}
              </label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3.5 6.5 12 13l8.5-6.5" />
                  </svg>
                </span>
                <input
                  id="email"
                  className="form-input login-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder={t('例如：name@example.com', 'e.g. name@example.com')}
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
                  autoComplete="new-password"
                  placeholder={t(`至少 ${MIN_PASSWORD_LENGTH} 位`, `At least ${MIN_PASSWORD_LENGTH} characters`)}
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

            <div className="login-field">
              <label className="form-label" htmlFor="confirmPassword">
                {t('确认密码', 'Confirm password')}
              </label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    <path d="M9.6 15.4l1.6 1.6 3.2-3.4" />
                  </svg>
                </span>
                <input
                  id="confirmPassword"
                  className="form-input login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder={t('再次输入密码', 'Repeat the password')}
                />
              </div>
            </div>

            <button className="btn btn-primary login-submit" type="submit" disabled={!canSubmit}>
              {busy && <span className="login-spinner" />}
              {busy ? t('提交中...', 'Submitting...') : t('提交注册', 'Create account')}
            </button>

            <p className="login-alt">
              {t('已有账号？', 'Already have an account?')}{' '}
              <Link to="/login">{t('去登录', 'Log in')}</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
