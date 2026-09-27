import { mountSuspended } from "@nuxt/test-utils/runtime"
import type { RouterClient } from "@orpc/server"
import type { TestORPCHandler } from "orpc-vue/testing"
import { expect, test, vi } from "vitest"
import type { router } from "~~/server/orpc/router"

import AwaitedError from "~/components/awaited-error.vue"
import DeclaredError from "~/components/declared-error.vue"
import PostList from "~/components/post-list.vue"

import { client, onUnexpectedError, procedures } from "./setup"

test("queries, mutates and invalidates through the test client", async () => {
  let title = "First post"
  const list = procedures.blog.posts.list.handle(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return [{ id: 1, title }]
  })
  const update = procedures.blog.posts.update.handle((input) => {
    title = input.title
    return { id: input.id, details: { title } }
  })
  const component = await mountSuspended(PostList)

  expect(component.text()).toContain("First post")
  await component.get("button").trigger("click")
  await vi.waitFor(() => expect(component.text()).toContain("Updated post"))

  expect(update).toHaveBeenCalledWith({ id: 1, title: "Updated post" })
  expect(list).toHaveBeenCalledTimes(2)
})

test("renders a caught declared error as data", async () => {
  procedures.blog.posts.update.handle((_input, { errors }) => {
    throw errors.NOT_FOUND()
  })
  const component = await mountSuspended(DeclaredError)

  expect(component.get("#declared-data").text()).toBe("missing")
  expect(component.get("#declared-status").text()).toBe("success")
  expect(component.get("#declared-error").text()).toBe("")
})

test("delivers an awaited query error to compiled script setup with its instance restored", async () => {
  procedures.blog.posts.fail.handle(() => {
    throw new Error("Failed query")
  })
  const component = await mountSuspended(AwaitedError)

  expect(component.get("#awaited-error").text()).toBe("Failed query")
  expect(component.get("#instance-restored").text()).toBe("true")
  expect(onUnexpectedError).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
    source: "query",
    path: ["blog", "posts", "fail"],
    input: undefined,
  })
})

test("reports an unexpected setup error through the test client's hook", async () => {
  const error = new Error("Failed query")
  const handler: TestORPCHandler<RouterClient<typeof router>["blog"]["posts"]["list"]> = () => {
    throw error
  }
  procedures.blog.posts.list.handle(handler)
  await expect(mountSuspended(PostList)).rejects.toBe(error)
  expect(onUnexpectedError).toHaveBeenCalledExactlyOnceWith(error, {
    source: "query",
    path: ["blog", "posts", "list"],
    input: undefined,
  })
})

/** Never called: the built testing entry must preserve procedure and decorated client types. */
export function checkTestClientTypes() {
  const query = client.blog.posts.list.useQuery(undefined, { default: () => [] })
  query.data.value[0]?.title satisfies string | undefined
  procedures.blog.posts.get.handle(async (input) => {
    input.id satisfies number
    return { id: input.id, details: { title: "Post" } }
  })
  procedures.blog.posts.get.handle((input) => ({
    // @ts-expect-error The response ID must remain a number in built declarations.
    id: String(input.id),
    details: { title: "Post" },
  }))
  // @ts-expect-error Router branches expose no registration method.
  procedures.blog.posts.handle(() => [])
  // @ts-expect-error Router branches expose no query composable.
  client.blog.posts.useQuery()
}
