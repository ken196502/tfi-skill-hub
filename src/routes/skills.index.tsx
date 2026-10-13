import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { categoriesInUse, listSkills } from '../lib/api'
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

function SkillsPage() {
  const { sort = 'created', category = '', q = '' } = Route.useSearch()
  const navigate = useNavigate()
  const t = useT()
  const [pages, setPages] = useState(1)
  const [input, setInput] = useState(q)

  const SORTS: Array<[string, string]> = [
    ['created', t('最新发布', 'Latest published')],
    ['updated', t('最近更新', 'Recently updated')],
    ['downloads', t('最多下载', 'Most downloaded')],
    ['stars', t('最多收藏', 'Most favorited')],
    ['name', t('名称排序', 'Name')],
  ]

  const query = useQuery({
    queryKey: ['skills', { sort, category, q, limit: 20 * pages }],
    queryFn: () => listSkills({ limit: 20 * pages, sort, category, q }),
  })

  /**
   * The filters come from the catalogue rather than a fixed list — a curated
   * taxonomy would send every visitor to an empty page, since the catalogue is
   * filed under design / research / documentation / writing. Server-side
   * scoped to what this viewer can see, so an all-unlisted category never shows.
   */
  const categoryQuery = useQuery({
    queryKey: ['categories-in-use'],
    queryFn: categoriesInUse,
    staleTime: 30_000,
  })

  const filters = useMemo(
    () =>
      [...(categoryQuery.data?.categories ?? [])].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    [categoryQuery.data],
  )

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
              {filters.map((slug) => (
                <button
                  key={slug}
                  type="button"
                  className={`skills-cat-btn${category === slug ? ' active' : ''}`}
                  onClick={() => setCategory(slug)}
                >
                  {slug}
                </button>
              ))}
              {/* A category can reach the URL without being in the list — an old
                  link, or a skill that has since been unlisted. Keep it on screen
                  so the active filter stays visible instead of silently
                  resetting the "all" button while results are still filtered. */}
              {category !== '' && !filters.includes(category) && (
                <button
                  type="button"
                  className="skills-cat-btn active"
                  onClick={() => setCategory(category)}
                >
                  {category}
                </button>
              )}
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
                {/* "Publish the first one" only makes sense with nothing to
                    filter. With a filter or a search in play, the catalogue is
                    simply not holding a match. */}
                {q || category
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
