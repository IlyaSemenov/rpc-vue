# orpc-vue

## 0.13.0

### Minor Changes

- fc1ea55: Nuxt plugins and test clients accept standard oRPC client interceptors.

## 0.12.0

### Minor Changes

- 9908e51: Test clients and `.handle()` accept a `copyInput` option that copies each procedure input before the handler and its mock receive it.

## 0.11.0

### Minor Changes

- 8ce48c1: BREAKING: `await useQuery()` now rejects when the initial fetch fails; set `rejectOnError: false` to resolve with the error state as before.
  BREAKING: TanStack's `throwOnError` query option is no longer exposed by the composables.
- f59a39c: Add a `catching` option to `useQuery` that turns declared errors into cached data.
  BREAKING: Procedures without declared errors no longer expose `callCatching`, and declared query errors no longer retry.
- 53a326f: Add `onUnexpectedError` to report unexpected browser errors from calls, queries and mutations.
- a21f57a: Add non-cached query defaults for pending, disabled, skipped, and failed queries.

## 0.10.0

### Minor Changes

- 5cf8e13: Add trpc-vue with typed Vue composables and Nuxt integration, and support both RPC clients sharing one QueryClient and SSR payload through explicit cache ownership and separate key prefixes.
- 5cf8e13: `useQuery()` options no longer accept `queryKeyHashFn` or `queryHash`.

## 0.9.0

### Minor Changes

- 93f8aff: Nuxt runtime helpers (`defineNuxtPlugin`, `useOrpc`, `useOrpcQueryClient`) moved from `orpc-vue/nuxt/runtime` to `orpc-vue/nuxt`, and the Nuxt module moved from `orpc-vue/nuxt` to `orpc-vue/nuxt/module`.

## 0.8.0

### Minor Changes

- ac0ac66: Rename `orpc-nuxt` to `orpc-vue`, expose its Vue Query composables and typed app context independently of Nuxt, and move Nuxt integration to `orpc-vue/nuxt` and `orpc-vue/nuxt/runtime`.

## 0.7.0

### Minor Changes

- ce879f0: Add `.callCatching()` to procedures for calling them and handling declared errors in one step.

## 0.6.0

### Minor Changes

- c9f3b56: Replace the standalone test error helper with procedure-typed `errors` constructors in test handlers.

## 0.5.0

### Minor Changes

- bdb765f: Add typed handling of declared procedure errors and a test helper for creating them.

## 0.4.0

### Minor Changes

- 452be12: Allow the Nuxt plugin helper to create a custom oRPC link with access to the current SSR request event.

## 0.3.1

### Patch Changes

- 7a62794: `createTestORPCClient()` now owns a QueryClient that never retries, exposes it as `queryClient`, and clears it from `reset()`.

## 0.3.0

### Minor Changes

- b83340d: Add the `orpc-nuxt/testing` entrypoint with `createTestORPCClient()`, which creates a fake oRPC client whose procedures register typed handlers and return Vitest mocks.

## 0.2.0

### Minor Changes

- 5b3908a: Add the auto-imported `useOrpcQueryClient()`, which returns the app's QueryClient and also works outside Vue components.
- aa9d708: Accept later oRPC 2.0.0 betas: `@orpc/client` and `@orpc/tanstack-query` now allow `^2.0.0-beta.35` instead of that exact version.

## 0.1.1

### Patch Changes

- ac187ab: Support Nuxt 3.14 and later, and accept the `@nuxt/kit` and `devalue` versions that the host Nuxt installs.

## 0.1.0

### Minor Changes

- 47bb193: Add oRPC v2 integration for Nuxt 3 and 4 with a typed HTTP plugin helper, reactive, awaitable queries, mutations, SSR hydration, and configurable caching.
  Support local mutable clones, readonly selections, and invalidation of procedures or router branches.
