import { expect, test } from "bun:test"

import { type Client, createORPCClient } from "@orpc/client"
import {
  createTanstackQueryUtils,
  TANSTACK_QUERY_OPERATION_CONTEXT_SYMBOL,
} from "@orpc/tanstack-query"
import { QueryClient, type QueryFunctionContext } from "@tanstack/vue-query"

import { createProcedureOptions } from "./utils"

test("catching codes identify both the observer and oRPC operation", async () => {
  let operationKey: unknown
  const raw = createORPCClient<{
    find: Client<object, { id: number }, string, Error>
  }>({
    async call(_path, _input, options) {
      operationKey = (options.context as Record<symbol, { key?: unknown }>)[
        TANSTACK_QUERY_OPERATION_CONTEXT_SYMBOL
      ]?.key
      return "found"
    },
  })
  const procedure = createTanstackQueryUtils(raw).find
  const { queryOptions } = createProcedureOptions(procedure)
  const options = queryOptions({ id: 1 }, { catching: { NOT_FOUND: null, CONFLICT: "conflict" } })
  const context = {
    client: new QueryClient(),
    meta: undefined,
    queryKey: options.queryKey,
    signal: new AbortController().signal,
  } as QueryFunctionContext

  if (typeof options.queryFn !== "function") throw new Error("Expected a query function.")
  await expect(options.queryFn(context)).resolves.toBe("found")
  expect(options.queryKey.at(-1)).toMatchObject({ catching: ["CONFLICT", "NOT_FOUND"] })
  expect(operationKey).toEqual(options.queryKey)
})
