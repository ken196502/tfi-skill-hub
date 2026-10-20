import { useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { search, type SearchHit } from '../lib/api'
import { Loading, ErrorBox, PageHeader, formatNumber } from '../components/ui'
import { useLang, useT } from '../lib/i18n'

interface SearchSearch {
  q?: string
}

export const Route = createFileRoute('/search')({
  validateSearch: (s: Record<string, unknown>): SearchSearch => ({
    q: typeof s.q === 'string' ? s.q : undefined,
  }),
  component: SearchPage,
})

function SearchPage() {
  const { q: initial = '' } = Route.useSearch()
  const t = useT()
  const [input, setInput] = useState(initial)
  const [submitted, setSubmitted] = useState(initial)

  const query = useQuery({
    queryKey: ['search', submitted],
    queryFn: () => search(submitted, 40),
    enabled: submitted.trim() !== '',
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(input.trim())
  }

  const hits = query.data?.hits ?? []

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <PageHeader
        title={t('搜索', 'Search')}
        subtitle={t(
          '按名称、摘要、标签或 SKILL.md 内容检索技能。',
          'Search skills by name, summary, tags, or SKILL.md content.',
        )}
      />

      <form className="search-box" onSubmit={onSubmit} style={{ marginBottom: 28 }}>
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

      {submitted.trim() === '' ? (
        <p className="detail-summary">{t('输入关键词搜索技能。', 'Enter keywords to search skills.')}</p>
      ) : query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorBox message={t('搜索失败，请稍后重试。', 'Search failed. Please try again later.')} />
      ) : (
        <>
          <p className="detail-summary" style={{ marginBottom: 20 }}>
            {(hits.length ?? 0) > 0 ? (
              <>
                {t('找到约', 'Found about')} <strong>{hits.length}</strong>{' '}
                {t('条关于', 'results for')} “<strong>{submitted}</strong>”{' '}
                {t('的结果', '')}
              </>
            ) : (
              <>
                {t('未找到关于', 'No results found for')} “<strong>{submitted}</strong>”{' '}
                {t('的结果', '')}
              </>
            )}
          </p>

          <div className="skill-grid">
            {hits.map((hit) => (
              <HitCard key={hit.id} hit={hit} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function HitCard({ hit }: { hit: SearchHit }) {
  const { lang } = useLang()
  const t = useT()
  const ref = hit.namespaceSlug ? `@${hit.namespaceSlug}/${hit.slug}` : hit.slug
  const to = '/skills/$'
  const name =
    lang === 'en' && hit.displayNameEn ? hit.displayNameEn : hit.displayName || hit.slug
  const summary =
    lang === 'en' && hit.summaryEn ? hit.summaryEn : hit.summary
  // Every hit says which catalogue it belongs to, in the bottom-right corner
  // of the card — search answers with both kinds of entry.
  const isKnowledgeBase = hit.type === 'knowledge_base'
  const tags = hit.tags.slice(0, 3)
  return (
    <Link to={to} params={{ _splat: ref }}>
      <div className="card">
        <div className="card-head">
          <div className="card-title">{name}</div>
          {tags.length > 0 && (
            <div className="card-tags">
              {tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card-summary">{summary || t('暂无描述', 'No description yet')}</div>
        <div className="card-meta">
          <span className="stat-downloads" title={t('下载量', 'Downloads')}>
            <i className="stat-icon" aria-hidden="true">↓</i>
            <b>{formatNumber(hit.downloads)}</b>
          </span>
          <span className="stat-stars" title={t('收藏数', 'Stars')}>
            <i className="stat-icon" aria-hidden="true">★</i>
            <b>{formatNumber(hit.stars)}</b>
          </span>
          {hit.ownerHandle && (
            <span className="stat-owner">
              <i className="stat-icon" aria-hidden="true">@</i>
              {hit.ownerHandle}
            </span>
          )}
          {/* The kind marker closes the meta row, so it lands in the
              bottom-right corner of the card. */}
          <span className={`card-kind${isKnowledgeBase ? '' : ' card-kind-skill'}`}>
            {isKnowledgeBase ? t('知识库', 'Knowledge base') : t('技能', 'Skill')}
          </span>
        </div>
      </div>
    </Link>
  )
}
