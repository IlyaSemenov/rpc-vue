import type { RouterClient } from "@orpc/server"
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import type { router } from "~~/server/orpc/router"

/** Send SSR and browser requests to separate transports and forward only the listed headers. */
export default defineNuxtPlugin<RouterClient<typeof router>>(() => {
  const unexpectedErrors = useState("unexpected-error-count", () => 0)
  return {
    url: "/orpc?transport=browser",
    serverUrl: "/orpc?transport=server",
    credentials: "include",
    forwardHeaders: useRequestURL().pathname === "/no-headers" ? undefined : ["Cookie", "x-viewer"],
    onUnexpectedError() {
      unexpectedErrors.value++
    },
  }
})
