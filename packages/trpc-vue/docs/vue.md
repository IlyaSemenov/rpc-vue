# Vue Quickstart

This guide assumes a router type exported as `AppRouter` from `./server/router` and a tRPC handler serving it at `/trpc`; see the [tRPC server adapters](https://trpc.io/docs/server/adapters) to set them up.
For a Nuxt app, see [Nuxt Quickstart](./nuxt).

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

trpc-vue supports Vue 3.5 and needs TanStack Vue Query 5.102.8 or newer.

## Set up the client

Create a typed context for accessing the client from components:

```ts
// trpc-context.ts
import { createTRPCVueContext } from "trpc-vue"

import type { AppRouter } from "./server/router"

export const trpcContext = createTRPCVueContext<AppRouter>()
```

Install Vue Query and provide the tRPC client:

```ts
// main.ts
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { createTRPCVueQuery } from "trpc-vue"
import { createApp } from "vue"

import App from "./App.vue"
import type { AppRouter } from "./server/router"
import { trpcContext } from "./trpc-context"

const app = createApp(App)
const queryClient = new QueryClient()

app.use(VueQueryPlugin, { queryClient })

const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/trpc" })] })
const trpc = createTRPCVueQuery(client, { queryClient })
app.provide(trpcContext.key, trpc)

app.mount("#app")
```

For Vue SSR, create a QueryClient and tRPC client for each request.
If your router uses a transformer, pass it to `httpBatchLink` too.

## First query

Query a procedure in a component:

```vue
<!-- PostTitle.vue -->
<script setup lang="ts">
import { trpcContext } from "./trpc-context"

const trpc = trpcContext.useTrpc()
const { data: post } = trpc.blog.posts.get.useQuery({ id: 1 })
</script>

<template>
  <h1 v-if="post">{{ post.title }}</h1>
</template>
```

See [Queries](./queries) for reactive input, loading states and errors.
