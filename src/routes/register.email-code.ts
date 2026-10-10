import { createFileRoute } from '@tanstack/react-router'

/**
 * `POST /register/email-code` — the sign-up form's "send code" action.
 *
 * A path of its own because the form posts it separately from the submission
 * itself, and because a page route may only own one HTTP method per path:
 * `/register` already serves the page (GET) and the sign-up POST.
 *
 * Public, like the registration it belongs to, and rate limited like it.
 */
export const Route = createFileRoute('/register/email-code')({
  server: {
    handlers: {
      /**
       * Read the wait for an address. Called when the form loads and while the
       * address is being edited, so it must not start a wait — POST does that.
       */
      GET: async ({ request }) => {
        const { auth } = await import('../server/api/handlers')
        const { compileRoutes, dispatch } = await import('../server/http')
        const routes = compileRoutes([
          {
            method: 'GET',
            path: '/register/email-code',
            handler: auth.emailCodeStatus,
            auth: 'public',
            bucket: 'read',
          },
        ])
        const result = await dispatch(routes, request)
        return result.response
      },

      /** The button itself: sends (once a provider is connected) and starts the wait. */
      POST: async ({ request }) => {
        const { auth } = await import('../server/api/handlers')
        const { compileRoutes, dispatch } = await import('../server/http')
        const routes = compileRoutes([
          {
            method: 'POST',
            path: '/register/email-code',
            handler: auth.requestEmailCode,
            auth: 'public',
            bucket: 'write',
          },
        ])
        const result = await dispatch(routes, request)
        return result.response
      },
    },
  },
})