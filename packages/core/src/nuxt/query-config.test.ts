import { expect, test } from "bun:test"

import { createQueryClientConfig } from "./query-config"

test("static overrides preserve defaults in other sections", () => {
  const config = createQueryClientConfig({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false },
      mutations: { retry: 2 },
    },
  })
  expect(config.defaultOptions?.queries).toMatchObject({ staleTime: 30_000, retry: false })
  expect(config.defaultOptions?.mutations?.retry).toBe(2)
})

test("partial static defaults preserve the default stale time", () => {
  const config = createQueryClientConfig({ defaultOptions: { queries: { retry: false } } })
  expect(config.defaultOptions?.queries?.staleTime).toBe(5_000)
})
