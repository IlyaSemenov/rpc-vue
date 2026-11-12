# Queries

Call `useQuery` in `<script setup>` or a Vue component's `setup()` function.
Use your router's procedure paths; the examples below use posts from a blog router.

```ts
const orpc = useOrpc()
const query = await orpc.blog.posts.get.useQuery({ id: 1 })
```

`query` exposes reactive state and methods, including:

- `query.data.value` contains the query result, or `undefined` before data is available.
- `query.isPending.value` is `true` before the first success or error, even when disabled.
- `query.error.value` contains the query error, or `null` when there is no error.
- `query.refetch()` fetches the current query again.
- `query.invalidate()` marks its cached result as stale and refetches it if it is active.

Pass a `default` factory when the component needs a value before query data is available:

```ts
const { data: posts } = await orpc.blog.posts.list.useQuery(undefined, {
  default: () => [],
})

// posts.value is always an array.
```

The default appears while the query has no cached data, including while it is pending, disabled, skipped, or in an error state.
The factory runs once for each `useQuery()` call.
The returned value is never written to the cache and does not affect fetching.
Unlike TanStack Query's `placeholderData`, it leaves the query status pending or error and does not set `isPlaceholderData`.
With `select`, the default has the selected result's shape.
With `clone: true`, the default is copied into mutable local data.

## Reactive input and options

Pass a ref, reactive object, or getter when the input can change.
The query follows the current input and uses its cached result when available.

The second argument accepts both TanStack Vue Query options (such as `select`, `enabled`, and `staleTime`) and orpc-vue options (such as `clone` and `server`).

```ts
const route = useRoute()
const panelOpen = ref(true)

const query = orpc.blog.posts.get.useQuery(() => ({ id: Number(route.params.id) }), {
  enabled: panelOpen,
  staleTime: 30_000,
})
```

Here, changing the route ID switches to that post's query, and closing the panel disables automatic fetching.

Vue Query options such as `enabled` and `staleTime` can be reactive too.
You can also pass the entire options object as a ref or getter.

## Waiting for input

Use TanStack Query's `skipToken` when you don't have valid input yet.
This query starts once a post is selected:

```ts
import { skipToken } from "@tanstack/vue-query"

const selectedId = ref<number>()
const query = orpc.blog.posts.get.useQuery(() =>
  selectedId.value === undefined ? skipToken : { id: selectedId.value },
)
```

## Awaiting queries and server rendering

You can use `useQuery` with or without `await`.
Without it, you get the query refs immediately and can show a loading state.
With it, you wait for the initial fetch and reject if that fetch fails.
During SSR, the page waits for active queries either way.

Set `server: false` in the query options to fetch only after the component mounts in the browser.
The query refs are still available during SSR.

`await` returns the current state immediately when no fetch is running.
This includes disabled queries, `skipToken`, queries waiting for the component to mount, and requests paused because the browser is offline.
It does not wait for these queries to become enabled or resume fetching.

During SSR, an awaited initial error reaches Nuxt's error page.
During client-side navigation, Nuxt does not automatically show its error page for an ordinary RPC error; use [`onUnexpectedError`](./errors#unexpected-browser-errors) to notify the user about undeclared errors.
Set `rejectOnError: false` to resolve the await and inspect the error through `query.error.value` instead.
Queries used without `await` also expose failures through `query.error.value`.
Errors from later refetches update that ref without changing the already settled initial await.
TanStack's `throwOnError` option is not supported; use `rejectOnError`.
