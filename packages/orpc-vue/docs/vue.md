# Vue Quickstart

This guide assumes an oRPC router the app can import from `./server/router` and an RPC handler serving it at `/rpc`; see the [oRPC RPC handler](https://orpc.dev/docs/rpc/handler) to set it up.
For a Nuxt app, see [Nuxt Quickstart](./nuxt).

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

orpc-vue supports Vue 3.5 and needs TanStack Vue Query 5.102.8 or newer.

## Set up the client

Create a typed context for accessing the client from components:

```ts
// orpc-context.ts
import type { RouterClient } from "@orpc/server"
import { createORPCVueContext } from "orpc-vue"

import type { router } from "./server/router"

export const orpcContext = createORPCVueContext<RouterClient<typeof router>>()
```

Install Vue Query and provide the oRPC client:

```ts
// main.ts
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import { createORPCVueQuery } from "orpc-vue"
import { createApp } from "vue"

import App from "./App.vue"
import { orpcContext } from "./orpc-context"
import type { router } from "./server/router"

const app = createApp(App)
const queryClient = new QueryClient()

app.use(VueQueryPlugin, { queryClient })

const client = createORPCClient<RouterClient<typeof router>>(new RPCLink({ url: "/rpc" }))
const orpc = createORPCVueQuery(client, { queryClient })
app.provide(orpcContext.key, orpc)

app.mount("#app")
```

For Vue SSR, create a QueryClient and oRPC client for each request.

## First query

Query a procedure in a component:

```vue
<!-- PostTitle.vue -->
<script setup lang="ts">
import { orpcContext } from "./orpc-context"

const orpc = orpcContext.useOrpc()
const { data: post } = orpc.blog.posts.get.useQuery({ id: 1 })
</script>

<template>
  <h1 v-if="post">{{ post.title }}</h1>
</template>
```

See [Queries](./queries) for reactive input, loading states and errors.
