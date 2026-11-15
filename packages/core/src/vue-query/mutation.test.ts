import { afterEach, describe, expect, mock, test } from "bun:test"

import { QueryClient } from "@tanstack/vue-query"
import { type App, createRenderer, effectScope, type MaybeRefOrGetter, nextTick, ref } from "vue"

import { useReactiveMutation } from "./mutation"

test("mutations resolve reactive options and preserve input, output and callbacks", async () => {
  const queryClient = new QueryClient()
  const scope = effectScope()
  const successes: string[] = []
  const label = ref("first")
  try {
    const mutation = scope.run(() =>
      useReactiveMutation(
        settings => ({
          ...settings,
          mutationFn: async (input: unknown) => ({ saved: (input as { title: string }).title }),
        }),
        () => ({
          onSuccess: (data: { saved: string }) => {
            successes.push(`${label.value}: ${data.saved}`)
          },
        }),
        queryClient,
      ),
    )!
    expect(await mutation.mutateAsync({ title: "draft" })).toEqual({ saved: "draft" })
    label.value = "second"
    await mutation.mutateAsync({ title: "final" })
    expect(successes).toEqual(["first: draft", "second: final"])
    expect(mutation.data.value).toEqual({ saved: "final" })
  } finally {
    scope.stop()
    queryClient.clear()
  }
})

