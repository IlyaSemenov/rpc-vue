import { expect, test } from "@playwright/test"
import { defineBrowserTests } from "@rpc-vue/core/test-utils/browser-tests"

defineBrowserTests("/orpc/", (path) => [path.replaceAll("/", ".")])

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
  await page.locator("#unexpected-refetch").click()
  await expect(page.locator("#unexpected-count")).toHaveText("2")
})

test("hydrates a caught declared error as successful data", async ({ page }) => {
  const requests: string[] = []
  page.on("request", (request) => {
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
