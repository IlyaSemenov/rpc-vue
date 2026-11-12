import { expect, test } from "bun:test"

import { QueryClient } from "@tanstack/vue-query"
import { effectScope, ref } from "vue"

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

test("requires a component setup or an active effect scope", () => {
  expect(() => useReactiveMutation(settings => settings, undefined, new QueryClient())).toThrow(
    "active Vue effect scope",
  )
})
