import { httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import { defineNuxtPlugin } from "trpc-vue/nuxt"

import type { AppRouter } from "~~/server/trpc/router"

/** Exercise a custom links factory, which each adapter's own fixture leaves to the HTTP options. */
export default defineNuxtPlugin<AppRouter>(() => ({
  prefix: "trpc",
  links: ({ event }) => [
    httpBatchLink({
      url: new URL("/trpc", useRequestURL()).href,
      transformer: superjson,
      // Only SSR receives an H3 event, and only SSR must forward the viewer's cookie.
      headers: event ? useRequestHeaders(["cookie"]) : {},
    }),
  ],
}))
