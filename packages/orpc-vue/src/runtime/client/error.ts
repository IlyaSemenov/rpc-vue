import {
  type AnyNestedClient,
  type AnyORPCError,
  type ClientContext,
  type FriendlyClientOptions,
  type InferClientContext,
  type InferClientError,
  isDefinedError,
  type ORPCClientInterceptor,
  type ORPCError,
} from "@orpc/client"

type ErrorOf<TPromise extends Promise<unknown>> = TPromise extends {
  __error?: { type: infer Error }
}
  ? Error
  : never

type DefinedError<TError> = Extract<TError, AnyORPCError>
/** Error codes declared by a procedure whose client error union is `TError`. */
export type DefinedErrorCode<TError> = DefinedError<TError>["code"] & string

type ErrorResultValue =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | readonly unknown[]
  | { readonly [key: string]: unknown }

/** Handlers or result values keyed by the codes declared in the client error union `TError`. */
export type DefinedErrorHandlers<TError> = Partial<{
  [Code in DefinedErrorCode<TError>]:
    | ((error: Extract<DefinedError<TError>, { code: Code }>) => unknown)
    | ErrorResultValue
}>

/** Handlers for query `catching`; TanStack rejects `undefined` query data. */
export type QueryDefinedErrorHandlers<TError> = Partial<{
  [Code in DefinedErrorCode<TError>]:
    | ((error: Extract<DefinedError<TError>, { code: Code }>) => unknown)
    | Exclude<ErrorResultValue, undefined>
}>

type UndeclaredCodes<TError, Handlers> = Record<
  Exclude<keyof Handlers, DefinedErrorCode<TError>>,
  never
>

/** Reject handler keys that are not declared by the procedure. */
export type StrictDefinedErrorHandlers<
  TError,
  Handlers extends DefinedErrorHandlers<TError>,
> = DefinedErrorHandlers<TError> & Handlers & UndeclaredCodes<TError, Handlers>

/** Reject undeclared codes and query handlers that can resolve to undefined. */
export type StrictQueryDefinedErrorHandlers<
  TError,
  Handlers extends QueryDefinedErrorHandlers<TError>,
> = QueryDefinedErrorHandlers<TError> &
  Handlers &
  UndeclaredCodes<TError, Handlers> & {
    [Code in keyof Handlers]: Handlers[Code] extends (...args: never[]) => infer Result
      ? undefined extends Awaited<Result>
        ? never
        : Handlers[Code]
      : Exclude<Handlers[Code], undefined>
  }

/** The awaited result of any handler or value in `Handlers`. */
export type HandledResult<Handlers> = {
  [Code in keyof Handlers]: Handlers[Code] extends (...args: never[]) => infer Result
    ? Awaited<Result>
    : Awaited<Handlers[Code]>
}[keyof Handlers]

/** Check whether a runtime rejection is an error declared by its oRPC procedure. */
export function isDefinedORPCError(error: unknown): error is AnyORPCError {
  // The upstream generic predicate narrows unknown to never, so provide the runtime union it checks.
  return isDefinedError(error as AnyORPCError | Error)
}

/** The `callCatching()` method of a finite procedure in a decorated client. */
export interface CallCatching<TClientContext extends ClientContext, TInput, TOutput, TError> {
  /**
   * Call the procedure and handle selected declared errors like `catchORPCError()`.
   * Pass `undefined` as input for procedures without input.
   */
  callCatching<Handlers extends DefinedErrorHandlers<TError>>(
    input: TInput,
    handlers: StrictDefinedErrorHandlers<TError, Handlers>,
    ...rest: object extends TClientContext
      ? [options?: FriendlyClientOptions<TClientContext>]
      : [options: FriendlyClientOptions<TClientContext>]
  ): Promise<TOutput | HandledResult<Handlers>>
}

