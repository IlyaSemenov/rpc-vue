import superjson from "superjson"
import { defineNuxtPlugin } from "trpc-vue/nuxt"

import type { AppRouter } from "~~/server/trpc/router"

/** Send SSR and browser requests to separate transports and forward only the listed headers. */
export default defineNuxtPlugin<AppRouter>(() => ({
  url: "/trpc?transport=browser",
  serverUrl: "/trpc?transport=server",
  credentials: "include",
  forwardHeaders: useRequestURL().pathname === "/no-headers" ? undefined : ["Cookie", "x-viewer"],
  transformer: superjson,
}))
