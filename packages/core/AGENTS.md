# Private core Agent Guide

- Keep protocol types, key construction, key hashing, errors and transport links in the adapters.
- Scope runtime coordination to the current Vue/Nuxt application and support separately bundled copies of the core; do not rely on module-level singletons or independently created symbols.
- Keep `src/vue/` and `src/vue-query/` free of Nuxt imports; only `src/nuxt/` may import Nuxt.
- Import `src/testing/` only from the adapters' `testing` entrypoints.
- Keep `build/`, `docs/` and `test-utils/` out of published entrypoints.
- Register Vue lifecycle hooks before awaiting query completion.
- Write Nuxt plugin ordering metadata as literals in generated plugin source.
- Type values that plugin option callbacks receive, such as the request event, without `NuxtApp` members: `NuxtApp` includes plugin injections, so a plugin using them would make its own type circular.
