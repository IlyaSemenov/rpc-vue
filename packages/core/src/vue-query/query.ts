import {
  type QueryClient,
  type QueryObserverOptions,
  type SkipToken,
  skipToken,
  useQuery,
  type UseQueryOptions,
  type UseQueryReturnType,
} from "@tanstack/vue-query"
import { cloneDeep } from "es-toolkit"
import {
  computed,
  type ComputedRef,
  type DeepReadonly,
  getCurrentInstance,
  getCurrentScope,
  type MaybeRefOrGetter,
  onMounted,
  onScopeDispose,
  onServerPrefetch,
  readonly,
  ref,
  toRaw,
  toValue,
  watch,
  type WritableComputedRef,
} from "vue"

import type { ResolveOptions } from "./types"

/**
 * Query state is available synchronously; awaiting it waits for the initial active fetch.
 * Awaiting an inactive query returns its current state without waiting for it to become enabled.
 */
export type AwaitableQuery<TQueryState> = TQueryState & Promise<TQueryState>

type QueryDataValue<TOutput, TDefault, TClone extends boolean> = TClone extends true
  ? TOutput | TDefault
  : DeepReadonly<TOutput | TDefault>

/** Vue Query state with cache-writing data assignment and an optional mutable local clone. */
export type QueryResult<
  TOutput,
  TError,
  TClone extends boolean = false,
  TDefault = undefined,
> = Omit<UseQueryReturnType<TOutput, TError>, "data"> & {
  /**
   * Assign a whole response to update the shared cache for the current input.
   * Nested edits require clone: true and remain local until a whole value is assigned.
   * Successful cache updates replace that local clone and discard its edits.
   */
  data: WritableComputedRef<QueryDataValue<TOutput, TDefault, TClone>, TOutput>
  /** Invalidate this query's current input and refetch active observers. */
  invalidate: () => Promise<void>
}

/** Vue Query state projected through select while the cache retains the original response. */
export type SelectedQueryResult<TSelected, TError, TDefault = undefined> = Omit<
  UseQueryReturnType<TSelected, TError>,
  "data"
> & {
  /** The selected value and its nested properties are readonly. */
  data: ComputedRef<DeepReadonly<TSelected | TDefault>>
  /** Invalidate the underlying query for the current input and refetch active observers. */
  invalidate: () => Promise<void>
}

/**
 * Reactive Vue Query options; the procedure derives keys, query functions and key hashing.
 * The useQuery overloads add default values and mutually exclusive select and clone options.
 */
export type ReactiveQueryOptions<TOutput, TError, TSelected = TOutput> = Omit<
  ResolveOptions<UseQueryOptions<TOutput, TError, TSelected>>,
  // Query-local hashing would split one input between observers and imperative cache access.
  "queryKey" | "queryFn" | "queryKeyHashFn" | "queryHash" | "select" | "shallow" | "enabled"
> & {
  /** Control automatic fetching reactively; disabled queries can still expose cached data. */
  enabled?: MaybeRefOrGetter<boolean | undefined>
  /** Use false to start the query only after the component mounts in the browser. */
  server?: boolean
}

/** A reactive procedure input or a token that disables its query. */
export type QueryInput<TInput> = MaybeRefOrGetter<TInput | SkipToken>

/** The value of the `default` option: a factory or `undefined`. */
export type QueryDefaultFactory = (() => unknown) | undefined

export type QueryDefaultOptions<TDefaultFactory extends QueryDefaultFactory> = {
  /** Provide a local value while the query has no data without writing it to the cache. */
  default?: TDefaultFactory
  // Requiring a definite factory prevents an optional source field from inferring away `undefined`.
} & (undefined extends TDefaultFactory ? object : { default: TDefaultFactory })

/** Resolve the local default factory while preserving an optional factory's undefined branch. */
export type QueryDefaultValue<TDefaultFactory extends QueryDefaultFactory> =
  TDefaultFactory extends () => infer TDefault ? TDefault : undefined

/** Omit input only when its type allows it, and options only when the protocol does not need them. */
type QueryArgs<TInput, TOptions, TOptionsRequired extends boolean> = TOptionsRequired extends true
  ? [input: QueryInput<TInput>, options: TOptions]
  : undefined extends TInput
    ? [input?: QueryInput<TInput>, options?: TOptions]
    : [input: QueryInput<TInput>, options?: TOptions]

/**
 * The useQuery overloads of a finite query procedure.
 *
 * @typeParam TOptions - Protocol options accepted beside the Vue Query options.
 * @typeParam TOptionsRequired - Whether callers must pass options, for example required context.
 */
export interface QueryComposable<
  TInput,
  TOutput,
  TError,
  TOptions extends object = object,
  TOptionsRequired extends boolean = false,
> {
  /** Observe a query with a mutable local clone; whole-value assignments update the shared cache. */
  useQuery<TDefaultFactory extends QueryDefaultFactory = undefined>(
    input: QueryInput<TInput>,
    options: MaybeRefOrGetter<
      ReactiveQueryOptions<TOutput, TError> &
        TOptions &
        QueryDefaultOptions<TDefaultFactory> & { clone: true; select?: never }
    >,
  ): AwaitableQuery<QueryResult<TOutput, TError, true, QueryDefaultValue<TDefaultFactory>>>
  /** Observe a readonly projection of cached data; select cannot be combined with clone: true. */
  useQuery<TSelected, TDefaultFactory extends QueryDefaultFactory = undefined>(
    input: QueryInput<TInput>,
    options: MaybeRefOrGetter<
      ReactiveQueryOptions<TOutput, TError, TSelected> &
        TOptions &
        QueryDefaultOptions<TDefaultFactory> & {
          select: (data: TOutput) => TSelected
          clone?: never
        }
    >,
  ): AwaitableQuery<SelectedQueryResult<TSelected, TError, QueryDefaultValue<TDefaultFactory>>>
  /** Observe a reactive query with readonly nested data and cache-writing whole-value assignment. */
  useQuery<TDefaultFactory extends QueryDefaultFactory = undefined>(
    ...args: QueryArgs<
      TInput,
      MaybeRefOrGetter<
        ReactiveQueryOptions<TOutput, TError> &
          TOptions &
          QueryDefaultOptions<TDefaultFactory> & { clone?: false; select?: never }
      >,
      TOptionsRequired
    >
  ): AwaitableQuery<QueryResult<TOutput, TError, false, QueryDefaultValue<TDefaultFactory>>>
}

