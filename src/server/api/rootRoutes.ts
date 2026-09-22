/**
 * Root-level (non-`/api`) service endpoints.
 *
 * `/login` and `/logout` are NOT here: they share a path with UI pages, so the
 * handlers live on those page routes instead (see `src/routes/login.tsx` and
 * `src/routes/logout.ts`). This table covers only paths no UI route claims.
 */

import { compileRoutes, dispatch, type RouteDef } from '../http'
import { discovery } from './handlers'

const ROUTES: RouteDef[] = [
  { method: 'GET', path: '/healthz', handler: discovery.healthz, auth: 'public', bucket: 'none' },
  { method: 'GET', path: '/readyz', handler: discovery.readyz, auth: 'public', bucket: 'none' },
  { method: 'GET', path: '/metrics', handler: discovery.metrics, auth: 'public', bucket: 'none' },
  {
    method: 'GET',
    path: '/.well-known/clawhub.json',
    handler: discovery.clawhubJson,
    auth: 'public',
    bucket: 'none',
  },
  { method: 'GET', path: '/skills.md', handler: discovery.skillsMd, auth: 'public', bucket: 'none' },
]

const compiled = compileRoutes(ROUTES)

export async function dispatchRoot(request: Request): Promise<Response> {
  const result = await dispatch(compiled, request)
  return result.response
}
