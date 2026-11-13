---
layout: home

hero:
  name: orpc-vue
  text: oRPC for Vue and Nuxt
  tagline: Add useQuery and useMutation to your oRPC procedures, with types inferred from your router.
  actions:
    - theme: brand
      text: Nuxt Quickstart
      link: /nuxt
    - theme: alt
      text: Vue Quickstart
      link: /vue
    - theme: alt
      text: GitHub
      link: https://github.com/IlyaSemenov/rpc-vue

features:
  - title: Typed from your router
    details: Procedure inputs, results and declared errors are inferred from your oRPC router.
  - title: Reactive input
    details: Pass a ref or getter as input; the query follows it and reuses cached results.
  - title: Server rendering
    details: Nuxt fetches queries during server rendering, and the browser reuses their results. Await a query when setup needs its result.
  - title: Precise invalidation
    details: Invalidate one input, a procedure, a router branch, or every query of the client, without building query keys.
  - title: Declared errors
    details: Handle the errors that a procedure declares by code, with typed data, in calls and queries.
  - title: Component tests
    details: Replace procedures with typed handlers in Nuxt component tests, without starting a server.
---

orpc-vue builds on oRPC's TanStack Query utilities, which stay available on every procedure, and adds Vue composables, a Nuxt module for server rendering and a typed test client.

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

See [Nuxt Quickstart](./nuxt) or [Vue Quickstart](./vue) to set up the client.
