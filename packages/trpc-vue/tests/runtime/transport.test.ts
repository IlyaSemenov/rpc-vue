import { expect, test } from "bun:test"

import { QueryClient } from "@tanstack/vue-query"
import { createTRPCClient, httpBatchLink, TRPCClientError, type TRPCLink } from "@trpc/client"
import { initTRPC, TRPCError } from "@trpc/server"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import superjson from "superjson"
import { createTRPCVueQuery } from "trpc-vue"
import { effectScope } from "vue"

const t = initTRPC.create({
  transformer: superjson,
  errorFormatter: ({ shape }) => ({ ...shape, data: { ...shape.data, field: "title" } }),
})
const router = t.router({
  read: t.procedure
    .input((input: unknown) => input as { id: number })
    .query(({ input }) => ({ id: input.id, date: new Date("2026-01-01T00:00:00Z") })),
  fail: t.procedure.query(() => {
    throw new TRPCError({ code: "CONFLICT" })
  }),
})

for (const abortOnUnmount of [false, true]) {
  for (const action of ["dispose", "cancel"] as const) {
    test(`HTTP batching preserves a neighbour when ${action}, abortOnUnmount=${abortOnUnmount}`, async () => {
      const received = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const contexts: unknown[] = []
      const signals: (AbortSignal | undefined | null)[] = []
      let batchSignal: AbortSignal | undefined | null
      const tap: TRPCLink<typeof router> =
        () =>
        ({ op, next }) => {
          contexts.push(op.context)
          signals.push(op.signal)
          return next(op)
        }
      const raw = createTRPCClient<typeof router>({
        links: [
          tap,
          httpBatchLink({
            url: "http://rpc.test/trpc",
            transformer: superjson,
            async fetch(url, init) {
              batchSignal = init?.signal
              received.resolve()
              await release.promise
              return fetchRequestHandler({
                req: new Request(url, init),
                endpoint: "/trpc",
                router,
                createContext: async () => ({}),
              })
            },
          }),
        ],
      })
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const trpc = createTRPCVueQuery<typeof router>(raw, { queryClient })
      const cancelled = effectScope()
      const neighbour = effectScope()
      try {
        const query = cancelled.run(() =>
          trpc.read.useQuery(
            { id: 1 },
            { trpc: { abortOnUnmount, context: { request: "cancelled" } } },
          ),
        )!
        const active = neighbour.run(() =>
          trpc.read.useQuery(
            { id: 2 },
            { trpc: { abortOnUnmount: true, context: { request: "active" } } },
          ),
        )!
        await received.promise
        if (action === "dispose") cancelled.stop()
        else
          await queryClient.cancelQueries({ queryKey: trpc.read.queryKey({ id: 1 }), exact: true })
        expect(Boolean(signals[0]?.aborted)).toBe(abortOnUnmount)
        expect(Boolean(batchSignal?.aborted)).toBe(false)
        expect(contexts).toEqual([{ request: "cancelled" }, { request: "active" }])
        release.resolve()
        await active
        expect(active.data.value?.id).toBe(2)
        expect(active.data.value?.date).toBeInstanceOf(Date)
        await query.catch(() => {})
      } finally {
        release.resolve()
        cancelled.stop()
        neighbour.stop()
        queryClient.clear()
      }
    })
  }
}

test("HTTP integration preserves formatted error data and error identity through observers", async () => {
  let seenError: unknown
  const raw = createTRPCClient<typeof router>({
    links: [
      httpBatchLink({
        url: "http://rpc.test/trpc",
        transformer: superjson,
        fetch: (url, init) =>
          fetchRequestHandler({
            req: new Request(url, init),
            endpoint: "/trpc",
            router,
            createContext: async () => ({}),
          }),
      }),
    ],
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const trpc = createTRPCVueQuery<typeof router>(raw, { queryClient })
  const scope = effectScope()
  try {
    queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") seenError = event.action.error
    })
    const query = scope.run(() => trpc.fail.useQuery())!
    await expect(Promise.resolve(query)).rejects.toBeInstanceOf(TRPCClientError)
    expect(query.error.value).toBeInstanceOf(TRPCClientError)
    expect(query.error.value?.data?.field).toBe("title")
    expect(seenError).toBe(query.error.value)
  } finally {
    scope.stop()
    queryClient.clear()
  }
})
