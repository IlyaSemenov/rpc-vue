# Mutations and Invalidation

Use `useMutation` for actions such as creating or updating a post.

```ts
const orpc = useOrpc()
const mutation = orpc.blog.posts.create.useMutation({
  onSuccess: () => orpc.blog.posts.invalidate(),
})

await mutation.mutateAsync({ title: "New post" })
```

`mutation` exposes reactive state and methods, including:

- `mutation.mutate(input)` starts the request and returns `void`; read the result from `mutation.data.value` or handle it in `onSuccess`.
- `mutation.mutateAsync(input)` starts the request and returns a `Promise` that resolves with the response or rejects with the error, so you can use `await` and `try/catch`.
- `mutation.data.value` contains the mutation result, or `undefined` before data is available.
- `mutation.isPending.value` is `true` while the mutation is running.
- `mutation.error.value` contains the mutation error, or `null` when there is no error.

The `onSuccess` callback above refreshes active post queries after creating a post.

## Invalidation

Choose how much of the cache to invalidate:

```ts
// Every cached input of this procedure.
await orpc.blog.posts.get.invalidate()

// Every query under this router branch.
await orpc.blog.posts.invalidate()

// Every query of this client.
await orpc.invalidate()

// Only this query's current input.
await query.invalidate()
```

Invalidation marks matching queries as stale and refetches active ones.
Inactive queries can refresh when used again.
Create the decorated client inside your app plugin so callbacks use that app's QueryClient.
