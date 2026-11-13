# Nuxt Quickstart

This guide assumes a Nuxt app with a router type exported as `AppRouter` from `server/trpc/router.ts` and a tRPC handler at `/trpc`; see the [tRPC server adapters](https://trpc.io/docs/server/adapters) to set them up.
For a Vue app without Nuxt, see [Vue Quickstart](./vue).

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

## Register the module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["trpc-vue/nuxt/module"],
})
```

The module auto-imports `useTrpc` and `useTrpcQueryClient`.
If you disable Nuxt auto-imports, import them from `trpc-vue/nuxt`.

## Add the client plugin

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

If your router uses a transformer such as SuperJSON, pass it as `transformer` in these options too.

Import `defineNuxtPlugin` from `trpc-vue/nuxt`: its callback returns RPC client options, unlike Nuxt's auto-imported helper of the same name.

::: details Why the same name?
Nuxt checks that each plugin is wrapped in `defineNuxtPlugin` and warns about plugins that are not.
It also recognizes aliased imports, so you can import the helper under another name, such as `import { defineNuxtPlugin as defineTRPCPlugin } from "trpc-vue/nuxt"`.
:::

The plugin sends both browser and SSR requests over HTTP with `httpBatchLink`, so simultaneous requests can share one HTTP request.
For direct router calls during SSR, use [manual client setup](./nuxt-client#manual-client-setup).

## First query

Query a procedure in a component:

```vue
<!-- app/components/post-title.vue -->
<script setup lang="ts">
const trpc = useTrpc()
const { data: post } = await trpc.blog.posts.get.useQuery({ id: 1 })
</script>

<template>
  <h1 v-if="post">{{ post.title }}</h1>
</template>
```

Nuxt fetches the post during server rendering, and the browser reuses the result.
See [Queries](./queries) for reactive input, loading states and errors.
