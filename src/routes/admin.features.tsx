import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminListFeatures, adminListSkills, adminReplaceFeatures } from '../lib/api'
import { useSession } from '../lib/auth'
import { ErrorBox, Loading, PageHeader } from '../components/ui'
import { AdminNav } from '../components/AdminShell'

export const Route = createFileRoute('/admin/features')({ component: FeaturesPage })

function FeaturesPage() {
  const { user, booting } = useSession()
  const client = useQueryClient()
  const skills = useQuery({ queryKey: ['admin-skills'], queryFn: () => adminListSkills('', '') })
  const current = useQuery({ queryKey: ['admin-features'], queryFn: adminListFeatures })
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => { if (current.data) setSelected(current.data.data.map((s) => s.id)) }, [current.data])
  const byId = useMemo(() => new Map((skills.data?.data ?? []).map((s) => [s.id, s])), [skills.data])
  const mutation = useMutation({ mutationFn: () => adminReplaceFeatures(selected), onSuccess: () => client.invalidateQueries({ queryKey: ['admin-features'] }) })
  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />
  if (skills.isLoading || current.isLoading) return <Loading />
  if (skills.isError || current.isError) return <ErrorBox message="加载精选配置失败，请稍后重试。" />
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((x) => x !== id) : items.length >= 12 ? items : [...items, id])
  return <div className="container page-container">
    <AdminNav active="features" />
    <PageHeader title="Features 管理" subtitle="选择首页展示的精选技能，最多 12 个；顺序按勾选顺序保存。" />
    <div className="admin-feature-list">
      {(skills.data?.data ?? []).map((skill) => <label className="admin-feature-item" key={skill.id}>
        <input type="checkbox" checked={selected.includes(skill.id)} onChange={() => toggle(skill.id)} />
        <span><strong>{skill.displayName || skill.slug}</strong><small>{skill.slug} · {skill.namespaceSlug}</small></span>
        {selected.includes(skill.id) && <em>#{selected.indexOf(skill.id) + 1}</em>}
      </label>)}
    </div>
    <button className="btn btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()} type="button">{mutation.isPending ? '保存中…' : '保存精选配置'}</button>
    {mutation.isSuccess && <p className="success-text">已保存。</p>}
    {mutation.isError && <ErrorBox message="保存失败，请重试。" />}
    {selected.length > 0 && <p className="muted">当前已选择 {selected.length} / 12 个；{selected.map((id) => byId.get(id)?.slug).join('、')}</p>}
  </div>
}
