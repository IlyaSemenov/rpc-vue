# Queries

Call `useQuery` in `<script setup>` or a Vue component's `setup()` function.
Use your router's query procedure paths; the examples below use posts from a blog router.

```vue
<script setup lang="ts">
const trpc = useTrpc()
const { data: post, error } = trpc.blog.posts.get.useQuery({ id: 1 })
</script>

<template>
  <p v-if="error">Failed to load the post.</p>
  <h1 v-else-if="post">{{ post.title }}</h1>
  <p v-else>Loading…</p>
</template>
```

The query exposes reactive state and methods, including:

- `data` contains the query result, or `undefined` before data is available.
- `isPending` is `true` before the first success or error, even when disabled.
- `error` contains the query error, or `null` when there is no error.
- `refetch()` fetches the current query again.
- `invalidate()` marks its cached result as stale and refetches it if it is active.

## Reactive input and options

Pass a ref, reactive object, or getter when the input can change.
The query follows the current input and uses its cached result when available.

The second argument accepts both TanStack Vue Query options (such as `select`, `enabled`, and `staleTime`) and trpc-vue options (such as `clone`, `server`, and `trpc` request options).

```ts
const route = useRoute()
const panelOpen = ref(true)

const query = trpc.blog.posts.get.useQuery(() => ({ id: Number(route.params.id) }), {
  enabled: panelOpen,
  staleTime: 30_000,
})
```

Here, changing the route ID switches to that post's query, and closing the panel disables automatic fetching.

Vue Query options such as `enabled` and `staleTime` can be reactive too.
You can also pass the entire options object as a ref or getter.

## Input copies

`useQuery` deep-copies the input each time it reads it, so later changes to your object do not affect queries already created from it.
A copied class instance keeps its prototype and own properties but loses private fields and other state stored outside them.
To pass an object as is, such as a class instance that keeps its state in private fields, wrap it in Vue's `markRaw()`:

```ts
import { markRaw } from "vue"

const query = trpc.blog.posts.list.useQuery(() => ({ author: markRaw(author.value) }))
```

Queries keep that object and pass it to every refetch, so replace it instead of changing it, and keep refs and reactive objects out of it.
The [key and options builders](./calls#trpc-utilities) copy their input the same way; in an infinite query, wrap values inside the input rather than the input itself.
Cache keys compare inputs by their JSON form, so give such a class a `toJSON()` method that tells its values apart.

## Waiting for input

Use TanStack Query's `skipToken` when you don't have valid input yet.
This query starts once a post is selected:

```ts
import { skipToken } from "@tanstack/vue-query"

const selectedId = ref<number>()
const query = trpc.blog.posts.get.useQuery(() =>
  selectedId.value === undefined ? skipToken : { id: selectedId.value },
)
```

## Awaiting queries and server rendering

Await `useQuery` to wait for the initial fetch before the rest of the setup code runs:

```ts
const { data: post } = await trpc.blog.posts.get.useQuery({ id: 1 })
```

The awaited query rejects if that fetch fails.
Without `await`, you get the query refs immediately and can show a loading state.
During SSR, the page waits for active queries either way.

Set `server: false` in the query options to fetch only after the component mounts in the browser.
The query refs are still available during SSR.

`await` returns the current state immediately when no fetch is running.
This includes disabled queries, `skipToken`, queries waiting for the component to mount, and requests paused because the browser is offline.
It does not wait for these queries to become enabled or resume fetching.

During SSR, an awaited initial error reaches Nuxt's error page.
During client-side navigation, it reaches Vue and Nuxt error handling, where an error boundary or hook can choose how to present it.
Set `rejectOnError: false` to resolve the await and inspect the error through `error.value` instead.
Queries used without `await` also expose failures through `error.value`.
Errors from later refetches update that ref without changing the already settled initial await.
TanStack's `throwOnError` option is not supported; use `rejectOnError`.

## Default data

Pass a `default` factory when the component needs a value before query data is available:

```ts
const { data: posts } = trpc.blog.posts.list.useQuery(undefined, {
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
