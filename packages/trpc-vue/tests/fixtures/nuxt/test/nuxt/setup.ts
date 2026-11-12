import { mockNuxtImport } from "@nuxt/test-utils/runtime"
import { createTestTRPCClient } from "trpc-vue/testing"
import { afterEach } from "vitest"

import type { AppRouter } from "~~/server/trpc/router"

export const { client, procedures, reset } = createTestTRPCClient<AppRouter>()

// This factory is hoisted before module initialization, so every dependency it reaches must be
// safe to load without entering the Nuxt runtime module graph.
mockNuxtImport("useTrpc", () => () => client)

afterEach(reset)
