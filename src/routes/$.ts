import { createFileRoute } from '@tanstack/react-router'

/**
 * Root-level non-UI endpoints.
 *
 * TanStack Router picks the most specific match, so `/skills`, `/plugins`, …
 * still resolve to the page routes; only paths nobody else claims land here.
 * That is exactly the set of service endpoints that live at the root of the
 * original route table.
 *
 * Anything unmatched returns the API's JSON 404 rather than the SPA shell, so a
 * typo'd endpoint fails loudly instead of returning HTML.
 */
export const Route = createFileRoute('/$')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      HEAD: ({ request }) => handle(request),
    },
  },
})

async function handle(request: Request): Promise<Response> {
  const { dispatchRoot } = await import('../server/api/rootRoutes')
  return dispatchRoot(request)
}
