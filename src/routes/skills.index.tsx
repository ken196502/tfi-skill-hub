import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CataloguePage, readCatalogueSearch, type CatalogueSearch } from '../components/CataloguePage'
import { useT } from '../lib/i18n'

export const Route = createFileRoute('/skills/')({
  validateSearch: (search: Record<string, unknown>): CatalogueSearch =>
    readCatalogueSearch(search),
  component: SkillsPage,
})

function SkillsPage() {
  const navigate = useNavigate()
  const t = useT()
  const search = Route.useSearch()

  return (
    <CataloguePage
      type="skill"
      search={search}
      onSearchChange={(next) =>
        navigate({ to: '/skills', search: { sort: next.sort, category: next.category, q: next.q } })
      }
      title={t('技能', 'Skills')}
      subtitle={t('浏览、安装并发布智能体技能。', 'Browse, install, and publish agent skills.')}
      searchPlaceholder={t('搜索技能...', 'Search skills...')}
      emptyText={t('还没有技能，快来发布第一个吧。', 'No skills yet. Publish the first one!')}
    />
  )
}
