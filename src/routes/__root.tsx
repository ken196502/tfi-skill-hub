import type { ReactNode } from 'react'
import { Outlet, createRootRouteWithContext, HeadContent, Scripts, Link } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '../components/Layout'
import '../styles/global.css'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TFI SKILL HUB' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <QueryClientProvider client={queryClient}>
      <RootDocument>
        <Layout>
          <Outlet />
        </Layout>
      </RootDocument>
    </QueryClientProvider>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/** SPA-level 404 — distinct from the API's JSON `{"error":"not found"}`. */
function NotFound() {
  return (
    <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
      <h1 className="detail-title">页面不存在</h1>
      <p className="detail-summary">你访问的页面可能已被删除，或链接有误。</p>
      <Link to="/" className="btn btn-primary">
        返回首页
      </Link>
    </div>
  )
}
