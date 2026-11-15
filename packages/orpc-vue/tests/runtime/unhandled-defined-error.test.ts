import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"

import { type Client, createORPCClient, createORPCErrorFromJson, ORPCError } from "@orpc/client"
import { environmentManager, QueryClient } from "@tanstack/vue-query"
import {
  createORPCVueQuery,
  type ORPCUnexpectedErrorHandler,
  type ORPCUnhandledDefinedErrorHandler,
} from "orpc-vue"
import { type EffectScope, effectScope } from "vue"

type Input = { id: number }
type AppClient = {
  invitations: {
    cancel: Client<Record<never, never>, Input, void, ORPCError<"CONFLICT", unknown> | Error>
  }
}
const scopes: EffectScope[] = []
const clients: QueryClient[] = []
let wasServer: boolean

beforeEach(() => {
  wasServer = environmentManager.isServer()
  environmentManager.setIsServer(() => false)
})
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  for (const client of clients.splice(0)) client.clear()
  environmentManager.setIsServer(() => wasServer)
})

/** Create an error as the client receives it for a code the procedure declares. */
function createDeclaredError() {
  return createORPCErrorFromJson({ ...new ORPCError("CONFLICT").toJSON(), defined: true })
}

/** The transport rejects every call with a declared error unless a test replaces the error. */
function setup(
  onUnhandledDefinedError = mock<ORPCUnhandledDefinedErrorHandler>(() => {}),
  error: Error = createDeclaredError(),
) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  clients.push(queryClient)
  const scope = effectScope()
  scopes.push(scope)
  const onUnexpectedError = mock<ORPCUnexpectedErrorHandler>(() => {})
  const raw = createORPCClient<AppClient>({
    call: async () => {
      throw error
    },
  })
  const client = createORPCVueQuery(raw, {
    queryClient,
    prefix: "admin",
    onUnexpectedError,
    onUnhandledDefinedError,
  })
  const mutation = scope.run(() => client.invitations.cancel.useMutation())!
  return { mutation, error, onUnexpectedError, onUnhandledDefinedError }
}

/** Let the rejection and the reporter's checks finish. */
async function settle() {
  await new Promise(resolve => setTimeout(resolve))
}

test("reports declared errors of mutate() without onError", async () => {
  const error = createDeclaredError()
  const { mutation, onUnexpectedError, onUnhandledDefinedError } = setup(undefined, error)
  const input = { id: 1 }
  mutation.mutate(input)
  await settle()
  expect(mutation.error.value).toBe(error)
  expect(onUnhandledDefinedError.mock.calls).toEqual([
    [error, { source: "mutation", path: ["invitations", "cancel"], input }],
  ])
  expect(onUnexpectedError).not.toHaveBeenCalled()
})

test("does not report declared errors that onError handles", async () => {
  const { mutation, onUnhandledDefinedError } = setup()
  const onError = mock(() => {})
  mutation.mutate({ id: 2 }, { onError })
  await settle()
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onUnhandledDefinedError).not.toHaveBeenCalled()
})

test("leaves undeclared errors to onUnexpectedError", async () => {
  const error = new Error("Unexpected failure")
  const { mutation, onUnexpectedError, onUnhandledDefinedError } = setup(undefined, error)
  mutation.mutate({ id: 3 })
  await settle()
  expect(onUnexpectedError).toHaveBeenCalledTimes(1)
  expect(onUnhandledDefinedError).not.toHaveBeenCalled()
})

test("never reports on the server", async () => {
  environmentManager.setIsServer(() => true)
  const { mutation, onUnhandledDefinedError } = setup()
  mutation.mutate({ id: 4 })
  await settle()
  expect(onUnhandledDefinedError).not.toHaveBeenCalled()
})

test.each([false, true])("isolates hook failures (async=%s)", async async => {
  const hookError = new Error("Broken toast")
  const { mutation, error } = setup(
    mock<ORPCUnhandledDefinedErrorHandler>(() => {
      if (async) return Promise.reject(hookError)
      throw hookError
    }),
  )
  const log = spyOn(console, "error").mockImplementation(() => {})
  try {
    mutation.mutate({ id: 5 })
    await settle()
    expect(mutation.error.value).toBe(error)
    expect(log.mock.calls).toEqual([["orpc-vue: onUnhandledDefinedError failed", hookError]])
  } finally {
    log.mockRestore()
  }
})
