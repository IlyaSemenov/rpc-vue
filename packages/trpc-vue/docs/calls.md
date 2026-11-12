# Native Calls and Utilities

Use the native `.query()` and `.mutate()` methods when you just need a procedure's response, without query state or caching:

```ts
const post = await trpc.blog.posts.get.query({ id: 1 })
```

Subscriptions keep the native `.subscribe()` method.
Errors are `TRPCClientError<AppRouter>` instances that carry your `errorFormatter` data.

## tRPC utilities

The client also exposes TanStack Query utilities for query and mutation procedures:

- `.pathKey()` builds a cache key prefix for a procedure or router branch.
- `.queryKey()` builds a query key for a specific input; partial input matches every input that contains it.
- `.queryOptions()` builds options for Vue Query's `useQuery`.
- `.mutationKey()` and `.mutationOptions()` build a key and options for Vue Query's `useMutation`.
- `.infiniteQueryKey()` and `.infiniteQueryOptions()` build a key and options for Vue Query's `useInfiniteQuery`, for procedures whose input has a `cursor`.

These builders take plain values, not refs or getters.
Wrap them in `computed()` to rebuild options when reactive input changes:

```ts
import { useInfiniteQuery, useQuery } from "@tanstack/vue-query"

const query = useQuery(computed(() => trpc.blog.posts.get.queryOptions({ id: selectedId.value })))
const pages = useInfiniteQuery(
  trpc.blog.posts.list.infiniteQueryOptions(
    { category: "news" },
    { initialCursor: 0, getNextPageParam: page => page.nextCursor },
  ),
)
```

Each page request receives TanStack's `pageParam` as `cursor` and its fetch direction as `direction`.
`initialCursor` sets the first page's cursor.
Infinite query keys omit `cursor` and `direction`, and differ from the keys of regular queries with the same input.
Keys carry the procedure's output type, so `getQueryData()` and `setQueryData()` infer it.

Subscription composables are not available yet.
Procedures that return streams keep the native methods but do not get the utilities or this package's `useQuery`.
The module does not automatically transfer streamed query results from server to browser.

## Cancellation

Queries do not abort their requests unless you set `trpc.abortOnUnmount: true`, as in tRPC's React integration:

```ts
trpc.blog.posts.get.useQuery({ id: 1 }, { trpc: { abortOnUnmount: true } })
```

With it, both `queryClient.cancelQueries()` and unmounting the last observer abort the request.
Without it, cancellation discards the result while the request continues.
Mutations do not receive query cancellation signals; native calls accept tRPC's own `signal` option.
