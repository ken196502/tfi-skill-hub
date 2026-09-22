import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  // TanStack Start loads route modules in both the SSR and browser graphs.
  // Keep React's singleton consistent across those graphs so hooks use the
  // dispatcher installed by react-dom during hydration.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Matches the Go implementation's default listen port.
    port: Number(process.env.PORT ?? process.env.SKILLHUB_PORT ?? 10070),
    host: process.env.SKILLHUB_HOST ?? '0.0.0.0',
  },
  plugins: [
    tanstackStart(),
    // React's plugin must come after Start's.
    viteReact(),
  ],
})
