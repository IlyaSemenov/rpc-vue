# RPC Vue Workspace Agent Guide

## Overview

Vue and Nuxt integrations for RPC clients.

Read the affected package's README completely before changing its public API, package behavior, supported runtimes, or user documentation.
Each workspace package's `AGENTS.md` adds the conventions specific to that package.

Extend this guide only with stable, non-obvious conventions, architecture, contracts, workflows, and gotchas.
Do not catalog files or restate information evident from their names and locations.

## Scope

- Keep production code in each package's `src/`.
- Keep focused module tests beside their source as `*.test.ts`.
- Keep runtime integration tests in each package's `tests/runtime/` and source type tests in its `tests/types/`.
- Keep Nuxt component tests in the fixture application's `test/nuxt/`, where its generated tsconfig also typechecks them.
- Name compile-only tests `*.type-test.ts`; keep Nuxt type tests inside the fixture application so they use its generated injections and built package declarations.
- Keep compile-only checks that reuse a component test's fixtures in that test file rather than a separate `*.type-test.ts`.
- Keep package `src/index.ts` files limited to explicit public exports.
- Treat package `package.json` exports and supported runtimes as public contracts.

## Implementation

- Keep each public adapter installable without the other adapter or private core; published JavaScript and declarations must not import either package.
- Implement behavior, types, test helpers and tooling shared by both adapters once in the private core; keep in adapters only protocol-specific code and their public names and documentation.
- Keep query identity consistent across observers, imperative cache access, invalidation and SSR hydration; adapter hashing must not change unrelated queries' hashing.
- Capture QueryClient during plugin initialization; `.invalidate()` must not require Vue injection at call time.
- Keep Vue context factories free of client instances; provide clients per app or SSR request.
- Keep Vue root entrypoints free of Nuxt runtime imports.
- Use extensionless relative imports within a package's `src/`.
- Cross package and test boundaries only through aliases: `@rpc-vue/core/*` for core, the package's public specifiers mapped in `tests/tsconfig.json` for its source, and `~~/` inside Nuxt fixtures; never through relative paths such as `../../src`.
- When source files use tsconfig path aliases, check that built `dist/*.d.ts` files import only their own chunks and declared dependencies.

## Documentation

- Write public README and JSDoc text for package users who do not know the implementation.
- Keep shared Vue and Nuxt behavior consistent across both adapter READMEs; preserve differences required by their protocol APIs.
- Give every RPC client a distinct stable nonempty prefix in shared-cache examples so root invalidation stays within its namespace.
- In adapter READMEs, serve RPC handlers at each protocol's official path, `/rpc` for oRPC and `/trpc` for tRPC, and keep each router in the `server/` directory of the same name.
- Add JSDoc to every exported declaration and to internal helpers whose contract, inputs, output, or failure behavior is not obvious.
- Add inline comments beside every non-obvious invariant, algorithmic choice, safety constraint, and intentionally limited behavior.
- Update nearby JSDoc and inline comments whenever the documented code changes, and remove comments that no longer apply.
- Do not narrate self-evident syntax or restate what a name already communicates.
- Do not document obvious or implied defaults.
- Describe a default only when readers need it to make a decision or avoid surprising behavior.
- Use One Sentence Per Line for connected prose.
- Keep semantically connected explanations as prose paragraphs.
- Use lists for separate assertions instead of presenting them as prose paragraphs.

## Changesets

- Before the first publication, update `.changeset/initial-release.md` instead of creating additional changesets.
- After the first publication, add one `.changeset/*.md` file for each independently releasable user-visible change.
- Include every affected public package and its SemVer bump in the changeset frontmatter.
- Do not add changesets for internal refactors, maintenance, tests, or documentation changes that do not require a package release.
- Choose the SemVer bump from the public contract: `patch` for backward-compatible fixes and `minor` for backward-compatible functionality.
- Before 1.0, use `minor` for breaking changes; starting with 1.0, use `major` and remove this rule.
- Create `.changeset/<unique-name>.md` with this format, adding a frontmatter entry for every affected public package:

```markdown
---
"<package-name>": patch
---

Describe the user-visible change.
```

- Briefly describe the user-observable change or new capability in the public contract, without implementation details or rationale.
  Prefer a single sentence.
- Do not edit the package version or `CHANGELOG.md` by hand, and do not run `changeset version` or `changeset publish`; the maintainer releases pending changesets.

## Tests

- Add a `describe` block where the file gives a reason for it: several APIs or behaviors in one file, a fixture that belongs to some cases but not all, or a file name that does not say what its tests cover.
  Name such a block after what it covers and keep its fixtures inside it.
- Distinguish several same-kind values by role rather than by order.
  When values differ only by order, number them with digits instead of ordinal words.
- Keep tests deterministic so a failure repeats on every run.
  Generate random inputs from an explicit seed and print the seed in failure messages so the failing input can be replayed.
- Test deeply nested router inference through each adapter's Vue accessor, Nuxt composable and `$` injection, with valid and invalid calls against source types and built declarations.
- Test shared behavior once in the private core through its own APIs; in adapters, test only protocol-specific behavior and how the adapter wires the core.
- Share the adapters' Nuxt fixture pages and browser tests through core's `test-utils/`; keep the rest of each adapter's Nuxt fixture structurally identical to the other adapter's, differing only where protocol APIs require it.
- Check each adapter alone with its module-owned QueryClient and HTTP transport options; check application-owned QueryClients and custom transport factories in the integration test workspace.
- Keep cross-adapter compatibility tests in the private integration test workspace; neither adapter's test suite may depend on the other adapter.

## Checks

- Run package checks from that package's directory or use root scripts to check every workspace package.
- Build and publish each package from its own directory.

- Run the `types` script when public types or TypeScript configuration change.
- Run the `test` script when behavior changes.
- Run the `build` script when package exports, declarations, or supported runtimes change.
- Run `test:component` when changing composables, auto-imports, or a documented testing recipe; it uses the built package, so build first.
- Run `test:nuxt` when changing Nuxt compatibility, plugin registration, or SSR hydration.
  Install the packed archive in an isolated consumer running the exact Nuxt version installed in the workspace; keep its generated configuration and dependencies outside the source workspace.
  Check other Nuxt versions only on explicit request, by passing them to `test:nuxt`.
