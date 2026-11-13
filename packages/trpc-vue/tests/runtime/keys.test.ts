import { expect, test } from "bun:test"

import { type QueryKey, skipToken } from "@tanstack/vue-query"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { createTRPCVueQuery } from "trpc-vue"
import { markRaw, reactive, ref } from "vue"

import { fixture, router } from "./fixture"

test("key shapes match the pinned upstream reference, including partial and infinite keys", () => {
  const { raw, trpc, queryClient, dispose } = fixture()
  try {
    const reference = createTRPCOptionsProxy<typeof router, { keyPrefix: true }>({
      client: raw,
      queryClient,
      keyPrefix: "trpc",
    })
    expect(trpc.pathKey() as QueryKey).toEqual(reference.pathKey())
    expect(trpc.blog.pathKey() as QueryKey).toEqual(reference.blog.pathKey())
    expect(trpc.blog.get.queryKey() as QueryKey).toEqual(reference.blog.get.queryKey())
    expect(trpc.blog.get.queryKey({ id: 2 }) as QueryKey).toEqual(
      reference.blog.get.queryKey({ id: 2 }),
    )
    expect(trpc.blog.get.queryOptions(skipToken).queryKey as QueryKey).toEqual(
      reference.blog.get.queryOptions(skipToken).queryKey,
    )
    expect(trpc.blog.save.mutationKey() as QueryKey).toEqual(reference.blog.save.mutationKey())
    expect(trpc.blog.pages.infiniteQueryKey({ group: "news" }) as QueryKey).toEqual(
      reference.blog.pages.infiniteQueryKey({ group: "news" }),
    )
    expect(
      trpc.blog.pages.infiniteQueryOptions(
        { group: "news" },
        { initialCursor: 0, getNextPageParam: p => p.next },
      ).initialPageParam,
    ).toBe(
      reference.blog.pages.infiniteQueryOptions(
        { group: "news" },
        { initialCursor: 0, getNextPageParam: p => p.next },
      ).initialPageParam,
    )
    const noPrefix = createTRPCVueQuery<typeof router>(raw)
    expect(noPrefix.pathKey()).toEqual([])
  } finally {
    dispose()
  }
})

test("builders snapshot reactive objects so old cache keys never change in place", () => {
  const { trpc, dispose } = fixture()
  try {
    const input = reactive({ id: 1 })
    const options = trpc.blog.get.queryOptions(input)
    input.id = 2
    expect(options.queryKey).toEqual(trpc.blog.get.queryKey({ id: 1 }))
  } finally {
    dispose()
  }
})

test("builders keep markRaw input in the key by reference", () => {
  const { trpc, dispose } = fixture()
  try {
    const input = markRaw({ id: 1 })
    const operation = trpc.blog.get.queryKey(input).at(-1) as { input: unknown }
    expect(operation.input).toBe(input)
  } finally {
    dispose()
  }
})

test("pure builders reject refs and getters before they can reach transport", () => {
  const { trpc, dispose } = fixture()
  try {
    const build = trpc.blog.get.queryOptions as (input: unknown) => unknown
    expect(() => build(ref({ id: 1 }))).toThrow("resolved input")
    expect(() => build(() => ({ id: 1 }))).toThrow("resolved input")
  } finally {
    dispose()
  }
})
