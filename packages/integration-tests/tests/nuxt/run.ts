import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { checkConsumers, checkStartupError } from "@rpc-vue/core/test-utils/nuxt-consumer"

import pkg from "../../package.json"

const orpcVersion = pkg.devDependencies["@orpc/server"]
const trpcVersion = pkg.devDependencies["@trpc/server"]

await checkConsumers({
  packageRoot: resolve(import.meta.dir, "../.."),
  adapterRoots: ["orpc-vue", "trpc-vue"].map(name =>
    dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`))),
  ),
  owners: ["orpc", "trpc", "application"],
  dependencies: {
    // Install the protocol versions tested in this workspace, including the oRPC beta.
    "@orpc/client": orpcVersion,
    "@orpc/tanstack-query": orpcVersion,
    "@orpc/server": orpcVersion,
    "@trpc/client": trpcVersion,
    "@trpc/server": trpcVersion,
    superjson: pkg.devDependencies.superjson,
  },
  async afterCheck(app, owner) {
    // Without a module-owned cache, the same app can also enable both module caches or neither.
    if (owner !== "application") return
    const env = process.env
    await checkStartupError(app, { ...env, RPC_TEST_OWNER: "both" }, "multiple QueryClient owners")
    await checkStartupError(app, { ...env, RPC_TEST_OWNER: "none" }, "install Vue Query before")
  },
})
