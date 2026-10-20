import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminListFeatures, adminListSkills, adminReplaceFeatures } from '../lib/api'
import { useSession } from '../lib/auth'
import { useLang, useT, localizedName } from '../lib/i18n'
import { ErrorBox, Loading, PageHeader } from '../components/ui'
import { AdminNav } from '../components/AdminShell'
import type { SkillType } from '../lib/types'

export const Route = createFileRoute('/admin/features')({ component: FeaturesPage })

/**
 * The candidate pool is fetched in a single page and filtered locally, so the
 * type tabs never cost a request. 100 is the server's per-page ceiling.
 */
const POOL_SIZE = 100

function FeaturesPage() {
  const { user, booting } = useSession()
  const client = useQueryClient()
  const t = useT()
  const { lang } = useLang()
  const skills = useQuery({ queryKey: ['admin-feature-pool'], queryFn: () => adminListSkills({ pageSize: POOL_SIZE }) })
  const current = useQuery({ queryKey: ['admin-features'], queryFn: adminListFeatures })
  const [selected, setSelected] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<'' | SkillType>('')
  useEffect(() => { if (current.data) setSelected(current.data.data.map((s) => s.id)) }, [current.data])
  const byId = useMemo(() => new Map((skills.data?.data ?? []).map((s) => [s.id, s])), [skills.data])
  const visible = useMemo(
    () => (skills.data?.data ?? []).filter((skill) => typeFilter === '' || skill.type === typeFilter),
    [skills.data, typeFilter],
  )
  const mutation = useMutation({ mutationFn: () => adminReplaceFeatures(selected), onSuccess: () => client.invalidateQueries({ queryKey: ['admin-features'] }) })
  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />
  if (skills.isLoading || current.isLoading) return <Loading />
  if (skills.isError || current.isError) return <ErrorBox message={t('加载精选配置失败，请稍后重试。', 'Failed to load the featured configuration. Please try again later.')} />
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((x) => x !== id) : items.length >= 12 ? items : [...items, id])
  return <div className="container page-container">
    <AdminNav active="features" />
    <PageHeader
      title={t('首页精选', 'Featured skills')}
      subtitle={t('选择首页展示的精选技能，最多 12 个；顺序按勾选顺序保存。', 'Choose the skills featured on the homepage, up to 12; the order follows your selection.')}
    />
    <div className="admin-toolbar admin-toolbar-spaced">
      <div className="admin-filter-group">
        {([
          ['', t('全部', 'All')],
          ['skill', t('技能', 'Skills')],
          ['knowledge_base', t('知识库', 'Knowledge bases')],
        ] as Array<[ '' | SkillType, string ]>).map(([value, label]) => (
          <button
            key={value || 'all'}
            className={`filter-btn${typeFilter === value ? ' active' : ''}`}
            type="button"
            onClick={() => setTypeFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <div className="admin-feature-list">
      {visible.map((skill) => <label className="admin-feature-item" key={skill.id}>
        <input type="checkbox" checked={selected.includes(skill.id)} onChange={() => toggle(skill.id)} />
        <span>
          <strong>{localizedName(skill, lang)}</strong>
          <small>
            {skill.slug} · {skill.namespaceSlug}
            {/* The featured pool feeds both homepage sections, so the kind is
                spelled out here — the selection is split by it, not by hand. */}
            {skill.type === 'knowledge_base' ? ' · 知识库' : ' · 技能'}
          </small>
        </span>
        {selected.includes(skill.id) && <em>#{selected.indexOf(skill.id) + 1}</em>}
      </label>)}
    </div>
    {visible.length === 0 && <p className="muted">{t('当前筛选下暂无条目。', 'No entries match this filter.')}</p>}
    <button className="btn btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()} type="button">{mutation.isPending ? t('保存中…', 'Saving…') : t('保存精选配置', 'Save featured selection')}</button>
    {mutation.isSuccess && <p className="success-text">{t('已保存。', 'Saved.')}</p>}
    {mutation.isError && <ErrorBox message={t('保存失败，请重试。', 'Failed to save. Please try again.')} />}
    {selected.length > 0 && <p className="muted">{t('当前已选择', 'Selected')} {selected.length} / 12 · {selected.map((id) => byId.get(id)?.slug).join(', ')}</p>}
  </div>
}
