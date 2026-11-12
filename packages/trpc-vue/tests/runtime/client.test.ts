import { afterEach, describe, expect, test } from "bun:test"

import { dehydrate, hydrate, QueryClient, useInfiniteQuery } from "@tanstack/vue-query"
import { createTRPCClient, getUntypedClient, type TRPCLink, unstable_localLink } from "@trpc/client"
import { initTRPC } from "@trpc/server"
import { parse, stringify } from "devalue"
import superjson from "superjson"
import { createTRPCVueQuery } from "trpc-vue"
import { ref } from "vue"

import { fixture, router } from "./fixture"

const cleanups: (() => void)[] = []

/** Create an isolated client, cache and effect scope, all disposed by afterEach. */
function setup() {
  const client = fixture()
  cleanups.push(client.dispose)
  return client
}

afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose()
})

describe("query and mutation client", () => {
  test("procedure invalidation covers every input; branch and root invalidation include descendants", async () => {
    const { trpc, queryClient } = setup()
    const keys = [
      trpc.blog.get.queryKey({ id: 1 }),
      trpc.blog.get.queryKey({ id: 2 }),
      trpc.blog.pages.queryKey({ group: "news" }),
      trpc.date.queryKey(),
    ]
    for (const key of keys) queryClient.setQueryData(key, "cached")

    await trpc.blog.get.invalidate()
    expect(keys.map(key => queryClient.getQueryState(key)?.isInvalidated)).toEqual([
      true,
      true,
      false,
      false,
    ])
    await trpc.blog.invalidate()
    expect(keys.map(key => queryClient.getQueryState(key)?.isInvalidated)).toEqual([
      true,
      true,
      true,
      false,
    ])
    await trpc.invalidate()
    expect(queryClient.getQueryState(keys[3]!)?.isInvalidated).toBe(true)
  })

  test("invalidation keeps clients with different prefixes separate", async () => {
    const { raw, queryClient } = setup()
    const blog = createTRPCVueQuery(raw, { queryClient, prefix: "blog" })
    const archive = createTRPCVueQuery(raw, { queryClient, prefix: "archive" })
    const blogKey = blog.blog.get.queryKey({ id: 1 })
    const archiveKey = archive.blog.get.queryKey({ id: 1 })
    queryClient.setQueryData(blogKey, { id: 1, title: "current", details: { label: "" } })
    queryClient.setQueryData(archiveKey, { id: 1, title: "archived", details: { label: "" } })
    await blog.blog.invalidate()
    expect(queryClient.getQueryState(blogKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(archiveKey)?.isInvalidated).toBe(false)
  })

  test("preserves native methods, procedure names and the untyped client", async () => {
    const { trpc, raw, scope } = setup()
    expect(trpc.blog).toBe(trpc.blog)
    expect(trpc.blog.get.useQuery).toBe(trpc.blog.get.useQuery)
    expect(trpc.blog.save.useMutation).toBe(trpc.blog.save.useMutation)
    expect(trpc.useQuery.nested).toBe(trpc.useQuery.nested)
    expect(getUntypedClient(trpc)).toBe(getUntypedClient(raw))
    // Recursive property lookup must not manufacture a then method and hang promise resolution.
    expect(await trpc).toBe(trpc)
    expect(await trpc.blog.get.query({ id: 1 })).toMatchObject({ id: 1 })
    expect(await trpc.blog.save.mutate({ title: "native" })).toEqual({ title: "native" })
    expect(await trpc.useQuery.nested.query()).toBe("collision")
    const collision = scope.run(() => trpc.useQuery.nested.useQuery())!
    expect(await collision).toHaveProperty("data.value", "collision")
    const chunks: string[] = []
    for await (const chunk of await trpc.stream.query()) chunks.push(chunk)
    expect(chunks).toEqual(["chunk"])
    await new Promise<void>((resolve, reject) => {
      const subscription = trpc.events.subscribe(undefined, {
        onData(data) {
          expect(data).toBe("event")
          subscription.unsubscribe()
          resolve()
        },
        onError: reject,
      })
    })
  })

  test("composables use tRPC keys and resolve reactive request options", async () => {
    const { queryClient, scope } = setup()
    const calls: unknown[] = []
    const tap: TRPCLink<typeof router> =
      () =>
      ({ op, next }) => {
        calls.push({ path: op.path, context: op.context })
        return next(op)
      }
    const trpc = createTRPCVueQuery(
      createTRPCClient<typeof router>({
        links: [
          tap,
          unstable_localLink({ router, createContext: async () => ({ viewer: "visitor" }) }),
        ],
      }),
      { queryClient },
    )
    const token = ref("first")
    const options = () => ({ trpc: { context: { token: token.value } } })
    const query = await scope.run(() => trpc.blog.get.useQuery({ id: 1 }, options))!
    expect(query.data.value?.title).toBe("trpc visitor")
    expect(queryClient.getQueryData(trpc.blog.get.queryKey({ id: 1 }))?.title).toBe("trpc visitor")
    token.value = "second"
    const mutation = scope.run(() => trpc.blog.save.useMutation(options))!
    expect(await mutation.mutateAsync({ title: "draft" })).toEqual({ title: "draft" })
    expect(calls).toEqual([
      { path: "blog.get", context: { token: "first" } },
      { path: "blog.save", context: { token: "second" } },
    ])
  })

  test("a transformer preserves client output types through queries and hydration", async () => {
    const t = initTRPC.create({ transformer: superjson })
    const transformed = t.router({
      date: t.procedure.query(() => ({ date: new Date("2026-01-01T00:00:00Z"), count: 12n })),
    })
    const cache = new QueryClient()
    const restored = new QueryClient()
    cleanups.push(
      () => cache.clear(),
      () => restored.clear(),
    )
    const trpc = createTRPCVueQuery(
      createTRPCClient<typeof transformed>({
        links: [
          unstable_localLink({
            router: transformed,
            createContext: async () => ({}),
            transformer: superjson,
          }),
        ],
      }),
      { queryClient: cache },
    )
    const value = await cache.fetchQuery(trpc.date.queryOptions())
    expect(value.date).toBeInstanceOf(Date)
    expect(value.count).toBe(12n)
    hydrate(restored, parse(stringify(dehydrate(cache))))
    expect(restored.getQueryData(trpc.date.queryKey())).toEqual(value)
  })

  test("infinite utilities work with Vue Query, map pageParam and keep query kinds distinct", async () => {
    const { trpc, scope, queryClient } = setup()
    const pages = scope.run(() =>
      useInfiniteQuery(
        trpc.blog.pages.infiniteQueryOptions(
          { group: "news" },
          {
            initialCursor: 3,
            getNextPageParam: page => page.next,
            getPreviousPageParam: page => (page.cursor ?? 0) - 1,
          },
        ),
        queryClient,
      ),
    )!
    await pages.fetchNextPage()
    await pages.fetchNextPage()
    expect(pages.data.value?.pages.map(page => page.cursor)).toEqual([3, 4])
    await pages.fetchPreviousPage()
    expect(pages.data.value?.pages[0]).toMatchObject({ cursor: 2, direction: "backward" })
    scope.stop()
    await trpc.blog.pages.invalidate()
    expect(
      queryClient.getQueryState(trpc.blog.pages.infiniteQueryKey({ group: "news" }))?.isInvalidated,
    ).toBe(true)
    expect(trpc.blog.pages.queryKey({ group: "news" })).not.toEqual(
      trpc.blog.pages.infiniteQueryKey({ group: "news" }),
    )
  })
})
