import { describe, expect, test } from "bun:test"

import { createORPCClient, RPCJsonSerializer } from "@orpc/client"
import { dehydrate, hydrate, QueryClient } from "@tanstack/vue-query"
import { effectScope, markRaw } from "vue"

import { createORPCVueQuery } from "./create"

describe("query key hashing", () => {
  test("prefixed queries share an entry for typed inputs that differ only in key order or undefined properties", async () => {
    let calls = 0
    const raw = createORPCClient<{
      read: (input: { date: Date; id: bigint; note?: string }) => Promise<{ count: number }>
    }>({
      async call() {
        return { count: ++calls }
      },
    })
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    const scope = effectScope()
    const orpc = createORPCVueQuery(raw, { queryClient: cache, prefix: "orpc" })
    const date = new Date("2026-01-01T00:00:00Z")
    try {
      const first = await scope.run(() => orpc.read.useQuery({ id: 1n, date, note: undefined }))!
      const reordered = await scope.run(() => orpc.read.useQuery({ date, id: 1n }))!
      expect(first.data.value).toEqual({ count: 1 })
      expect(reordered.data.value).toEqual({ count: 1 })
      expect(calls).toBe(1)
      expect(cache.getQueryCache().getAll()).toHaveLength(1)
    } finally {
      scope.stop()
      cache.clear()
    }
  })

  test("typed input addresses one entry through fetching, writes, invalidation and hydration", async () => {
    let calls = 0
    const raw = createORPCClient<{
      read: (input: { date: Date | string; id: bigint }) => Promise<{ count: number }>
    }>({
      async call() {
        return { count: ++calls }
      },
    })
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    const scope = effectScope()
    const orpc = createORPCVueQuery(raw, { queryClient: cache, prefix: "orpc" })
    const input = { date: new Date("2026-01-01T00:00:00Z"), id: 1n }
    try {
      const query = await scope.run(() => orpc.read.useQuery(input))!
      const key = orpc.read.queryKey({ input })
      const stringKey = orpc.read.queryKey({ input: { ...input, date: input.date.toISOString() } })
      expect(cache.getQueryData(key)).toEqual({ count: 1 })
      expect(cache.getQueryData(stringKey)).toBeUndefined()
      query.data.value = { count: 2 }
      expect(cache.getQueryData(key)).toEqual({ count: 2 })
      cache.setQueryData(key, { count: 3 })
      expect(query.data.value).toEqual({ count: 3 })
      await query.invalidate()
      expect(calls).toBe(2)
      expect(cache.getQueryCache().getAll()).toHaveLength(1)
      const restored = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
      const restoredScope = effectScope()
      try {
        // Nuxt hydrates before RPC plugins register their namespace defaults.
        hydrate(restored, dehydrate(cache))
        const restoredClient = createORPCVueQuery(raw, { queryClient: restored, prefix: "orpc" })
        expect(restored.getQueryCache().find({ queryKey: key, exact: true })).toBeDefined()
        const hydrated = await restoredScope.run(() => restoredClient.read.useQuery(input))!
        expect(hydrated.data.value).toEqual(query.data.value)
        expect(calls).toBe(2)
      } finally {
        restoredScope.stop()
        restored.clear()
      }
    } finally {
      scope.stop()
      cache.clear()
    }
  })
})

