import {
  dehydrate,
  type DehydratedState,
  hydrate,
  QueryClient,
  type QueryClientConfig,
  VueQueryPlugin,
} from "@tanstack/vue-query"
import { type NuxtApp, useState } from "nuxt/app"

import { resolveQueryClient } from "../vue-query/query-client"

/**
 * Install one Vue Query cache per Nuxt app and transfer server data through its payload.
 *
 * @param createConfig - Build a fresh configuration for each app.
 * @param configure - Run the adapter's runtime customization hook before the cache is created.
 * @param stateKey - The payload key for this module's dehydrated cache.
 */
export function createNuxtQueryClientSetup(
  createConfig: () => QueryClientConfig,
  configure: (nuxtApp: NuxtApp, config: QueryClientConfig) => void | Promise<unknown>,
  stateKey: string,
) {
  return async function setup(nuxtApp: NuxtApp) {
    // Copies of this core can coexist: the Vue app's actual provider is the source of truth.
    if (resolveQueryClient(nuxtApp.vueApp)) {
      throw new Error(
        "RPC Vue: multiple QueryClient owners. Set queryClient: false on all but one RPC module, or on both when the application installs Vue Query.",
      )
    }
    // Capture Nuxt state before the awaited customization hook can leave the active context.
    const state = useState<DehydratedState | undefined>(stateKey)
    const config = createConfig()
    await configure(nuxtApp, config)
    // Never share a module-level cache between SSR requests with different user contexts.
    const queryClient = new QueryClient(config)

    if (import.meta.server) {
      nuxtApp.hook("app:rendered", () => {
        state.value = dehydrate(queryClient)
        // Release request resources only after the payload has captured the completed queries.
        queryClient.clear()
      })
      nuxtApp.hook("app:error", () => queryClient.clear())
    } else {
      // Hydrate before observers mount, then release the payload's redundant cache snapshot.
      if (state.value) hydrate(queryClient, state.value)
      state.value = undefined
    }
    nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
  }
}
