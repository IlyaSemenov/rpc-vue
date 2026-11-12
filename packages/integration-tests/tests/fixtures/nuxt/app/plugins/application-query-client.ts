import {
  dehydrate,
  type DehydratedState,
  hydrate,
  QueryClient,
  VueQueryPlugin,
} from "@tanstack/vue-query"
import { defineNuxtPlugin, useRuntimeConfig, useState } from "nuxt/app"

/**
 * Install and hydrate the application's own cache when the fixture's runtime config enables it.
 * The RPC modules then own no cache, and the client plugins capture this one.
 */
export default defineNuxtPlugin({
  enforce: "pre",
  async setup(nuxtApp) {
    if (!useRuntimeConfig().public.applicationQueryClient) return
    const state = useState<DehydratedState | undefined>("application-query-client")
    // Finish asynchronous initialization before any default-order plugin captures the cache.
    await Promise.resolve()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, retry: false } },
    })
    if (import.meta.server) {
      nuxtApp.hook("app:rendered", () => {
        state.value = dehydrate(queryClient)
        queryClient.clear()
      })
      nuxtApp.hook("app:error", () => queryClient.clear())
    } else if (state.value) {
      hydrate(queryClient, state.value)
      state.value = undefined
    }
    nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
  },
})
