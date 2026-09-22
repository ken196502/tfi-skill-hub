import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '../components/LoginPage'

/**
 * `/login` serves both roles: the page for browsers and the form target for
 * `POST /login`. Keeping them in one file is the documented TanStack pattern
 * and avoids two routes competing for the same path.
 */
export const Route = createFileRoute('/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { auth } = await import('../server/api/handlers')
        const { compileRoutes, dispatch } = await import('../server/http')
        const routes = compileRoutes([
          { method: 'POST', path: '/login', handler: auth.login, auth: 'optional', bucket: 'write' },
        ])
        const result = await dispatch(routes, request)
        return result.response
      },
    },
  },
  component: LoginPage,
})
