# trpc-vue

## 0.2.0

### Minor Changes

- 8ce48c1: BREAKING: `await useQuery()` now rejects when the initial fetch fails; set `rejectOnError: false` to resolve with the error state as before.
  BREAKING: TanStack's `throwOnError` query option is no longer exposed by the composables.
- a21f57a: Add non-cached query defaults for pending, disabled, skipped, and failed queries.

## 0.1.0

### Minor Changes

- 5cf8e13: Add trpc-vue with typed Vue composables and Nuxt integration, and support both RPC clients sharing one QueryClient and SSR payload through explicit cache ownership and separate key prefixes.
