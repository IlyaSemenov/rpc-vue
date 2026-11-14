# Editing Query Data

## Updating cached data

Assigning a new response to `data.value` updates the shared cache for the query's current input.
Other components reading the same query see the update too.
Nested properties are readonly unless you enable `clone: true`.

```ts
const { data } = await trpc.blog.posts.get.useQuery({ id: 1 })

const response = await trpc.blog.posts.update.mutate({
  id: 1,
  title: "Updated title",
})

data.value = response
```

Treat the original `response` as readonly after assigning it to `data.value`.
The assignment passes it to the cache without a defensive copy, so changing `response.title` could modify cached data directly.

## Mutable data

With `clone: true`, `data.value` contains a reactive local copy that you can edit, for example in a form.
There are two ways to change it:

- Edit a nested property to change only your local copy.
- Assign a whole response to `data.value` to update the shared cache and reset the local copy.

```ts
const id = 1
const { data } = await trpc.blog.posts.get.useQuery({ id }, { clone: true })

if (data.value) {
  // Only this query's local copy changes.
  data.value.title = "Local draft"

  // Save the draft, then share the server's response with other components.
  data.value = await trpc.blog.posts.update.mutate({
    id,
    title: data.value.title,
  })
}
```

After assigning a response, you can keep editing `data.value.title`; those edits still affect only the new local copy.

A successful refetch or cache update replaces the local copy and discards its edits, even if the returned data has not changed.
Changing the query input also switches the copy to that input's data.
Keep a separate form draft if it must survive these updates.

You cannot combine `clone: true` with `select`; selected results are readonly.

## Readonly data in component props

Query data is typed as deeply readonly because other components share it.
Some UI components declare an array prop as mutable, such as `Post[]`, even though they only read it, so TypeScript rejects query data passed to them.

If the component does not modify the array, pass it a shallow copy:

```vue
<script setup lang="ts">
const trpc = useTrpc()
const { data: posts } = trpc.blog.posts.list.useQuery(undefined)

// PostTable declares `posts: Post[]` but only reads it.
const rows = computed(() => [...(posts.value ?? [])])
</script>

<template>
  <PostTable :posts="rows" />
</template>
```

The copy is a new mutable array, but its elements are the cached objects, so do not modify them.

To avoid the copy, change only the array's type with a helper:

```ts
/** Types a readonly array as mutable without copying it. */
export function toMutableArray<T>(array: readonly T[]): T[] {
  return array as T[]
}
```

```vue
<PostTable :posts="toMutableArray(posts ?? [])" />
```

The component then receives the cached array, which stays readonly at runtime.
If the component modifies it, for example by sorting it in place, Vue ignores the change and warns only in development.

TypeScript rejects both the copy and the helper's result if the element type contains arrays, such as `tags: string[]`, because those stay readonly.

Do not enable `clone: true` only to satisfy such a prop type: it deep-copies the data on every update.
If the component edits the data, use [mutable data](#mutable-data) or keep a separate form draft.
