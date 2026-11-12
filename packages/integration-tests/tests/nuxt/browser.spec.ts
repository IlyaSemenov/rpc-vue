import { expect, test } from "@playwright/test"

test("both protocols share one hydrated cache and invalidate independently", async ({
  page,
  request,
}) => {
  const responses = await Promise.all(
    ["alice", "bob"].map(name => request.get("/", { headers: { cookie: `viewer=${name}` } })),
  )
  for (const [index, response] of responses.entries()) {
    const html = await response.text()
    const name = index === 0 ? "alice" : "bob"
    expect(html).toContain(`id="trpc">trpc viewer=${name}`)
    expect(html).toContain(`id="orpc">orpc viewer=${name}`)
    expect(html).toContain('id="same-cache">true')
  }
  const urls: string[] = []
  page.on("request", request => {
    if (/\/[ot]rpc\//.test(request.url())) urls.push(request.url())
  })
  await page.goto("/")
  await expect(page.locator("#ready")).toHaveText("true")
  await page.waitForLoadState("networkidle")
  expect(urls).toHaveLength(0)
  await page.locator("#invalidate-restored").click()
  await expect(page.locator("#restored-invalidated")).toHaveText("true")
  expect(urls).toHaveLength(0)
  await page.locator("#trpc-write").click()
  await expect(page.locator("#trpc")).toContainText("edited")
  await expect(page.locator("#orpc")).toContainText("orpc")
  await page.locator("#trpc-invalidate").click()
  await expect(page.locator("#trpc")).toContainText("trpc")
  expect(urls.filter(url => url.includes("/orpc/"))).toHaveLength(0)
  await page.locator("#orpc-invalidate").click()
  await expect.poll(() => urls.filter(url => url.includes("/orpc/")).length).toBe(1)
})
