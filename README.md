# rpc-vue

Type-safe RPC for Vue and Nuxt.
Use your oRPC or tRPC procedures as TanStack Vue Query composables, with types inferred from your router.

- **Typed, reactive queries**: call router procedures in components with typed inputs and results; a query follows the ref or getter passed as its input.
- **Server rendering**: Nuxt fetches queries during server rendering, and the browser reuses their results.
- **Precise invalidation**: invalidate one input, a procedure, a router branch, or every query of the client, without building query keys.
- **Component tests**: replace procedures with typed handlers in Nuxt component tests, without starting a server.

Choose the integration for your RPC library:

- [orpc-vue](packages/orpc-vue/README.md) for [oRPC](https://orpc.dev/) v2, with typed handling of the errors that procedures declare ([documentation](https://ilyasemenov.github.io/rpc-vue/orpc/)).
- [trpc-vue](packages/trpc-vue/README.md) for [tRPC](https://trpc.io/) 11, with tRPC's TanStack Query utilities, including infinite queries ([documentation](https://ilyasemenov.github.io/rpc-vue/trpc/)).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workspace checks and the development setup.
