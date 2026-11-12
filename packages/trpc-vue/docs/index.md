---
layout: home

hero:
  name: trpc-vue
  text: tRPC for Vue and Nuxt
  tagline: Add useQuery and useMutation to your tRPC procedures, with types inferred from your router.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Vue without Nuxt
      link: /vue
    - theme: alt
      text: GitHub
      link: https://github.com/IlyaSemenov/rpc-vue

features:
  - title: Typed from your router
    details: Procedure inputs, transformed results and formatted errors are inferred from your tRPC router.
  - title: Server rendering
    details: Nuxt fetches queries during server rendering, and the browser reuses their results.
  - title: Await or show loading
    details: Await a query to wait for its first result, or use it right away and show a loading state.
  - title: Precise invalidation
    details: Invalidate one input, a procedure, a router branch, or every query of the client.
  - title: tRPC utilities
    details: Build query, mutation and infinite query options for TanStack Vue Query from your procedures.
  - title: Component tests
    details: Replace the client with typed procedure handlers in Nuxt component tests.
---

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

See [Getting Started](./getting-started) to set up the module.
