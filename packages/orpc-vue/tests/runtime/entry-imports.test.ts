import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

import { findNuxtRuntimeImport } from "@rpc-vue/core/test-utils/entry-imports"

const packageRoot = fileURLToPath(new URL("../..", import.meta.url))

test.each(["client", "testing"])("keeps the %s entry free of Nuxt runtime imports", async entry => {
  expect(await findNuxtRuntimeImport(packageRoot, "orpc-vue", entry)).toBeUndefined()
})
