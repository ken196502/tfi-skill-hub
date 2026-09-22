import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import { adminListFeatures, adminListPlugins, adminListSkills, adminListUsers } from '../lib/api'
import { useSession } from '../lib/auth'
import { ErrorBox, Loading, PageHeader } from '../components/ui'
import { AdminNav } from '../components/AdminShell'

export const Route = createFileRoute('/admin/')({ component: AdminPage })

function AdminPage() {
  const { user, booting } = useSession()
  const results = useQueries({ queries: [
    { queryKey: ['admin-users'], queryFn: () => adminListUsers() },
    { queryKey: ['admin-skills'], queryFn: () => adminListSkills('', '') },
    { queryKey: ['admin-plugins'], queryFn: () => adminListPlugins() },
    { queryKey: ['admin-features'], queryFn: adminListFeatures },
  ] })
  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />
  if (results.some((result) => result.isLoading)) return <Loading />
  if (results.some((result) => result.isError)) return <div className="container page-container"><ErrorBox message="加载管理后台数据失败，请稍后重试。" /></div>
  const [users, skills, plugins, features] = results
  return <div className="container page-container">
    <AdminNav active="overview" />
    <PageHeader title="管理后台" subtitle={`欢迎回来，${user.displayName || user.handle}。`} />
    <div className="admin-stats">
      <div className="admin-stat"><strong>{users.data?.data.length ?? 0}</strong><span>用户</span></div>
      <div className="admin-stat"><strong>{skills.data?.data.length ?? 0}</strong><span>技能</span></div>
      <div className="admin-stat"><strong>{plugins.data?.data.length ?? 0}</strong><span>插件</span></div>
      <div className="admin-stat"><strong>{features.data?.data.length ?? 0}</strong><span>首页精选</span></div>
    </div>
    <h2 className="admin-section-title">管理模块</h2>
    <div className="admin-module-grid">
      <Link className="admin-module-card" to="/admin/features">
        <span className="admin-module-icon">✦</span>
        <span><strong>首页精选</strong><small>配置首页精选技能及展示顺序</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/users">
        <span className="admin-module-icon">◎</span>
        <span><strong>用户管理</strong><small>创建用户、调整角色、封禁账号并签发 Token</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/content">
        <span className="admin-module-icon">◇</span>
        <span><strong>内容审核</strong><small>审核技能与插件，并管理公开或私有状态</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/audit-logs">
        <span className="admin-module-icon">≋</span>
        <span><strong>审计日志</strong><small>追踪用户、审核与精选配置的管理员操作</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
    </div>
  </div>
}
