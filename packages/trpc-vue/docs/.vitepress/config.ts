import { defineAdapterSiteConfig } from "@rpc-vue/core/docs/config"

export default defineAdapterSiteConfig("trpc-vue", {
  description: "tRPC integration for Vue and Nuxt with TanStack Vue Query composables",
  protocolPages: [{ text: "Native Calls and Utilities", link: "/calls" }],
})