/**
 * Handle selected errors declared by an oRPC procedure and rethrow every other rejection.
 * The promise must come directly from a typed client call so its declared error union is preserved.
 * Each handler receives the declared error branch narrowed to its own code.
 * A non-function value is returned directly when its error code matches.
 * Synchronous and asynchronous handler results are included in the returned promise type.
 *
 * @param promise - The `PromiseWithError` returned by an oRPC client procedure.
 * @param handlers - Handlers keyed by declared error code.
 * @returns The procedure output or the result of the matching handler.
 */
export function catchORPCError<
  TPromise extends Promise<unknown>,
  Handlers extends DefinedErrorHandlers<ErrorOf<NoInfer<TPromise>>>,
>(
  promise: TPromise,
  handlers: "__error" extends keyof TPromise
    ? StrictDefinedErrorHandlers<ErrorOf<NoInfer<TPromise>>, Handlers>
    : never,
): Promise<Awaited<TPromise> | HandledResult<Handlers>>

export function catchORPCError(
  promise: Promise<unknown>,
  handlers: Record<string, unknown>,
): Promise<unknown> {
  return catchDefinedErrors(promise, handlers)
}

/**
 * Untyped runtime of `catchORPCError()` for callers that enforce handler types themselves.
 *
 * @param promise - A procedure call result.
 * @param handlers - Handlers or result values keyed by declared error code.
 * @returns The procedure output or the result of the matching handler.
 */
export function catchDefinedErrors(
  promise: Promise<unknown>,
  handlers: Record<string, unknown>,
): Promise<unknown> {
  return promise.catch((error: unknown) => {
    if (!isDefinedORPCError(error)) throw error

    if (!Object.hasOwn(handlers, error.code)) throw error

    const handler = handlers[error.code]
    return typeof handler === "function" ? handler(error) : handler
  })
}

// Distribute over the union so each extra code gets its own error branch for handler narrowing.
type ExtraDefinedError<TCode extends string> = TCode extends string
  ? ORPCError<TCode, unknown>
  : never

/**
 * Listeners keyed by the codes declared in the client error union `TError`.
 * Without codes, every key is rejected: an empty mapped type would accept any object.
 */
type DefinedErrorListeners<TError> = [DefinedErrorCode<TError>] extends [never]
  ? Record<string, never>
  : Partial<{
      [Code in DefinedErrorCode<TError>]: (
        error: Extract<DefinedError<TError>, { code: Code }>,
      ) => unknown
    }>

/**
 * Create a client interceptor that calls the matching handler when a procedure rejects with a declared error.
 * Use it for an application-wide policy, such as redirecting to the login page after a session expires.
 *
 * The call still rejects with the original error after the awaited handler completes, so `.callCatching()` and `catching` handlers at the call site run afterwards.
 * The interceptor runs for each call attempt, including query retries.
 * A failing handler is logged with `console.error` and does not replace the call's error.
 *
 * @typeParam TClient - The oRPC client type whose declared error codes the handler keys may use.
 * Required: without it, every handler key is rejected.
 * @typeParam TExtraCode - Codes to handle even while no procedure of `TClient` declares them.
 * @param handlers - Handlers keyed by declared error code.
 * @returns An interceptor for the `interceptors` option of an oRPC client.
 */
export function onDefinedError<
  TClient extends AnyNestedClient = never,
  TExtraCode extends string = never,
>(
  handlers: DefinedErrorListeners<InferClientError<TClient> | ExtraDefinedError<TExtraCode>>,
): ORPCClientInterceptor<InferClientContext<TClient>, unknown, unknown, InferClientError<TClient>>

export function onDefinedError(
  handlers: Record<string, ((error: AnyORPCError) => unknown) | undefined>,
): (options: { next: () => Promise<unknown> }) => Promise<unknown> {
  return async ({ next }) => {
    try {
      return await next()
    } catch (error) {
      if (isDefinedORPCError(error) && Object.hasOwn(handlers, error.code)) {
        try {
          await handlers[error.code]?.(error)
        } catch (handlerError) {
          console.error("orpc-vue: onDefinedError handler failed", handlerError)
        }
      }
      throw error
    }
  }
}
