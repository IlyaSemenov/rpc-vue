# orpc-vue

oRPC v2 integration for Vue and Nuxt, built on TanStack Vue Query.
Add `useQuery` and `useMutation` to your oRPC procedures, with types inferred from your router.

- **Typed from your router**: procedure inputs, results and declared errors are inferred from your oRPC router.
- **Reactive input**: pass a ref or getter as input; the query follows it and reuses cached results.
- **Server rendering**: Nuxt fetches queries during server rendering, and the browser reuses their results. Await a query when setup needs its result.
- **Precise invalidation**: invalidate one input, a procedure, a router branch, or every query of the client, without building query keys.
- **Declared errors**: handle the errors that a procedure declares by code, with typed data, in calls and queries.
- **Component tests**: replace procedures with typed handlers in Nuxt component tests, without starting a server.

See the [documentation](https://ilyasemenov.github.io/rpc-vue/orpc/).

## Install

```sh
npm install orpc-vue @orpc/client@2.0.0-beta.35 @orpc/server@2.0.0-beta.35 @orpc/tanstack-query@2.0.0-beta.35 @tanstack/vue-query
```

Install oRPC by version: v2 is still in beta, and this package needs `2.0.0-beta.35` or newer.

orpc-vue supports Vue 3.5 and Nuxt 3 and 4, and needs TanStack Vue Query 5.102.8 or newer.

## Usage

Register the Nuxt module:

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

A Nuxt page that renders a post on the server and refreshes it after a like:

```vue
<!-- app/pages/posts/[id].vue -->
<script setup lang="ts">
const route = useRoute()
const orpc = useOrpc()

// Fetched during SSR, reused in the browser, and switched when the route changes.
const { data: post } = await orpc.blog.posts.get.useQuery(() => ({ id: Number(route.params.id) }))

const { mutate: like, isPending } = orpc.blog.posts.like.useMutation({
  // Refresh this post and every other cached post query.
  onSuccess: () => orpc.blog.posts.invalidate(),
})
</script>

<template>
  <article v-if="post">
    <h1>{{ post.title }}</h1>
    <button :disabled="isPending" @click="like({ id: post.id })">♥ {{ post.likes }}</button>
  </article>
</template>
```

See [Nuxt Quickstart](https://ilyasemenov.github.io/rpc-vue/orpc/nuxt) for the setup details, and [Vue Quickstart](https://ilyasemenov.github.io/rpc-vue/orpc/vue) for a Vue app without Nuxt.

## Contributing

See [CONTRIBUTING.md](https://github.com/IlyaSemenov/rpc-vue/blob/main/CONTRIBUTING.md) for the workspace checks and the development setup.
