import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { defineNuxtPlugin } from "orpc-vue/nuxt"

import type { router } from "~~/server/orpc/router"

/** Exercise a custom link factory, which each adapter's own fixture leaves to the HTTP options. */
export default defineNuxtPlugin<RouterClient<typeof router>>(() => ({
  prefix: "orpc",
  link: ({ event }) =>
    new RPCLink({
      origin: useRequestURL().origin,
      url: "/orpc",
      // Only SSR receives an H3 event, and only SSR must forward the viewer's cookie.
      headers: event ? useRequestHeaders(["cookie"]) : {},
    }),
}))
