import { defineAdapterSiteConfig } from "@rpc-vue/core/docs/config"

export default defineAdapterSiteConfig("orpc-vue", {
  description: "oRPC integration for Vue and Nuxt with TanStack Vue Query composables",
  protocolPages: [
    { text: "Direct Calls and Utilities", link: "/calls" },
    { text: "Errors", link: "/errors" },
    { text: "Custom Types", link: "/custom-types" },
  ],
})
