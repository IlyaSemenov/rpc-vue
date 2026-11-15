import type { UnhandledMutationErrorHandler } from "@rpc-vue/core/vue-query/mutation"
import { environmentManager } from "@tanstack/vue-query"

import type { ORPCUnhandledDefinedErrorHandler } from "../types"

import { isDefinedORPCError } from "./error"
import { runErrorHook } from "./error-hook"

/**
 * Create the core's callback for unhandled `mutate()` failures of the procedure at `path`.
 * It passes declared errors to the hook in the browser; `onUnexpectedError` covers the others.
 */
export function createUnhandledDefinedErrorReporter(
  handler: ORPCUnhandledDefinedErrorHandler,
  path: readonly string[],
): UnhandledMutationErrorHandler {
  return (error, input) => {
    if (environmentManager.isServer() || !isDefinedORPCError(error)) return
    runErrorHook("onUnhandledDefinedError", () =>
      handler(error, { source: "mutation", path, input }),
    )
  }
}
