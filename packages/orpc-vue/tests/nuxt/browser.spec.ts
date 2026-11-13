import { expect, test } from "@playwright/test"
import { defineBrowserTests } from "@rpc-vue/core/test-utils/browser-tests"

defineBrowserTests("/orpc/", path => [path.replaceAll("/", ".")])

test("reports through the client plugin in the browser but never during SSR", async ({
  page,
  request,
}) => {
  const response = await request.get("/unexpected-errors")
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain(
    '<p id="unexpected-count" data-allow-mismatch="text">0</p>',
  )
  await page.goto("/unexpected-errors")
  await expect(page.locator("#unexpected-count")).toHaveText("1")
  await expect(page.locator("#unexpected-kind")).toHaveText("server")
  await page.locator("#unexpected-refetch").click()
  await expect(page.locator("#unexpected-count")).toHaveText("2")
})

test("reports a request without a response as ORPCNetworkError", async ({ page }) => {
  await page.goto("/unexpected-errors")
  await expect(page.locator("#unexpected-count")).toHaveText("1")
  await page.route("**/orpc/**", route => route.abort("internetdisconnected"))
  await page.locator("#unexpected-refetch").click()
  await expect(page.locator("#unexpected-count")).toHaveText("2")
  await expect(page.locator("#unexpected-kind")).toHaveText("network")
})

test("hydrates a caught declared error as successful data", async ({ page }) => {
  const requests: string[] = []
  page.on("request", request => {
    if (new URL(request.url()).pathname.includes("blog/posts/update")) {
      requests.push(request.url())
    }
  })

  await page.goto("/declared-error")
  await expect(page.locator("#declared-data")).toHaveText("missing")
  await expect(page.locator("#declared-status")).toHaveText("success")
  await expect(page.locator("#declared-error")).toBeEmpty()
  await page.waitForLoadState("networkidle")
  expect(requests).toEqual([])
})

test("keeps SSR cache keys and payload for custom types defined by the serializer", async ({
  page,
}) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => {
    if (message.type() === "warning" || message.type() === "error") errors.push(message.text())
  })
  page.on("request", request => {
    if (new URL(request.url()).pathname.includes("prices/describe")) requests.push(request.url())
  })

  await page.goto("/custom-types")
  // SSR HTML already has the expected texts; the browser renders them only after hydration.
  await expect(page.locator("#hydrated")).toHaveText("true")
  await expect(page.locator("#money-input")).toHaveText("money")
  await expect(page.locator("#string-input")).toHaveText("string")
  await expect(page.locator("#money-output")).toHaveText("Money 1.5")
  await page.waitForLoadState("networkidle")
  // The browser rebuilds the SSR keys from its inputs, so hydrated entries need no refetch.
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})
