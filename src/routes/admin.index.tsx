import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import { adminListApiKeys, adminListFeatures, adminListSkills, adminListUsers } from '../lib/api'
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
    { queryKey: ['admin-skills'], queryFn: () => adminListSkills() },
    { queryKey: ['admin-features'], queryFn: adminListFeatures },
    { queryKey: ['admin-api-keys'], queryFn: adminListApiKeys },
  ] })
  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />
  if (results.some((result) => result.isLoading)) return <Loading />
  if (results.some((result) => result.isError)) return <div className="container page-container"><ErrorBox message={t('加载管理后台数据失败，请稍后重试。', 'Failed to load admin data. Please try again later.')} /></div>
  const [users, skills, features, apiKeys] = results
  const keyTotal = apiKeys.data?.data.length ?? 0
  const keyActive = (apiKeys.data?.data ?? []).filter(
    (key) => !key.revokedAt && (!key.expiresAt || new Date(key.expiresAt) > new Date()),
  ).length
  return <div className="container page-container">
    <AdminNav active="overview" />
    <PageHeader title={t('管理后台', 'Admin')} subtitle={`${t('欢迎回来', 'Welcome back')}，${user.displayName || user.handle}。`} />
    <div className="admin-stats">
      <div className="admin-stat"><strong>{users.data?.data.length ?? 0}</strong><span>{t('用户', 'Users')}</span></div>
      <div className="admin-stat"><strong>{skills.data?.data.length ?? 0}</strong><span>{t('技能与知识库', 'Skills & knowledge bases')}</span></div>
      <div className="admin-stat"><strong>{features.data?.data.length ?? 0}</strong><span>{t('首页精选', 'Featured')}</span></div>
      <div className="admin-stat">
        <strong>{keyTotal}</strong>
        <span>{t('API Key', 'API Keys')}{keyActive < keyTotal ? ` · ${t('有效', 'Active')} ${keyActive}` : ''}</span>
      </div>
    </div>
    <h2 className="admin-section-title">{t('管理模块', 'Modules')}</h2>
    <div className="admin-module-grid">
      <Link className="admin-module-card" to="/admin/features">
        <span className="admin-module-icon">✦</span>
        <span><strong>{t('首页精选', 'Featured')}</strong><small>{t('配置首页精选内容与展示顺序', 'Curate the homepage featured content and its order')}</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/users">
        <span className="admin-module-icon admin-module-icon-hue-label">◎</span>
        <span><strong>{t('用户管理', 'Users')}</strong><small>{t('创建用户、调整角色、封禁账号并签发 Token', 'Create users, change roles, ban accounts, and mint tokens')}</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/content">
        <span className="admin-module-icon admin-module-icon-hue-meta">◇</span>
        <span><strong>{t('内容管理', 'Content management')}</strong><small>{t('增删技能与知识库，维护展示信息与详情内容', 'Add and remove skills and knowledge bases, and maintain their details')}</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
      <Link className="admin-module-card" to="/admin/api-keys">
        <span className="admin-module-icon admin-module-icon-hue-hint">⌘</span>
        <span><strong>{t('API Key 管理', 'API Keys')}</strong><small>{t('签发 API Key、设置权限范围与有效期，并可撤销', 'Issue API keys, set scopes and expiry, and revoke them')}</small></span>
        <span className="admin-module-arrow">→</span>
      </Link>
    </div>
  </div>
}
