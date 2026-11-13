import { expect, test } from "bun:test"

import { createORPCClient } from "@orpc/client"
import {
  dehydrate,
  hashKey,
  hydrate,
  QueryClient,
  type QueryClientConfig,
  type QueryKey,
} from "@tanstack/vue-query"
import { createORPCVueQuery } from "orpc-vue"
import { createTRPCVueQuery } from "trpc-vue"

import { fixture } from "./fixture"

/** Application-owned global hashing that namespaced adapter keys must not depend on. */
const applicationHash = (queryKey: QueryKey) => `application:${hashKey(queryKey)}`
const applicationConfig: QueryClientConfig = {
  defaultOptions: { queries: { queryKeyHashFn: applicationHash } },
}
const hashingConfigs: Record<string, QueryClientConfig> = {
  default: {},
  application: applicationConfig,
}

for (const [hashing, config] of Object.entries(hashingConfigs)) {
  test(`${hashing} cache hashing preserves adapter keys for imperative reads/writes`, () => {
    const queryClient = new QueryClient(config)
    const { trpc, dispose } = fixture("visitor", queryClient)
    const orpc = createORPCVueQuery(
      createORPCClient<{ read: (input: { value: unknown; other?: number }) => Promise<string> }>({
        call: async () => "orpc",
      }),
      { queryClient, prefix: "orpc" },
    )
    try {
      const date = new Date("2026-01-01T00:00:00Z")
      const keys = [
        orpc.read.queryKey({ input: { value: date } }),
        orpc.read.queryKey({ input: { value: date.toISOString() } }),
        orpc.read.queryKey({ input: { value: 1n, other: 2 } }),
      ]
      keys.forEach((key, i) => queryClient.setQueryData(key, String(i)))
      expect(keys.map(key => queryClient.getQueryData(key))).toEqual(["0", "1", "2"])
      expect(queryClient.getQueryData(orpc.read.queryKey({ input: { other: 2, value: 1n } }))).toBe(
        "2",
      )
      // tRPC follows TanStack JSON hashing, independently of transport transformers.
      const dateKey = [...trpc.pathKey(), ["typed"], { input: { value: date } }]
      const stringKey = [...trpc.pathKey(), ["typed"], { input: { value: date.toISOString() } }]
      queryClient.setQueryData(dateKey, "same JSON value")
      expect(queryClient.getQueryData<string>(stringKey)).toBe("same JSON value")
      expect(() =>
        queryClient.setQueryData([...trpc.pathKey(), ["typed"], { input: 1n }], "unsupported"),
      ).toThrow()
      queryClient.setQueryData([...trpc.pathKey(), ["typed"], { input: { a: 1, b: 2 } }], "ordered")
      expect(
        queryClient.getQueryData<string>([...trpc.pathKey(), ["typed"], { input: { b: 2, a: 1 } }]),
      ).toBe("ordered")
    } finally {
      dispose()
    }
  })
}

for (const [hashing, config] of Object.entries(hashingConfigs)) {
  test(`${hashing} cache hashing supports exact filters on unobserved hydrated namespaces`, async () => {
    const server = fixture("server", new QueryClient(config))
    const cache = new QueryClient(config)
    let browser: ReturnType<typeof fixture> | undefined
    try {
      const keys = [
        server.trpc.blog.get.queryKey({ id: 1 }),
        server.orpc.blog.get.queryKey({ input: { id: 1 } }),
      ]
      for (const key of keys)
        server.queryClient.setQueryData(key, {
          id: 1,
          title: "cached",
          details: { label: "original" },
        })
      hydrate(cache, dehydrate(server.queryClient))
      browser = fixture("browser", cache)
      for (const key of keys) {
        const query = cache.getQueryCache().find({ queryKey: key, exact: true })
        expect(query).toBeDefined()
        expect(query!.getObserversCount()).toBe(0)
        expect(cache.getQueryData(key)).toMatchObject({ title: "cached" })
        await cache.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" })
        expect(cache.getQueryState(key)?.isInvalidated).toBe(true)
        cache.removeQueries({ queryKey: key, exact: true })
        expect(cache.getQueryData(key)).toBeUndefined()
      }
    } finally {
      browser?.dispose()
      cache.clear()
      server.dispose()
    }
  })
}

for (const adapter of ["oRPC", "tRPC"]) {
  for (const prefix of [undefined, ""]) {
    test(`unprefixed ${adapter} preserves hashing for existing application queries (${JSON.stringify(prefix)})`, () => {
      const cache = new QueryClient(applicationConfig)
      const f = fixture("visitor", cache)
      try {
        const key = [["application"], { input: { id: 1 } }]
        cache.setQueryData(key, "cached")
        const before = cache.defaultQueryOptions({ queryKey: key }).queryHash
        expect(before).toBe(applicationHash(key))
        if (adapter === "tRPC") createTRPCVueQuery(f.trpcClient, { queryClient: cache, prefix })
        else createORPCVueQuery(f.orpcClient, { queryClient: cache, prefix })
        expect(cache.defaultQueryOptions({ queryKey: key }).queryHash).toBe(before)
        expect(cache.getQueryData<string>(key)).toBe("cached")
      } finally {
        f.dispose()
      }
    })
  }
}
