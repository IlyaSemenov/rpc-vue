import { defineConfig } from "tsdown"

/** Build an adapter's public entrypoints, bundling the private core into its archive. */
export default defineConfig({
  entry: {
    module: "src/module.ts",
    "runtime/client": "src/runtime/client.ts",
    "runtime/testing": "src/runtime/testing.ts",
    "runtime/nuxt/runtime": "src/runtime/nuxt/runtime.ts",
    // The Nuxt module loads this plugin by path when generating the app's plugins.
    "runtime/nuxt/plugin": "src/runtime/nuxt/plugin.ts",
  },
  platform: "neutral",
  // Emit workspace declarations together so re-exported core types are available to the bundler.
  dts: { tsc: { eager: true } },
  publint: true,
  attw: {
    profile: "esm-only",
  },
})
