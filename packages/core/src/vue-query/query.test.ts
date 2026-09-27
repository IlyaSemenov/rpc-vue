import { afterEach, describe, expect, test } from "bun:test"

import {
  dehydrate,
  environmentManager,
  hydrate,
  QueryClient,
  type QueryObserverOptions,
  skipToken,
  VueQueryPlugin,
} from "@tanstack/vue-query"
import { renderToString } from "@vue/server-renderer"
import {
  createSSRApp,
  type EffectScope,
  effectScope,
  h,
  isReadonly,
  nextTick,
  reactive,
  ref,
} from "vue"

import { type AwaitableQuery, type QueryResult, useReactiveQuery } from "./query"

interface Item {
  id: number
  details: { title: string }
}

const clients: QueryClient[] = []
const scopes: EffectScope[] = []

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  for (const client of clients.splice(0)) client.clear()
})

/**
 * Create an isolated cache and effect scope, both disposed by afterEach, and an item query.
 * Items with a negative id fail; `source` names the fetching side in each title.
 */
function setup(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  }),
  source = "item",
  shouldRetryError?: (error: unknown) => boolean,
) {
  const scope = effectScope()
  clients.push(queryClient)
  scopes.push(scope)
  let calls = 0

  function buildOptions(
    input: unknown,
    settings: Record<string, unknown>,
  ): QueryObserverOptions<unknown, Error> {
    return {
      ...settings,
      queryKey: ["item", input],
      queryFn:
        input === skipToken
          ? skipToken
          : async () => {
              calls++
              const { id } = input as { id: number }
              if (id < 0) throw new Error("Missing item")
              await Promise.resolve()
              return { id, details: { title: `${source} ${id}` } } satisfies Item
            },
    }
  }

  return {
    queryClient,
    scope,
    calls: () => calls,
    key: (id: number) => ["item", { id }],
    useItem(input: unknown, options?: unknown) {
      return useReactiveQuery(input, options, {
        buildOptions,
        queryClient,
        shouldRetryError,
      }) as AwaitableQuery<QueryResult<Item, Error, true>>
    },
  }
}

