import { useEffect, useState, type FormEvent } from 'react'
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

const CATEGORIES: Array<[string, string, string]> = [
  ['finance', '金融', 'Finance'],
  ['personal', '个人', 'Personal'],
  ['workspace', '工作区', 'Workspace'],
  ['general', '通用', 'General'],
]

function SkillsPage() {
  const { sort = 'created', category = '', q = '' } = Route.useSearch()
  const navigate = useNavigate()
  const t = useT()
  const [pages, setPages] = useState(1)
  const [input, setInput] = useState(q)

  const SORTS: Array<[string, string]> = [
    ['created', t('最新', 'Newest')],
    ['updated', t('最近更新', 'Recently updated')],
    ['downloads', t('下载量', 'Downloads')],
    ['stars', t('收藏数', 'Stars')],
    ['name', t('名称', 'Name')],
  ]

  const query = useQuery({
    queryKey: ['skills', { sort, category, q, limit: 20 * pages }],
    queryFn: () => listSkills({ limit: 20 * pages, sort, category, q }),
  })

  const setSort = (next: string) =>
    navigate({ to: '/skills', search: { sort: next, category: category || undefined, q: q || undefined } })
  const setCategory = (next: string) => {
    setPages(1)
    navigate({ to: '/skills', search: { sort, category: next || undefined, q: q || undefined } })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const next = input.trim()
    setInput(next)
    setPages(1)
    navigate({ to: '/skills', search: { sort, category: category || undefined, q: next || undefined } })
  }

  // Keep the box in sync when `q` changes from outside (e.g. back / forward).
  useEffect(() => {
    setInput(q)
  }, [q])

  return (
    <div className="home-page">
      <div className="home-backdrop" aria-hidden="true" />
      <div className="container home-container" style={{ paddingTop: 40 }}>
        <PageHeader
          title={t('技能', 'Skills')}
          subtitle={t('浏览、安装并发布智能体技能。', 'Browse, install, and publish agent skills.')}
        />

        <div className="skills-layout">
          <aside className="skills-sidebar">
            <div className="skills-sidebar-title">{t('分类', 'Categories')}</div>
            <nav className="skills-cat-list">
              <button
                type="button"
                className={`skills-cat-btn${category === '' ? ' active' : ''}`}
                onClick={() => setCategory('')}
              >
                {t('全部分类', 'All categories')}
              </button>
              {CATEGORIES.map(([slug, zh, en]) => (
                <button
                  key={slug}
                  type="button"
                  className={`skills-cat-btn${category === slug ? ' active' : ''}`}
                  onClick={() => setCategory(slug)}
                >
                  {t(zh, en)}
                </button>
              ))}
            </nav>
          </aside>

          <div className="skills-main">
            <form className="search-box" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
              <input
                className="search-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('搜索技能...', 'Search skills...')}
                aria-label={t('搜索技能', 'Search skills')}
              />
              <button className="btn btn-primary" type="submit">
                {t('搜索', 'Search')}
              </button>
            </form>

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

            {query.isLoading ? (
              <Loading />
            ) : query.isError ? (
              <ErrorBox message={t('加载技能列表失败，请稍后重试。', 'Failed to load skills. Please try again later.')} />
            ) : (query.data?.data.length ?? 0) === 0 ? (
              <p className="detail-summary">
                {q
                  ? t('未找到匹配的技能。', 'No skills match your search.')
                  : t('还没有技能，快来发布第一个吧。', 'No skills yet. Publish the first one!')}
              </p>
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
      </div>
    </div>
  )
}
