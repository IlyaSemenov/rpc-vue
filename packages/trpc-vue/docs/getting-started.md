# Getting Started

## Install

::: code-group

```sh [npm]
npm install trpc-vue @trpc/client @trpc/server @tanstack/vue-query
```

```sh [pnpm]
pnpm add trpc-vue @trpc/client @trpc/server @tanstack/vue-query
```

```sh [bun]
bun add trpc-vue @trpc/client @trpc/server @tanstack/vue-query
```

:::

Install the same version of `@trpc/client` and `@trpc/server`; this package needs `11.19.0` or newer.

trpc-vue supports Vue 3.5 and Nuxt 3 and 4, and needs TanStack Vue Query 5.102.8 or newer.

## Nuxt setup

For a Vue app without Nuxt, see [Vue without Nuxt](./vue).

Register the module:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["trpc-vue/nuxt/module"],
})
```

Add a plugin for browser and SSR requests:

```ts
// app/plugins/trpc.ts
import { defineNuxtPlugin } from "trpc-vue/nuxt"
import type { AppRouter } from "~~/server/trpc/router"

export default defineNuxtPlugin<AppRouter>(() => {
  return {
    url: "/trpc",
    forwardHeaders: ["cookie"], // Forward the visitor's cookies during SSR.
  }
})
```

This assumes you have a router type exported as `AppRouter` from `server/trpc/router.ts` and a tRPC handler at `/trpc`; see the [tRPC server adapters](https://trpc.io/docs/server/adapters) to set them up.
If your router uses a transformer such as SuperJSON, pass it as `transformer` in these options too.

The helper sends both browser and SSR requests over HTTP with `httpBatchLink`, so simultaneous requests can share one HTTP request.
For direct router calls during SSR, use [manual client setup](./nuxt-client#manual-client-setup).

The callback passed to this helper returns RPC client options.
Import the helper explicitly from `trpc-vue/nuxt`; Nuxt's auto-imported `defineNuxtPlugin` takes a regular Nuxt plugin.
It shares that name because Nuxt uses it to check that each plugin is wrapped, and warns about plugins that are not.
You can import it under an alias, such as `import { defineNuxtPlugin as defineTRPCPlugin } from "trpc-vue/nuxt"`, because Nuxt also recognizes aliased imports.

The module auto-imports `useTrpc` and `useTrpcQueryClient`.
If you disable Nuxt auto-imports, import them from `trpc-vue/nuxt`.

## First query

Query a procedure in a component:

```ts
const trpc = useTrpc()
const { data } = await trpc.blog.posts.get.useQuery({ id: 1 })
```

See [Queries](./queries) for reactive input, loading states and server rendering.
