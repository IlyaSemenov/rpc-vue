# orpc-vue

oRPC v2 integration for Vue 3.5 and Nuxt 3/4, built on TanStack Vue Query 5.102.8 or newer.
Add `useQuery` and `useMutation` to your oRPC procedures, with types inferred from your router.

- **Typed from your router**: procedure inputs, results and declared errors are inferred from your oRPC router.
- **Server rendering**: Nuxt fetches queries during server rendering, and the browser reuses their results.
- **Await or show loading**: await a query to wait for its first result, or use it right away and show a loading state.
- **Precise invalidation**: invalidate one input, a procedure, a router branch, or every query of the client.
- **Declared errors**: handle the errors that a procedure declares by code, with typed data, in calls and queries.
- **Component tests**: replace the client with typed procedure handlers in Nuxt component tests.

See the [documentation](https://ilyasemenov.github.io/rpc-vue/orpc/).

## Install

```sh
npm install orpc-vue @orpc/client@2.0.0-beta.35 @orpc/server@2.0.0-beta.35 @orpc/tanstack-query@2.0.0-beta.35 @tanstack/vue-query
```

Install oRPC by version: v2 is still in beta, and this package needs `2.0.0-beta.35` or newer.

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

See [Getting Started](https://ilyasemenov.github.io/rpc-vue/orpc/getting-started) for the setup details, and [Vue without Nuxt](https://ilyasemenov.github.io/rpc-vue/orpc/vue) for a Vue app without Nuxt.

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
