import type { AnyNestedClient, Client, ClientContext } from "@orpc/client"
import type { RouterUtils } from "@orpc/tanstack-query"
import type { MutationComposable, ReactiveMutationOptions } from "@rpc-vue/core/vue-query/mutation"
import type {
  AwaitableQuery,
  QueryComposable,
  QueryArgs,
  QueryDefaultFactory,
  QueryDefaultOptions,
  QueryDefaultValue,
  QueryInput,
  QueryResult,
  ReactiveQueryOptions,
  SelectedQueryResult,
} from "@rpc-vue/core/vue-query/query"
import type { ClientOptions } from "@rpc-vue/core/vue-query/types"
import type { MaybeRefOrGetter } from "vue"

import type {
  CallCatching,
  DefinedErrorCode,
  HandledResult,
  QueryDefinedErrorHandlers,
  StrictQueryDefinedErrorHandlers,
} from "./client/error"

export type {
  AwaitableQuery,
  QueryResult as ORPCQueryResult,
  SelectedQueryResult as ORPCSelectedQueryResult,
} from "@rpc-vue/core/vue-query/query"

/** The operation whose unexpected browser error is being reported. */
export interface ORPCUnexpectedErrorContext {
  /** The decorated client API that started the operation. */
  readonly source: "call" | "callCatching" | "query" | "mutation"
  /** Procedure path segments, without the cache namespace prefix. */
  readonly path: readonly string[]
  /** Procedure input; it may contain sensitive application data. */
  readonly input: unknown
}

/** Report an unexpected browser error without handling or replacing it. */
export type ORPCUnexpectedErrorHandler = (
  error: unknown,
  context: ORPCUnexpectedErrorContext,
) => void | Promise<void>

/** Configure cache ownership, namespacing and unexpected browser error reporting. */
export interface ORPCVueQueryOptions extends ClientOptions {
  /** Report final failures except declared errors and cancellations; never called during SSR. */
  onUnexpectedError?: ORPCUnexpectedErrorHandler
}

/**
 * An oRPC client decorated with Vue composables and the official TanStack Query utilities.
 * Router branches retain their names; finite procedures gain query and mutation composables.
 * Procedures with declared errors also gain `callCatching()` and typed query error mappings.
 * Procedures whose output includes an async iterable retain only the upstream utilities.
 */
export type ORPCVueQueryClient<TClient extends AnyNestedClient> = RouterUtils<TClient> & {
  /** Invalidate all inputs of this procedure, or every query under this router branch. */
  invalidate: () => Promise<void>
} & (TClient extends Client<infer TClientContext, infer TInput, infer TOutput, infer TError>
    ? Extract<TOutput, AsyncIterable<unknown>> extends never
      ? ProcedureHooks<TClientContext, TInput, TOutput, TError>
      : object
    : {
        [TKey in keyof TClient]: TClient[TKey] extends AnyNestedClient
          ? ORPCVueQueryClient<TClient[TKey]>
          : never
      })

/** Keep context mandatory when the wrapped client requires fields the caller must supply. */
type ContextOptions<TClientContext extends ClientContext> = object extends TClientContext
  ? { context?: MaybeRefOrGetter<TClientContext> }
  : { context: MaybeRefOrGetter<TClientContext> }

/**
 * Reactive Vue Query options with the procedure's oRPC client context.
 * The useQuery overloads add mutually exclusive select and clone options.
 */
export type ORPCQueryOptions<
  TClientContext extends ClientContext,
  TOutput,
  TError,
  TSelected = TOutput,
> = ReactiveQueryOptions<TOutput, TError, TSelected> & ContextOptions<TClientContext>

/** Reactive Vue Query mutation options with the procedure's oRPC client context. */
export type ORPCMutationOptions<
  TClientContext extends ClientContext,
  TInput,
  TOutput,
  TError,
  TOnMutateResult = unknown,
