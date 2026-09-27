import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"

import { type Client, createORPCClient, createORPCErrorFromJson, ORPCError } from "@orpc/client"
import { CancelledError, environmentManager, QueryClient } from "@tanstack/vue-query"
import { createORPCVueQuery, type ORPCUnexpectedErrorHandler } from "orpc-vue"
import { type EffectScope, effectScope, nextTick } from "vue"

type Input = { id: number }
type AppClient = {
  posts: {
    get: Client<Record<never, never>, Input, Input, ORPCError<"NOT_FOUND", unknown> | Error>
  }
}
const scopes: EffectScope[] = []
const clients: QueryClient[] = []
let wasServer: boolean

beforeEach(() => {
  wasServer = environmentManager.isServer()
  environmentManager.setIsServer(() => false)
})
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  for (const client of clients.splice(0)) client.clear()
  environmentManager.setIsServer(() => wasServer)
})

/** A controlled transport keeps the original error identity and counts actual RPC attempts. */
function setup(onUnexpectedError = mock<ORPCUnexpectedErrorHandler>(() => {})) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  clients.push(queryClient)
  const scope = effectScope()
  scopes.push(scope)
  const error = new Error("Unexpected failure")
  const transport = mock<
    (path: readonly string[], input: unknown, options: { signal?: AbortSignal }) => Promise<unknown>
  >(async () => {
    throw error
  })
  const raw = createORPCClient<AppClient>({ call: transport })
  const client = createORPCVueQuery(raw, { queryClient, prefix: "blog", onUnexpectedError })
  return { client, raw, scope, queryClient, error, transport, onUnexpectedError }
}

test.each(["call", "callCatching"] as const)(
  "reports %s and preserves the rejection",
  async (source) => {
    const { client, error, onUnexpectedError } = setup()
    const input = { id: 1 }
    const promise =
      source === "call" ? client.posts.get.call(input) : client.posts.get.callCatching(input, {})
    await expect(promise).rejects.toBe(error)
    expect(onUnexpectedError.mock.calls).toEqual([
      [error, { source, path: ["posts", "get"], input }],
    ])
  },
)

test.each([true, false])(
  "reports awaited queries with rejectOnError=%s once after all retries",
  async (rejectOnError) => {
    const { client, scope, transport, error, onUnexpectedError } = setup()
    const input = { id: 2 }
    const queries = [1, 2].map(() =>
      scope.run(() =>
        client.posts.get.useQuery(input, {
          retry: 2,
          retryDelay: 0,
          rejectOnError,
        }),
      )!,
    )
    const results = await Promise.allSettled(queries)
    expect(results.map((result) => result.status)).toEqual(
      rejectOnError ? ["rejected", "rejected"] : ["fulfilled", "fulfilled"],
    )
    expect(queries[0]!.error.value).toBe(error)
    expect(transport).toHaveBeenCalledTimes(3)
    expect(onUnexpectedError.mock.calls).toEqual([
      [error, { source: "query", path: ["posts", "get"], input }],
    ])

    await queries[0]!.refetch()
    expect(transport).toHaveBeenCalledTimes(6)
    expect(onUnexpectedError).toHaveBeenCalledTimes(2)
  },
)

test("reports queries used without await and failures following a successful fetch", async () => {
  const { client, scope, transport, error, onUnexpectedError } = setup()
  transport.mockImplementationOnce(async (_path, input) => input)
  const query = scope.run(() => client.posts.get.useQuery({ id: 3 }))!
  await query.suspense()
  expect(onUnexpectedError).not.toHaveBeenCalled()
  await query.refetch()
  expect(query.error.value).toBe(error)
  expect(onUnexpectedError).toHaveBeenCalledTimes(1)
})

test.each(["mutate", "mutateAsync"] as const)(
  "reports %s once after retries and preserves state",
  async (method) => {
    const { client, scope, transport, error, onUnexpectedError } = setup()
    const onError = mock(() => {})
    const mutation = scope.run(() =>
      client.posts.get.useMutation({ retry: 2, retryDelay: 0, onError }),
    )!
    const input = { id: 4 }
    if (method === "mutateAsync") {
      await expect(mutation.mutateAsync(input)).rejects.toBe(error)
    } else {
      await new Promise<void>((resolve) => mutation.mutate(input, { onSettled: () => resolve() }))
    }
    await nextTick()
    expect(mutation.error.value).toBe(error)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledTimes(3)
    expect(onUnexpectedError.mock.calls).toEqual([
      [error, { source: "mutation", path: ["posts", "get"], input }],
    ])
  },
)

