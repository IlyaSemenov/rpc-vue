import { useReactiveMutation } from "@rpc-vue/core/vue-query/mutation"
import { useReactiveQuery } from "@rpc-vue/core/vue-query/query"
import { captureQueryClient } from "@rpc-vue/core/vue-query/query-client"
import { hashKey } from "@tanstack/vue-query"
import { getUntypedClient, type TRPCClient } from "@trpc/client"
import type { AnyTRPCRouter } from "@trpc/server"

import type { TRPCVueQueryClient, TRPCVueQueryOptions } from "../types"
import { decorateClient } from "./decorate"
import { createProcedureUtils } from "./utils"

/**
 * Add reactive query and mutation composables and TanStack Query utilities to a tRPC client.
 * The native client methods keep their behavior, and the server router is never loaded at runtime.
 * Creating the wrapper does not start requests or require a Vue effect scope;
 * calling its composables does require an active scope.
 *
 * @param client - The application-owned tRPC client whose router types are preserved.
 * @param options - Cache key prefix and an optional QueryClient for standalone usage.
 */
export function createTRPCVueQuery<TRouter extends AnyTRPCRouter>(
  client: TRPCClient<TRouter>,
  options: TRPCVueQueryOptions = {},
): TRPCVueQueryClient<TRouter> {
  const raw = getUntypedClient(client)
  // tRPC omits an empty prefix from keys; unprefixed keys keep the cache's global hashing.
  const getQueryClient = captureQueryClient(
    options.queryClient,
    options.prefix ? [[options.prefix]] : undefined,
    hashKey,
  )

  /** Bind protocol utilities and Vue composables without invoking hooks during traversal. */
  function createMethods(path: string[]) {
    const name = path.join(".")
    const utils = createProcedureUtils(raw, path, options.prefix)
    return {
      ...utils,
      useQuery: (input: unknown, settings: unknown) =>
        useReactiveQuery(input, settings, {
          buildOptions: utils.queryOptions,
          queryClient: getQueryClient(),
        }),
      useMutation: (settings: unknown) =>
        useReactiveMutation(utils.mutationOptions, settings, getQueryClient()),
      invalidate: () => getQueryClient().invalidateQueries({ queryKey: utils.pathKey() }),
      query: raw.query.bind(raw, name),
      mutate: raw.mutation.bind(raw, name),
      subscribe: raw.subscription.bind(raw, name),
    }
  }

  return decorateClient(client, createMethods) as TRPCVueQueryClient<TRouter>
}
