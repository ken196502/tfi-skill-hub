/**
 * The catalogue browse page, shared by the skills and knowledge-base views.
 *
 * The two catalogues are the same thing with a different kind of entry in
 * them, so they are the same page: one category filter, one search box,
 * one sort bar, one grid. Only the `type` they ask the server for, and the
 * wording around it, differ.
 *
 * The filters live in the URL, so a filtered view can be shared and the back
 * button works. The route owns that state; this component only reports the
 * changes it wants made.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoriesInUse, listSkills } from '../lib/api'
import { Combobox, type ComboboxOption } from './Combobox'
import { SkillCard, Loading, ErrorBox, PageHeader } from './ui'
import { useT } from '../lib/i18n'
import type { SkillType } from '../lib/types'

export interface CatalogueSearch {
  sort?: string
  category?: string
  q?: string
}

/** Reads the query string into the shape the browse page works with. */
export function readCatalogueSearch(search: Record<string, unknown>): CatalogueSearch {
  return {
    sort: typeof search.sort === 'string' ? search.sort : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }
}

export function CataloguePage({
  type,
  search,
  onSearchChange,
  title,
  subtitle,
  searchPlaceholder,
  emptyText,
}: {
  type: SkillType
  /** The current filters, as they appear in the URL. */
  search: CatalogueSearch
  /** Applies a new set of filters — the route writes them back to the URL. */
  onSearchChange: (next: CatalogueSearch) => void
  title: string
  subtitle: string
  searchPlaceholder: string
  emptyText: string
}) {
  const t = useT()
  const sort = search.sort ?? 'created'
  const category = search.category ?? ''
  const q = search.q ?? ''
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
    queryKey: ['skills', { sort, category, q, type, limit: 20 * pages }],
    queryFn: () => listSkills({ limit: 20 * pages, sort, category, q, type }),
  })

  /**
   * The filters come from the catalogue rather than a fixed list — a curated
   * taxonomy would send every visitor to an empty page, since the catalogue is
   * filed under design / research / documentation / writing. Server-side
   * scoped to what this viewer can see, so an all-unlisted category never shows.
   * Scoped to this kind of entry too, so the knowledge-base page does not
   * offer categories that only skills are filed under.
   */
  const categoryQuery = useQuery({
    queryKey: ['categories-in-use', type],
    queryFn: () => categoriesInUse(type),
    staleTime: 30_000,
  })

  const filters = useMemo(
    () =>
      [...(categoryQuery.data?.categories ?? [])].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    [categoryQuery.data],
  )

  /**
   * The filter's suggestions, in the order they are offered: an explicit
   * "all" entry first, then every category the catalogue currently uses.
   *
   * The field takes free text, so this list is only a shortcut. A category
   * can also reach the URL without being in it — an old link, or a skill
   * that has since been unlisted — so the active one rides along and stays
   * visible and pickable instead of reading as text the user typed.
   */
  const categoryOptions: ComboboxOption[] = [
    { value: '', label: t('全部分类', 'All categories') },
    ...filters.map((value) => ({ value, label: value })),
    ...(category !== '' && !filters.includes(category)
      ? [{ value: category, label: category }]
      : []),
  ]

  const setSort = (next: string) => {
    setPages(1)
    onSearchChange({ sort: next, category: search.category, q: search.q })
  }
  const setCategory = (next: string) => {
    setPages(1)
    onSearchChange({ sort: search.sort, category: next || undefined, q: search.q })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPages(1)
    onSearchChange({ sort: search.sort, category: search.category, q: input.trim() || undefined })
  }

  // Keep the box in sync when `q` changes from outside (e.g. back / forward).
  useEffect(() => {
    setInput(q)
  }, [q])

  return (
    <div className="home-page">
      <div className="home-backdrop" aria-hidden="true" />
      <div className="container home-container" style={{ paddingTop: 40 }}>
        <PageHeader title={title} subtitle={subtitle} />

        <div className="skills-layout">
          <aside className="skills-sidebar">
            <label className="skills-sidebar-title" htmlFor="catalogue-category">
              {t('分类', 'Categories')}
            </label>
            <Combobox
              id="catalogue-category"
              value={category}
              options={categoryOptions}
              onChange={setCategory}
              placeholder={t('选择或输入分类', 'Pick or type a category')}
              listLabel={t('已有分类', 'Existing categories')}
              emptyLabel={t('没有匹配的分类', 'No matching categories')}
              allowCustom
            />
          </aside>

          <div className="skills-main">
            <form className="search-box" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
              <input
                className="search-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
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
              <ErrorBox message={t('加载列表失败，请稍后重试。', 'Could not load the list. Please try again later.')} />
            ) : (query.data?.data.length ?? 0) === 0 ? (
              <p className="detail-summary">
                {/* "Publish the first one" only makes sense with nothing to
                    filter. With a filter or a search in play, the catalogue is
                    simply not holding a match. */}
                {q || category
                  ? t('未找到匹配的内容。', 'Nothing matches your search.')
                  : emptyText}
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