test("does not report declared errors, handled or not, through any API", async () => {
  const { client, scope, transport, onUnexpectedError } = setup()
  const error = createORPCErrorFromJson({ ...new ORPCError("NOT_FOUND").toJSON(), defined: true })
  transport.mockImplementation(async () => {
    throw error
  })
  const input = { id: 5 }
  await expect(client.posts.get.call(input)).rejects.toBe(error)
  await expect(client.posts.get.callCatching(input, {})).rejects.toBe(error)
  await expect(client.posts.get.callCatching(input, { NOT_FOUND: null })).resolves.toBeNull()
  await expect(scope.run(() => client.posts.get.useQuery(input))!).rejects.toBe(error)
  const handled = scope.run(() =>
    client.posts.get.useQuery(input, { catching: { NOT_FOUND: null } }),
  )!
  expect((await handled).data.value).toBeNull()
  await expect(scope.run(() => client.posts.get.useMutation())!.mutateAsync(input)).rejects.toBe(
    error,
  )
  expect(onUnexpectedError).not.toHaveBeenCalled()
})

test.each([new DOMException("Aborted", "AbortError"), new CancelledError()])(
  "does not report cancellations: %s",
  async (error) => {
    const { client, scope, transport, onUnexpectedError } = setup()
    transport.mockImplementation(async () => {
      throw error
    })
    const input = { id: 6 }
    await expect(client.posts.get.call(input)).rejects.toBe(error)
    await expect(client.posts.get.callCatching(input, {})).rejects.toBe(error)
    const query = scope.run(() => client.posts.get.useQuery(input, { rejectOnError: false }))!
    await query
    await expect(scope.run(() => client.posts.get.useMutation())!.mutateAsync(input)).rejects.toBe(
      error,
    )
    expect(onUnexpectedError).not.toHaveBeenCalled()
  },
)

test("does not report custom abort reasons or cancelled in-flight queries", async () => {
  const { client, scope, queryClient, transport, onUnexpectedError } = setup()
  const controller = new AbortController()
  controller.abort(new Error("Cancelled by caller"))
  transport.mockImplementation(async (_path, _input, { signal }) => {
    signal!.throwIfAborted()
    return await new Promise((_resolve, reject) =>
      signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }),
    )
  })
  const input = { id: 7 }
  await expect(client.posts.get.call(input, { signal: controller.signal })).rejects.toBe(
    controller.signal.reason,
  )
  await expect(
    client.posts.get.callCatching(input, {}, { signal: controller.signal }),
  ).rejects.toBe(controller.signal.reason)
  scope.run(() => client.posts.get.useQuery(input))
  await queryClient.cancelQueries()
  expect(onUnexpectedError).not.toHaveBeenCalled()
})

test("never reports on the server", async () => {
  environmentManager.setIsServer(() => true)
  const { client, scope, error, onUnexpectedError } = setup()
  const input = { id: 8 }
  await expect(client.posts.get.call(input)).rejects.toBe(error)
  await expect(client.posts.get.callCatching(input, {})).rejects.toBe(error)
  await expect(scope.run(() => client.posts.get.useQuery(input))!).rejects.toBe(error)
  await expect(scope.run(() => client.posts.get.useMutation())!.mutateAsync(input)).rejects.toBe(
    error,
  )
  expect(onUnexpectedError).not.toHaveBeenCalled()
})

test.each([false, true])("isolates hook failures (async=%s)", async (async) => {
  const hookError = new Error("Broken toast")
  const onUnexpectedError = mock<ORPCUnexpectedErrorHandler>(() => {
    if (async) return Promise.reject(hookError)
    throw hookError
  })
  const { client, scope, error } = setup(onUnexpectedError)
  const log = spyOn(console, "error").mockImplementation(() => {})
  try {
    await expect(client.posts.get.call({ id: 9 })).rejects.toBe(error)
    const query = scope.run(() => client.posts.get.useQuery({ id: 9 }))!
    await expect(query).rejects.toBe(error)
    const mutation = scope.run(() => client.posts.get.useMutation())!
    await expect(mutation.mutateAsync({ id: 9 })).rejects.toBe(error)
    expect(query.error.value).toBe(error)
    expect(mutation.error.value).toBe(error)
    expect(log.mock.calls).toEqual(
      Array.from({ length: 3 }, () => ["orpc-vue: onUnexpectedError failed", hookError]),
    )
  } finally {
    log.mockRestore()
  }
})

test("keeps reporting isolated between clients sharing a cache", async () => {
  const { client, raw, scope, queryClient, onUnexpectedError } = setup()
  const otherHook = mock<ORPCUnexpectedErrorHandler>(() => {})
  const other = createORPCVueQuery(raw, {
    queryClient,
    prefix: "archive",
    onUnexpectedError: otherHook,
  })
  await Promise.allSettled([
    scope.run(() => client.posts.get.useQuery({ id: 10 }))!,
    scope.run(() => other.posts.get.useQuery({ id: 10 }))!,
  ])
  expect(onUnexpectedError).toHaveBeenCalledTimes(1)
  expect(otherHook).toHaveBeenCalledTimes(1)
  await queryClient
    .fetchQuery({
      queryKey: ["unrelated"],
      queryFn: () => {
        throw new Error("Other")
      },
    })
    .catch(() => {})
  expect(onUnexpectedError).toHaveBeenCalledTimes(1)
  expect(otherHook).toHaveBeenCalledTimes(1)
})
