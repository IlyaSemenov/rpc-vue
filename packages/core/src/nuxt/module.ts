import { addImports, addPluginTemplate, createResolver, defineNuxtModule } from "@nuxt/kit"
import { uneval } from "devalue"

import type { StaticQueryClientConfig } from "./query-config"

/** Configure the integration through its section of nuxt.config. */
export interface ModuleOptions {
  /** Set static query defaults, or use false when another plugin owns Vue Query and hydration. */
  queryClient?: boolean | StaticQueryClientConfig
}

/** The names and packaged files that distinguish one adapter's Nuxt module. */
interface ModuleDefinition {
  /** The npm package name, which also names its generated plugin. */
  name: string
  /** The nuxt.config section holding ModuleOptions. */
  configKey: string
  /** Composables exported by the package's Nuxt runtime entrypoint. */
  composables: string[]
  /** The adapter module's import.meta.url, which locates its built runtime files. */
  moduleUrl: string
}

/** Define an adapter's Nuxt module: runtime auto-imports and the optional module-owned cache. */
export function defineRpcNuxtModule({ name, configKey, composables, moduleUrl }: ModuleDefinition) {
  return defineNuxtModule<ModuleOptions>({
    meta: {
      name,
      configKey,
      compatibility: { nuxt: "^3.14.1592 || ^4.0.1" },
    },
    defaults: { queryClient: true },
    setup(options, nuxt) {
      const resolver = createResolver(moduleUrl)
      // Also bundle runtime entrypoints when the module is registered by function instead of name.
      nuxt.options.build.transpile.push(name)
      // Keep the Vue Query integration out of prebundling alongside Nuxt's runtime plugins.
      const optimizeDeps = (nuxt.options.vite.optimizeDeps ??= {})
      optimizeDeps.exclude ??= []
      optimizeDeps.exclude.push(name, "@tanstack/vue-query")
      const runtime = resolver.resolve("./runtime/nuxt/runtime")
      addImports(composables.map(composable => ({ name: composable, from: runtime })))
      if (options.queryClient) {
        const config = options.queryClient === true ? {} : options.queryClient
        addPluginTemplate({
          filename: `${name}/query-client.mjs`,
          // Emit static defaults into both bundles; uneval preserves values such as Infinity.
          // Functions must use the runtime hook, where their closures are available.
          // Keep enforce in the generated object so Nuxt can read its order without executing it.
          getContents: () =>
            [
              `import { defineNuxtPlugin } from "nuxt/app"`,
              `import createQueryClientSetup from ${JSON.stringify(resolver.resolve("./runtime/nuxt/plugin"))}`,
              `export default defineNuxtPlugin({`,
              `  name: ${JSON.stringify(`${name}:query-client`)},`,
              `  enforce: "pre",`,
              `  setup: createQueryClientSetup(${uneval(config)}),`,
              `})`,
            ].join("\n"),
        })
      }
    },
  })
}
