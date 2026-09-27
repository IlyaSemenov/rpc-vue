import type { AnyNestedClient } from "@orpc/client"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { useReactiveMutation } from "@rpc-vue/core/vue-query/mutation"
import { useReactiveQuery } from "@rpc-vue/core/vue-query/query"
import { captureQueryClient } from "@rpc-vue/core/vue-query/query-client"
import type { QueryKey } from "@tanstack/vue-query"

import type { ORPCUnexpectedErrorContext, ORPCVueQueryClient, ORPCVueQueryOptions } from "../types"
import { decorateClient } from "./decorate"
import { catchDefinedErrors, isDefinedORPCError } from "./error"
import { hashORPCKey } from "./hash"
import { createUnexpectedErrorReporter } from "./unexpected-error"
import { createProcedureOptions } from "./utils"

/**
 * Add reactive query and mutation composables while preserving oRPC's TanStack utilities.
 * Accepts either an HTTP client or a server client bound to the current request context.
 * Creating the wrapper does not start requests or require a Vue effect scope;
 * calling its composables does require an active scope.
 *
 * @param client - The application-owned oRPC client whose router types are preserved.
 * @param options - Cache ownership, key prefix and unexpected browser error reporting.
 */
export function createORPCVueQuery<TClient extends AnyNestedClient>(
  client: TClient,
  options: ORPCVueQueryOptions = {},
): ORPCVueQueryClient<TClient> {
  const utils = createTanstackQueryUtils(client, { prefix: options.prefix })
  const reporter =
    options.onUnexpectedError && createUnexpectedErrorReporter(options.onUnexpectedError)
  // oRPC namespaces keys even for an empty prefix; unprefixed keys keep the cache's global hashing.
  const getQueryClient = captureQueryClient(
    options.queryClient,
    options.prefix === undefined ? undefined : utils.key(),
    hashORPCKey,
  )

  /** Resolve the app cache and install reporting before the first observer starts fetching. */
  function observedQueryClient() {
    const cache = getQueryClient()
    reporter?.observe(cache)
    return cache
  }

  /** Bind composables to one utility node without invoking Vue hooks during traversal. */
  function createMethods(target: object, path: readonly string[]) {
    const procedure = target as {
      call: (input: unknown, options: unknown) => Promise<unknown>
      key: () => QueryKey
    }
    const { queryOptions, mutationOptions } = createProcedureOptions(target)
    async function call(
      input: unknown,
      callOptions: unknown,
      source: Extract<ORPCUnexpectedErrorContext["source"], "call" | "callCatching">,
      handlers?: Record<string, unknown>,
    ) {
      try {
        const promise = procedure.call(input, callOptions)
        return await (handlers === undefined ? promise : catchDefinedErrors(promise, handlers))
      } catch (error) {
        reporter?.report(
          error,
          { source, path, input },
          (callOptions as { signal?: AbortSignal } | undefined)?.signal,
        )
        throw error
      }
    }
    return {
      call: (input: unknown, callOptions: unknown) => call(input, callOptions, "call"),
      useQuery: (input: unknown, settings: unknown) =>
        useReactiveQuery(input, settings, {
          buildOptions: (input, settings) => {
            const built = queryOptions(input, settings)
            reporter?.trackQuery(built, path, input)
            return built
          },
          queryClient: observedQueryClient(),
          shouldRetryError: (error) => !isDefinedORPCError(error),
        }),
      useMutation: (settings: unknown) =>
        useReactiveMutation(
          (settings) => {
            const built = mutationOptions(settings)
            reporter?.trackMutation(built, path)
            return built
          },
          settings,
          observedQueryClient(),
        ),
      callCatching: (input: unknown, handlers: Record<string, unknown>, callOptions: unknown) =>
        call(input, callOptions, "callCatching", handlers),
      invalidate: () => getQueryClient().invalidateQueries({ queryKey: procedure.key() }),
    }
  }

  return decorateClient(utils, createMethods) as ORPCVueQueryClient<TClient>
}
