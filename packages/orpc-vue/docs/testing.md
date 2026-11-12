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
Pass `interceptors` to run the same [client policy](./errors#application-wide-policy) in component tests:

```ts
import { type Client, createClientInterceptors } from "~/orpc"

export const onAuthenticationRequired = vi.fn()
export const { client, procedures, reset } = createTestORPCClient<Client>({
  interceptors: createClientInterceptors({ onAuthenticationRequired }),
  onUnexpectedError,
})

afterEach(() => {
  reset()
  onUnexpectedError.mockClear()
  onAuthenticationRequired.mockClear()
})
```

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

## Outside Vue components

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