type RuntimeOptions = ReactiveQueryOptions<unknown, Error> & {
  clone?: boolean
  default?: () => unknown
  select?: (data: unknown) => unknown
}

/**
 * Observe a procedure with reactive input, SSR prefetching and optional local cloning.
 * Registers lifecycle hooks synchronously and returns query state that can also be awaited.
 * Nested edits affect only the opt-in clone; whole-value assignments write through to the cache.
 * Selected data cannot be assigned back because its shape may differ from the cached response.
 *
 * @param buildOptions - Build protocol-specific options from the input snapshot and resolved settings.
 * @param input - A value, ref or getter; skipToken suppresses automatic fetching.
 * @param options - Query options, optionally wrapped in a ref or getter.
 * @param queryClient - The cache owner resolved by the client factory.
 * @returns Live query refs plus a promise waiting for the initial active fetch.
 */
export function useReactiveQuery(
  buildOptions: (
    input: unknown,
    options: Record<string, unknown>,
  ) => QueryObserverOptions<unknown, Error>,
  input: unknown,
  options: unknown,
  queryClient: QueryClient,
): AwaitableQuery<QueryResult<unknown, Error, true>> {
  if (!getCurrentScope()) {
    throw new Error("useQuery() requires a component setup or an active Vue effect scope.")
  }
  const instance = getCurrentInstance()
  // A standalone browser scope has no mount hook; component queries wait for actual mounting.
  const mounted = ref(typeof window !== "undefined" && !instance)
  if (instance)
    onMounted(() => {
      mounted.value = true
    })

  const settings = computed(
    () => toValue(options as MaybeRefOrGetter<RuntimeOptions | undefined>) ?? {},
  )
  // Create the fallback once per call without adding it to the query cache.
  const defaultValue = settings.value.default?.()
  const readonlyDefault =
    typeof defaultValue === "object" && defaultValue !== null
      ? readonly(defaultValue)
      : defaultValue
  const queryOptions = computed(() => {
    const { clone, default: _default, server, enabled, ...rest } = settings.value
    if (clone && rest.select) {
      throw new TypeError("clone: true cannot be combined with select.")
    }
    // Snapshot reactive input so an existing cache entry never changes its identity in place.
    const snapshot = cloneDeep(toValue(input))
    const isEnabled = toValue(enabled)
    const { enabled: _enabled, ...built } = buildOptions(snapshot, rest)
    return {
      ...built,
      // Omit an unspecified enabled value so QueryClient defaults still apply.
      ...(snapshot === skipToken || (server === false && !mounted.value)
        ? { enabled: false }
        : isEnabled === undefined
          ? {}
          : { enabled: isEnabled }),
      shallow: false,
    }
  })
  const query = useQuery(queryOptions, queryClient)
  const queryHash = computed(() => queryClient.defaultQueryOptions(queryOptions.value).queryHash)
  const localData = ref<unknown>()
  /** Discard local edits and copy the current query's data without retaining its readonly proxy. */
  function resetClone() {
    if (settings.value.clone) {
      const value = query.data.value === undefined ? defaultValue : query.data.value
      localData.value = cloneDeep(toRaw(value))
    }
  }
  watch([query.data, queryHash, () => settings.value.clone], resetClone, {
    immediate: true,
    // A queued reset could overwrite local edits made immediately after a cache assignment.
    flush: "sync",
  })
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // Success is significant even when structural sharing preserves data and timestamps coincide.
    if (
      event.type === "updated" &&
      event.action.type === "success" &&
      event.query.queryHash === queryHash.value
    ) {
      resetClone()
    }
  })
  onScopeDispose(unsubscribe)

  const data = computed({
    get: () => {
      if (settings.value.clone) return localData.value
      const value = query.data.value
      return value !== undefined || query.status.value === "success" ? value : readonlyDefault
    },
    set(value: unknown) {
      if (settings.value.select) throw new TypeError("Query data is readonly when select is used.")
      // Use the current reactive key; callers own any external references to the assigned value.
      queryClient.setQueryData(queryOptions.value.queryKey, value)
      resetClone()
    },
  })
  const result = {
    ...query,
    data,
    invalidate: () =>
      queryClient.invalidateQueries({
        queryKey: queryOptions.value.queryKey,
        exact: true,
      }),
  }

  // Disabled, client-only and offline-paused queries must not block setup or SSR.
  const loaded = query.fetchStatus.value === "fetching" ? query.suspense() : Promise.resolve()
  if (instance) onServerPrefetch(() => loaded)
  // Resolve to plain state rather than the promise itself to avoid thenable resolution cycles.
  const awaitable = Object.assign(
    loaded.then(() => result),
    result,
  )
  // A query also works without await; errors remain observable through its state.
  void awaitable.catch(() => {})
  return awaitable
}
