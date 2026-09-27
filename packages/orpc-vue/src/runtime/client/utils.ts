import type { ClientContext } from "@orpc/client"
import type { ProcedureUtils } from "@orpc/tanstack-query"
import type { MutationObserverOptions, QueryKey, QueryObserverOptions } from "@tanstack/vue-query"
import { toValue } from "vue"

import { catchDefinedErrors } from "./error"

type RuntimeProcedure = ProcedureUtils<ClientContext, unknown, unknown, Error>
type RuntimeQueryOptions = Parameters<RuntimeProcedure["queryOptions"]>[0]
type RuntimeMutationOptions = Parameters<RuntimeProcedure["mutationOptions"]>[0]

/** Add handled error codes to the operation descriptor while retaining its namespace and path. */
function withCatchingCodes(queryKey: QueryKey, handlers: Record<string, unknown>): QueryKey {
  const operation = queryKey.at(-1) as Record<string, unknown>
  return [...queryKey.slice(0, -1), { ...operation, catching: Object.keys(handlers).sort() }]
}

/**
 * Adapt one official oRPC utility node to the core's option builders.
 * The builders resolve reactive client context and keep the official keys and query functions.
 */
export function createProcedureOptions(target: object) {
  const procedure = target as RuntimeProcedure
  return {
    queryOptions(input: unknown, settings: Record<string, unknown>) {
      const { catching, ...querySettings } = settings
      const handlers = catching as Record<string, unknown> | undefined
      const queryKey =
        handlers === undefined
          ? undefined
          : withCatchingCodes(procedure.queryKey({ input }), handlers)
      // Data tags carry compile-time procedure types; the core only handles runtime key values.
      const options = procedure.queryOptions({
        ...querySettings,
        input,
        context: toValue(settings.context),
        ...(queryKey === undefined ? {} : { queryKey }),
      } as RuntimeQueryOptions) as unknown as QueryObserverOptions<unknown, Error>
      if (handlers === undefined || typeof options.queryFn !== "function") return options

      const queryFn = options.queryFn
      return {
        ...options,
        queryFn: (context: Parameters<typeof queryFn>[0]) =>
          catchDefinedErrors(Promise.resolve(queryFn(context)), handlers),
      }
    },
    mutationOptions(settings: Record<string, unknown>) {
      return procedure.mutationOptions({
        ...settings,
        context: toValue(settings.context),
      } as RuntimeMutationOptions) as MutationObserverOptions<unknown, Error, unknown>
    },
  }
}
