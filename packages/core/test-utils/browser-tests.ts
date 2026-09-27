import { expect, type Page, test } from "@playwright/test"

/**
 * Register the browser tests that both adapters run against the shared adapter fixture pages.
 *
 * @param endpoint - The RPC handler path with a trailing slash.
 * @param parseProcedures - Read dot-separated procedure names from the request path after the endpoint.
 */
export function defineBrowserTests(endpoint: string, parseProcedures: (path: string) => string[]) {
  /** Record the procedures the browser requests from the RPC handler. */
  function recordProcedures(page: Page) {
    const procedures: string[] = []
    page.on("request", (request) => {
      const { pathname } = new URL(request.url())
      if (pathname.startsWith(endpoint)) {
        procedures.push(...parseProcedures(pathname.slice(endpoint.length)))
      }
    })
    return procedures
  }

  test("SSR isolates viewers, preserves Date results and uses the server transport", async ({
    request,
  }) => {
    const responses = await Promise.all([
      request.get("/", {
        headers: {
          "x-viewer": "reader-ada",
          cookie: "session=ada",
          authorization: "must-not-be-forwarded",
        },
      }),
      request.get("/", {
        headers: { "x-viewer": "reader-grace", cookie: "session=grace" },
      }),
    ])
    const html = await Promise.all(responses.map((response) => response.text()))
    expect(responses.every((response) => response.ok())).toBe(true)
    expect(html[0]).toContain('<p id="viewer">reader-ada</p>')
    expect(html[0]).not.toContain("reader-grace")
    expect(html[1]).toContain('<p id="viewer">reader-grace</p>')
    expect(html[1]).not.toContain("reader-ada")
    expect(html[0]).toContain("2026-01-01T00:00:00.000Z")
    expect(html[0]).toContain('<p id="cookie">session=ada</p>')
    expect(html[0]).not.toContain("session=grace")
    expect(html[1]).toContain('<p id="cookie">session=grace</p>')
    expect(html[0]).not.toContain("must-not-be-forwarded")
    expect(html[0]).toContain('<p id="transport">server</p>')
    expect(html[0]).toContain('<p id="browser-transport"></p>')
  })

  test("does not forward incoming headers unless explicitly listed", async ({ request }) => {
    const response = await request.get("/no-headers", {
      headers: { "x-viewer": "private-viewer", cookie: "session=private-cookie" },
    })
    expect(response.ok()).toBe(true)
    const html = await response.text()
    expect(html).toContain('<p id="viewer">visitor</p>')
    expect(html).not.toContain("private-viewer")
    expect(html).not.toContain("private-cookie")
  })

  test("turns an awaited initial query error into an SSR and navigation error", async ({
    page,
    request,
  }) => {
    const response = await request.get("/awaited-error")
    expect(response.status()).toBe(500)
    expect(await response.text()).toContain('<p id="error-status">500</p>')

    await page.goto("/")
    await expect(page.locator("#hydrated")).toHaveText("true")
    await page.locator("#awaited-error").click()
    await expect(page).toHaveURL(/\/awaited-error$/)
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { rpcSetupError?: string }).rpcSetupError),
      )
      .toBeTruthy()
  })

  test("invalidates the app cache from an event before any query or mutation is created", async ({
    page,
  }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("/invalidation")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("#invalidated")).toHaveText("false")
    await page.locator("#invalidate").click()
    await expect(page.locator("#invalidated")).toHaveText("true")
    expect(errors).toEqual([])
  })

  test("hydrates without refetching and keeps local edits separate from cache assignments", async ({
    page,
  }) => {
    const errors: string[] = []
    const procedures = recordProcedures(page)
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") errors.push(message.text())
    })
    await page.setExtraHTTPHeaders({ "x-viewer": "browser" })
    await page.goto("/")
    await expect(page.locator("#hydrated")).toHaveText("true")
    await expect(page.locator("#browser-transport")).toHaveText("browser")
    await page.waitForLoadState("networkidle")
    expect(procedures).toEqual(["transport"])
    await expect(page.locator("#viewer")).toHaveText("browser")
    await expect(page.locator("#manual-user")).toHaveText("Ada")
    await expect(page.locator("#date")).toHaveText("2026-01-01T00:00:00.000Z")
    await expect(page.locator("#defaults")).toHaveText("60000 / false")
    await expect(page.locator("#disabled")).toHaveText("idle")
    await page.locator("#edit").click()
    await expect(page.locator("#viewer")).toHaveText("local")
    await expect(page.locator("#selected")).toHaveText("browser")
    await page.locator("#share").click()
    await expect(page.locator("#viewer")).toHaveText("shared")
    await expect(page.locator("#selected")).toHaveText("shared")
    expect(errors).toEqual([])
  })

  test("reactive input, enabled, namespace invalidation and configured retry work in the browser", async ({
    page,
  }) => {
    await page.addInitScript((endpoint) => {
      const state = window as typeof window & { rpcCredentials: (RequestCredentials | undefined)[] }
      state.rpcCredentials = []
      // Preserve fetch's full API, including the extra properties in Bun's ambient types.
      window.fetch = new Proxy(window.fetch, {
        apply(target, receiver, args: [RequestInfo | URL, RequestInit?]) {
          const [input, init] = args
          if (String(input).includes(endpoint)) state.rpcCredentials.push(init?.credentials)
          return Reflect.apply(target, receiver, args)
        },
      })
    }, endpoint)
    const procedures = recordProcedures(page)
    const count = (procedure: string) => procedures.filter((name) => name === procedure).length
    await page.goto("/")
    await expect(page.locator("#hydrated")).toHaveText("true")
    await expect(page.locator("#post")).toBeEmpty()
    await page.locator("#enable").click()
    await expect(page.locator("#post")).toHaveText("post 1")
    await page.locator("#next").click()
    await expect(page.locator("#post")).toHaveText("post 2")
    await page.locator("#invalidate").click()
    await expect.poll(() => count("blog.posts.get")).toBe(3)
    await page.waitForLoadState("networkidle")
    await page.locator("#enable").click()
    await page.locator("#next").click()
    await page.waitForLoadState("networkidle")
    expect(count("blog.posts.get")).toBe(3)
    await page.locator("#fail").click()
    await expect(page.locator("#error")).not.toBeEmpty()
    await page.waitForLoadState("networkidle")
    expect(count("blog.posts.fail")).toBe(1)
    const credentials = await page.evaluate(() => {
      const state = window as typeof window & { rpcCredentials: (RequestCredentials | undefined)[] }
      return state.rpcCredentials
    })
    expect(credentials.length).toBeGreaterThan(0)
    expect(credentials.every((value) => value === "include")).toBe(true)
  })
}
