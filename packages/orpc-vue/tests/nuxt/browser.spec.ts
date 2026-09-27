import { expect, test } from "@playwright/test"
import { defineBrowserTests } from "@rpc-vue/core/test-utils/browser-tests"

defineBrowserTests("/orpc/", (path) => [path.replaceAll("/", ".")])

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
