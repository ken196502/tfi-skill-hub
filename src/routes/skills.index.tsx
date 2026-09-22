import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listSkills } from '../lib/api'
import { SkillCard, Loading, ErrorBox, PageHeader } from '../components/ui'
import { useT } from '../lib/i18n'

interface SkillsSearch {
  sort?: string
  category?: string
  q?: string
}

export const Route = createFileRoute('/skills/')({
  validateSearch: (search: Record<string, unknown>): SkillsSearch => ({
    sort: typeof search.sort === 'string' ? search.sort : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  component: SkillsPage,
})

const CATEGORIES = [
  'devops',
  'security',
  'data',
  'frontend',
  'backend',
  'infra',
  'testing',
  'ai',
  'general',
]

function SkillsPage() {
  const { sort = 'created', category = '' } = Route.useSearch()
  const navigate = useNavigate()
  const t = useT()
  const [pages, setPages] = useState(1)

  const SORTS: Array<[string, string]> = [
    ['created', t('最新', 'Newest')],
    ['updated', t('最近更新', 'Recently updated')],
    ['downloads', t('下载量', 'Downloads')],
    ['stars', t('收藏数', 'Stars')],
    ['name', t('名称', 'Name')],
  ]

  const query = useQuery({
    queryKey: ['skills', { sort, category, limit: 20 * pages }],
    queryFn: () => listSkills({ limit: 20 * pages, sort, category }),
  })

  const setSort = (next: string) =>
    navigate({ to: '/skills', search: { sort: next, category: category || undefined } })
  const setCategory = (next: string) =>
    navigate({ to: '/skills', search: { sort, category: next || undefined } })

  return (
    <div className="home-page">
      <div className="home-backdrop" aria-hidden="true" />
      <div className="container home-container" style={{ paddingTop: 40 }}>
        <PageHeader
          title={t('技能', 'Skills')}
          subtitle={t('浏览、安装并发布智能体技能。', 'Browse, install, and publish agent skills.')}
        />

        <div className="filter-bar">
          {SORTS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-btn${sort === key ? ' active' : ''}`}
              onClick={() => setSort(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="filter-bar">
          <button
            type="button"
            className={`filter-btn${category === '' ? ' active' : ''}`}
            onClick={() => setCategory('')}
          >
            {t('全部分类', 'All categories')}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`filter-btn${category === c ? ' active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {query.isLoading ? (
          <Loading />
        ) : query.isError ? (
          <ErrorBox message={t('加载技能列表失败，请稍后重试。', 'Failed to load skills. Please try again later.')} />
        ) : (query.data?.data.length ?? 0) === 0 ? (
          null
        ) : (
          <>
            <div className="skill-grid">
              {query.data!.data.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
            {query.data!.nextCursor !== '' && (
              <div className="load-more">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setPages((p) => p + 1)}
                >
                  {t('加载更多', 'Load more')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
