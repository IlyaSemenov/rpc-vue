import { expect, test } from "bun:test"

import { renderToString } from "@vue/server-renderer"
import { createSSRApp, h } from "vue"

import { createClientContext } from "./context"

test("reads the client provided to each Vue app without sharing it across SSR requests", async () => {
  const context = createClientContext<{ name: string }>("RPC", "useRpc")
  const clients = [{ name: "first" }, { name: "second" }]

  await Promise.all(
    clients.map(async client => {
      const app = createSSRApp({
        setup() {
          expect(context.useRpc()).toBe(client)
          return () => h("p", "ready")
        },
      })
      app.provide(context.key, client)
      expect(await renderToString(app)).toBe("<p>ready</p>")
    }),
  )
})

test("requires the matching provider in an active Vue injection context", () => {
  const context = createClientContext<object>("RPC", "useRpc")
  const other = createClientContext<object>("RPC", "useRpc")
  const app = createSSRApp({ render: () => null })
  app.provide(other.key, {})

  expect(() => context.useRpc()).toThrow("before using context.useRpc()")
  expect(() => app.runWithContext(() => context.useRpc())).toThrow("No RPC client was provided")
  expect(context.key).not.toBe(other.key)
})
