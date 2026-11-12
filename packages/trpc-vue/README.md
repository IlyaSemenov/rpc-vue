# trpc-vue

tRPC 11 integration for Vue 3.5 and Nuxt 3/4, built on TanStack Vue Query 5.102.8 or newer.
Add `useQuery` and `useMutation` to your tRPC procedures, with types inferred from your router, including transformed results and formatted errors.

- **Typed from your router**: procedure inputs, transformed results and formatted errors are inferred from your tRPC router.
- **Server rendering**: Nuxt fetches queries during server rendering, and the browser reuses their results.
- **Await or show loading**: await a query to wait for its first result, or use it right away and show a loading state.
- **Precise invalidation**: invalidate one input, a procedure, a router branch, or every query of the client.
- **tRPC utilities**: build query, mutation and infinite query options for TanStack Vue Query from your procedures.
- **Component tests**: replace the client with typed procedure handlers in Nuxt component tests.

See the [documentation](https://ilyasemenov.github.io/rpc-vue/trpc/).

## Install

```sh
npm install trpc-vue @trpc/client @trpc/server @tanstack/vue-query
```

Install the same version of `@trpc/client` and `@trpc/server`; this package needs `11.19.0` or newer.

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

See [Getting Started](https://ilyasemenov.github.io/rpc-vue/trpc/getting-started) for the setup details, and [Vue without Nuxt](https://ilyasemenov.github.io/rpc-vue/trpc/vue) for a Vue app without Nuxt.

## Development

Install dependencies from the repository root with `bun install`.
Run `bun run build`, `bun run types`, and `bun run test` from this package's directory.

Run `bun run docs:dev` to preview the documentation site.

Run `bun run test:component` to check the documented component-test recipe in the fixture application; it uses the built package, so build first.

To try the package in a Nuxt app, build it and run `bunx nuxt dev tests/fixtures/nuxt`.
The example app uses the built package, so rebuild after changing its source.

From the repository root, install the shared test browser with `bunx playwright install chromium-headless-shell`.
Then run `bun run test:nuxt` from this package's directory to check the packed npm archive with the Nuxt version installed in the workspace.
It checks types, SSR, and hydration in development and production.

To check other Nuxt versions by hand, pass them explicitly: `bun run test:nuxt 3.14.1592 4.0.1`.

Cross-adapter cache and SSR tests, app-managed QueryClients and custom transports are checked in the [private integration test workspace](../integration-tests/README.md).
