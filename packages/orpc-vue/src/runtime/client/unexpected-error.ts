import {
  environmentManager,
  isCancelledError,
  type MutationObserverOptions,
  type QueryClient,
  type QueryObserverOptions,
} from "@tanstack/vue-query"

import type { ORPCUnexpectedErrorContext, ORPCUnexpectedErrorHandler } from "../types"
import { isDefinedORPCError } from "./error"

/**
 * Report final failures of this decorated client without changing cache callbacks or state.
 * Function ownership stays outside query metadata so dehydration never serializes callbacks.
 * Each cache event has one owning function even when several observers or clients share a cache.
 */
export function createUnexpectedErrorReporter(handler: ORPCUnexpectedErrorHandler) {
  const queries = new WeakMap<object, ORPCUnexpectedErrorContext>()
  const mutations = new WeakMap<object, readonly string[]>()
  const observed = new WeakSet<QueryClient>()

  function report(error: unknown, context: ORPCUnexpectedErrorContext, signal?: AbortSignal) {
    if (
      environmentManager.isServer() ||
      signal?.aborted ||
      isDefinedORPCError(error) ||
      isCancelledError(error) ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError")
    )
      return

    // Neither a synchronous throw nor an async rejection may replace the operation's error.
    try {
      void Promise.resolve(handler(error, context)).catch(reportHookError)
    } catch (hookError) {
      reportHookError(hookError)
    }
  }

  function reportHookError(error: unknown) {
    console.error("orpc-vue: onUnexpectedError failed", error)
  }

  return {
    report,
    /** Subscribe once per client/cache lifetime, not once per component observer. */
    observe(client: QueryClient) {
      if (environmentManager.isServer() || observed.has(client)) return
      observed.add(client)
      client.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "error") return
        const fn = event.query.options.queryFn
        const context = typeof fn === "function" ? queries.get(fn) : undefined
        if (context) report(event.action.error, context)
      })
      client.getMutationCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "error") return
        const fn = event.mutation.options.mutationFn
        const path = fn && mutations.get(fn)
        if (path)
          report(event.action.error, {
            source: "mutation",
            path,
            input: event.mutation.state.variables,
          })
      })
    },
    trackQuery(
      options: QueryObserverOptions<unknown, Error>,
      path: readonly string[],
      input: unknown,
    ) {
      if (typeof options.queryFn === "function") {
        queries.set(options.queryFn, { source: "query", path, input })
      }
    },
    trackMutation(
      options: MutationObserverOptions<unknown, Error, unknown>,
      path: readonly string[],
    ) {
      if (options.mutationFn) mutations.set(options.mutationFn, path)
    },
  }
}
