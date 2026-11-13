import { describe, expect, test } from "bun:test"

import { type Client, createORPCClient, onError, ORPCError, RPCJsonSerializer } from "@orpc/client"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { effectScope } from "vue"

import { catchORPCError } from "./client/error"
import { createTestORPCClient } from "./testing"

interface Post {
  id: number
  title: string
}

type AppClient = {
  blog: {
    posts: {
      list: Client<Record<never, never>, undefined, Post[], unknown>
      update: Client<
        Record<never, never>,
        { id: number; title: string },
        Post,
        ORPCError<"CONFLICT", { field: string }> | Error
      >
      fail: Client<Record<never, never>, undefined, never, unknown>
    }
  }
}

function setup() {
  return createTestORPCClient<AppClient>()
}

describe("createTestORPCClient()", () => {
  test("dispatches typed handlers and exposes decorated client methods", async () => {
    const { client, procedures } = setup()
    const list = procedures.blog.posts.list.handle(() => [{ id: 1, title: "First post" }])

    expect(await client.blog.posts.list.call()).toEqual([{ id: 1, title: "First post" }])
    expect(list.mock.calls).toEqual([[undefined]])
    expect(typeof client.blog.posts.list.useQuery).toBe("function")
    expect(typeof client.blog.posts.update.useMutation).toBe("function")
    expect(typeof client.blog.posts.invalidate).toBe("function")
  })

  test("reports the full path of an unregistered procedure", async () => {
    const { client } = setup()

    await expect(client.blog.posts.update.call({ id: 1, title: "Updated" })).rejects.toThrow(
      'No test handler is registered for oRPC procedure "blog.posts.update"',
    )
  })

  test("preserves an ORPCError thrown by a handler", async () => {
    const { client, procedures } = setup()
    const error = new ORPCError("NOT_FOUND", { message: "Missing post" })
    procedures.blog.posts.fail.handle(() => {
      throw error
    })

    await expect(client.blog.posts.fail.call()).rejects.toBe(error)
  })

  test("creates a declared error handled by the client helper", async () => {
    const { client, procedures } = setup()
    const update = procedures.blog.posts.update.handle((input, { errors }) => {
      if (input.title === "Duplicate") {
        throw errors.CONFLICT({ message: "Already exists", data: { field: "title" } })
      }
      return { id: input.id, title: input.title }
    })

    await expect(
      catchORPCError(client.blog.posts.update.call({ id: 1, title: "Duplicate" }), {
        CONFLICT: error => error.data.field,
      }),
    ).resolves.toBe("title")
    expect(update.mock.calls).toEqual([[{ id: 1, title: "Duplicate" }]])
  })

  test("runs client interceptors before declared error handlers", async () => {
    const errors: unknown[] = []
    const { client, procedures } = createTestORPCClient<AppClient>({
      interceptors: [
        onError(error => {
          errors.push(error)
        }),
      ],
    })
    procedures.blog.posts.update.handle((_input, { errors }) => {
      throw errors.CONFLICT({ data: { field: "title" } })
    })

    await expect(
      client.blog.posts.update.callCatching(
        { id: 1, title: "Duplicate" },
        { CONFLICT: () => "handled" },
      ),
    ).resolves.toBe("handled")
    expect(errors).toEqual([expect.objectContaining({ code: "CONFLICT" })])
  })

  test("applies client interceptors to calls, queries and mutations", async () => {
    const paths: string[] = []
    const { client, procedures } = createTestORPCClient<AppClient>({
      interceptors: [
        async ({ next, path }) => {
          paths.push(path.join("."))
          return await next()
        },
      ],
    })
    procedures.blog.posts.list.handle(() => [])
    procedures.blog.posts.update.handle(input => ({ ...input }))
    const scope = effectScope()

    try {
      await client.blog.posts.list.call()
      const query = scope.run(() => client.blog.posts.list.useQuery(undefined, { enabled: false }))!
      await query.refetch()
      const mutation = scope.run(() => client.blog.posts.update.useMutation())!
      await mutation.mutateAsync({ id: 1, title: "Updated" })
    } finally {
      scope.stop()
    }

    expect(paths).toEqual(["blog.posts.list", "blog.posts.list", "blog.posts.update"])
  })

  test("builds keys with the serializer while handlers receive unserialized input", async () => {
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
          deserialize: serialized => new Money(String(serialized)),
          isTerminal: true,
        },
      },
    })
    type PriceClient = {
      read: Client<Record<never, never>, { price: Money | string }, number, unknown>
    }
    const { client, procedures, queryClient } = createTestORPCClient<PriceClient>({ serializer })
    const read = procedures.read.handle(input => (input.price instanceof Money ? 1 : 2))
    const production = createTanstackQueryUtils(
      createORPCClient<PriceClient>({ call: async () => 0 }),
      { serializer },
    )
    const price = new Money("1.5")
    const scope = effectScope()

    try {
      await scope.run(() => client.read.useQuery({ price }))!
      await scope.run(() => client.read.useQuery({ price: "1.5" }))!
    } finally {
      scope.stop()
    }

    expect(read.mock.calls[0]?.[0].price).toBeInstanceOf(Money)
    expect(queryClient.getQueryData(production.read.queryKey({ input: { price } }))).toBe(1)
    expect(queryClient.getQueryData(production.read.queryKey({ input: { price: "1.5" } }))).toBe(2)
  })
})
