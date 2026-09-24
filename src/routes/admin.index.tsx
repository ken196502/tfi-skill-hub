import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import { adminListFeatures, adminListPlugins, adminListSkills, adminListUsers } from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { ErrorBox, Loading, PageHeader } from '../components/ui'
import { AdminNav } from '../components/AdminShell'

export const Route = createFileRoute('/admin/')({ component: AdminPage })

function AdminPage() {
  const { user, booting } = useSession()
  const t = useT()
  const results = useQueries({ queries: [
    { queryKey: ['admin-users'], queryFn: () => adminListUsers() },
    { queryKey: ['admin-skills'], queryFn: () => adminListSkills('', '') },
    { queryKey: ['admin-plugins'], queryFn: () => adminListPlugins() },
    { queryKey: ['admin-features'], queryFn: adminListFeatures },
  ] })
  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />
  if (results.some((result) => result.isLoading)) return <Loading />
  if (results.some((result) => result.isError)) return <div className="container page-container"><ErrorBox message={t('加载管理后台数据失败，请稍后重试。', 'Failed to load admin data. Please try again later.')} /></div>
  const [users, skills, plugins, features] = results
  return <div className="container page-container">
    <AdminNav active="overview" />
    <PageHeader title={t('管理后台', 'Admin')} subtitle={`${t('欢迎回来', 'Welcome back')}，${user.displayName || user.handle}。`} />
    <div className="admin-stats">
      <div className="admin-stat"><strong>{users.data?.data.length ?? 0}</strong><span>{t('用户', 'Users')}</span></div>
      <div className="admin-stat"><strong>{skills.data?.data.length ?? 0}</strong><span>{t('技能', 'Skills')}</span></div>
      <div className="admin-stat"><strong>{plugins.data?.data.length ?? 0}</strong><span>{t('插件', 'Plugins')}</span></div>
      <div className="admin-stat"><strong>{features.data?.data.length ?? 0}</strong><span>{t('首页精选', 'Featured')}</span></div>
    </div>
    <h2 className="admin-section-title">{t('管理模块', 'Modules')}</h2>
    <div className="admin-module-grid">
      <Link className="admin-module-card" to="/admin/features">
        <span className="admin-module-icon">✦</span>
        <span><strong>{t('首页精选', 'Featured')}</strong><small>{t('配置首页精选技能及展示顺序', 'Curate the homepage featured skills and their order')}</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/users">
        <span className="admin-module-icon admin-module-icon-hue-label">◎</span>
        <span><strong>{t('用户管理', 'Users')}</strong><small>{t('创建用户、调整角色、封禁账号并签发 Token', 'Create users, change roles, ban accounts, and mint tokens')}</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/content">
        <span className="admin-module-icon admin-module-icon-hue-meta">◇</span>
        <span><strong>{t('内容审核', 'Content review')}</strong><small>{t('审核技能与插件，并管理公开或私有状态', 'Review skills and plugins, and manage their public/private state')}</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/audit-logs">
        <span className="admin-module-icon admin-module-icon-hue-hint">≋</span>
        <span><strong>{t('审计日志', 'Audit logs')}</strong><small>{t('追踪用户、审核与精选配置的管理员操作', 'Trace admin actions on users, reviews, and featured curation')}</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
    </div>
  </div>
}
