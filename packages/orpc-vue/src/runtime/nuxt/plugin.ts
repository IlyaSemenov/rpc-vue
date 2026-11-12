import { createNuxtQueryClientSetup } from "@rpc-vue/core/nuxt/plugin"
import {
  createQueryClientConfig,
  type StaticQueryClientConfig,
} from "@rpc-vue/core/nuxt/query-config"

import { hashORPCKey } from "../client/hash"

// Include the Nuxt hook augmentation without adding a runtime import.
import type {} from "./hooks"

/** Install the module-owned cache with oRPC key hashing and its runtime customization hook. */
export default function createQueryClientSetup(options: StaticQueryClientConfig = {}) {
  return createNuxtQueryClientSetup(
    () => createQueryClientConfig(options, hashORPCKey),
    (nuxtApp, config) => nuxtApp.callHook("orpc:query-client", config),
    "orpc-vue:query-cache",
  )
}
