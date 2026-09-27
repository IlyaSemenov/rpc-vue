---
"orpc-vue": minor
---

Add a `catching` option to `useQuery` that turns declared errors into cached data.
BREAKING: Procedures without declared errors no longer expose `callCatching`, and declared query errors no longer retry.
