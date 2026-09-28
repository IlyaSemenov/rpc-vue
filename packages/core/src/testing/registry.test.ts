import { describe, expect, test } from "bun:test"

import { QueryClient } from "@tanstack/vue-query"
import { reactive, toRaw } from "vue"

import { createTestRegistry } from "./registry"

type Procedures = {
  blog: {
    posts: {
      list: {
        handle(
          handler: (input: unknown, options: unknown) => unknown,
          options?: { copyInput?: ((input: unknown) => unknown) | false },
        ): unknown
      }
    }
  }
}

type Mock = { mock: { calls: unknown[][] } }

function setup(queryClient?: QueryClient, copyInput?: (input: unknown) => unknown) {
  const registry = createTestRegistry("RPC", {
    queryClient,
    copyInput,
    createHandlerOptions: () => ({ tag: "options" }),
  })
  return { ...registry, procedures: registry.procedures as Procedures }
}

describe("test registry", () => {
  test("dispatches by full path and passes handler options outside the mock's calls", async () => {
    const { procedures, call } = setup()
    const list = procedures.blog.posts.list.handle((input, options) => ({ input, options }))

    expect(await call("blog.posts.list", 1)).toEqual({ input: 1, options: { tag: "options" } })
    expect((list as { mock: { calls: unknown[] } }).mock.calls).toEqual([[1]])
    expect(procedures.blog.posts).toBe(procedures.blog.posts)
    expect(Reflect.get(procedures, Symbol.iterator)).toBeUndefined()
    expect(Reflect.get(procedures, "then")).toBeUndefined()
  })

  test("reports the full path of an unregistered procedure", () => {
    expect(() => setup().call("blog.posts.update", undefined)).toThrow(
      'No test handler is registered for RPC procedure "blog.posts.update"',
    )
  })

  test("requires a handler function registered through handle()", () => {
    const { procedures } = setup()
    expect(() => Reflect.apply(procedures.blog.posts.list as never, undefined, [])).toThrow(
      "procedure.handle(function)",
    )
    expect(() => procedures.blog.posts.list.handle("value" as never)).toThrow(
      "procedure.handle(function)",
    )
  })

  test("a later registration replaces the handler for the same path", async () => {
    const { procedures, call } = setup()
    const first = procedures.blog.posts.list.handle(() => "first") as { mock: { calls: [] } }
    procedures.blog.posts.list.handle(() => "replacement")

    expect(await call("blog.posts.list", undefined)).toBe("replacement")
    expect(first.mock.calls).toHaveLength(0)
  })

  test("the owned cache reports a failing procedure instead of retrying it", () => {
    expect(setup().queryClient.getDefaultOptions().queries?.retry).toBe(false)
  })

  test("reset clears registrations and the cache without touching another registry", () => {
    const queryClient = new QueryClient()
    const own = setup(queryClient)
    const other = setup()
    own.procedures.blog.posts.list.handle(() => "own")
    other.procedures.blog.posts.list.handle(() => "other")
    queryClient.setQueryData(["cached"], "value")
    other.queryClient.setQueryData(["cached"], "value")

    own.reset()

    expect(() => own.call("blog.posts.list", undefined)).toThrow("blog.posts.list")
    expect(queryClient.getQueryData(["cached"])).toBeUndefined()
    expect(other.call("blog.posts.list", undefined)).toBe("other")
    expect(other.queryClient.getQueryData<string>(["cached"])).toBe("value")
  })

  describe("copyInput", () => {
    const copyInput = (input: unknown) => structuredClone(toRaw(input))

    test("passes the handler and its mock one copy taken at call time", async () => {
      const { procedures, call } = setup(undefined, copyInput)
      let received: unknown
      const list = procedures.blog.posts.list.handle((input) => (received = input)) as Mock
      const fields = reactive({ title: "Post" })

      await call("blog.posts.list", fields)
      fields.title = ""

      expect(list).toHaveBeenCalledWith({ title: "Post" })
      expect(list.mock.calls[0]?.[0]).toBe(received)
    })

    test("a registration's copyInput replaces the client's", async () => {
      const { procedures, call } = setup(undefined, copyInput)
      const list = procedures.blog.posts.list.handle((input) => input, {
        copyInput: (input) => input,
      }) as Mock
      const fields = reactive({ title: "Post" })

      await call("blog.posts.list", fields)
      fields.title = ""

      expect(list).toHaveBeenCalledWith({ title: "" })
      expect(list.mock.calls[0]?.[0]).toBe(fields)
    })

    test("a registration's false turns off the client's copyInput", async () => {
      const { procedures, call } = setup(undefined, copyInput)
      const list = procedures.blog.posts.list.handle((input) => input, {
        copyInput: false,
      }) as Mock
      const fields = reactive({ title: "Post" })

      await call("blog.posts.list", fields)

      expect(list.mock.calls[0]?.[0]).toBe(fields)
    })
  })
})