describe("unhandled mutate() errors", () => {
  const apps: App[] = []
  afterEach(() => {
    for (const app of apps.splice(0)) app.unmount()
  })

  // Vue routes a watcher's error to the app's errorHandler only inside a component instance.
  const renderer = createRenderer<object, object>({
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    setText: () => {},
    setElementText: () => {},
    parentNode: () => null,
    nextSibling: () => null,
    patchProp: () => {},
  })

  /** Run a composable in a mounted component; errors that Vue Query throws into Vue are collected. */
  function mount<T>(create: () => T) {
    const thrown: unknown[] = []
    let result!: T
    const app = renderer.createApp({
      setup() {
        result = create()
        return () => null
      },
    })
    app.config.errorHandler = error => thrown.push(error)
    app.mount({})
    apps.push(app)
    return { result, thrown, unmount: () => app.unmount() }
  }

  type Call = { variables: unknown; reject: (error: unknown) => void }

  /** Each call waits until the test rejects it, so tests control overlapping executions. */
  function setup(
    options?: MaybeRefOrGetter<Record<string, unknown>>,
    queryClient = new QueryClient(),
  ) {
    const calls: Call[] = []
    const reported: unknown[][] = []
    const { result: mutation, ...component } = mount(() =>
      useReactiveMutation(
        settings => ({
          ...settings,
          mutationFn: (variables: unknown) =>
            new Promise((_resolve, reject) => calls.push({ variables, reject })),
        }),
        options,
        queryClient,
        (error, variables) => reported.push([error, variables]),
      ),
    )
    /** Reject a call once its mutation function has started. */
    async function fail(index: number, error: unknown) {
      for (let attempt = 0; calls.length <= index; attempt++) {
        if (attempt === 10) throw new Error(`Mutation call ${index} did not start`)
        await new Promise(resolve => setTimeout(resolve))
      }
      calls[index]!.reject(error)
    }
    return { mutation, calls, fail, reported, queryClient, ...component }
  }

  /** Let rejections, Vue's flush and the reporter's checks finish. */
  async function settle() {
    await new Promise(resolve => setTimeout(resolve))
  }

  test("reports mutate() without onError, even with onSettled", async () => {
    const onSettled = mock(() => {})
    const { mutation, fail, reported } = setup({ onSettled })
    const error = new Error("Declined")
    mutation.mutate({ id: 1 }, { onSettled })
    await fail(0, error)
    await settle()
    expect(onSettled).toHaveBeenCalledTimes(2)
    expect(mutation.error.value).toBe(error)
    expect(reported).toEqual([[error, { id: 1 }]])
  })

  test("leaves mutateAsync() rejections to the caller", async () => {
    const { mutation, fail, reported } = setup()
    const error = new Error("Declined")
    const promise = mutation.mutateAsync({ id: 2 })
    await fail(0, error)
    await expect(promise).rejects.toBe(error)
    await settle()
    expect(reported).toEqual([])
  })

  test.each([
    ["useMutation() options", { onError: () => {} }, undefined],
    ["mutation defaults", {}, { defaultOptions: { mutations: { onError: () => {} } } }],
    ["the mutate() call", {}, undefined],
  ] as const)("does not report errors handled by onError in %s", async (where, options, config) => {
    const onError = mock(() => {})
    const { mutation, fail, reported } = setup(options, new QueryClient(config))
    mutation.mutate({ id: 3 }, where === "the mutate() call" ? { onError } : undefined)
    await fail(0, new Error("Declined"))
    await settle()
    expect(onError).toHaveBeenCalledTimes(where === "the mutate() call" ? 1 : 0)
    expect(reported).toEqual([])
  })

  describe("reports a call whose own onError never ran", () => {
    test("because a later call superseded it", async () => {
      const onError = mock((_error: Error) => {})
      const { mutation, fail, reported } = setup()
      const superseded = new Error("Superseded")
      const latest = new Error("Latest")
      mutation.mutate({ id: "superseded" }, { onError })
      mutation.mutate({ id: "latest" }, { onError })
      await fail(0, superseded)
      await fail(1, latest)
      await settle()
      expect(onError.mock.calls.map(([error]) => error)).toEqual([latest])
      expect(reported).toEqual([[superseded, { id: "superseded" }]])
    })

    test("because reset() detached it", async () => {
      const onError = mock(() => {})
      const { mutation, fail, reported } = setup()
      const error = new Error("Declined")
      mutation.mutate({ id: 4 }, { onError })
      mutation.reset()
      await fail(0, error)
      await settle()
      expect(onError).not.toHaveBeenCalled()
      expect(reported).toEqual([[error, { id: 4 }]])
    })

    test("because its component was unmounted", async () => {
      const onError = mock(() => {})
      const { mutation, unmount, fail, reported } = setup()
      const error = new Error("Declined")
      mutation.mutate({ id: 5 }, { onError })
      unmount()
      await fail(0, error)
      await settle()
      expect(onError).not.toHaveBeenCalled()
      expect(reported).toEqual([[error, { id: 5 }]])
    })
  })

  test.each([
    ["added", false],
    ["removed", true],
  ] as const)(
    "decides by the options at failure when reactive onError is %s during onSettled",
    async (_change, initiallyHandled) => {
      const handled = ref(initiallyHandled)
      const onError = mock(() => {})
      let finishSettled!: () => void
      const { mutation, fail, reported } = setup(() => ({
        onError: handled.value ? onError : undefined,
        onSettled: () => new Promise<void>(resolve => (finishSettled = resolve)),
      }))
      const error = new Error("Declined")
      mutation.mutate({ id: 6 })
      await nextTick()
      await fail(0, error)
      await settle()
      handled.value = !initiallyHandled
      await nextTick()
      finishSettled()
      await settle()
      expect(onError).toHaveBeenCalledTimes(initiallyHandled ? 1 : 0)
      expect(reported).toEqual(initiallyHandled ? [[error, { id: 6 }]] : [])
    },
  )

  describe("throwOnError", () => {
    test("does not report errors Vue Query throws into Vue", async () => {
      const { mutation, fail, reported, thrown } = setup({ throwOnError: true })
      const error = new Error("Declined")
      mutation.mutate({ id: 7 })
      await fail(0, error)
      await settle()
      expect(thrown).toEqual([error])
      expect(reported).toEqual([])
    })

    test("reports errors its predicate keeps and evaluates it like Vue Query", async () => {
      const throwOnError = mock(() => false)
      const { mutation, fail, reported, queryClient } = setup({ throwOnError })
      const control = mock(() => false)
      const { result: plain } = mount(() =>
        useReactiveMutation(
          settings => ({
            ...settings,
            mutationFn: () => Promise.reject(new Error("Control")),
          }),
          { throwOnError: control },
          queryClient,
        ),
      )
      const error = new Error("Declined")
      mutation.mutate({ id: 8 })
      plain.mutate({ id: 8 })
      await fail(0, error)
      await settle()
      expect(throwOnError).toHaveBeenCalledTimes(control.mock.calls.length)
      expect(throwOnError).toHaveBeenCalledTimes(1)
      expect(reported).toEqual([[error, { id: 8 }]])
    })

    test.each([
      ["ref(false)", () => ref(false), false],
      ["ref(true)", () => ref(true), true],
      ["a ref of a predicate", () => ref(() => true), true],
      [
        "a ref switched on before the failure",
        () => {
          const option = ref(false)
          setTimeout(() => (option.value = true))
          return option
        },
        true,
      ],
    ] as const)("unwraps %s like Vue Query", async (_name, createOption, throws) => {
      const { mutation, fail, reported, thrown } = setup({ throwOnError: createOption() })
      const error = new Error("Declined")
      mutation.mutate({ id: 10 })
      await settle()
      await fail(0, error)
      await settle()
      expect(thrown).toEqual(throws ? [error] : [])
      expect(reported).toEqual(throws ? [] : [[error, { id: 10 }]])
    })

    test("follows a mutation that onMutate starts on the same observer", async () => {
      let startNested: (() => void) | undefined
      const { mutation, calls, reported, thrown } = setup({
        throwOnError: true,
        onMutate: () => {
          const start = startNested
          startNested = undefined
          start?.()
        },
      })
      startNested = () => mutation.mutate({ id: "nested" })
      mutation.mutate({ id: "outer" })
      await settle()
      const nested = new Error("Nested")
      const outer = new Error("Outer")
      for (const call of calls) {
        call.reject((call.variables as { id: string }).id === "nested" ? nested : outer)
      }
      await settle()
      expect(thrown).toEqual([nested])
      expect(reported).toEqual([[outer, { id: "outer" }]])
    })

    test("reports errors of an unmounted component, which Vue Query no longer throws", async () => {
      const { mutation, unmount, fail, reported, thrown } = setup({ throwOnError: true })
      const error = new Error("Declined")
      mutation.mutate({ id: 9 })
      unmount()
      await fail(0, error)
      await settle()
      expect(thrown).toEqual([])
      expect(reported).toEqual([[error, { id: 9 }]])
    })
  })

  describe("one error object rejecting several executions", () => {
    const error = new Error("Shared")

    test.each([
      ["options-level onError and throwOnError", "mutate"],
      ["options-level onError and throwOnError", "mutateAsync"],
      ["options-level and per-call onError", "mutate"],
      ["options-level and per-call onError", "mutateAsync"],
    ] as const)(
      "reports a later unhandled execution after %s handled one through %s",
      async (handlers, method) => {
        const handled = ref(true)
        const { mutation, fail, reported } = setup(() =>
          handled.value
            ? { onError: () => {}, throwOnError: handlers.includes("throwOnError") }
            : {},
        )
        const perCall = handlers.includes("per-call") ? { onError: () => {} } : undefined
        if (method === "mutate") mutation.mutate({ id: "handled" }, perCall)
        else void mutation.mutateAsync({ id: "handled" }, perCall).catch(() => {})
        await fail(0, error)
        await settle()
        handled.value = false
        await nextTick()
        mutation.mutate({ id: "unhandled" })
        await fail(1, error)
        await settle()
        expect(reported).toEqual([[error, { id: "unhandled" }]])
      },
    )

    test("reports only the unhandled one of concurrent executions", async () => {
      const { mutation, fail, reported } = setup()
      mutation.mutate({ id: "unhandled" })
      mutation.mutate({ id: "handled" }, { onError: () => {} })
      await fail(1, error)
      await fail(0, error)
      await settle()
      expect(reported).toEqual([[error, { id: "unhandled" }]])
    })
  })

  test("tracks its own execution when a cache listener starts another mutation", async () => {
    const queryClient = new QueryClient()
    const nested = new Error("Nested")
    queryClient.getMutationCache().subscribe(event => {
      if (event.type === "added" && event.mutation.options.mutationKey === undefined)
        void queryClient
          .getMutationCache()
          .build(queryClient, { mutationKey: ["nested"], mutationFn: () => Promise.reject(nested) })
          .execute(undefined)
          .catch(() => {})
    })
    // The nested mutation has no onError, so tracking it instead would report this handled call.
    const onError = mock(() => {})
    const { mutation, fail, reported } = setup({ onError }, queryClient)
    mutation.mutate({ id: 10 })
    await fail(0, new Error("Declined"))
    await settle()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(reported).toEqual([])
  })
})

test("requires a component setup or an active effect scope", () => {
  expect(() => useReactiveMutation(settings => settings, undefined, new QueryClient())).toThrow(
    "active Vue effect scope",
  )
})
