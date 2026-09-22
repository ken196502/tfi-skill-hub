import { createFileRoute } from '@tanstack/react-router'

/**
 * API catch-all.
 *
 * Every `/api/**` request lands here and is dispatched through the explicit
 * route table in `src/server/api/routes.ts`. See `src/server/http.ts` for why
 * the API is not expressed as individual file-based server routes.
 */
export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PUT: ({ request }) => handle(request),
      PATCH: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
      HEAD: ({ request }) => handle(request),
    },
  },
})

async function handle(request: Request): Promise<Response> {
  const { dispatchApi } = await import('../../server/api/routes')
  return dispatchApi(request)
}
