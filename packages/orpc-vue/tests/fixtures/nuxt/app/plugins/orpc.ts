import type { RouterClient } from "@orpc/server"
import { ORPCNetworkError } from "orpc-vue"
import { defineNuxtPlugin } from "orpc-vue/nuxt"

import type { router } from "~~/server/orpc/router"
import { serializer } from "~~/shared/money"

/**
 * Send SSR and browser requests to separate transports, forward only the listed headers and
 * serialize the fixture's custom type.
 */
export default defineNuxtPlugin<RouterClient<typeof router>>(() => {
  const unexpectedErrors = useState("unexpected-error-count", () => 0)
  const lastUnexpectedErrorKind = useState("unexpected-error-kind", () => "")
  return {
    url: "/orpc?transport=browser",
    serverUrl: "/orpc?transport=server",
    credentials: "include",
    forwardHeaders: useRequestURL().pathname === "/no-headers" ? undefined : ["Cookie", "x-viewer"],
    serializer,
    onUnexpectedError(error) {
      unexpectedErrors.value++
      lastUnexpectedErrorKind.value = error instanceof ORPCNetworkError ? "network" : "server"
    },
  }
})
