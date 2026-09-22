import { useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { search, type SearchHit } from '../lib/api'
import { Loading, ErrorBox, PageHeader, formatNumber } from '../components/ui'

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

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <PageHeader title="搜索" subtitle="按名称、摘要、标签或 SKILL.md 内容检索技能。" />

      <form className="search-box" onSubmit={onSubmit} style={{ marginBottom: 28 }}>
        <input
          className="search-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索技能..."
          aria-label="搜索技能"
        />
        <button className="btn btn-primary" type="submit">
          搜索
        </button>
      </form>

      {submitted.trim() === '' ? (
        <p className="detail-summary">输入关键词搜索技能。</p>
      ) : query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorBox message="搜索失败，请稍后重试。" />
      ) : (
        <>
          <p className="detail-summary" style={{ marginBottom: 20 }}>
            {(query.data?.hits.length ?? 0) > 0 ? (
              <>
                找到约 <strong>{query.data!.hits.length}</strong> 条关于 “
                <strong>{submitted}</strong>” 的结果
              </>
            ) : (
              <>
                未找到关于 “<strong>{submitted}</strong>” 的结果
              </>
            )}
          </p>

          <div className="skill-grid">
            {query.data!.hits.map((hit) => (
              <HitCard key={hit.id} hit={hit} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function HitCard({ hit }: { hit: SearchHit }) {
  const ref = hit.namespaceSlug ? `@${hit.namespaceSlug}/${hit.slug}` : hit.slug
  const to = hit.docType === 'plugin' ? '/plugins/$' : '/skills/$'
  return (
    <Link to={to} params={{ _splat: ref }}>
      <div className="card">
        <div className="card-title">{hit.displayName || hit.slug}</div>
        {hit.tags.length > 0 && (
          <div className="card-tags">
            {hit.tags.slice(0, 3).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="card-summary">{hit.summary || '暂无描述'}</div>
        <div className="card-meta">
          <span>↓ {formatNumber(hit.downloads)}</span>
          <span>★ {formatNumber(hit.stars)}</span>
          {hit.ownerHandle && <span>@{hit.ownerHandle}</span>}
        </div>
      </div>
    </Link>
  )
}
