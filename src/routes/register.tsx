import { createFileRoute } from '@tanstack/react-router'
import { RegisterPage } from '../components/RegisterPage'

/**
 * `/register` serves both roles: the sign-up form for browsers and the form
 * target for `POST /register`. Same split as `/login` — the page and its POST
 * handler share one path because TanStack Router owns the route.
 */
export const Route = createFileRoute('/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { auth } = await import('../server/api/handlers')
        const { compileRoutes, dispatch } = await import('../server/http')
        const routes = compileRoutes([
          { method: 'POST', path: '/register', handler: auth.register, auth: 'public', bucket: 'write' },
        ])
        const result = await dispatch(routes, request)
        return result.response
      },
    },
  },
  component: RegisterPage,
})
