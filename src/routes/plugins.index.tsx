import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listPlugins } from '../lib/api'
import { PluginCard, Loading, ErrorBox, PageHeader } from '../components/ui'

interface PluginsSearch {
  sort?: string
}

export const Route = createFileRoute('/plugins/')({
  validateSearch: (s: Record<string, unknown>): PluginsSearch => ({
    sort: typeof s.sort === 'string' ? s.sort : undefined,
  }),
  component: PluginsPage,
})

const SORTS: Array<[string, string]> = [
  ['created', '最新'],
  ['downloads', '下载'],
  ['stars', '收藏'],
  ['name', '名称'],
]

function PluginsPage() {
  const { sort = 'created' } = Route.useSearch()
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: ['plugins', { sort }],
    queryFn: () => listPlugins({ limit: 40, sort }),
  })

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <PageHeader title="插件" subtitle="浏览打包了技能与 MCP 服务的插件包。" />

      <div className="filter-bar">
        {SORTS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`filter-btn${sort === key ? ' active' : ''}`}
            onClick={() => navigate({ to: '/plugins', search: { sort: key } })}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorBox message="加载插件列表失败，请稍后重试。" />
      ) : (query.data?.data.length ?? 0) === 0 ? (
        null
      ) : (
        <div className="skill-grid">
          {query.data!.data.map((plugin) => (
            <PluginCard key={plugin.id} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  )
}
