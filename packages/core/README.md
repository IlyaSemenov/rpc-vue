# Private RPC Vue core

Shared Vue Query lifecycle, cache access, Nuxt integration, test client registry, tooling and documentation configuration for the public RPC adapters.
This workspace package is private; each adapter's tsdown build includes the shared code and types it imports, so published entrypoints resolve their core imports within their own archive.

- `src/vue/` and `src/vue-query/`: the Vue client context, composables, cache helpers and their types.
- `src/nuxt/`: the Nuxt module, plugins and composable helpers.
- `src/testing/`: the registry behind the adapters' test clients.
- `build/`: the adapters' shared tsdown configuration.
- `docs/`: the shared VitePress configuration of the adapters' documentation sites and the root page that links to them.
- `test-utils/`: helpers for the adapters' and integration tests, including isolated Nuxt consumers and the pages and browser tests shared by both adapters' Nuxt fixtures.

Playwright tests read the consumer server address from `RPC_TEST_URL`.
The integration fixture selects the QueryClient owner from `RPC_TEST_OWNER`.
