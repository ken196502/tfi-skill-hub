import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useT } from '../lib/i18n'

export type AdminSection = 'overview' | 'users' | 'content' | 'features' | 'apikeys' | 'audit'

const ITEMS: Array<{ key: AdminSection; labelKey: 'overview' | 'users' | 'content' | 'features' | 'apikeys' | 'audit'; to: string }> = [
  { key: 'overview', labelKey: 'overview', to: '/admin' },
  { key: 'users', labelKey: 'users', to: '/admin/users' },
  { key: 'content', labelKey: 'content', to: '/admin/content' },
  { key: 'features', labelKey: 'features', to: '/admin/features' },
  { key: 'apikeys', labelKey: 'apikeys', to: '/admin/api-keys' },
  { key: 'audit', labelKey: 'audit', to: '/admin/audit-logs' },
]

const LABELS = {
  overview: ['总览', 'Overview'],
  users: ['用户管理', 'Users'],
  content: ['内容审核', 'Content review'],
  features: ['首页精选', 'Featured'],
  apikeys: ['API Keys', 'API Keys'],
  audit: ['审计日志', 'Audit logs'],
} as const

export function AdminNav({ active }: { active: AdminSection }) {
  const t = useT()
  return (
    <nav className="admin-nav" aria-label={t('管理后台模块', 'Admin sections')}>
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className={`admin-nav-link${active === item.key ? ' active' : ''}`}
        >
          {t(LABELS[item.labelKey][0], LABELS[item.labelKey][1])}
        </Link>
      ))}
    </nav>
  )
}

export function AdminStatus({ value }: { value: string }) {
  const t = useT()
  const labels: Record<string, [string, string]> = {
    public: ['公开', 'Public'],
    private: ['私有', 'Private'],
    approved: ['已通过', 'Approved'],
    pending: ['待审核', 'Awaiting review'],
    pending_review: ['待审核', 'Pending review'],
    rejected: ['已拒绝', 'Rejected'],
    active: ['正常', 'Active'],
    banned: ['已封禁', 'Banned'],
    revoked: ['已撤销', 'Revoked'],
    expired: ['已过期', 'Expired'],
  }
  const tone = value === 'approved' || value === 'public' || value === 'active' ? 'success'
    : value === 'rejected' || value === 'private' || value === 'banned' || value === 'revoked' || value === 'expired' ? 'danger'
      : 'warning'
  const pair = labels[value]
  return (
    <span className={`admin-status admin-status-${tone}`}>
      {pair ? t(pair[0], pair[1]) : value}
    </span>
  )
}

export function AdminGuard({ children, user, booting }: {
  children: ReactNode
  user: { role: string } | null
  booting: boolean
}) {
  if (booting) return null
  if (!user || user.role !== 'admin') return null
  return <>{children}</>
}
