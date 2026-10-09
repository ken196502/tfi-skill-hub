/**
 * Sign-up form. Posts to `/register`, which creates an account that waits for
 * an admin decision — no session is issued here, so the page ends on a
 * confirmation rather than a redirect.
 *
 * Besides the credentials the form collects who the applicant is and what they
 * intend to research, because that is what the review is based on. The form is
 * laid out in three labelled sections rather than one long column: the account
 * itself, the person's affiliation, and their research focus. Only the office
 * location is optional.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { register } from '../lib/api'
import { useRegistrationOpen } from '../lib/auth'
import { useLang, useT } from '../lib/i18n'
import {
  PROFILE_FIELD_MAX,
  RESEARCH_NEEDS_MAX,
  MARKETS,
  countryOptions,
  isEmailVerificationCode,
} from '../lib/registration'
import { Combobox } from './Combobox'
import { ErrorBox } from './ui'

/** Mirrors the server's rule so the common cases are reported before posting. */
const HANDLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

/** Which required fields are still empty — drives the inline "fill this in" hints. */
type FieldName =
  | 'displayName'
  | 'email'
  | 'emailCode'
  | 'password'
  | 'confirm'
  | 'country'
  | 'organization'
  | 'jobTitle'
  | 'researchNeeds'
  | 'markets'

