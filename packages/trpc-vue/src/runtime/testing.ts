import {
  createTestRegistry,
  type TestClient,
  type TestClientOptions,
  type TestHandleOptions,
} from "@rpc-vue/core/testing/registry"
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client"
import type {
  AnyTRPCProcedure,
  AnyTRPCRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  TRPCRouterRecord,
} from "@trpc/server"
import { observable } from "@trpc/server/observable"
import type { Mock } from "vitest"

import { createTRPCVueQuery } from "./client/create"
import type { TRPCVueQueryClient, TRPCVueQueryOptions } from "./types"

/** A procedure implementation registered for a test client; it returns the client-side result. */
export type TestTRPCHandler<TRouter extends AnyTRPCRouter, TProcedure extends AnyTRPCProcedure> = (
  input: inferProcedureInput<TProcedure>,
) =>
  | inferTransformedProcedureOutput<TRouter, TProcedure>
  | Promise<inferTransformedProcedureOutput<TRouter, TProcedure>>

/** A router-shaped tree whose query and mutation leaves register test implementations. */
export type TestTRPCProcedures<
  TRouter extends AnyTRPCRouter,
  Record extends TRPCRouterRecord = TRouter["_def"]["record"],
> = {
  [TKey in keyof Record]: Record[TKey] extends AnyTRPCProcedure
    ? Record[TKey]["_def"]["type"] extends "query" | "mutation"
      ? {
          /** Register the implementation used by subsequent calls and return its Vitest mock. */
          handle(
            handler: TestTRPCHandler<TRouter, Record[TKey]>,
            options?: TestHandleOptions<inferProcedureInput<Record[TKey]>>,
          ): Mock<TestTRPCHandler<TRouter, Record[TKey]>>
        }
      : never
    : Record[TKey] extends TRPCRouterRecord
      ? TestTRPCProcedures<TRouter, Record[TKey]>
      : never
}

/** Configure a test client's cache, namespacing and input copying. */
export interface TestTRPCClientOptions extends TRPCVueQueryOptions, TestClientOptions {}

/** The isolated client, procedure registry and cleanup function created for a test suite. */
export type TestTRPCClient<TRouter extends AnyTRPCRouter> = TestClient<
  TRPCVueQueryClient<TRouter>,
  TestTRPCProcedures<TRouter>
>

/**
 * Create an isolated fake tRPC client for Vue or Nuxt component tests.
 * Handlers replace the server procedures and return client output, so middleware, transformer and
 * error formatter do not run; subscriptions are not mocked.
 * The entrypoint has no Nuxt runtime dependency.
 * A shared setup file can therefore import it when Vitest hoists `mockNuxtImport()`.
 *
 * Without a `queryClient` the client owns one that never retries, so a failing procedure fails
 * the test instead of retrying until it times out.
 *
 * @param options - Cache key prefix, a QueryClient to use instead of the owned one and input copying.
 * @returns A decorated client, its typed registration tree, its cache and a reset function.
 */
export function createTestTRPCClient<TRouter extends AnyTRPCRouter>(
  options: TestTRPCClientOptions = {},
): TestTRPCClient<TRouter> {
  const { copyInput, ...clientOptions } = options
  const registry = createTestRegistry("tRPC", { queryClient: clientOptions.queryClient, copyInput })
  const link: TRPCLink<TRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        Promise.resolve()
          .then(async () => {
            if (op.type === "subscription") {
              throw new Error("trpc-vue/testing does not mock subscriptions.")
            }
            observer.next({ result: { data: await registry.call(op.path, op.input) } })
            observer.complete()
          })
          .catch((error) => observer.error(TRPCClientError.from<TRouter>(error)))
      })
  return {
    client: createTRPCVueQuery(createTRPCClient<TRouter>({ links: [link] }), {
      ...clientOptions,
      queryClient: registry.queryClient,
    }),
    procedures: registry.procedures as TestTRPCProcedures<TRouter>,
    queryClient: registry.queryClient,
    reset: registry.reset,
  }
}
