import { Fragment, useMemo, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  adminBanUser,
  adminCreateUser,
  adminListUsers,
  adminReviewUser,
  adminSetRole,
} from '../lib/api'
import { useSession } from '../lib/auth'
import { useLang, useT } from '../lib/i18n'
import { countryLabel, marketLabel } from '../lib/registration'
import { AdminNav, AdminStatus } from '../components/AdminShell'
import { ErrorBox, Loading, PageHeader, formatDate } from '../components/ui'
import type { User, UserRole, UserStatus } from '../lib/types'

export const Route = createFileRoute('/admin/users')({ component: UsersPage })

const ROLES: UserRole[] = ['user', 'admin']

/** `''` = no filter (every account). */
type StatusFilter = '' | UserStatus

function UsersPage() {
  const { user, booting } = useSession()
  const client = useQueryClient()
  const t = useT()
  const { lang } = useLang()
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [showCreate, setShowCreate] = useState(false)
  /**
   * Rows the reviewer has opened or closed by hand. Only the exceptions are
   * stored: a pending account shows its details without being opened, so
   * remembering every closed pending row would just be the default again.
   */
  const [detailOverride, setDetailOverride] = useState<Record<string, boolean>>({})
  const [createForm, setCreateForm] = useState({ handle: '', displayName: '', email: '', role: 'user' })

  const users = useInfiniteQuery({
    queryKey: ['admin-users-paged', statusFilter],
    queryFn: ({ pageParam }) => adminListUsers(pageParam, statusFilter),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  })

  const create = useMutation({
    mutationFn: () => adminCreateUser({ ...createForm, role: createForm.role }),
    onSuccess: () => {
      setCreateForm({ handle: '', displayName: '', email: '', role: 'user' })
      setShowCreate(false)
      void client.invalidateQueries({ queryKey: ['admin-users-paged'] })
    },
  })
  const role = useMutation({
    mutationFn: ({ id, nextRole }: { id: string; nextRole: string }) => adminSetRole(id, nextRole),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-users-paged'] }),
  })
  const ban = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminBanUser(id, reason),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-users-paged'] }),
  })
  const review = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note: string }) =>
      adminReviewUser(id, action, note),
    onSuccess: (_result, { id }) => {
      // A row that was open stays open. A pending account's details open by
      // default, so without this the row would snap shut the moment it is
      // approved — the reviewer would lose what they were reading mid-decision.
      setDetailOverride((current) => (current[id] === undefined ? { ...current, [id]: true } : current))
      void client.invalidateQueries({ queryKey: ['admin-users-paged'] })
    },
  })
  const allUsers = useMemo(() => users.data?.pages.flatMap((page) => page.data) ?? [], [users.data])
  /** Same on every page of the response, so the first one is representative. */
  const pendingCount = users.data?.pages[0]?.pendingCount ?? 0
  const filteredUsers = allUsers.filter((item) => {
    const q = filter.trim().toLowerCase()
    if (q === '') return true
    // The profile fields are searchable too: reviewers look people up by where
    // they work, not only by the name on the account.
    return [
      item.handle,
      item.displayName,
      item.email,
      item.organization,
      item.jobTitle,
      item.country ? countryLabel(item.country, lang) : '',
      item.officeLocation,
    ].some((value) => value?.toLowerCase().includes(q))
  })

  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />

  const roleLabel = (value: string): string =>
    ({ user: t('普通用户', 'User'), admin: t('管理员', 'Admin') })[value] ?? value

  const statusTabs: Array<{ value: StatusFilter; label: string }> = [
    { value: '', label: t('全部', 'All') },
    { value: 'pending', label: t('待审核', 'Awaiting review') },
    { value: 'approved', label: t('已通过', 'Approved') },
    { value: 'rejected', label: t('已驳回', 'Rejected') },
  ]

  // A rejected review means the admin clicked something the server refused —
  // most often trying to reject an account that is already approved. The raw
  // message is English prose, so it is matched here and restated in the UI's
  // language rather than shown as-is.
  const reviewError = review.error
    ? friendlyReviewError(review.error instanceof Error ? review.error.message : '', t)
    : null

  const error = create.error ?? role.error ?? ban.error
  return <div className="container page-container">
    <AdminNav active="users" />
    <PageHeader
      title={t('用户管理', 'Users')}
      subtitle={`${t('共', 'Total')} ${allUsers.length}${users.hasNextPage ? '+' : ''} ${t('位用户；管理员操作会写入审计日志。', 'users; admin actions are written to the audit log.')}`}
      actions={<button className="btn btn-primary" type="button" onClick={() => setShowCreate((value) => !value)}>{showCreate ? t('收起表单', 'Hide form') : t('创建用户', 'Create user')}</button>}
    />

    {pendingCount > 0 && statusFilter !== 'pending' && <div className="admin-callout">
      <span>{t(`${pendingCount} 位用户等待审核。`, `${pendingCount} account(s) are waiting for review.`)}</span>
      <button className="btn btn-primary btn-small" type="button" onClick={() => setStatusFilter('pending')}>{t('去审核', 'Review now')}</button>
    </div>}

    {showCreate && <form className="admin-form-card" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
      <div className="admin-form-grid">
        <label><span className="form-label">Handle *</span><input className="form-input" required value={createForm.handle} onChange={(event) => setCreateForm({ ...createForm, handle: event.target.value })} /></label>
        <label><span className="form-label">{t('显示名称', 'Display name')}</span><input className="form-input" value={createForm.displayName} onChange={(event) => setCreateForm({ ...createForm, displayName: event.target.value })} /></label>
        <label><span className="form-label">{t('邮箱', 'Email')}</span><input className="form-input" type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} /></label>
        <label><span className="form-label">{t('角色', 'Role')}</span><select className="form-input" value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}>{ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label>
      </div>
      <div className="admin-form-actions"><button className="btn btn-primary" disabled={create.isPending} type="submit">{create.isPending ? t('创建中…', 'Creating…') : t('确认创建', 'Create')}</button></div>
    </form>}

    {(reviewError ?? error) && <ErrorBox message={reviewError ?? (error instanceof Error ? error.message : t('操作失败，请重试。', 'Action failed. Please try again.'))} />}
    <div className="admin-toolbar">
      <div className="admin-filter-group">
        {statusTabs.map((tab) => <button key={tab.value} type="button" className={`admin-tab${statusFilter === tab.value ? ' active' : ''}`} onClick={() => setStatusFilter(tab.value)}>
          {tab.label}{tab.value === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>)}
      </div>
      <input className="form-input admin-search" placeholder={t('搜索 handle、姓名、邮箱或机构', 'Search handle, name, email, or institution')} value={filter} onChange={(event) => setFilter(event.target.value)} />
      <span className="muted">{t('显示', 'Showing')} {filteredUsers.length} {t('位', '')}</span>
    </div>

    {users.isLoading ? <Loading /> : users.isError ? <ErrorBox message={t('加载用户失败，请稍后重试。', 'Failed to load users. Please try again later.')} /> : <div className="admin-table-wrap">
      <table className="admin-table"><thead><tr><th>{t('用户', 'User')}</th><th>{t('审核', 'Review')}</th><th>{t('角色', 'Role')}</th><th>{t('状态', 'Status')}</th><th>{t('创建时间', 'Created')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>
        {filteredUsers.map((item) => {
          // Pending applications show what the applicant wrote without being
          // opened — that is what the decision is based on. Everything else
          // stays collapsed until asked for, so an approved list stays readable.
          const showDetail = detailOverride[item.id] ?? item.status === 'pending'
          return <Fragment key={item.id}>
          <tr>
            <td>
              <strong>{item.displayName || item.handle}</strong>
              <small className="admin-cell-sub">
                @{item.handle}
                {item.email ? ` · ${item.email}` : ''}
                {item.organization ? ` · ${item.organization}` : ''}
              </small>
            </td>
            <td><AdminStatus value={item.status} />{item.status === 'rejected' && item.reviewNote && <small className="admin-cell-sub">{item.reviewNote}</small>}</td>
            <td><select className="admin-inline-select" value={item.role} disabled={role.isPending || item.id === user.id} title={item.id === user.id ? t('不能修改自己的角色', 'You cannot change your own role') : undefined} onChange={(event) => role.mutate({ id: item.id, nextRole: event.target.value })}>{ROLES.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></td>
            <td><div className="admin-status-row"><AdminStatus value={item.isBanned ? 'banned' : 'active'} />{item.isBanned && item.banReason && <small className="admin-cell-sub">{item.banReason}</small>}</div></td>
            <td className="muted">{formatDate(item.createdAt)}</td>
            <td><div className="admin-actions">
              <button className="btn btn-primary btn-small" type="button" disabled={review.isPending || item.status === 'approved' || item.id === user.id} title={item.id === user.id ? t('不能审核自己的账号', 'You cannot review your own account') : undefined} onClick={() => review.mutate({ id: item.id, action: 'approve', note: '' })}>{t('通过', 'Approve')}</button>
              {/* Approval is final, so an approved account cannot be rejected
                  here — access is withdrawn with Ban instead. The title says so,
                  rather than leaving a greyed-out button unexplained. */}
              <button className="btn btn-danger btn-small" type="button" disabled={review.isPending || item.status === 'rejected' || item.status === 'approved' || item.id === user.id} title={item.id === user.id ? t('不能审核自己的账号', 'You cannot review your own account') : item.status === 'approved' ? t('已通过的账号不能驳回，如需收回访问权请使用封禁', 'An approved account cannot be rejected — use Ban to revoke access') : undefined} onClick={() => handleReject(item, t, (note) => review.mutate({ id: item.id, action: 'reject', note }))}>{t('驳回', 'Reject')}</button>
              <button className="btn btn-danger btn-small" disabled={item.isBanned || item.id === user.id || ban.isPending} title={item.id === user.id ? t('不能封禁自己的账号', 'You cannot ban your own account') : undefined} type="button" onClick={() => handleBan(item, t, () => ban.mutate({ id: item.id, reason: window.prompt(t('请输入封禁原因（可选）', 'Enter a ban reason (optional)'), '') ?? '' }))}>{item.isBanned ? t('已封禁', 'Banned') : t('封禁', 'Ban')}</button>
            </div></td>
          </tr>
          {/* The applicant's own words are what the decision rests on, so they get
              a full row rather than another cramped column. */}
          <tr className="admin-detail-row">
            <td colSpan={6}>
              <button className="admin-detail-toggle" type="button" aria-expanded={showDetail} onClick={() => setDetailOverride((current) => ({ ...current, [item.id]: !showDetail }))}>
                {showDetail ? t('收起资料', 'Hide details') : t('查看资料', 'View details')}
              </button>
              {showDetail && <ProfileDetail item={item} lang={lang} t={t} />}
            </td>
          </tr>
        </Fragment>
        })}
        {filteredUsers.length === 0 && <tr><td colSpan={6} className="admin-empty">{t('没有匹配的用户。', 'No matching users.')}</td></tr>}
      </tbody></table>
    </div>}
    {users.hasNextPage && <div className="load-more"><button className="btn btn-secondary" disabled={users.isFetchingNextPage} type="button" onClick={() => void users.fetchNextPage()}>{users.isFetchingNextPage ? t('加载中…', 'Loading…') : t('加载更多用户', 'Load more users')}</button></div>}
  </div>
}

/**
 * Restates a refused review in the console's own language. Returns null when
 * the message is one we do not recognise, so the caller falls back to showing it
 * verbatim rather than swallowing it.
 */
function friendlyReviewError(
  message: string,
  t: (zh: string, en: string) => string,
): string | null {
  if (message === '') return null
  if (/already been approved/i.test(message)) {
    return t('该账号已通过审核，不能驳回。如需收回访问权，请使用封禁。', 'This account is already approved and cannot be rejected. Use Ban to revoke access.')
  }
  return message
}

/**
 * Everything the applicant told us about themselves, laid out as label/value
 * pairs. Accounts created outside sign-up (the bootstrap admin, the admin
 * console) have none of it, and say so rather than showing a wall of dashes.
 */
function ProfileDetail({
  item,
  lang,
  t,
}: {
  item: User
  lang: 'zh' | 'en'
  t: (zh: string, en: string) => string
}) {
  const markets = item.markets ?? []
  const rows: Array<{ label: string; value: string }> = [
    { label: t('姓名', 'Name'), value: item.displayName ?? '' },
    { label: t('邮箱', 'Email'), value: item.email ?? '' },
    { label: t('所在国家或地区', 'Country or region'), value: item.country ? countryLabel(item.country, lang) : '' },
    { label: t('机构名称', 'Institution'), value: item.organization ?? '' },
    { label: t('岗位', 'Job title'), value: item.jobTitle ?? '' },
    { label: t('办公地区', 'Office location'), value: item.officeLocation ?? '' },
  ]
  const hasProfile = rows.some((row) => row.value !== '') || markets.length > 0 || (item.researchNeeds ?? '') !== ''

  if (!hasProfile) {
    return <p className="admin-detail-empty">{t('该账号未填写注册资料。', 'No registration details were provided for this account.')}</p>
  }

  return <div className="admin-profile">
    <dl className="admin-profile-grid">
      {rows.filter((row) => row.value !== '').map((row) => <div key={row.label} className="admin-profile-item">
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      </div>)}
      {markets.length > 0 && <div className="admin-profile-item">
        <dt>{t('关注市场', 'Markets of interest')}</dt>
        <dd className="admin-profile-chips">{markets.map((slug) => <span key={slug} className="admin-profile-chip">{marketLabel(slug, lang)}</span>)}</dd>
      </div>}
    </dl>
    {item.researchNeeds && <div className="admin-profile-item admin-profile-wide">
      <dt>{t('研究需求', 'Research needs')}</dt>
      <dd className="admin-profile-text">{item.researchNeeds}</dd>
    </div>}
  </div>
}

function handleBan(item: User, t: (zh: string, en: string) => string, action: () => void): void {
  if (window.confirm(`${t('确定封禁', 'Ban')} ${item.handle} ${t('吗？封禁后该账号将无法继续使用。', "? The account will no longer be usable.")}`)) action()
}

function handleReject(
  item: User,
  t: (zh: string, en: string) => string,
  action: (note: string) => void,
): void {
  if (!window.confirm(`${t('确定驳回', 'Reject')} ${item.handle} ${t('的注册申请吗？该账号将无法登录。', "'s registration? The account will not be able to sign in.")}`)) return
  const note = window.prompt(t('填写驳回理由（可选，会记录在审计日志中）', 'Reason (optional, recorded in the audit log)'), '')
  // A cancelled prompt is still a decision to reject — only the note is skipped.
  action(note ?? '')
}
