---
"orpc-vue": minor
"trpc-vue": minor
---

BREAKING: `await useQuery()` now rejects when the initial fetch fails; set `rejectOnError: false` to resolve with the error state as before.
BREAKING: TanStack's `throwOnError` query option is no longer exposed by the composables.
