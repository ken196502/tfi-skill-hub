import type { ReactNode } from 'react'
import { Outlet, createRootRouteWithContext, HeadContent, Scripts, Link } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LangProvider, useT } from '../lib/i18n'
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
      <LangProvider>
        <RootDocument>
          <Layout>
            <Outlet />
          </Layout>
        </RootDocument>
      </LangProvider>
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
  const t = useT()
  return (
    <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
      <h1 className="detail-title">{t('页面不存在', 'Page not found')}</h1>
      <p className="detail-summary">
        {t('你访问的页面可能已被删除，或链接有误。', 'This page may have been removed, or the link is wrong.')}
      </p>
      <Link to="/" className="btn btn-primary">
        {t('返回首页', 'Back to home')}
      </Link>
    </div>
  )
}
