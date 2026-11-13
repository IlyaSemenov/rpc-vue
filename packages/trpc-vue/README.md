# trpc-vue

tRPC 11 integration for Vue and Nuxt, built on TanStack Vue Query.
Add `useQuery` and `useMutation` to your tRPC procedures, with types inferred from your router, including transformed results and formatted errors.

- **Typed from your router**: procedure inputs, transformed results and formatted errors are inferred from your tRPC router.
- **Reactive input**: pass a ref or getter as input; the query follows it and reuses cached results.
- **Server rendering**: Nuxt fetches queries during server rendering, and the browser reuses their results. Await a query when setup needs its result.
- **Precise invalidation**: invalidate one input, a procedure, a router branch, or every query of the client, without building query keys.
- **tRPC utilities**: build query, mutation and infinite query options for TanStack Vue Query from your procedures.
- **Component tests**: replace procedures with typed handlers in Nuxt component tests, without starting a server.

See the [documentation](https://ilyasemenov.github.io/rpc-vue/trpc/).

## Install

```sh
npm install trpc-vue @trpc/client @trpc/server @tanstack/vue-query
```

Install the same version of `@trpc/client` and `@trpc/server`; this package needs `11.19.0` or newer.

trpc-vue supports Vue 3.5 and Nuxt 3 and 4, and needs TanStack Vue Query 5.102.8 or newer.

## Usage

Register the Nuxt module:

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

A Nuxt page that renders a post on the server and refreshes it after a like:

```vue
<!-- app/pages/posts/[id].vue -->
<script setup lang="ts">
const route = useRoute()
const trpc = useTrpc()

// Fetched during SSR, reused in the browser, and switched when the route changes.
const { data: post } = await trpc.blog.posts.get.useQuery(() => ({ id: Number(route.params.id) }))

const { mutate: like, isPending } = trpc.blog.posts.like.useMutation({
  // Refresh this post and every other cached post query.
  onSuccess: () => trpc.blog.posts.invalidate(),
})
</script>

<template>
  <article v-if="post">
    <h1>{{ post.title }}</h1>
    <button :disabled="isPending" @click="like({ id: post.id })">♥ {{ post.likes }}</button>
  </article>
</template>
```

See [Nuxt Quickstart](https://ilyasemenov.github.io/rpc-vue/trpc/nuxt) for the setup details, and [Vue Quickstart](https://ilyasemenov.github.io/rpc-vue/trpc/vue) for a Vue app without Nuxt.

## Contributing

See [CONTRIBUTING.md](https://github.com/IlyaSemenov/rpc-vue/blob/main/CONTRIBUTING.md) for the workspace checks and the development setup.
