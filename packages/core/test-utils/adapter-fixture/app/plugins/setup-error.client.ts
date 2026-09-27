import { defineNuxtPlugin } from "nuxt/app"

declare global {
  interface Window {
    rpcSetupError?: string
  }
}

export default defineNuxtPlugin({
  hooks: {
    "vue:error"(error) {
      window.rpcSetupError = error instanceof Error ? error.message : String(error)
    },
  },
})
