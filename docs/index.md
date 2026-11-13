---
layout: home

hero:
  name: rpc-vue
  text: Type-safe RPC for Vue and Nuxt
  tagline: Use your oRPC or tRPC procedures as TanStack Vue Query composables, with types inferred from your router.
  actions:
    # A target makes the router load the adapter's documentation as another site.
    - theme: brand
      text: Use with oRPC
      link: /orpc/
      target: _self
    - theme: brand
      text: Use with tRPC
      link: /trpc/
      target: _self
    - theme: alt
      text: GitHub
      link: https://github.com/IlyaSemenov/rpc-vue

features:
  - title: Typed, reactive queries
    details: Call router procedures in components with typed inputs and results; a query follows the ref or getter passed as its input.
  - title: Server rendering
    details: Nuxt fetches queries during server rendering, and the browser reuses their results.
  - title: Precise invalidation
    details: Invalidate one input, a procedure, a router branch, or every query of the client, without building query keys.
  - title: Component tests
    details: Replace procedures with typed handlers in Nuxt component tests, without starting a server.
---
