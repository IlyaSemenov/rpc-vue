# orpc-vue

oRPC v2 integration for Vue 3.5 and Nuxt 3/4, built on TanStack Vue Query 5.102.8 or newer.
Add `useQuery` and `useMutation` to your oRPC procedures, with types inferred from your router.

```ts
const orpc = useOrpc()
const { data } = await orpc.blog.posts.get.useQuery({ id: 1 })
```

## Install

```sh
npm install orpc-vue @orpc/client@2.0.0-beta.35 @orpc/server@2.0.0-beta.35 @orpc/tanstack-query@2.0.0-beta.35 @tanstack/vue-query
```

Install oRPC by version: v2 is still in beta, and this package needs `2.0.0-beta.35` or newer.

## Nuxt setup

For a Vue app without Nuxt, see [Plain Vue setup](#plain-vue-setup).

Register the module:

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

This assumes you have a router exported from `server/rpc/router.ts` and an RPC handler at `/rpc`; see the [oRPC Nuxt adapter](https://orpc.dev/docs/adapters/nuxt) to set them up.

The helper sends both browser and SSR requests over HTTP.
For direct router calls during SSR with your own `context`, use [manual client setup](#manual-nuxt-client-setup).

The callback passed to this helper returns RPC client options.
Import the helper explicitly from `orpc-vue/nuxt`; Nuxt's auto-imported `defineNuxtPlugin` takes a regular Nuxt plugin.
It shares that name because Nuxt uses it to check that each plugin is wrapped, and warns about plugins that are not.
You can import it under an alias, such as `import { defineNuxtPlugin as defineORPCPlugin } from "orpc-vue/nuxt"`, because Nuxt also recognizes aliased imports.

The module auto-imports `useOrpc` and `useOrpcQueryClient`.
If you disable Nuxt auto-imports, import them from `orpc-vue/nuxt`.

## Queries

Call `useQuery` in `<script setup>` or a Vue component's `setup()` function.
Use your router's procedure paths; the examples below use posts from a blog router.

```ts
const orpc = useOrpc()
const query = await orpc.blog.posts.get.useQuery({ id: 1 })
```

`query` exposes reactive state and methods, including:

- `query.data.value` contains the query result, or `undefined` before data is available.
- `query.isPending.value` is `true` before the first success or error, even when disabled.
- `query.error.value` contains the query error, or `null` when there is no error.
- `query.refetch()` fetches the current query again.
- `query.invalidate()` marks its cached result as stale and refetches it if it is active.

Pass a `default` factory when the component needs a value before query data is available:

```ts
const { data: posts } = await orpc.blog.posts.list.useQuery(undefined, {
  default: () => [],
})

// posts.value is always an array.
```

The default appears while the query has no cached data, including while it is pending, disabled, skipped, or in an error state.
The factory runs once for each `useQuery()` call.
The returned value is never written to the cache and does not affect fetching.
Unlike TanStack Query's `placeholderData`, it leaves the query status pending or error and does not set `isPlaceholderData`.
With `select`, the default has the selected result's shape.
With `clone: true`, the default is copied into mutable local data.

### Reactive input and options

Pass a ref, reactive object, or getter when the input can change.
The query follows the current input and uses its cached result when available.

The second argument accepts both TanStack Vue Query options (such as `select`, `enabled`, and `staleTime`) and orpc-vue options (such as `clone` and `server`).

```ts
const route = useRoute()
const panelOpen = ref(true)

const query = orpc.blog.posts.get.useQuery(() => ({ id: Number(route.params.id) }), {
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
const query = orpc.blog.posts.get.useQuery(() =>
  selectedId.value === undefined ? skipToken : { id: selectedId.value },
)
```

### Awaiting queries and server rendering

You can use `useQuery` with or without `await`.
Without it, you get the query refs immediately and can show a loading state.
With it, you wait for the initial fetch and reject if that fetch fails.
During SSR, the page waits for active queries either way.

Set `server: false` in the query options to fetch only after the component mounts in the browser.
The query refs are still available during SSR.

`await` returns the current state immediately when no fetch is running.
This includes disabled queries, `skipToken`, queries waiting for the component to mount, and requests paused because the browser is offline.
It does not wait for these queries to become enabled or resume fetching.

During SSR, an awaited initial error reaches Nuxt's error page.
During client-side navigation, Nuxt does not automatically show its error page for an ordinary RPC error; use [`onUnexpectedError`](#unexpected-browser-errors) to notify the user about undeclared errors.
Set `rejectOnError: false` to resolve the await and inspect the error through `query.error.value` instead.
Queries used without `await` also expose failures through `query.error.value`.
Errors from later refetches update that ref without changing the already settled initial await.
TanStack's `throwOnError` option is not supported; use `rejectOnError`.

## Mutations

Use `useMutation` for actions such as creating or updating a post.

```ts
const orpc = useOrpc()
const mutation = orpc.blog.posts.create.useMutation({
  onSuccess: () => orpc.blog.posts.invalidate(),
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
// Every cached input of this procedure.
await orpc.blog.posts.get.invalidate()

// Every query under this router branch.
await orpc.blog.posts.invalidate()

// Every query of this client.
await orpc.invalidate()

// Only this query's current input.
await query.invalidate()
```

Invalidation marks matching queries as stale and refetches active ones.
Inactive queries can refresh when used again.
Create the decorated client inside your app plugin so callbacks use that app's QueryClient.

## Direct calls and oRPC utilities

Use `.call()` when you just need a procedure's response, without query state or caching:

```ts
const post = await orpc.blog.posts.get.call({ id: 1 })
```

### Declared errors

Use `.callCatching()` to call a procedure and handle errors it declares with `.errors()`, with their code and data types:

```ts
const post = await orpc.blog.posts.update.callCatching(input, {
  CONFLICT: (error) => {
    message.value = error.message
    conflictingField.value = error.data.field
  },
  NOT_FOUND: () => navigateTo("/posts"),
})
```

The successful output, matching handler's awaited result, or matching non-function value becomes the call result.
Undeclared errors and declared codes without a handler are rethrown unchanged.

When one declared error simply means there is no result, map it to `undefined` or `null` directly:

```ts
const post = await orpc.blog.posts.get.callCatching({ id }, { NOT_FOUND: null })
// post is the procedure output or null.
```

Pass call options such as `context` or `signal` as the third argument.
Pass `undefined` as input for procedures without input.
Procedures without declared errors expose neither `.callCatching()` nor the `catching` query option.

The `catching` query option accepts the same handlers as `.callCatching()` and turns matching declared errors into query data:

```ts
const { data: post } = await orpc.blog.posts.get.useQuery({ id }, { catching: { NOT_FOUND: null } })
// post.value is the procedure output or null.
```

Query handlers must return a value; return `null` rather than `undefined` when there is no result.
A handled result is cached as successful data.
Queries with the same `catching` codes share a cache entry and must map them to the same results.
`setQueryData()` with the original `.queryKey()` does not update queries that use `catching`.
Declared errors are never retried, including codes omitted from `catching`; other errors follow the `retry` option.
An awaited query rejects when a declared error has no matching `catching` handler.

Use a client interceptor for an application-wide policy on a declared error, such as redirecting after an expired session.
The Nuxt plugin accepts the same `interceptors` option as `createORPCClient()`:

```ts
import { type InferClientError, isDefinedError, onError } from "@orpc/client"
import type { RouterClient } from "@orpc/server"
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import type { router } from "~~/server/rpc/router"

type Client = RouterClient<typeof router>
type ClientError = InferClientError<Client>

export default defineNuxtPlugin<Client>((nuxtApp) => ({
  url: "/rpc",
  interceptors: [
    onError(async (error: ClientError) => {
      if (isDefinedError(error) && error.code === "AUTHENTICATION_REQUIRED") {
        await nuxtApp.runWithContext(() => navigateTo("/login"))
      }
    }),
  ],
}))
```

An interceptor runs for every client attempt before `.callCatching()` or `catching` handles a declared error.
Keep `onUnexpectedError` for a shared notification after retries of an undeclared error.

`.callCatching()` is built on `catchORPCError()`, which handles errors of a promise returned directly by any typed oRPC client call.
Use `catchORPCError()` when calling a plain typed oRPC client:

```ts
import { catchORPCError } from "orpc-vue"

const post = await catchORPCError(client.blog.posts.get({ id }), { NOT_FOUND: null })
```

### Unexpected browser errors

Set `onUnexpectedError` in `createORPCVueQuery()` options or in the options returned by your `orpc-vue/nuxt` plugin to show a shared notification for undeclared errors.
It receives the error and `{ source, path, input }`, where `source` is `"call"`, `"callCatching"`, `"query"` or `"mutation"`.
`input` may contain sensitive data such as passwords; do not log or send it.

- The hook runs even when your code catches the error; calls still reject and query or mutation state keeps the error.
- It runs in the browser once per failed call, mutation or query fetch, after retries, including initial awaited queries and refetches.
- It does not run for declared errors, even without a matching handler, for cancellations, or during SSR.
- It covers the decorated methods above; upstream `queryOptions()`, `mutationOptions()` and direct calls of the raw oRPC client are not reported.

With [Nuxt UI's `useToast()`](https://ui.nuxt.com/docs/composables/use-toast), call it during plugin setup:

```ts
// app/plugins/orpc.ts
import type { RouterClient } from "@orpc/server"
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import type { router } from "~~/server/rpc/router"

export default defineNuxtPlugin<RouterClient<typeof router>>(() => {
  const toast = useToast()
  const recent = new Set<string>()

  return {
    url: "/rpc",
    onUnexpectedError(error) {
      const message = error instanceof Error ? error.message : "Request failed"
      if (recent.has(message)) return
      recent.add(message)
      setTimeout(() => recent.delete(message), 3_000)
      toast.add({ title: "Request failed", description: message, color: "error" })
    },
  }
})
```

### oRPC utilities

The client also exposes oRPC's TanStack Query utilities:

- `.key()` builds a cache key prefix for a procedure or router branch.
- `.queryKey()` builds a query key for a specific input.
- `.queryOptions()` builds options for Vue Query's `useQuery`.
- `.mutationOptions()` builds options for Vue Query's `useMutation`.
- `.infiniteOptions()` builds options for Vue Query's `useInfiniteQuery` for pagination.

Subscription composables are not available yet.
Procedures that return streams keep the oRPC utilities but do not get this package's `useQuery` or `useMutation` methods.
The module does not automatically transfer streamed query results from server to browser.

## Query data

### Updating cached data

Assigning a new response to `data.value` updates the shared cache for the query's current input.
Other components reading the same query see the update too.
Nested properties are readonly unless you enable `clone: true`.

```ts
const { data } = await orpc.blog.posts.get.useQuery({ id: 1 })

const response = await orpc.blog.posts.update.call({
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
const { data } = await orpc.blog.posts.get.useQuery({ id }, { clone: true })

if (data.value) {
  // Only this query's local copy changes.
  data.value.title = "Local draft"

  // Save the draft, then share the server's response with other components.
  data.value = await orpc.blog.posts.update.call({
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
import { createApp } from "vue"
import { createORPCVueQuery } from "orpc-vue"
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

Use the client in a component:

```ts
import { orpcContext } from "./orpc-context"

const orpc = orpcContext.useOrpc()
const query = orpc.blog.posts.get.useQuery({ id: 1 })
```

For Vue SSR, create a QueryClient and oRPC client for each request.

### Separate API service

If your API runs in a separate service, configure the base URLs in `nuxt.config.ts`, without the `/rpc` path:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["orpc-vue/nuxt/module"],
  runtimeConfig: {
    orpc: {
      apiOrigin: "", // Optional SSR address; empty means use public.orpc.apiOrigin.
    },
    public: {
      orpc: {
        apiOrigin: "https://api.example.com",
      },
    },
  },
})
```

Set `NUXT_PUBLIC_ORPC_API_ORIGIN` to the browser-facing API origin.
Use `NUXT_ORPC_API_ORIGIN` if SSR should use an internal address such as `http://api:3000`.

Use these settings in `app/plugins/orpc.ts`:

```ts
// app/plugins/orpc.ts
import type { router } from "@my-app/api"
import type { RouterClient } from "@orpc/server"
import { defineNuxtPlugin } from "orpc-vue/nuxt"

export default defineNuxtPlugin<RouterClient<typeof router>>(() => {
  const config = useRuntimeConfig()
  const serverOrigin = import.meta.server ? config.orpc.apiOrigin : ""

  return {
    url: `${config.public.orpc.apiOrigin}/rpc`,
    serverUrl: serverOrigin ? `${serverOrigin}/rpc` : undefined,
    credentials: "include",
    forwardHeaders: ["cookie"],
  }
})
```

`serverUrl` overrides `url` during SSR; an empty or omitted value falls back to `url`.
Relative URLs resolve against the current request URL during SSR.
Only headers listed in `forwardHeaders` are forwarded from the incoming SSR request.
`credentials: "include"` allows browser cookies on cross-origin requests.

### Custom link

Return a custom `link` when the server needs a request-scoped transport while the browser should keep a regular HTTP transport:

```ts
// app/plugins/orpc.ts
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { getRequestURL } from "h3"
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import type { router } from "~~/server/rpc/router"

export default defineNuxtPlugin<RouterClient<typeof router>>(() => ({
  link: ({ event }) => {
    if (!event) return new RPCLink({ url: "/api/rpc" })

    const requestFetch = event.context.nuxtMultiApp.createFetch("web")
    const endpoint = new URL("/api/rpc", getRequestURL(event))

    return new RPCLink({
      origin: endpoint.origin,
      url: endpoint.pathname as `/${string}`,
      fetch: requestFetch,
    })
  },
}))
```

The link factory receives `{ nuxtApp, event }`, where `event` is the current H3 event during SSR and `undefined` in the browser.
It runs once per Nuxt application, so every SSR request gets its own link.
The plugin setup callback has the same lifecycle: once per SSR request and once when the browser app starts.

### Manual Nuxt client setup

Use `createORPCVueQuery` when you want SSR to call the router directly or need to own the complete client setup.
Instead of the shared HTTP plugin above, add a browser plugin and a server plugin.

Keep `orpc-vue/nuxt/module` in `modules` for auto-imports and QueryClient setup.
Both plugins provide the client under the `orpc` key: `useOrpc()` reads it as `useNuxtApp().$orpc` and infers the router type from that injection.

The browser plugin sends requests to `/rpc` over HTTP:

```ts
// app/plugins/orpc.client.ts
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { createORPCVueQuery } from "orpc-vue"
import type { router } from "~~/server/rpc/router"

export default defineNuxtPlugin(() => {
  const client = createORPCClient<RouterClient<typeof router>>(new RPCLink({ url: "/rpc" }))
  const orpc = createORPCVueQuery(client)
  return {
    provide: { orpc },
  }
})
```

The server plugin calls the router directly, without an HTTP request.
This example passes the current Nuxt request event as `context.event`; adjust it to match your router:

```ts
// app/plugins/orpc.server.ts
import { createRouterClient } from "@orpc/server"
import { createORPCVueQuery } from "orpc-vue"
import { router } from "~~/server/rpc/router"

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()!
  const client = createRouterClient(router, {
    context: { event },
  })
  const orpc = createORPCVueQuery(client)
  return {
    provide: { orpc },
  }
})
```

Let both plugins infer the client type instead of annotating it.
Nuxt combines what they provide, so a widened type in either one leaves `useOrpc()` without procedure types.

### SSR and cache configuration

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
Keys are compared this way when the module creates the QueryClient or the client has a [prefix](#multiple-clients).
For custom classes in query results, register a Nuxt payload serializer or use TanStack dehydration options to exclude those queries from the payload.

### Runtime configuration

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

### Query client

`useOrpcQueryClient()` returns the QueryClient installed for the app, whether by the module or by your own plugin.
Unlike Vue Query's `useQueryClient()`, it also works where Vue injection is unavailable, such as in an event handler or between tests:

```ts
const queryClient = useOrpcQueryClient()
queryClient.clear()
```

It needs the Nuxt context, which the browser keeps available once the app has started.
During server rendering, call it inside `nuxtApp.runWithContext()`.

### Existing Vue Query setup

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

### Multiple clients

When several RPC clients share a QueryClient, give each a different `prefix` to keep their cache keys and invalidation separate.
Set `prefix` in your client plugin configuration, or pass it to the factory:

```ts
const orpc = createORPCVueQuery(client, { prefix: "blog" })
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
Use `createTestORPCClient()` from `orpc-vue/testing` to replace `useOrpc()` with an isolated fake client.
`client` includes the regular composables and oRPC utilities.
Each procedure leaf in `procedures` has a `.handle()` method that registers a typed handler and returns a Vitest mock.

```ts
// test/nuxt/setup.ts
import { mockNuxtImport } from "@nuxt/test-utils/runtime"
import type { RouterClient } from "@orpc/server"
import { createTestORPCClient } from "orpc-vue/testing"
import { afterEach, vi } from "vitest"

import type { router } from "~~/server/rpc/router"

export const onUnexpectedError = vi.fn()
export const { client, procedures, reset } = createTestORPCClient<RouterClient<typeof router>>({
  onUnexpectedError,
})

// Return the composable itself; Vitest hoists this factory before the setup file runs.
mockNuxtImport("useOrpc", () => () => client)

afterEach(() => {
  reset()
  onUnexpectedError.mockClear()
})
```

`orpc-vue/testing` does not import `nuxt/app`, so the hoisted `mockNuxtImport()` factory can load it safely.
The client owns a QueryClient that never retries, so a failing procedure fails the test instead of timing out, and `reset()` removes the registered handlers together with the cached responses.
Reach that cache as `queryClient` to seed or inspect it, or pass your own to `createTestORPCClient()`; `reset()` clears that one as well.
Pass `interceptors` to run the same client policy in component tests.

Register the required handlers before mounting; `mountSuspended()` waits for awaited queries before assertions:

```ts
// test/nuxt/post-list.spec.ts
import { mountSuspended } from "@nuxt/test-utils/runtime"
import { expect, test } from "vitest"

import PostList from "~/components/post-list.vue"

import { onUnexpectedError, procedures } from "./setup"

test("renders the posts", async () => {
  const list = procedures.blog.posts.list.handle(() => [{ id: 1, title: "First post" }])
  const component = await mountSuspended(PostList)

  expect(component.text()).toContain("First post")
  expect(list).toHaveBeenCalledOnce()
})
```

When an awaited query fails during setup, `mountSuspended()` rejects with that error unless the component sets `rejectOnError: false` or catches it itself:

```ts
procedures.blog.posts.list.handle(() => {
  throw new Error("Failed query")
})

await expect(mountSuspended(PostList)).rejects.toThrow("Failed query")
expect(onUnexpectedError).toHaveBeenCalledOnce()
```

Handlers replace your server procedures, so middleware and input and output validation do not run.
To test server behavior, call your real router with `createRouterClient()`.

A handler receives the object that was passed to the call, and its mock keeps a reference to it.
If your components change an input after the call, for example by clearing a submitted form, pass `copyInput` to the test client, such as `copyInput: (input) => structuredClone(toRaw(input))`, and choose a copy that suits your data.
`.handle(handler, { copyInput })` replaces that copy for one procedure, and `copyInput: false` turns copying off.

The second handler argument provides typed error constructors derived from that procedure's `.errors()` map:

```ts
procedures.blog.posts.update.handle((input, { errors }) => {
  if (input.title === "taken") {
    throw errors.CONFLICT({
      message: "Already exists",
      data: { field: "title" },
    })
  }
  return { id: 1, ...input }
})
```

### Outside Vue components

You can call `.useQuery()` and `.useMutation()` outside a component, for example in a script or in a test that never mounts one.
Create them inside `scope.run()` so Vue can track their reactive subscriptions, then call `scope.stop()` when you are done.
When Vue injection is unavailable, pass a QueryClient explicitly:

```ts
import { QueryClient } from "@tanstack/vue-query"
import { createORPCVueQuery } from "orpc-vue"
import { effectScope } from "vue"

const queryClient = new QueryClient()
const orpc = createORPCVueQuery(client, { queryClient })
const scope = effectScope()

try {
  const { data } = await scope.run(() => {
    return orpc.blog.posts.get.useQuery({ id: 1 })
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
