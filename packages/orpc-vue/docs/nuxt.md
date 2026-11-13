# Nuxt Quickstart

This guide assumes a Nuxt app with an oRPC router exported from `server/rpc/router.ts` and an RPC handler at `/rpc`; see the [oRPC Nuxt adapter](https://orpc.dev/docs/adapters/nuxt) to set them up.
For a Vue app without Nuxt, see [Vue Quickstart](./vue).

## Install

::: code-group

```sh [npm]
npm install orpc-vue @orpc/client@2.0.0-beta.50 @orpc/server@2.0.0-beta.50 @orpc/tanstack-query@2.0.0-beta.50 @tanstack/vue-query
```

```sh [pnpm]
pnpm add orpc-vue @orpc/client@2.0.0-beta.50 @orpc/server@2.0.0-beta.50 @orpc/tanstack-query@2.0.0-beta.50 @tanstack/vue-query
```

```sh [bun]
bun add orpc-vue @orpc/client@2.0.0-beta.50 @orpc/server@2.0.0-beta.50 @orpc/tanstack-query@2.0.0-beta.50 @tanstack/vue-query
```

:::

Install oRPC by version: v2 is still in beta, and this package needs `2.0.0-beta.50` or newer.

orpc-vue supports Vue 3.5 and Nuxt 3 and 4, and needs TanStack Vue Query 5.105.0 or newer.

## Register the module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["orpc-vue/nuxt/module"],
})
```

The module auto-imports `useOrpc` and `useOrpcQueryClient`.
If you disable Nuxt auto-imports, import them from `orpc-vue/nuxt`.

## Add the client plugin

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

Import `defineNuxtPlugin` from `orpc-vue/nuxt`: its callback returns RPC client options, unlike Nuxt's auto-imported helper of the same name.

::: details Why the same name?
Nuxt checks that each plugin is wrapped in `defineNuxtPlugin` and warns about plugins that are not.
It also recognizes aliased imports, so you can import the helper under another name, such as `import { defineNuxtPlugin as defineORPCPlugin } from "orpc-vue/nuxt"`.
:::

The plugin sends both browser and SSR requests over HTTP.
For direct router calls during SSR with your own `context`, use [manual client setup](./nuxt-client#manual-client-setup).

## First query

Query a procedure in a component:

```vue
<!-- app/components/post-title.vue -->
<script setup lang="ts">
const orpc = useOrpc()
const { data: post } = await orpc.blog.posts.get.useQuery({ id: 1 })
</script>

<template>
  <h1 v-if="post">{{ post.title }}</h1>
</template>
```

Nuxt fetches the post during server rendering, and the browser reuses the result.
See [Queries](./queries) for reactive input, loading states and errors.
