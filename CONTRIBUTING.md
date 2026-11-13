# Contributing

## Workspace

- `packages/orpc-vue` and `packages/trpc-vue` are the published adapters.
- [`packages/core`](packages/core/README.md) is the private core that both adapters build from.
- [`packages/integration-tests`](packages/integration-tests/README.md) checks both adapters together: shared caches, application-owned QueryClients and custom transports.

## Checks

Install dependencies with `bun install` from the repository root.
Run the complete workspace checks in this order:

```sh
bun run build
bun run types
bun run test
bun run test:component
bunx playwright install chromium-headless-shell
bun run test:nuxt
```

Run the same scripts from a package's directory to check only that package.
Use `bun run test`, not `bun test`: the package scripts select the appropriate files for each test runner.

- `test` runs the runtime tests of the core, the adapters and the integration workspace.
- `test:component` runs an adapter's documented component-test recipe in its fixture application. It uses the built package, so build first.
- `test:nuxt` packs each adapter and installs the archive in an isolated Nuxt application, separately and both together, to check types, SSR and hydration in development and production. It uses the Nuxt version installed in the workspace; pass other versions explicitly, such as `bun run test:nuxt 3.14.1592 4.0.1`.

To try an adapter in a Nuxt app, build it and run `bunx nuxt dev tests/fixtures/nuxt` from its directory.
The app uses the built package, so rebuild after changing its source.

## Documentation

Each adapter's documentation is a VitePress site in its `docs/` directory; run `bun run docs:dev` from the adapter's directory to preview it.
`bun run docs:build` builds both sites and the root page into the GitHub Pages site in `docs/.vitepress/dist`, and `bun run docs:preview` serves it.