export function RegisterPage() {
  const t = useT()
  const { lang } = useLang()
  const open = useRegistrationOpen()
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [country, setCountry] = useState('')
  const [organization, setOrganization] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [officeLocation, setOfficeLocation] = useState('')
  const [researchNeeds, setResearchNeeds] = useState('')
  const [markets, setMarkets] = useState<string[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  /** Set once a submit has been attempted, so hints appear only after that. */
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Stable across renders so the combobox's filter memo is not thrown away on
  // every keystroke elsewhere in the form.
  const countries = useMemo(() => countryOptions(lang), [lang])

  const toggleMarket = (slug: string) => {
    setTouched(true)
    setMarkets((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    )
  }

  const missing = new Set<FieldName>()
  if (displayName.trim() === '') missing.add('displayName')
  if (email.trim() === '') missing.add('email')
  if (emailCode.trim() === '') missing.add('emailCode')
  if (password === '') missing.add('password')
  if (confirm === '') missing.add('confirm')
  if (country === '') missing.add('country')
  if (organization.trim() === '') missing.add('organization')
  if (jobTitle.trim() === '') missing.add('jobTitle')
  if (researchNeeds.trim() === '') missing.add('researchNeeds')
  if (markets.length === 0) missing.add('markets')

  const invalid = new Set<FieldName>()
  if (email.trim() !== '' && !EMAIL_PATTERN.test(email.trim())) invalid.add('email')
  if (emailCode.trim() !== '' && !isEmailVerificationCode(emailCode)) invalid.add('emailCode')
  if (password !== '' && password.length < MIN_PASSWORD_LENGTH) invalid.add('password')
  if (confirm !== '' && password !== confirm) invalid.add('confirm')

  /** Highlighted only after a submit attempt, so the form is not shouting on arrival. */
  const mark = (field: FieldName): string =>
    touched && (missing.has(field) || invalid.has(field)) ? ' field-invalid' : ''

  const canSubmit = handle.trim() !== '' && password !== '' && confirm !== '' && !busy

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
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
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError(t('邮箱格式不正确。', 'Please enter a valid email address.'))
      return
    }
    if (!isEmailVerificationCode(emailCode)) {
      setError(t('邮箱验证码不正确。', 'That email verification code is not correct.'))
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
        emailCode: emailCode.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        country,
        organization: organization.trim(),
        jobTitle: jobTitle.trim(),
        officeLocation: officeLocation.trim(),
        researchNeeds: researchNeeds.trim(),
        markets,
      })
      setDone(true)
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : t('提交失败，请稍后重试。', 'Could not submit. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="login-page login-page-wide">
      <div className="login-glow" />
      <div className="login-container login-container-wide">
        <div className="login-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="10" cy="8" r="3.5" />
            <path d="M3 20c0-3.6 3.1-6 7-6" />
            <path d="M17 13v6M14 16h6" />
          </svg>
        </div>
        <h1 className="login-title">{t('注册', 'Sign up')}</h1>
        <p className="login-subtitle">
          {t(
            '请填写以下信息，提交后需管理员审核，通过后即可登录。',
            'Tell us a little about yourself. An administrator reviews your application before you can sign in.',
          )}
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
          <form className="login-form login-form-wide" onSubmit={onSubmit} noValidate>
            {error && <ErrorBox message={error} />}

            {/* ── 账号 ───────────────────────────────────────────── */}
            <fieldset className="reg-section">
              <legend className="reg-legend">{t('账号信息', 'Account')}</legend>

              <div className="reg-row">
                <div className="login-field">
                  <label className="form-label" htmlFor="handle">
                    {t('用户名', 'Username')} *
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
                      placeholder={t('用于登录', 'Used to sign in')}
                    />
                  </div>
                </div>

                <div className="login-field">
                  <label className="form-label" htmlFor="displayName">
                    {t('姓名', 'Full name')} *
                  </label>
                  <div className="login-input-wrap">
                    <span className="login-input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M4 7h16M4 12h16M4 17h10" />
                      </svg>
                    </span>
                    <input
                      id="displayName"
                      className={`form-input login-input${mark('displayName')}`}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      autoComplete="name"
                      placeholder={t('例如：张伟', 'e.g. Jane Doe')}
                    />
                  </div>
                  {touched && missing.has('displayName') && (
                    <span className="field-hint">{t('请填写姓名。', 'Please enter your name.')}</span>
                  )}
                </div>
              </div>

              <div className="reg-row">
                <div className="login-field">
                  <label className="form-label" htmlFor="email">
                    {t('邮箱', 'Email')} *
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
                      className={`form-input login-input${mark('email')}`}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder={t('例如：name@example.com', 'e.g. name@example.com')}
                    />
                  </div>
                  {touched && (missing.has('email') || invalid.has('email')) && (
                    <span className="field-hint">{t('请填写有效的邮箱地址。', 'Please enter a valid email address.')}</span>
                  )}
                </div>

                <div className="login-field">
                  <label className="form-label" htmlFor="emailCode">
                    {t('邮箱验证码', 'Email verification code')} *
                  </label>
                  <div className="login-input-wrap">
                    <span className="login-input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M20 12v8H4v-8M2 7h20v5H2zM12 15v-3M12 7V4.5" />
                      </svg>
                    </span>
                    <input
                      id="emailCode"
                      className={`form-input login-input login-input-code${mark('emailCode')}`}
                      // Digits only, so the six-character code cannot carry a
                      // typo the user then has to hunt for.
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                      placeholder={t('6 位数字', '6 digits')}
                    />
                  </div>
                  {touched && (missing.has('emailCode') || invalid.has('emailCode')) && (
                    <span className="field-hint">
                      {missing.has('emailCode')
                        ? t('请输入邮箱收到的验证码。', 'Please enter the code sent to your email.')
                        : t('验证码不正确，请重新输入。', 'That code is not correct. Please try again.')}
                    </span>
                  )}
                </div>
              </div>

              <div className="reg-row">
                <div className="login-field">
                  <label className="form-label" htmlFor="country">
                    {t('所在国家或地区', 'Country or region')} *
                  </label>
                  <Combobox
                    id="country"
                    value={country}
                    options={countries}
                    onChange={(next) => {
                      setCountry(next)
                      setTouched(true)
                    }}
                    placeholder={t('输入关键字搜索，或展开下拉选择', 'Type to search, or open the list')}
                    invalid={touched && missing.has('country')}
                    emptyLabel={t('没有匹配的地区，请换一个关键字或选择「其他」', 'No match — try another keyword, or pick "Other"')}
                  />
                  {touched && missing.has('country') && (
                    <span className="field-hint">{t('请选择所在国家或地区。', 'Please select your country or region.')}</span>
                  )}
                </div>

                <div className="login-field">
                  <label className="form-label" htmlFor="officeLocation">
                    {t('办公地区', 'Office location')}
                    <span className="form-optional">{t('（选填）', '(optional)')}</span>
                  </label>
                  <div className="login-input-wrap">
                    <span className="login-input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                        <circle cx="12" cy="10" r="2.6" />
                      </svg>
                    </span>
                    <input
                      id="officeLocation"
                      className="form-input login-input"
                      value={officeLocation}
                      maxLength={PROFILE_FIELD_MAX}
                      onChange={(e) => setOfficeLocation(e.target.value)}
                      placeholder={t('例如：上海', 'e.g. Shanghai')}
                    />
                  </div>
                </div>
              </div>

              <div className="reg-row">
                <div className="login-field">
                  <label className="form-label" htmlFor="password">
                    {t('密码', 'Password')} *
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
                      className={`form-input login-input${mark('password')}`}
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
                  {touched && (missing.has('password') || invalid.has('password')) && (
                    <span className="field-hint">{t(`密码至少 ${MIN_PASSWORD_LENGTH} 位。`, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)}</span>
                  )}
                </div>

                <div className="login-field">
                  <label className="form-label" htmlFor="confirmPassword">
                    {t('确认密码', 'Confirm password')} *
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
                      className={`form-input login-input${mark('confirm')}`}
                      type={showPassword ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder={t('再次输入密码', 'Repeat the password')}
                    />
                  </div>
                  {touched && (missing.has('confirm') || invalid.has('confirm')) && (
                    <span className="field-hint">{t('两次输入的密码需一致。', 'The two passwords must match.')}</span>
                  )}
                </div>
              </div>
            </fieldset>

            {/* ── 机构 ───────────────────────────────────────────── */}
            <fieldset className="reg-section">
              <legend className="reg-legend">{t('机构信息', 'Affiliation')}</legend>

              <div className="reg-row">
                <div className="login-field">
                  <label className="form-label" htmlFor="organization">
                    {t('机构名称', 'Institution')} *
                  </label>
                  <div className="login-input-wrap">
                    <span className="login-input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M4 21V7l8-4 8 4v14" />
                        <path d="M9 21v-5h6v5M9 10h.01M12 10h.01M15 10h.01M9 13h.01M12 13h.01M15 13h.01" />
                      </svg>
                    </span>
                    <input
                      id="organization"
                      className={`form-input login-input${mark('organization')}`}
                      value={organization}
                      maxLength={PROFILE_FIELD_MAX}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder={t('例如：中信证券研究所', 'e.g. Research Institute')}
                    />
                  </div>
                  {touched && missing.has('organization') && (
                    <span className="field-hint">{t('请填写机构名称。', 'Please enter your institution.')}</span>
                  )}
                </div>

                <div className="login-field">
                  <label className="form-label" htmlFor="jobTitle">
                    {t('岗位', 'Job title')} *
                  </label>
                  <div className="login-input-wrap">
                    <span className="login-input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <rect x="3" y="7" width="18" height="13" rx="2" />
                        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
                      </svg>
                    </span>
                    <input
                      id="jobTitle"
                      className={`form-input login-input${mark('jobTitle')}`}
                      value={jobTitle}
                      maxLength={PROFILE_FIELD_MAX}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder={t('例如：高级研究员', 'e.g. Senior Analyst')}
                    />
                  </div>
                  {touched && missing.has('jobTitle') && (
                    <span className="field-hint">{t('请填写岗位。', 'Please enter your job title.')}</span>
                  )}
                </div>
              </div>
            </fieldset>

            {/* ── 研究需求 ───────────────────────────────────────── */}
            <fieldset className="reg-section">
              <legend className="reg-legend">{t('研究需求', 'Research needs')}</legend>

              <div className="login-field">
                <label className="form-label" htmlFor="researchNeeds">
                  {t('希望获得的研究支持', 'Research support you are looking for')} *
                </label>
                <textarea
                  id="researchNeeds"
                  className={`form-input reg-textarea${mark('researchNeeds')}`}
                  value={researchNeeds}
                  rows={4}
                  maxLength={RESEARCH_NEEDS_MAX}
                  onChange={(e) => setResearchNeeds(e.target.value)}
                  placeholder={t(
                    '例如：需要港股公司公告的结构化提取与行业对比分析',
                    'e.g. Structured extraction from listed-company filings and cross-sector comparison',
                  )}
                />
                <div className="reg-counter">
                  {touched && missing.has('researchNeeds') ? (
                    <span className="field-hint">{t('请简单描述你的研究需求。', 'Please describe your research needs.')}</span>
                  ) : (
                    <span />
                  )}
                  <span className="muted">{researchNeeds.length} / {RESEARCH_NEEDS_MAX}</span>
                </div>
              </div>

              <div className="login-field">
                <span className="form-label" id="marketsLabel">
                  {t('关注市场', 'Markets of interest')} *
                </span>
                <div className="reg-chips" role="group" aria-labelledby="marketsLabel">
                  {MARKETS.map((item) => {
                    const active = markets.includes(item.slug)
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        className={`reg-chip${active ? ' active' : ''}${touched && missing.has('markets') && !active ? ' chip-dim' : ''}`}
                        aria-pressed={active}
                        onClick={() => toggleMarket(item.slug)}
                      >
                        {t(item.zh, item.en)}
                      </button>
                    )
                  })}
                </div>
                {touched && missing.has('markets') && (
                  <span className="field-hint">{t('请至少选择一个关注市场。', 'Please select at least one market.')}</span>
                )}
              </div>
            </fieldset>

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
