import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export type AdminSection = 'overview' | 'users' | 'content' | 'features' | 'audit'

const ITEMS: Array<{ key: AdminSection; label: string; to: string }> = [
  { key: 'overview', label: '总览', to: '/admin' },
  { key: 'users', label: '用户管理', to: '/admin/users' },
  { key: 'content', label: '内容审核', to: '/admin/content' },
  { key: 'features', label: '首页精选', to: '/admin/features' },
  { key: 'audit', label: '审计日志', to: '/admin/audit-logs' },
]

export function AdminNav({ active }: { active: AdminSection }) {
  return (
    <nav className="admin-nav" aria-label="管理后台模块">
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className={`admin-nav-link${active === item.key ? ' active' : ''}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export function AdminStatus({ value }: { value: string }) {
  const labels: Record<string, string> = {
    public: '公开',
    private: '私有',
    approved: '已通过',
    pending_review: '待审核',
    rejected: '已拒绝',
    active: '正常',
    banned: '已封禁',
  }
  const tone = value === 'approved' || value === 'public' || value === 'active' ? 'success'
    : value === 'rejected' || value === 'private' || value === 'banned' ? 'danger'
      : 'warning'
  return <span className={`admin-status admin-status-${tone}`}>{labels[value] ?? value}</span>
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