describe("query composable", () => {
  test("returns state immediately and deduplicates the initial fetch", async () => {
    const { scope, useItem, calls } = setup()
    const first = scope.run(() => useItem({ id: 1 }))!
    const second = scope.run(() => useItem({ id: 1 }))!
    expect(first.data.value).toBeUndefined()
    expect(first.isPending.value).toBe(true)
    const result = await first
    await second
    expect(result.data).toBe(first.data)
    expect(first.data.value?.id).toBe(1)
    expect(second.data.value?.id).toBe(1)
    expect(isReadonly(second.data.value)).toBe(true)
    expect(calls()).toBe(1)
  })

  test("exposes a stable default without writing it to the cache", async () => {
    const { scope, queryClient, useItem, key } = setup()
    const fallback = { id: 0, details: { title: "Loading" } }
    let defaults = 0
    const query = scope.run(() =>
      useItem(
        { id: 1 },
        {
          default: () => {
            defaults++
            return fallback
          },
        },
      ),
    )!

    expect(query.data.value).toEqual(fallback)
    expect(isReadonly(query.data.value)).toBe(true)
    expect(query.isPending.value).toBe(true)
    expect(queryClient.getQueryData(key(1))).toBeUndefined()
    expect(defaults).toBe(1)

    await query
    expect(query.data.value?.details.title).toBe("item 1")
    expect(defaults).toBe(1)

    const failed = scope.run(() =>
      useItem({ id: -1 }, { default: () => ({ id: 0, details: { title: "Unavailable" } }) }),
    )!
    await failed
    expect(failed.data.value?.details.title).toBe("Unavailable")
    expect(failed.error.value?.message).toBe("Missing item")
    expect(queryClient.getQueryData(key(-1))).toBeUndefined()
  })

  test("keeps cloned and selected defaults outside the cache", async () => {
    const { scope, queryClient, useItem } = setup()
    const fallback = { id: 0, details: { title: "Draft" } }
    const clone = scope.run(() =>
      useItem(skipToken, {
        clone: true,
        default: () => fallback,
      }),
    )!
    const selected = scope.run(() =>
      useItem(skipToken, {
        select: (item: Item) => item.details,
        default: () => ({ title: "Nothing selected" }),
      }),
    )!

    expect(clone.data.value).not.toBe(fallback)
    expect(isReadonly(clone.data.value)).toBe(false)
    clone.data.value!.details.title = "Local draft"
    expect(fallback.details.title).toBe("Draft")
    expect(selected.data.value).toHaveProperty("title", "Nothing selected")
    expect(isReadonly(selected.data.value)).toBe(true)
    expect(queryClient.getQueryData(["item", skipToken])).toBeUndefined()
  })

  test("writes to the cache only after explicit assignment over a default", async () => {
    const { scope, queryClient, useItem, key } = setup()
    const query = scope.run(() =>
      useItem(
        { id: 2 },
        {
          enabled: false,
          default: () => ({ id: 0, details: { title: "Disabled" } }),
        },
      ),
    )!

    expect(query.data.value?.details.title).toBe("Disabled")
    expect(queryClient.getQueryData(key(2))).toBeUndefined()
    query.data.value = { id: 2, details: { title: "Assigned" } }
    expect(queryClient.getQueryData(key(2))).toHaveProperty("details.title", "Assigned")
    expect(query.data.value?.details.title).toBe("Assigned")
  })

  test("clones are local; root assignment updates the shared cache", async () => {
    const { scope, queryClient, useItem, key } = setup()
    const clone = scope.run(() => useItem({ id: 1 }, { clone: true }))!
    const other = scope.run(() => useItem({ id: 1 }))!
    await Promise.all([clone, other])
    clone.data.value!.details.title = "local edit"
    expect(other.data.value?.details.title).toBe("item 1")
    clone.data.value = { id: 1, details: { title: "saved" } }
    expect(other.data.value?.details.title).toBe("saved")
    expect(clone.data.value).not.toBe(queryClient.getQueryData(key(1)))
    clone.data.value!.details.title = "another local edit"
    expect(other.data.value?.details.title).toBe("saved")
    await nextTick()
    expect(clone.data.value?.details.title).toBe("another local edit")
    // Once an assignment has propagated, further local edits survive unrelated Vue ticks.
    clone.data.value!.details.title = "draft"
    await nextTick()
    expect(clone.data.value?.details.title).toBe("draft")
    await clone.invalidate()
    expect(clone.data.value?.details.title).toBe("item 1")
  })

  test("a successful fetch or cache write resets a clone even when the data is unchanged", async () => {
    const { scope, queryClient, useItem, key } = setup()
    const query = scope.run(() => useItem({ id: 1 }, { clone: true }))!
    await query
    query.data.value!.details.title = "draft"
    await query.refetch()
    expect(query.data.value?.details.title).toBe("item 1")
    query.data.value!.details.title = "draft"
    queryClient.setQueryData(key(1), { id: 1, details: { title: "item 1" } })
    expect(query.data.value?.details.title).toBe("item 1")
  })

  test("select changes the view and makes assignments fail without changing the cache", async () => {
    const { scope, queryClient, useItem, key } = setup()
    const selected = scope.run(() => useItem({ id: 1 }, { select: (item: Item) => item.details }))!
    await selected
    expect(selected.data.value).toHaveProperty("title", "item 1")
    expect(isReadonly(selected.data.value)).toBe(true)
    expect(() => {
      Reflect.set(selected.data, "value", { title: "wrong" })
    }).toThrow("readonly")
    expect(queryClient.getQueryData(key(1))).toHaveProperty("id", 1)
    expect(() => {
      scope.run(() => useItem({ id: 1 }, { clone: true, select: (item: Item) => item.id }))
    }).toThrow("cannot be combined")
  })

  test("disabled and skipped queries settle without making a request", async () => {
    const { scope, useItem, calls } = setup()
    const enabled = ref(false)
    const query = scope.run(() => useItem({ id: 1 }, { enabled }))!
    const skipped = scope.run(() => useItem(skipToken))!
    await Promise.all([query, skipped])
    expect(skipped.fetchStatus.value).toBe("idle")
    expect(calls()).toBe(0)
    enabled.value = true
    await nextTick()
    await query.suspense()
    expect(query.data.value?.id).toBe(1)
    expect(calls()).toBe(1)
  })

  test("inherits QueryClient enabled defaults", async () => {
    const { scope, queryClient, useItem, calls } = setup()
    queryClient.setDefaultOptions({ queries: { enabled: false } })
    await scope.run(() => useItem({ id: 1 }))!
    expect(calls()).toBe(0)
  })

  test("reactive input gets separate cache entries and root writes use the current key", async () => {
    const { scope, queryClient, useItem, key } = setup()
    const input = reactive({ id: 1 })
    const query = scope.run(() => useItem(input, { clone: true }))!
    await query
    input.id = 2
    await nextTick()
    await query.suspense()
    query.data.value = { id: 2, details: { title: "updated" } }
    expect(queryClient.getQueryData(key(1))).toHaveProperty("id", 1)
    expect(queryClient.getQueryData(key(2))).toHaveProperty("details.title", "updated")
  })

  test("reactive input is snapshotted and invalidate() targets only the current input", async () => {
    const { scope, queryClient, useItem, key } = setup()
    const input = reactive({ id: 1 })
    const query = scope.run(() => useItem(input))!
    await query
    const [entry] = queryClient.getQueryCache().findAll()
    input.id = 2
    // The existing entry keeps the key it was created with.
    expect(entry!.queryKey).toEqual(key(1))
    await query.invalidate()
    expect(queryClient.getQueryState(key(1))?.isInvalidated).toBe(false)
    await nextTick()
    await query.suspense()
    expect(query.data.value?.id).toBe(2)
  })

  test("errors are state by default", async () => {
    const { scope, useItem } = setup()
    const query = scope.run(() => useItem({ id: -1 }))!
    await query
    expect(query.error.value?.message).toBe("Missing item")
  })

  test("an error retry guard preserves the configured retry policy for allowed errors", async () => {
    const blocked = setup(
      new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 } } }),
      "item",
      () => false,
    )
    await blocked.scope.run(() => blocked.useItem({ id: -1 }))!
    expect(blocked.calls()).toBe(1)

    const allowed = setup(
      new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 } } }),
      "item",
      () => true,
    )
    await allowed.scope.run(() => allowed.useItem({ id: -1 }))!
    expect(allowed.calls()).toBe(3)
  })

  test("uses the server retry default when the guard allows an error", async () => {
    const server = setup(
      new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } }),
      "item",
      () => true,
    )
    await server.scope.run(() => server.useItem({ id: -1 }))!
    expect(server.calls()).toBe(1)
  })

  test("uses the browser retry default when the guard allows an error", async () => {
    const wasServer = environmentManager.isServer()
    environmentManager.setIsServer(() => false)
    try {
      const browser = setup(
        new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } }),
        "item",
        () => true,
      )
      await browser.scope.run(() => browser.useItem({ id: -1 }))!
      expect(browser.calls()).toBe(4)
    } finally {
      environmentManager.setIsServer(() => wasServer)
    }
  })

  test("throwOnError rejects awaiting and reaches the Vue error handler", async () => {
    const { useItem } = setup()
    const errors: unknown[] = []
    const app = createSSRApp({
      async setup() {
        const query = useItem({ id: -1 }, { throwOnError: true })
        await expect(query).rejects.toThrow("Missing item")
        return () => h("p", "handled")
      },
    })
    app.config.errorHandler = (error) => {
      errors.push(error)
    }
    expect(await renderToString(app)).toContain("handled")
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe("server rendering", () => {
  test("waits for unawaited queries, isolates request caches and reuses hydrated data", async () => {
    let calls = 0
    /** Render an isolated app, optionally seeding its cache with a previous app's payload. */
    async function render(source: string, state?: ReturnType<typeof dehydrate>) {
      const client = setup(undefined, source)
      if (state) hydrate(client.queryClient, state)
      const app = createSSRApp({
        setup() {
          // Deliberately omit await: onServerPrefetch must still hold rendering for this query.
          const query = client.useItem({ id: 1 })
          return () => h("p", query.data.value?.details.title)
        },
      })
      app.use(VueQueryPlugin, { queryClient: client.queryClient })
      const html = await renderToString(app)
      calls += client.calls()
      return { html, state: dehydrate(client.queryClient) }
    }
    const [alice, bob] = await Promise.all([render("Alice"), render("Bob")])
    expect(alice.html).toBe("<p>Alice 1</p>")
    expect(bob.html).toBe("<p>Bob 1</p>")
    expect(calls).toBe(2)
    // A different source makes any accidental refetch observable in both HTML and call count.
    const hydrated = await render("should not fetch", alice.state)
    expect(hydrated.html).toBe("<p>Alice 1</p>")
    expect(calls).toBe(2)
  })

  test("uses hydrated data instead of the local default", async () => {
    const server = setup(undefined, "Server")
    const serverQuery = server.scope.run(() =>
      server.useItem(
        { id: 1 },
        { default: () => ({ id: 0, details: { title: "server default" } }) },
      ),
    )!
    await serverQuery
    const state = dehydrate(server.queryClient)
    expect(JSON.stringify(state)).not.toContain("server default")

    const client = setup(undefined, "should not fetch")
    hydrate(client.queryClient, state)
    const clientQuery = client.scope.run(() =>
      client.useItem(
        { id: 1 },
        { default: () => ({ id: 0, details: { title: "client default" } }) },
      ),
    )!
    expect(clientQuery.data.value?.details.title).toBe("Server 1")
    expect(client.calls()).toBe(0)
  })

  test("server: false never starts or awaits an SSR request", async () => {
    const { queryClient, useItem, calls, key } = setup()
    const app = createSSRApp({
      async setup() {
        const query = await useItem(
          { id: 1 },
          {
            server: false,
            default: () => ({ id: 0, details: { title: "pending" } }),
          },
        )
        return () => h("p", query.data.value?.details.title)
      },
    })
    expect(await renderToString(app)).toBe("<p>pending</p>")
    expect(queryClient.getQueryState(key(1))?.fetchStatus).toBe("idle")
    expect(dehydrate(queryClient).queries).toHaveLength(0)
    expect(calls()).toBe(0)
  })
})