> = ReactiveMutationOptions<TInput, TOutput, TError, TOnMutateResult> &
  ContextOptions<TClientContext>

/** Require options whenever the wrapped client requires context fields. */
type ContextRequired<TClientContext extends ClientContext> = object extends TClientContext
  ? false
  : true

type CatchingOptions<TError, Handlers extends QueryDefinedErrorHandlers<TError>> = {
  /** Convert selected declared errors into successful query data. */
  catching?: StrictQueryDefinedErrorHandlers<TError, Handlers>
}

/** Query overloads whose declared-error handlers extend the cached success type. */
interface CatchingQueryComposable<TClientContext extends ClientContext, TInput, TOutput, TError> {
  /** Observe a query with a mutable local clone; whole-value assignments update the shared cache. */
  useQuery<
    Handlers extends QueryDefinedErrorHandlers<TError> = {},
    TDefaultFactory extends QueryDefaultFactory = undefined,
  >(
    input: QueryInput<TInput>,
    options: MaybeRefOrGetter<
      ORPCQueryOptions<TClientContext, TOutput | HandledResult<Handlers>, TError> &
        QueryDefaultOptions<TDefaultFactory> &
        CatchingOptions<TError, Handlers> & { clone: true; select?: never }
    >,
  ): AwaitableQuery<
    QueryResult<TOutput | HandledResult<Handlers>, TError, true, QueryDefaultValue<TDefaultFactory>>
  >
  /** Observe a readonly projection of cached data; select cannot be combined with clone: true. */
  useQuery<
    TSelected,
    Handlers extends QueryDefinedErrorHandlers<TError> = {},
    TDefaultFactory extends QueryDefaultFactory = undefined,
  >(
    input: QueryInput<TInput>,
    options: MaybeRefOrGetter<
      ORPCQueryOptions<TClientContext, TOutput | HandledResult<Handlers>, TError, TSelected> &
        QueryDefaultOptions<TDefaultFactory> &
        CatchingOptions<TError, Handlers> & {
          select: (data: TOutput | HandledResult<Handlers>) => TSelected
          clone?: never
        }
    >,
  ): AwaitableQuery<SelectedQueryResult<TSelected, TError, QueryDefaultValue<TDefaultFactory>>>
  /** Observe a reactive query with readonly nested data and cache-writing whole-value assignment. */
  useQuery<
    Handlers extends QueryDefinedErrorHandlers<TError> = {},
    TDefaultFactory extends QueryDefaultFactory = undefined,
  >(
    ...args: QueryArgs<
      TInput,
      MaybeRefOrGetter<
        ORPCQueryOptions<TClientContext, TOutput | HandledResult<Handlers>, TError> &
          QueryDefaultOptions<TDefaultFactory> &
          CatchingOptions<TError, Handlers> & { clone?: false; select?: never }
      >,
      ContextRequired<TClientContext>
    >
  ): AwaitableQuery<
    QueryResult<
      TOutput | HandledResult<Handlers>,
      TError,
      false,
      QueryDefaultValue<TDefaultFactory>
    >
  >
}

type QueryHooks<TClientContext extends ClientContext, TInput, TOutput, TError> = [
  DefinedErrorCode<TError>,
] extends [never]
  ? QueryComposable<
      TInput,
      TOutput,
      TError,
      ContextOptions<TClientContext>,
      ContextRequired<TClientContext>
    >
  : CatchingQueryComposable<TClientContext, TInput, TOutput, TError> &
      CallCatching<TClientContext, TInput, TOutput, TError>

/** Carry each procedure's input, output, error and context types through the runtime decorator. */
type ProcedureHooks<TClientContext extends ClientContext, TInput, TOutput, TError> = QueryHooks<
  TClientContext,
  TInput,
  TOutput,
  TError
> &
  MutationComposable<
    TInput,
    TOutput,
    TError,
    ContextOptions<TClientContext>,
    ContextRequired<TClientContext>
  >
