# Testing

## Component tests

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

When an awaited query fails during setup, `mountSuspended()` rejects with that error unless the component sets `rejectOnError: false` or catches it itself:

```ts
procedures.blog.posts.list.handle(() => {
  throw new Error("Failed query")
})

await expect(mountSuspended(PostList)).rejects.toThrow("Failed query")
```

Handlers replace your server procedures, so middleware, transformers and your `errorFormatter` do not run, and subscriptions are not mocked.
Return what your client receives: without a transformer, for example, a `Date` output arrives as a string.
To test formatted error data, throw a `TRPCClientError` that carries it; to test server behavior, use your real router with `unstable_localLink`.

`.useQuery()` passes the handler a deep copy of its input that later input changes do not affect.
Mutations and direct procedure calls pass the object itself, and the handler's mock keeps a reference to it.
If your components change such an input after the call, for example by clearing a submitted form, pass `copyInput` to the test client, such as `copyInput: (input) => structuredClone(toRaw(input))`, and choose a copy that suits your data.
`.handle(handler, { copyInput })` replaces that copy for one procedure, and `copyInput: false` turns that copying off.

## Outside Vue components

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