describe("custom serializer", () => {
  /** An application type that JSON.stringify turns into the string of its amount. */
  class Money {
    constructor(readonly amount: string) {}
    toJSON() {
      return this.amount
    }
  }

  const serializer = new RPCJsonSerializer({
    handlers: {
      money: {
        condition: value => value instanceof Money,
        serialize: (value: Money) => value.amount,
        deserialize: serialized => {
          if (typeof serialized !== "string") throw new TypeError("Money expects a string")
          return new Money(serialized)
        },
        isTerminal: true,
      },
    },
  })

  type Input = { price: Money | string; id: number }

  /** Create a client whose procedure counts calls and returns the configured result for its input. */
  function setup(result: (input: unknown) => unknown = () => ({})) {
    let calls = 0
    const raw = createORPCClient<{ read: (input: Input) => Promise<unknown> }>({
      async call(_path, input) {
        calls++
        return result(input)
      },
    })
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    const orpc = createORPCVueQuery(raw, { queryClient: cache, prefix: "orpc", serializer })
    return { raw, cache, orpc, calls: () => calls }
  }

  test("keys a custom value apart from its JSON form and ignores input key order", async () => {
    const { cache, calls, orpc } = setup()
    const scope = effectScope()
    try {
      await scope.run(() => orpc.read.useQuery({ price: new Money("1.5"), id: 1 }))!
      await scope.run(() => orpc.read.useQuery({ id: 1, price: new Money("1.5") }))!
      expect(calls()).toBe(1)
      await scope.run(() => orpc.read.useQuery({ price: "1.5", id: 1 }))!
      expect(calls()).toBe(2)
      expect(cache.getQueryCache().getAll()).toHaveLength(2)
    } finally {
      scope.stop()
      cache.clear()
    }
  })

  test("passes a markRaw custom value to the procedure and keys it through the serializer", async () => {
    let received: unknown
    const { cache, calls, orpc } = setup(input => {
      received = (input as Input).price
      return {}
    })
    const scope = effectScope()
    const price = markRaw(new Money("1.5"))
    try {
      await scope.run(() => orpc.read.useQuery({ price, id: 1 }))!
      await scope.run(() => orpc.read.useQuery({ price: new Money("1.5"), id: 1 }))!
      expect(calls()).toBe(1)
      expect(received).toBe(price)
    } finally {
      scope.stop()
      cache.clear()
    }
  })

  test("keeps the reference of an equal custom value in refetched data", async () => {
    let amount = "1.5"
    const { cache, orpc } = setup(() => ({ total: new Money(amount) }))
    const scope = effectScope()
    const key = orpc.read.queryKey({ input: { price: "1", id: 1 } })
    try {
      const query = await scope.run(() => orpc.read.useQuery({ price: "1", id: 1 }))!
      const first = cache.getQueryData<{ total: Money }>(key)
      await query.refetch()
      expect(cache.getQueryData(key)).toBe(first)
      amount = "2"
      await query.refetch()
      expect(cache.getQueryData<{ total: Money }>(key)?.total).toEqual(new Money("2"))
      expect(cache.getQueryData(key)).not.toBe(first)
    } finally {
      scope.stop()
      cache.clear()
    }
  })

  test("custom input addresses one entry through partial invalidation and JSON hydration", async () => {
    const { cache, calls, orpc, raw } = setup(() => ({ count: calls() }))
    const scope = effectScope()
    const price = new Money("1.5")
    try {
      await scope.run(() => orpc.read.useQuery({ price, id: 1 }))!
      await scope.run(() => orpc.read.useQuery({ price: "1.5", id: 1 }))!
      // A partial key matches the custom input but not its JSON form; active entries refetch.
      await cache.invalidateQueries({ queryKey: orpc.read.key({ input: { price } }) })
      expect(calls()).toBe(3)
      const updates = (input: Input) =>
        cache.getQueryState(orpc.read.queryKey({ input }))?.dataUpdateCount
      expect(updates({ price, id: 1 })).toBe(2)
      expect(updates({ price: "1.5", id: 1 })).toBe(1)

      const restored = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
      const restoredScope = effectScope()
      try {
        // A JSON round trip shows that keys need no payload serializer for custom input types.
        hydrate(restored, JSON.parse(JSON.stringify(dehydrate(cache))))
        const restoredClient = createORPCVueQuery(raw, {
          queryClient: restored,
          prefix: "orpc",
          serializer,
        })
        const hydrated = await restoredScope.run(() =>
          restoredClient.read.useQuery({ id: 1, price: new Money("1.5") }),
        )!
        expect(hydrated.data.value).toEqual({ count: 3 })
        expect(calls()).toBe(3)
      } finally {
        restoredScope.stop()
        restored.clear()
      }
    } finally {
      scope.stop()
      cache.clear()
    }
  })
})
