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
