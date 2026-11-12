import { expect, test } from "bun:test"

import { ORPCNetworkError, rejectWithNetworkErrors } from "./network-error"

test("marks a fetch rejection as a network error with the original cause", async () => {
  const failure = new TypeError("Failed to fetch")
  const fetch = rejectWithNetworkErrors(() => Promise.reject(failure))
  const error = await fetch("https://example.com/rpc").catch((error: unknown) => error)
  expect(error).toBeInstanceOf(ORPCNetworkError)
  expect((error as ORPCNetworkError).cause).toBe(failure)
})

test("keeps the rejection of an aborted request unchanged", async () => {
  const controller = new AbortController()
  controller.abort()
  const fetch = rejectWithNetworkErrors(() => Promise.reject(controller.signal.reason))
  const error = await fetch("https://example.com/rpc", { signal: controller.signal }).catch(
    (error: unknown) => error,
  )
  expect(error).toBe(controller.signal.reason)
})

test("passes responses through, including HTTP errors", async () => {
  const response = new Response(null, { status: 500 })
  const fetch = rejectWithNetworkErrors(() => Promise.resolve(response))
  expect(await fetch("https://example.com/rpc")).toBe(response)
})
