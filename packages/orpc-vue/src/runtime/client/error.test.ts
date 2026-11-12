import { describe, expect, test } from "bun:test"

import { ORPCError, type PromiseWithError } from "@orpc/client"

import { catchORPCError } from "./error"

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
