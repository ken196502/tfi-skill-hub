import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CataloguePage, readCatalogueSearch, type CatalogueSearch } from '../components/CataloguePage'
import { useT } from '../lib/i18n'

export const Route = createFileRoute('/knowledge-bases/')({
  validateSearch: (search: Record<string, unknown>): CatalogueSearch =>
    readCatalogueSearch(search),
  component: KnowledgeBasesPage,
})

/**
 * The knowledge-base catalogue.
 *
 * Its own page rather than a filter on the skills page: the two hold
 * different things, and a reader arriving here wants the reference material,
 * not the installable skills.
 */
function KnowledgeBasesPage() {
  const navigate = useNavigate()
  const t = useT()
  const search = Route.useSearch()

  return (
    <CataloguePage
      type="knowledge_base"
      search={search}
      onSearchChange={(next) =>
        navigate({
          to: '/knowledge-bases',
          search: { sort: next.sort, category: next.category, q: next.q },
        })
      }
      title={t('知识库', 'Knowledge bases')}
      subtitle={t(
        '浏览知识库：成体系的研究资料、方法论与参考文档，供智能体与研究人员查阅。',
        'Browse knowledge bases: curated research material, methodologies and reference documents for agents and researchers.',
      )}
      searchPlaceholder={t('搜索知识库...', 'Search knowledge bases...')}
      emptyText={t('还没有知识库。', 'No knowledge bases yet.')}
    />
  )
}
