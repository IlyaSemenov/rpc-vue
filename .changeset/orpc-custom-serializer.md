---
"orpc-vue": minor
---

Add a `serializer` option to `createORPCVueQuery()`, `createTestORPCClient()` and the Nuxt client plugin, so that custom types of an oRPC serializer get distinct cache keys and keep their references in refetched data; the plugin also uses it for its HTTP link.
