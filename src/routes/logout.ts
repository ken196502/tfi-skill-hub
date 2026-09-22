import { createFileRoute } from '@tanstack/react-router'

/** `POST /logout` — clears the session cookie. No UI of its own. */
export const Route = createFileRoute('/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { auth } = await import('../server/api/handlers')
        const { compileRoutes, dispatch } = await import('../server/http')
        const routes = compileRoutes([
          { method: 'POST', path: '/logout', handler: auth.logout, auth: 'optional', bucket: 'none' },
        ])
        const result = await dispatch(routes, request)
        return result.response
      },
    },
  },
})
