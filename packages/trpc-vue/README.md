# trpc-vue

tRPC 11 integration for Vue 3.5 and Nuxt 3/4, built on TanStack Vue Query 5.102.8 or newer.
Add `useQuery` and `useMutation` to your tRPC procedures, with types inferred from your router, including transformed results and formatted errors.

```ts
const trpc = useTrpc()
const { data } = await trpc.blog.posts.get.useQuery({ id: 1 })
```

## Install

```sh
npm install trpc-vue @trpc/client @trpc/server @tanstack/vue-query
```

Install the same version of `@trpc/client` and `@trpc/server`; this package needs `11.19.0` or newer.

## Nuxt setup

For a Vue app without Nuxt, see [Plain Vue setup](#plain-vue-setup).

Register the module:

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

This assumes you have a router type exported as `AppRouter` from `server/trpc/router.ts` and a tRPC handler at `/trpc`; see the [tRPC server adapters](https://trpc.io/docs/server/adapters) to set them up.
If your router uses a transformer such as SuperJSON, pass it as `transformer` in these options too.

The helper sends both browser and SSR requests over HTTP with `httpBatchLink`, so simultaneous requests can share one HTTP request.
For direct router calls during SSR, use [manual client setup](#manual-nuxt-client-setup).

The callback passed to this helper returns RPC client options.
Import the helper explicitly from `trpc-vue/nuxt`; Nuxt's auto-imported `defineNuxtPlugin` takes a regular Nuxt plugin.
It shares that name because Nuxt uses it to check that each plugin is wrapped, and warns about plugins that are not.
You can import it under an alias, such as `import { defineNuxtPlugin as defineTRPCPlugin } from "trpc-vue/nuxt"`, because Nuxt also recognizes aliased imports.

The module auto-imports `useTrpc` and `useTrpcQueryClient`.
If you disable Nuxt auto-imports, import them from `trpc-vue/nuxt`.

## Queries

Call `useQuery` in `<script setup>` or a Vue component's `setup()` function.
Use your router's query procedure paths; the examples below use posts from a blog router.

```ts
const trpc = useTrpc()
const query = await trpc.blog.posts.get.useQuery({ id: 1 })
```

`query` exposes reactive state and methods, including:

- `query.data.value` contains the query result, or `undefined` before data is available.
- `query.isPending.value` is `true` before the first success or error, even when disabled.
- `query.error.value` contains the query error, or `null` when there is no error.
- `query.refetch()` fetches the current query again.
- `query.invalidate()` marks its cached result as stale and refetches it if it is active.

### Reactive input and options

Pass a ref, reactive object, or getter when the input can change.
The query follows the current input and uses its cached result when available.

The second argument accepts both TanStack Vue Query options (such as `select`, `enabled`, and `staleTime`) and trpc-vue options (such as `clone`, `server`, and `trpc` request options).

```ts
const route = useRoute()
const panelOpen = ref(true)

const query = trpc.blog.posts.get.useQuery(() => ({ id: Number(route.params.id) }), {
  enabled: panelOpen,
  staleTime: 30_000,
})
```

Here, changing the route ID switches to that post's query, and closing the panel disables automatic fetching.

Vue Query options such as `enabled` and `staleTime` can be reactive too.
You can also pass the entire options object as a ref or getter.

### Waiting for input

Use TanStack Query's `skipToken` when you don't have valid input yet.
This query starts once a post is selected:

```ts
import { skipToken } from "@tanstack/vue-query"

const selectedId = ref<number>()
const query = trpc.blog.posts.get.useQuery(() =>
  selectedId.value === undefined ? skipToken : { id: selectedId.value },
)
```

### Awaiting queries and server rendering

You can use `useQuery` with or without `await`.
Without it, you get the query refs immediately and can show a loading state.
With it, you wait for the initial fetch.
During SSR, the page waits for active queries either way.

Set `server: false` in the query options to fetch only after the component mounts in the browser.
The query refs are still available during SSR.

`await` returns the current state immediately when no fetch is running.
This includes disabled queries, `skipToken`, queries waiting for the component to mount, and requests paused because the browser is offline.
It does not wait for these queries to become enabled or resume fetching.

Failed queries expose the error in `query.error.value`.
Set `throwOnError: true` if you also want `await` to throw and Vue to handle the error through its error hooks or boundaries.

## Mutations

Use `useMutation` for actions such as creating or updating a post.
Only mutation procedures have this method.

```ts
const trpc = useTrpc()
const mutation = trpc.blog.posts.create.useMutation({
  onSuccess: () => trpc.blog.posts.invalidate(),
})

await mutation.mutateAsync({ title: "New post" })
```

`mutation` exposes reactive state and methods, including:

- `mutation.mutate(input)` starts the request and returns `void`; read the result from `mutation.data.value` or handle it in `onSuccess`.
- `mutation.mutateAsync(input)` starts the request and returns a `Promise` that resolves with the response or rejects with the error, so you can use `await` and `try/catch`.
- `mutation.data.value` contains the mutation result, or `undefined` before data is available.
- `mutation.isPending.value` is `true` while the mutation is running.
- `mutation.error.value` contains the mutation error, or `null` when there is no error.

The `onSuccess` callback above refreshes active post queries after creating a post.

### Invalidation

Choose how much of the cache to invalidate:

```ts
// Every cached input of this procedure, including infinite queries.
await trpc.blog.posts.get.invalidate()

// Every query under this router branch.
await trpc.blog.posts.invalidate()

// Every query of this client.
await trpc.invalidate()

// Only this query's current input.
await query.invalidate()
```

Invalidation marks matching queries as stale and refetches active ones.
Inactive queries can refresh when used again.
Create the decorated client inside your app plugin so callbacks use that app's QueryClient.

## Native calls and tRPC utilities

Use the native `.query()` and `.mutate()` methods when you just need a procedure's response, without query state or caching:

```ts
const post = await trpc.blog.posts.get.query({ id: 1 })
```

Subscriptions keep the native `.subscribe()` method.
Errors are `TRPCClientError<AppRouter>` instances that carry your `errorFormatter` data.

### tRPC utilities

The client also exposes TanStack Query utilities for query and mutation procedures:

- `.pathKey()` builds a cache key prefix for a procedure or router branch.
- `.queryKey()` builds a query key for a specific input; partial input matches every input that contains it.
- `.queryOptions()` builds options for Vue Query's `useQuery`.
- `.mutationKey()` and `.mutationOptions()` build a key and options for Vue Query's `useMutation`.
- `.infiniteQueryKey()` and `.infiniteQueryOptions()` build a key and options for Vue Query's `useInfiniteQuery`, for procedures whose input has a `cursor`.

These builders take plain values, not refs or getters.
Wrap them in `computed()` to rebuild options when reactive input changes:

```ts
import { useInfiniteQuery, useQuery } from "@tanstack/vue-query"

const query = useQuery(computed(() => trpc.blog.posts.get.queryOptions({ id: selectedId.value })))
const pages = useInfiniteQuery(
  trpc.blog.posts.list.infiniteQueryOptions(
    { category: "news" },
    { initialCursor: 0, getNextPageParam: (page) => page.nextCursor },
  ),
)
```

Each page request receives TanStack's `pageParam` as `cursor` and its fetch direction as `direction`.
`initialCursor` sets the first page's cursor.
Infinite query keys omit `cursor` and `direction`, and differ from the keys of regular queries with the same input.
Keys carry the procedure's output type, so `getQueryData()` and `setQueryData()` infer it.

Subscription composables are not available yet.
Procedures that return streams keep the native methods but do not get the utilities or this package's `useQuery`.
The module does not automatically transfer streamed query results from server to browser.

### Cancellation

Queries do not abort their requests unless you set `trpc.abortOnUnmount: true`, as in tRPC's React integration:

```ts
trpc.blog.posts.get.useQuery({ id: 1 }, { trpc: { abortOnUnmount: true } })
```

With it, both `queryClient.cancelQueries()` and unmounting the last observer abort the request.
Without it, cancellation discards the result while the request continues.
Mutations do not receive query cancellation signals; native calls accept tRPC's own `signal` option.

## Query data

### Updating cached data

Assigning a new response to `data.value` updates the shared cache for the query's current input.
Other components reading the same query see the update too.
Nested properties are readonly unless you enable `clone: true`.

```ts
const { data } = await trpc.blog.posts.get.useQuery({ id: 1 })

const response = await trpc.blog.posts.update.mutate({
  id: 1,
  title: "Updated title",
})

data.value = response
```

Treat the original `response` as readonly after assigning it to `data.value`.
The assignment passes it to the cache without a defensive copy, so changing `response.title` could modify cached data directly.

### Mutable data

With `clone: true`, `data.value` contains a reactive local copy that you can edit, for example in a form.
There are two ways to change it:

- Edit a nested property to change only your local copy.
- Assign a whole response to `data.value` to update the shared cache and reset the local copy.

```ts
const id = 1
const { data } = await trpc.blog.posts.get.useQuery({ id }, { clone: true })

if (data.value) {
  // Only this query's local copy changes.
  data.value.title = "Local draft"

  // Save the draft, then share the server's response with other components.
  data.value = await trpc.blog.posts.update.mutate({
    id,
    title: data.value.title,
  })
}
```

After assigning a response, you can keep editing `data.value.title`; those edits still affect only the new local copy.

A successful refetch or cache update replaces the local copy and discards its edits, even if the returned data has not changed.
Changing the query input also switches the copy to that input's data.
Keep a separate form draft if it must survive these updates.

You cannot combine `clone: true` with `select`; selected results are readonly.

## Advanced

### Plain Vue setup

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
import { createApp } from "vue"
import { createTRPCVueQuery } from "trpc-vue"
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

Use the client in a component:

```ts
import { trpcContext } from "./trpc-context"

const trpc = trpcContext.useTrpc()
const query = trpc.blog.posts.get.useQuery({ id: 1 })
```

For Vue SSR, create a QueryClient and tRPC client for each request.
If your router uses a transformer, pass it to `httpBatchLink` too.

### Separate API service

If your API runs in a separate service, configure the base URLs in `nuxt.config.ts`, without the `/trpc` path:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["trpc-vue/nuxt/module"],
  runtimeConfig: {
    trpc: {
      apiOrigin: "", // Optional SSR address; empty means use public.trpc.apiOrigin.
    },
    public: {
      trpc: {
        apiOrigin: "https://api.example.com",
      },
    },
  },
})
```

Set `NUXT_PUBLIC_TRPC_API_ORIGIN` to the browser-facing API origin.
Use `NUXT_TRPC_API_ORIGIN` if SSR should use an internal address such as `http://api:3000`.

Use these settings in `app/plugins/trpc.ts`:

```ts
// app/plugins/trpc.ts
import type { AppRouter } from "@my-app/api"
import { defineNuxtPlugin } from "trpc-vue/nuxt"

export default defineNuxtPlugin<AppRouter>(() => {
  const config = useRuntimeConfig()
  const serverOrigin = import.meta.server ? config.trpc.apiOrigin : ""

  return {
    url: `${config.public.trpc.apiOrigin}/trpc`,
    serverUrl: serverOrigin ? `${serverOrigin}/trpc` : undefined,
    credentials: "include",
    forwardHeaders: ["cookie"],
  }
})
```

`serverUrl` overrides `url` during SSR; an empty or omitted value falls back to `url`.
Relative URLs resolve against the current request URL during SSR.
Only headers listed in `forwardHeaders` are forwarded from the incoming SSR request.
`credentials: "include"` allows browser cookies on cross-origin requests.

### Custom links

Return custom `links` when you need other tRPC links or transport settings:

```ts
// app/plugins/trpc.ts
import { httpBatchLink, loggerLink } from "@trpc/client"
import { defineNuxtPlugin } from "trpc-vue/nuxt"
import type { AppRouter } from "~~/server/trpc/router"

export default defineNuxtPlugin<AppRouter>(() => ({
  links: ({ event }) => [
    // Log requests in the browser only.
    loggerLink({ enabled: () => !event }),
    httpBatchLink({
      url: new URL("/trpc", useRequestURL()).href,
      headers: useRequestHeaders(["cookie"]),
    }),
  ],
}))
```

The links factory receives `{ nuxtApp, event }`, where `event` is the current H3 event during SSR and `undefined` in the browser.
It runs once per Nuxt application, so every SSR request gets its own links.
The plugin setup callback has the same lifecycle: once per SSR request and once when the browser app starts.
Configure a transformer on your links; the HTTP options above and `transformer` apply only without custom links.

### Manual Nuxt client setup

Use `createTRPCVueQuery` when you want SSR to call the router directly or need to own the complete client setup.
Instead of the shared HTTP plugin above, add a browser plugin and a server plugin.

Keep `trpc-vue/nuxt/module` in `modules` for auto-imports and QueryClient setup.
Both plugins provide the client under the `trpc` key: `useTrpc()` reads it as `useNuxtApp().$trpc` and infers the router type from that injection.

The browser plugin sends requests to `/trpc` over HTTP:

```ts
// app/plugins/trpc.client.ts
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { createTRPCVueQuery } from "trpc-vue"
import type { AppRouter } from "~~/server/trpc/router"

export default defineNuxtPlugin(() => {
  const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/trpc" })] })
  const trpc = createTRPCVueQuery(client)
  return {
    provide: { trpc },
  }
})
```

The server plugin calls the router directly with tRPC's [`unstable_localLink`](https://trpc.io/docs/client/links/localLink), without an HTTP request.
This example passes the current Nuxt request event as the context's `event`; adjust it to match your router:

```ts
// app/plugins/trpc.server.ts
import { createTRPCClient, unstable_localLink } from "@trpc/client"
import { createTRPCVueQuery } from "trpc-vue"
import { router } from "~~/server/trpc/router"

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()!
  const client = createTRPCClient<typeof router>({
    links: [unstable_localLink({ router, createContext: async () => ({ event }) })],
  })
  const trpc = createTRPCVueQuery(client)
  return {
    provide: { trpc },
  }
})
```

If your router uses a transformer, pass it to both links.
`createTRPCVueQuery()` needs a client from `createTRPCClient()`; a server-side caller from `createCaller()` is not supported.

Let both plugins infer the client type instead of annotating it.
Nuxt combines what they provide, so a widened type in either one leaves `useTrpc()` without procedure types.

### SSR and cache configuration

The module gives each server request its own QueryClient, which manages the query cache.
It sends cached results to the browser in the Nuxt payload, so the browser can reuse data fetched during SSR.
Queries stay fresh for 5 seconds by default to avoid immediately fetching that data again.

Set static QueryClient defaults in `nuxt.config.ts`.
This example keeps results fresh for 30 seconds and disables retries:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["trpc-vue/nuxt/module"],
  trpc: {
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

Cache keys compare query inputs as JSON, as tRPC does: object property order does not matter, and a `Date` matches its ISO string.
A transformer such as SuperJSON does not change this, and `bigint` inputs are not supported in query keys.
Keys are compared this way when the module creates the QueryClient or the client has a [prefix](#multiple-clients).
For custom classes in query results, register a Nuxt payload serializer or use TanStack dehydration options to exclude those queries from the payload.

### Runtime configuration

For callbacks, custom cache instances, or settings that depend on the current request, add a `trpc:query-client` hook in a Nuxt plugin.
The module calls it with the configuration after applying static defaults and before creating the QueryClient.
This example logs failed queries:

```ts
// app/plugins/query-config.ts
import { QueryCache } from "@tanstack/vue-query"

export default defineNuxtPlugin({
  hooks: {
    "trpc:query-client"(config) {
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

### Query client

`useTrpcQueryClient()` returns the QueryClient installed for the app, whether by the module or by your own plugin.
Unlike Vue Query's `useQueryClient()`, it also works where Vue injection is unavailable, such as in an event handler or between tests:

```ts
const queryClient = useTrpcQueryClient()
queryClient.clear()
```

It needs the Nuxt context, which the browser keeps available once the app has started.
During server rendering, call it inside `nuxtApp.runWithContext()`.

### Existing Vue Query setup

If your app or another module already installs Vue Query and handles SSR hydration, reuse its QueryClient by disabling this module's cache setup.
This also applies when using another integration such as `orpc-vue`.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["trpc-vue/nuxt/module"],
  trpc: { queryClient: false },
})
```

Queries and mutations will use the existing cache.
Install it before the tRPC client plugin runs; for an application plugin, use `enforce: "pre"` and omit `parallel: true`.

### Multiple clients

When several RPC clients share a QueryClient, give each a different `prefix` to keep their cache keys and invalidation separate.
Set `prefix` in your client plugin configuration, or pass it to the factory:

```ts
const trpc = createTRPCVueQuery(client, { prefix: "blog" })
```

### Component tests

Configure the Nuxt test environment and load a shared setup file:

```ts
// vitest.config.ts
import { defineVitestConfig } from "@nuxt/test-utils/config"

export default defineVitestConfig({
  test: {
    setupFiles: ["test/nuxt/setup.ts"],
  },
})
```

That configuration runs every test under `test/nuxt/` or `tests/nuxt/`, and every test named `*.nuxt.test.ts` or `*.nuxt.spec.ts`, against your application.
Use `createTestTRPCClient()` from `trpc-vue/testing` to replace `useTrpc()` with an isolated fake client.
`client` includes the regular composables, tRPC utilities and native methods.
Each query and mutation leaf in `procedures` has a `.handle()` method that registers a typed handler and returns a Vitest mock.

```ts
// test/nuxt/setup.ts
import { mockNuxtImport } from "@nuxt/test-utils/runtime"
import { createTestTRPCClient } from "trpc-vue/testing"
import { afterEach } from "vitest"

import type { AppRouter } from "~~/server/trpc/router"

export const { client, procedures, reset } = createTestTRPCClient<AppRouter>()

// Return the composable itself; Vitest hoists this factory before the setup file runs.
mockNuxtImport("useTrpc", () => () => client)

afterEach(reset)
```

`trpc-vue/testing` does not import `nuxt/app`, so the hoisted `mockNuxtImport()` factory can load it safely.
The client owns a QueryClient that never retries, so a failing procedure fails the test instead of timing out, and `reset()` removes the registered handlers together with the cached responses.
Reach that cache as `queryClient` to seed or inspect it, or pass your own to `createTestTRPCClient()`; `reset()` clears that one as well.

Register the required handlers before mounting; `mountSuspended()` waits for awaited queries before assertions:

```ts
// test/nuxt/post-list.spec.ts
import { mountSuspended } from "@nuxt/test-utils/runtime"
import { expect, test } from "vitest"

import PostList from "~/components/post-list.vue"

import { procedures } from "./setup"

test("renders the posts", async () => {
  const list = procedures.blog.posts.list.handle(() => [{ id: 1, title: "First post" }])
  const component = await mountSuspended(PostList)

  expect(component.text()).toContain("First post")
  expect(list).toHaveBeenCalledOnce()
})
```

Handlers replace your server procedures, so middleware, transformers and your `errorFormatter` do not run, and subscriptions are not mocked.
Return what your client receives: without a transformer, for example, a `Date` output arrives as a string.
To test formatted error data, throw a `TRPCClientError` that carries it; to test server behavior, use your real router with `unstable_localLink`.

### Outside Vue components

You can call `.useQuery()` and `.useMutation()` outside a component, for example in a script or in a test that never mounts one.
Create them inside `scope.run()` so Vue can track their reactive subscriptions, then call `scope.stop()` when you are done.
When Vue injection is unavailable, pass a QueryClient explicitly:

```ts
import { QueryClient } from "@tanstack/vue-query"
import { createTRPCVueQuery } from "trpc-vue"
import { effectScope } from "vue"

const queryClient = new QueryClient()
const trpc = createTRPCVueQuery(client, { queryClient })
const scope = effectScope()

try {
  const { data } = await scope.run(() => {
    return trpc.blog.posts.get.useQuery({ id: 1 })
  })!

  console.log(data.value)
} finally {
  scope.stop()
  queryClient.clear()
}
```

## Development

Install dependencies from the repository root with `bun install`.
Run `bun run build`, `bun run types`, and `bun run test` from this package's directory.

Run `bun run test:component` to check the documented component-test recipe in the fixture application; it uses the built package, so build first.

To try the package in a Nuxt app, build it and run `bunx nuxt dev tests/fixtures/nuxt`.
The example app uses the built package, so rebuild after changing its source.

From the repository root, install the shared test browser with `bunx playwright install chromium-headless-shell`.
Then run `bun run test:nuxt` from this package's directory to check the packed npm archive with the Nuxt version installed in the workspace.
It checks types, SSR, and hydration in development and production.

To check other Nuxt versions by hand, pass them explicitly: `bun run test:nuxt 3.14.1592 4.0.1`.

Cross-adapter cache and SSR tests, app-managed QueryClients and custom transports are checked in the [private integration test workspace](../integration-tests/README.md).
