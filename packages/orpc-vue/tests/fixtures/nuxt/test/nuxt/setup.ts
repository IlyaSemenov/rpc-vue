import { mockNuxtImport } from "@nuxt/test-utils/runtime"
import type { RouterClient } from "@orpc/server"
import { createTestORPCClient } from "orpc-vue/testing"
import { afterEach, vi } from "vitest"
import type { router } from "~~/server/orpc/router"

export const onUnexpectedError = vi.fn()
export const { client, procedures, reset } = createTestORPCClient<RouterClient<typeof router>>({
  onUnexpectedError,
})

// This factory is hoisted before module initialization, so every dependency it reaches must be
// safe to load without entering the Nuxt runtime module graph.
mockNuxtImport("useOrpc", () => () => client)

afterEach(() => {
  reset()
  onUnexpectedError.mockClear()
})
