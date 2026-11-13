# Query Client

## SSR and cache configuration

The module gives each server request its own QueryClient, which manages the query cache.
It sends cached results to the browser in the Nuxt payload, so the browser can reuse data fetched during SSR.
Queries stay fresh for 5 seconds by default to avoid immediately fetching that data again.

Set static QueryClient defaults in `nuxt.config.ts`.
This example keeps results fresh for 30 seconds and disables retries:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["orpc-vue/nuxt/module"],
  orpc: {
    queryClient: {
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: false,
        },
      },
    },
  },
})
```

Query inputs can include oRPC types such as `bigint` and `Date`; cache keys distinguish them from their JSON forms.
For custom classes in query results, register a Nuxt payload serializer or use TanStack dehydration options to exclude those queries from the payload.

## Runtime configuration

For callbacks, custom cache instances, or settings that depend on the current request, add an `orpc:query-client` hook in a Nuxt plugin.
The module calls it with the configuration after applying static defaults and before creating the QueryClient.
This example logs failed queries:

```ts
// app/plugins/query-config.ts
import { QueryCache } from "@tanstack/vue-query"

export default defineNuxtPlugin({
  hooks: {
    "orpc:query-client"(config) {
      config.queryCache = new QueryCache({
        onError(error) {
          console.error("Query failed:", error)
        },
      })
    },
  },
})
```

Nuxt registers the handlers declared in `hooks` before running plugins, so this handler is ready when the module creates the QueryClient.

## Accessing the QueryClient

`useOrpcQueryClient()` returns the QueryClient installed for the app, whether by the module or by your own plugin.
Unlike Vue Query's `useQueryClient()`, it also works where Vue injection is unavailable, such as in an event handler or between tests:

```ts
const queryClient = useOrpcQueryClient()
queryClient.clear()
```

It needs the Nuxt context, which the browser keeps available once the app has started.
During server rendering, call it inside `nuxtApp.runWithContext()`.

## Existing Vue Query setup

If your app or another module already installs Vue Query and handles SSR hydration, reuse its QueryClient by disabling this module's cache setup.
This also applies when using another integration such as `trpc-vue`.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["orpc-vue/nuxt/module"],
  orpc: { queryClient: false },
})
```

Queries and mutations will use the existing cache.
Install it before the oRPC client plugin runs; for an application plugin, use `enforce: "pre"` and omit `parallel: true`.

## Multiple clients

When several RPC clients share a QueryClient, give each a different `prefix` to keep their cache keys and invalidation separate.
Set `prefix` in your client plugin configuration, or pass it to the factory:

```ts
const orpc = createORPCVueQuery(client, { prefix: "blog" })
```
