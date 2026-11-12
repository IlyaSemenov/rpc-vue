# Direct Calls and Utilities

Use `.call()` when you just need a procedure's response, without query state or caching:

```ts
const post = await orpc.blog.posts.get.call({ id: 1 })
```

To handle the errors that a procedure declares, see [Errors](./errors).

## oRPC utilities

The client also exposes oRPC's TanStack Query utilities:

- `.key()` builds a cache key prefix for a procedure or router branch.
- `.queryKey()` builds a query key for a specific input.
- `.queryOptions()` builds options for Vue Query's `useQuery`.
- `.mutationOptions()` builds options for Vue Query's `useMutation`.
- `.infiniteOptions()` builds options for Vue Query's `useInfiniteQuery` for pagination.

Subscription composables are not available yet.
Procedures that return streams keep the oRPC utilities but do not get this package's `useQuery` or `useMutation` methods.
The module does not automatically transfer streamed query results from server to browser.
