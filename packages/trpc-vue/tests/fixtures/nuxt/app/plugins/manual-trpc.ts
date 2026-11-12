import { createTRPCClient, httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import { createTRPCVueQuery } from "trpc-vue"

import type { AppRouter } from "~~/server/trpc/router"

/** Exercise the client entrypoint alongside the helper under Vite dependency optimization. */
export default defineNuxtPlugin(() => {
  const link = httpBatchLink({
    url: new URL("/trpc", useRequestURL()).href,
    transformer: superjson,
  })
  const client = createTRPCClient<AppRouter>({ links: [link] })
  const manualTrpc = createTRPCVueQuery(client)
  return {
    provide: { manualTrpc },
  }
})
