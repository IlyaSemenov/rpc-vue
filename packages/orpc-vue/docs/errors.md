# Errors

## Declared errors

Use `.callCatching()` to call a procedure and handle errors it declares with `.errors()`, with their code and data types:

```ts
const post = await orpc.blog.posts.update.callCatching(input, {
  CONFLICT: error => {
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

### In queries

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

### Application-wide policy

Use a client interceptor for an application-wide policy on a declared error, such as redirecting after an expired session.
`InferClientError` only includes codes that some procedure of the router declares, so add each code the policy handles to its error type.
The policy then keeps compiling while no procedure declares that code.
Define it in a module shared by the plugin and [component tests](./testing#component-tests):

```ts
// app/orpc.ts
import {
  type InferClientError,
  isDefinedError,
  onError,
  type ORPCClientOptions,
  type ORPCError,
} from "@orpc/client"
import type { RouterClient } from "@orpc/server"
import type { router } from "~~/server/rpc/router"

export type Client = RouterClient<typeof router>

type ClientError = InferClientError<Client> | ORPCError<"AUTHENTICATION_REQUIRED", unknown>

export interface ClientErrorPolicy {
  /** Called when any procedure rejects the call because the session has expired or was revoked. */
  onAuthenticationRequired: () => void | Promise<void>
}

export function createClientInterceptors(
  policy: ClientErrorPolicy,
): NonNullable<ORPCClientOptions<Client>["interceptors"]> {
  return [
    onError(async (error: ClientError) => {
      // Other errors reach the caller, `.callCatching()` handlers, or `onUnexpectedError`.
      if (isDefinedError(error) && error.code === "AUTHENTICATION_REQUIRED") {
        await policy.onAuthenticationRequired()
      }
    }),
  ]
}
```

The Nuxt plugin accepts the same `interceptors` option as `createORPCClient()`:

```ts
// app/plugins/orpc.ts
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import { type Client, createClientInterceptors } from "~/orpc"

export default defineNuxtPlugin<Client>(nuxtApp => ({
  url: "/rpc",
  interceptors: createClientInterceptors({
    onAuthenticationRequired: async () => {
      // Interceptors run outside the setup context, and navigateTo() needs the Nuxt app.
      await nuxtApp.runWithContext(() => navigateTo("/login"))
    },
  }),
}))
```

An interceptor runs for every client attempt before `.callCatching()` or `catching` handles a declared error.
Keep `onUnexpectedError` for a shared notification after retries of an undeclared error.

### Plain oRPC clients

`.callCatching()` is built on `catchORPCError()`, which handles errors of a promise returned directly by any typed oRPC client call.
Use `catchORPCError()` when calling a plain typed oRPC client:

```ts
import { catchORPCError } from "orpc-vue"

const post = await catchORPCError(client.blog.posts.get({ id }), { NOT_FOUND: null })
```

## Unexpected browser errors

Set `onUnexpectedError` in `createORPCVueQuery()` options or in the options returned by your `orpc-vue/nuxt` plugin to show a shared notification for undeclared errors.
It receives the error and `{ source, path, input }`, where `source` is `"call"`, `"callCatching"`, `"query"` or `"mutation"`.
`input` may contain sensitive data such as passwords; do not log or send it.

- The hook runs even when your code catches the error; calls still reject and query or mutation state keeps the error.
- It runs in the browser once per failed call, mutation or query fetch, after retries, including initial awaited queries and refetches.
- It does not run for declared errors, even without a matching handler, for cancellations, or during SSR.
- It covers `.call()`, `.callCatching()`, `.useQuery()` and `.useMutation()`; upstream `queryOptions()`, `mutationOptions()` and direct calls of the raw oRPC client are not reported.

With [Nuxt UI's `useToast()`](https://ui.nuxt.com/docs/composables/use-toast), call it during plugin setup:

```ts
// app/plugins/orpc.ts
import type { RouterClient } from "@orpc/server"
import { ORPCNetworkError } from "orpc-vue"
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
      const title = error instanceof ORPCNetworkError ? "Connection failed" : "Request failed"
      toast.add({ title, description: message, color: "error" })
    },
  }
})
```

### Network failures

When `fetch` rejects without a response available to the client, for example because the browser is offline, the server is unreachable or CORS blocks the response, the plugin's HTTP transport rejects the call with `ORPCNetworkError`.
The original `fetch` rejection is its `cause`.
Use it to tell connection problems apart from failed requests, in `onUnexpectedError` or when filtering errors before sending them to an error tracker.

A call whose `signal` is aborted, including by `AbortSignal.timeout()`, keeps its original rejection.
The plugin does not add `ORPCNetworkError` to a [custom link](./nuxt-client#custom-link) or a [manual client setup](./nuxt-client#manual-client-setup); their transport determines how `fetch` rejections reach the caller.
