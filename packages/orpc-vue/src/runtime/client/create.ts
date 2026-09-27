import type { AnyNestedClient } from "@orpc/client"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { useReactiveMutation } from "@rpc-vue/core/vue-query/mutation"
import { useReactiveQuery } from "@rpc-vue/core/vue-query/query"
import { captureQueryClient } from "@rpc-vue/core/vue-query/query-client"
import type { QueryKey } from "@tanstack/vue-query"

import type { ORPCVueQueryClient, ORPCVueQueryOptions } from "../types"
import { decorateClient } from "./decorate"
import { catchDefinedErrors, isDefinedORPCError } from "./error"
import { hashORPCKey } from "./hash"
import { createProcedureOptions } from "./utils"

/**
 * Add reactive query and mutation composables while preserving oRPC's TanStack utilities.
 * Accepts either an HTTP client or a server client bound to the current request context.
 * Creating the wrapper does not start requests or require a Vue effect scope;
 * calling its composables does require an active scope.
 *
 * @param client - The application-owned oRPC client whose router types are preserved.
 * @param options - Cache key prefix and an optional QueryClient for standalone usage.
 */
export function createORPCVueQuery<TClient extends AnyNestedClient>(
  client: TClient,
  options: ORPCVueQueryOptions = {},
): ORPCVueQueryClient<TClient> {
  const utils = createTanstackQueryUtils(client, { prefix: options.prefix })
  // oRPC namespaces keys even for an empty prefix; unprefixed keys keep the cache's global hashing.
  const getQueryClient = captureQueryClient(
    options.queryClient,
    options.prefix === undefined ? undefined : utils.key(),
    hashORPCKey,
  )

  /** Bind composables to one utility node without invoking Vue hooks during traversal. */
  function createMethods(target: object) {
    const procedure = target as {
      call: (input: unknown, options: unknown) => Promise<unknown>
      key: () => QueryKey
    }
    const { queryOptions, mutationOptions } = createProcedureOptions(target)
    return {
      useQuery: (input: unknown, settings: unknown) =>
        useReactiveQuery(input, settings, {
          buildOptions: queryOptions,
          queryClient: getQueryClient(),
          shouldRetryError: (error) => !isDefinedORPCError(error),
        }),
      useMutation: (settings: unknown) =>
        useReactiveMutation(mutationOptions, settings, getQueryClient()),
      callCatching: (input: unknown, handlers: Record<string, unknown>, callOptions: unknown) =>
        catchDefinedErrors(procedure.call(input, callOptions), handlers),
      invalidate: () => getQueryClient().invalidateQueries({ queryKey: procedure.key() }),
    }
  }

  return decorateClient(utils, createMethods) as ORPCVueQueryClient<TClient>
}
