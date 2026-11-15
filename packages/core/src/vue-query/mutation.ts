import {
  type Mutation,
  type MutationObserverOptions,
  type QueryClient,
  shouldThrowError,
  useMutation,
  type UseMutationOptions,
  type UseMutationReturnType,
} from "@tanstack/vue-query"
import { computed, getCurrentScope, type MaybeRefOrGetter, nextTick, toValue, unref } from "vue"

import type { ResolveOptions } from "./types"

/** Reactive Vue Query mutation options; the procedure derives keys and mutation functions. */
export type ReactiveMutationOptions<TInput, TOutput, TError, TOnMutateResult = unknown> = Omit<
  ResolveOptions<UseMutationOptions<TOutput, TError, TInput, TOnMutateResult>>,
  "mutationKey" | "mutationFn" | "shallow"
>

/**
 * The useMutation method of a mutation procedure.
 *
 * @typeParam TOptions - Protocol options accepted beside the Vue Query options.
 * @typeParam TOptionsRequired - Whether callers must pass options, for example required context.
 */
export interface MutationComposable<
  TInput,
  TOutput,
  TError,
  TOptions extends object = object,
  TOptionsRequired extends boolean = false,
> {
  /** Create a mutation observer; call mutate or mutateAsync to execute the procedure. */
  useMutation<TOnMutateResult = unknown>(
    ...args: TOptionsRequired extends true
      ? [
          options: MaybeRefOrGetter<
            ReactiveMutationOptions<TInput, TOutput, TError, TOnMutateResult> & TOptions
          >,
        ]
      : [
          options?: MaybeRefOrGetter<
            ReactiveMutationOptions<TInput, TOutput, TError, TOnMutateResult> & TOptions
          >,
        ]
  ): UseMutationReturnType<TOutput, TError, TInput, TOnMutateResult>
}

/** Receive the rejection and variables of a failed `mutate()` call selected for reporting. */
export type UnhandledMutationErrorHandler = (error: unknown, variables: unknown) => void

type RuntimeMutation = UseMutationReturnType<unknown, Error, unknown, unknown>
type RuntimeMutateOptions = Parameters<RuntimeMutation["mutate"]>[1]
type AnyMutation = Mutation<unknown, Error, unknown, unknown>

/**
 * Resolve reactive options within the observer's scope; Vue Query owns execution and disposal.
 *
 * @param onUnhandledError - Called after a `mutate()` call rejects when the mutation's options at
 *   failure have no `onError`, the call's own `onError` did not run, and Vue Query did not throw the
 *   error into Vue; `mutateAsync()` rejections reach their caller instead.
 */
export function useReactiveMutation(
  buildOptions: (
    settings: Record<string, unknown>,
  ) => MutationObserverOptions<unknown, Error, unknown>,
  options: unknown,
  queryClient: QueryClient,
  onUnhandledError?: UnhandledMutationErrorHandler,
) {
  if (!getCurrentScope())
    throw new Error("useMutation() requires a component setup or an active Vue effect scope.")
  const resolveOptions = () =>
    buildOptions(toValue(options as MaybeRefOrGetter<Record<string, unknown>>) ?? {})
  if (!onUnhandledError) return useMutation(computed(resolveOptions), queryClient)

  const thrown = new WeakSet<AnyMutation>()
  // The observer's current mutation: Vue Query's throwOnError watcher only sees its error.
  let current: AnyMutation | undefined
  const mutation: RuntimeMutation = useMutation(
    computed(() => {
      const built = resolveOptions()
      // Include QueryClient mutation defaults, which these explicit options would otherwise replace.
      // The wrapper hides a ref from Vue Query's unwrapping, so unwrap it here and track it.
      const throwOnError = unref(queryClient.defaultMutationOptions(built).throwOnError)
      return {
        ...built,
        // Vue Query evaluates this once per error change of the current mutation, while its scope
        // is alive, and throws the error into Vue when it returns true.
        throwOnError: (error: Error) => {
          const result = shouldThrowError(throwOnError, [error])
          if (result && current?.state.error === error) thrown.add(current)
          return result
        },
      }
    }),
    queryClient,
  )
  const mutateAsync = mutation.mutateAsync

  /** Start a mutation and return its promise and captured execution. */
  function start(variables: unknown, mutateOptions: RuntimeMutateOptions) {
    let execution: AnyMutation | undefined
    // The observer attaches itself to the new mutation synchronously, before it executes.
    // Matching the observer ignores mutations that other cache listeners start meanwhile;
    // Vue Query's mutateAsync is the observer's bound mutate method.
    const unsubscribe = queryClient.getMutationCache().subscribe(event => {
      if (!execution && event.type === "observerAdded" && event.observer.mutate === mutateAsync) {
        execution = event.mutation as AnyMutation
        // Set before execution: a synchronous onMutate may start a newer mutation of this observer.
        current = execution
      }
    })
    let promise: Promise<unknown>
    try {
      promise = mutateAsync(variables, mutateOptions)
    } finally {
      unsubscribe()
    }
    return { promise, execution }
  }

  return {
    ...mutation,
    mutate: (variables: unknown, mutateOptions?: RuntimeMutateOptions) => {
      // Per-call callbacks run only while the observer still follows this mutation, so record
      // that this call's onError actually ran instead of trusting that it was passed.
      let handledByCall = false
      const onError = mutateOptions?.onError
      const { promise, execution } = start(
        variables,
        onError
          ? {
              ...mutateOptions,
              onError: (...args: Parameters<typeof onError>) => {
                handledByCall = true
                return onError(...args)
              },
            }
          : mutateOptions,
      )
      void promise.catch(async (error: unknown) => {
        // Let the throwOnError watcher run first; a rethrow from it rejects the flush promise.
        await nextTick().catch(() => {})
        // query-core does not tell which execution an options-level onError ran for.
        // The mutation's options stop changing when it leaves the pending state right after its
        // callbacks, so they decide, even if reactive options changed onError during the callbacks.
        if (
          handledByCall ||
          execution?.options.onError ||
          (execution !== undefined && thrown.has(execution))
        )
          return
        onUnhandledError(error, variables)
      })
    },
    mutateAsync: (variables: unknown, mutateOptions?: RuntimeMutateOptions) =>
      start(variables, mutateOptions).promise,
  }
}
