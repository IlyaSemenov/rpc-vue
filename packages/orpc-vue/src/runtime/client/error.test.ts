import { describe, expect, mock, spyOn, test } from "bun:test"

import { type Client, createORPCClient, ORPCError, type PromiseWithError } from "@orpc/client"

import { catchORPCError, onDefinedError } from "./error"

type DeclaredError =
  | ORPCError<"CONFLICT", { field: string }>
  | ORPCError<"NOT_FOUND", { id: number }>
  | Error

function definedError<Code extends "CONFLICT" | "NOT_FOUND", Data>(
  code: Code,
  data: Data,
): ORPCError<Code, Data> {
  const error = new ORPCError(code, { message: code, data })
  Reflect.set(error, "defined", true)
  return error
}

function result<TOutput>(value: TOutput): PromiseWithError<TOutput, DeclaredError> {
  return Promise.resolve(value)
}

function failure<TOutput>(error: unknown): PromiseWithError<TOutput, DeclaredError> {
  return Promise.reject(error)
}

describe("catchORPCError", () => {
  test("returns a successful result unchanged", async () => {
    const value = { id: 1 }

    await expect(catchORPCError(result(value), { NOT_FOUND: undefined })).resolves.toBe(value)
  })

  test("returns a matching non-function value", async () => {
    const error = definedError("NOT_FOUND", { id: 1 })

    await expect(catchORPCError(failure(error), { NOT_FOUND: null })).resolves.toBeNull()
  })

  test("treats an explicit undefined value as handled", async () => {
    const error = definedError("NOT_FOUND", { id: 1 })

    await expect(catchORPCError(failure(error), { NOT_FOUND: undefined })).resolves.toBeUndefined()
  })

  test("calls the matching handler and returns its awaited result", async () => {
    const error = definedError("CONFLICT", { field: "title" })

    await expect(
      catchORPCError(failure(error), {
        CONFLICT: async caught => `${caught.data.field} conflict`,
      }),
    ).resolves.toBe("title conflict")
  })

  test("rethrows an undeclared error", async () => {
    const error = new Error("Database unavailable")

    await expect(catchORPCError(failure(error), { NOT_FOUND: null })).rejects.toBe(error)
  })

  test("rethrows an ORPCError with the same code when it is not declared", async () => {
    const error = new ORPCError("NOT_FOUND", { message: "Missing" })

    await expect(catchORPCError(failure(error), { NOT_FOUND: null })).rejects.toBe(error)
  })

  test("rethrows a declared error without a matching handler", async () => {
    const error = definedError("NOT_FOUND", { id: 1 })

    await expect(
      catchORPCError(failure(error), {
        CONFLICT: () => "handled",
      }),
    ).rejects.toBe(error)
  })

  test("rethrows an exception from a handler", async () => {
    const error = definedError("CONFLICT", { field: "title" })
    const handlerError = new Error("Handler failed")

    await expect(
      catchORPCError(failure(error), {
        CONFLICT: () => {
          throw handlerError
        },
      }),
    ).rejects.toBe(handlerError)
  })

  test("does not catch work chained after a successful result", async () => {
    const error = new Error("Follow-up failed")
    const handled = catchORPCError(result({ id: 1 }), { NOT_FOUND: undefined })

    await expect(
      handled.then(() => {
        throw error
      }),
    ).rejects.toBe(error)
  })
})

describe("onDefinedError", () => {
  type PolicyClient = {
    get: Client<Record<never, never>, undefined, string, DeclaredError>
  }

  /** Create a client whose only procedure resolves `"ok"` or rejects with `error`. */
  function createClient(
    interceptor: ReturnType<typeof onDefinedError<PolicyClient>>,
    error?: unknown,
  ): PolicyClient {
    const link = {
      call: async () => {
        if (error !== undefined) throw error
        return "ok"
      },
    }
    return createORPCClient<PolicyClient>(link, { interceptors: [interceptor] })
  }

  test("returns a successful result unchanged without calling handlers", async () => {
    const onNotFound = mock()
    const client = createClient(onDefinedError<PolicyClient>({ NOT_FOUND: onNotFound }))

    await expect(client.get()).resolves.toBe("ok")
    expect(onNotFound).not.toHaveBeenCalled()
  })

  test("rejects with the original error only after the matching handler settles", async () => {
    const error = definedError("NOT_FOUND", { id: 1 })
    const { promise: handlerDone, resolve: finishHandler } = Promise.withResolvers<void>()
    const handled: number[] = []
    const client = createClient(
      onDefinedError<PolicyClient>({
        NOT_FOUND: async caught => {
          handled.push(caught.data.id)
          await handlerDone
        },
      }),
      error,
    )
    let settled = false
    const call = client.get().finally(() => {
      settled = true
    })

    await Bun.sleep(0)
    expect(handled).toEqual([1])
    expect(settled).toBe(false)

    finishHandler()
    await expect(call).rejects.toBe(error)
  })

  test("handles an extra code that the client does not declare", async () => {
    const error = new ORPCError("AUTHENTICATION_REQUIRED", { message: "Sign in" })
    Reflect.set(error, "defined", true)
    const onAuthenticationRequired = mock()
    const client = createClient(
      onDefinedError<PolicyClient, "AUTHENTICATION_REQUIRED">({
        AUTHENTICATION_REQUIRED: onAuthenticationRequired,
      }),
      error,
    )

    await expect(client.get()).rejects.toBe(error)
    expect(onAuthenticationRequired).toHaveBeenCalledWith(error)
  })

  test("ignores a handler inherited by the handlers object", async () => {
    const error = definedError("NOT_FOUND", { id: 1 })
    const onNotFound = mock()
    const handlers = Object.create({ NOT_FOUND: onNotFound }) as Record<never, never>
    const client = createClient(onDefinedError<PolicyClient>(handlers), error)

    await expect(client.get()).rejects.toBe(error)
    expect(onNotFound).not.toHaveBeenCalled()
  })

  test("ignores other declared codes, undeclared ORPCErrors and other errors", async () => {
    const onNotFound = mock()
    const interceptor = onDefinedError<PolicyClient>({ NOT_FOUND: onNotFound })
    const errors = [
      definedError("CONFLICT", { field: "title" }),
      new ORPCError("NOT_FOUND", { message: "Missing" }),
      new Error("Database unavailable"),
    ]

    for (const error of errors) {
      await expect(createClient(interceptor, error).get()).rejects.toBe(error)
    }
    expect(onNotFound).not.toHaveBeenCalled()
  })

  test("logs a failing handler and rejects with the original error", async () => {
    const error = definedError("NOT_FOUND", { id: 1 })
    const handlerError = new Error("Navigation failed")
    const consoleError = spyOn(console, "error").mockImplementation(() => {})
    const handlers = {
      throwing: () => {
        throw handlerError
      },
      rejecting: async () => {
        await Promise.resolve()
        throw handlerError
      },
    }

    try {
      for (const [kind, handler] of Object.entries(handlers)) {
        const client = createClient(onDefinedError<PolicyClient>({ NOT_FOUND: handler }), error)

        await expect(client.get(), kind).rejects.toBe(error)
      }
      expect(consoleError.mock.calls).toEqual([
        ["orpc-vue: onDefinedError handler failed", handlerError],
        ["orpc-vue: onDefinedError handler failed", handlerError],
      ])
    } finally {
      consoleError.mockRestore()
    }
  })
})
