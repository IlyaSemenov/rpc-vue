# Getting Started

## Install

::: code-group

```sh [npm]
npm install orpc-vue @orpc/client@2.0.0-beta.35 @orpc/server@2.0.0-beta.35 @orpc/tanstack-query@2.0.0-beta.35 @tanstack/vue-query
```

```sh [pnpm]
pnpm add orpc-vue @orpc/client@2.0.0-beta.35 @orpc/server@2.0.0-beta.35 @orpc/tanstack-query@2.0.0-beta.35 @tanstack/vue-query
```

```sh [bun]
bun add orpc-vue @orpc/client@2.0.0-beta.35 @orpc/server@2.0.0-beta.35 @orpc/tanstack-query@2.0.0-beta.35 @tanstack/vue-query
```

:::

Install oRPC by version: v2 is still in beta, and this package needs `2.0.0-beta.35` or newer.

orpc-vue supports Vue 3.5 and Nuxt 3 and 4, and needs TanStack Vue Query 5.102.8 or newer.

## Nuxt setup

For a Vue app without Nuxt, see [Vue without Nuxt](./vue).

Register the module:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["orpc-vue/nuxt/module"],
})
```

Add a plugin for browser and SSR requests:

```ts
// app/plugins/orpc.ts
import type { RouterClient } from "@orpc/server"
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import type { router } from "~~/server/rpc/router"

export default defineNuxtPlugin<RouterClient<typeof router>>(() => {
  return {
    url: "/rpc",
    forwardHeaders: ["cookie"], // Forward the visitor's cookies during SSR.
  }
})
```

This assumes you have a router exported from `server/rpc/router.ts` and an RPC handler at `/rpc`; see the [oRPC Nuxt adapter](https://orpc.dev/docs/adapters/nuxt) to set them up.

The helper sends both browser and SSR requests over HTTP.
For direct router calls during SSR with your own `context`, use [manual client setup](./nuxt-client#manual-client-setup).

The callback passed to this helper returns RPC client options.
Import the helper explicitly from `orpc-vue/nuxt`; Nuxt's auto-imported `defineNuxtPlugin` takes a regular Nuxt plugin.
It shares that name because Nuxt uses it to check that each plugin is wrapped, and warns about plugins that are not.
You can import it under an alias, such as `import { defineNuxtPlugin as defineORPCPlugin } from "orpc-vue/nuxt"`, because Nuxt also recognizes aliased imports.

The module auto-imports `useOrpc` and `useOrpcQueryClient`.
If you disable Nuxt auto-imports, import them from `orpc-vue/nuxt`.

## First query

Query a procedure in a component:

```ts
const orpc = useOrpc()
const { data } = await orpc.blog.posts.get.useQuery({ id: 1 })
```

See [Queries](./queries) for reactive input, loading states and server rendering.
