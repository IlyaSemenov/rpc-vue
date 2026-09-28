import type {
  AnyORPCError,
  AnyNestedClient,
  Client,
  ClientLink,
  InferClientContext,
  ORPCClientOptions,
} from "@orpc/client"
import { createORPCClient, createORPCErrorFromJson, ORPCError } from "@orpc/client"
import {
  createTestRegistry,
  type TestClient,
  type TestClientOptions,
  type TestHandleOptions,
} from "@rpc-vue/core/testing/registry"
import type { Mock } from "vitest"

import { createORPCVueQuery } from "./client/create"
import type { ORPCVueQueryClient, ORPCVueQueryOptions } from "./types"

type MaybePromise<TValue> = TValue | Promise<TValue>
type RuntimeHandlerOptions = {
  errors: Record<string, (options?: RuntimeErrorOptions) => AnyORPCError>
}
type RuntimeErrorOptions = ErrorOptions & { message?: string; data?: unknown }

type ProcedureInput<TProcedure> =
  TProcedure extends Client<any, infer Input, any, any> ? Input : never

type ProcedureError<TProcedure> =
  TProcedure extends Client<any, any, any, infer Error> ? Extract<Error, AnyORPCError> : never

type ErrorConstructorOptions<Data> = ErrorOptions & { message?: string } & (undefined extends Data
    ? { data?: Data }
    : { data: Data })

type ErrorConstructor<ErrorType extends AnyORPCError> =
  ErrorType extends ORPCError<infer _Code, infer Data>
    ? (
        ...args: undefined extends Data
          ? [options?: ErrorConstructorOptions<Data>]
          : [options: ErrorConstructorOptions<Data>]
      ) => ErrorType
    : never

type TestORPCErrors<TProcedure> = {
  [Code in ProcedureError<TProcedure>["code"] & string]: ErrorConstructor<
    Extract<ProcedureError<TProcedure>, { code: Code }>
  >
}

/** Error constructors derived from the procedure's declared error union. */
export interface TestORPCHandlerOptions<TProcedure> {
  /** Construct an error declared by this procedure, with its corresponding data type. */
  errors: TestORPCErrors<TProcedure>
}

/** A procedure implementation registered for a test client. */
export type TestORPCHandler<TProcedure> =
  TProcedure extends Client<infer _Context, infer Input, infer Output, infer _Error>
    ? (input: Input, options: TestORPCHandlerOptions<TProcedure>) => MaybePromise<Awaited<Output>>
    : never

type TestORPCMockHandler<TProcedure> =
  TProcedure extends Client<infer _Context, infer Input, infer Output, infer _Error>
    ? (input: Input) => MaybePromise<Awaited<Output>>
    : never

/** Registration methods for one procedure in a test client. */
export interface TestORPCProcedure<TProcedure> {
  /** Register the implementation used by subsequent calls and return its Vitest mock. */
  handle(
    handler: TestORPCHandler<TProcedure>,
    options?: TestHandleOptions<ProcedureInput<TProcedure>>,
  ): Mock<TestORPCMockHandler<TProcedure>>
}

/** A router-shaped tree whose procedure leaves register test implementations. */
export type TestORPCProcedures<TClient extends AnyNestedClient> =
  TClient extends Client<infer Context, infer Input, infer Output, infer Error>
    ? TestORPCProcedure<Client<Context, Input, Output, Error>>
    : {
        [Key in keyof TClient]: TClient[Key] extends AnyNestedClient
          ? TestORPCProcedures<TClient[Key]>
          : never
      }

/** Configure a test client's cache, namespacing, interceptors, error reporting and input copying. */
export interface TestORPCClientOptions<TClient extends AnyNestedClient = AnyNestedClient>
  extends
    ORPCVueQueryOptions,
    TestClientOptions,
    Pick<ORPCClientOptions<TClient>, "interceptors"> {}

/** The isolated client, procedure registry and cleanup function created for a test suite. */
export type TestORPCClient<TClient extends AnyNestedClient> = TestClient<
  ORPCVueQueryClient<TClient>,
  TestORPCProcedures<TClient>
>

/**
 * Create an isolated fake oRPC client for Vue or Nuxt component tests.
 * Handlers replace the server procedures, so middleware and schema validation do not run.
 * The entrypoint has no Nuxt runtime dependency.
 * A shared setup file can therefore import it when Vitest hoists `mockNuxtImport()`.
 *
 * Without a `queryClient` the client owns one that never retries, so a failing procedure fails
 * the test instead of retrying until it times out.
 *
 * @param options - Cache ownership, key prefix, unexpected browser error reporting and input copying.
 * @returns A decorated client, its typed registration tree, its cache and a reset function.
 */
export function createTestORPCClient<TClient extends AnyNestedClient>(
  options: TestORPCClientOptions<TClient> = {},
): TestORPCClient<TClient> {
  const { copyInput, interceptors, ...clientOptions } = options
  const registry = createTestRegistry("oRPC", {
    queryClient: clientOptions.queryClient,
    copyInput,
    createHandlerOptions: () => ({ errors: createErrorConstructors() }),
  })
  const link: ClientLink<InferClientContext<TClient>> = {
    async call(path, input) {
      return await registry.call(path.join("."), input)
    },
  }
  return {
    client: createORPCVueQuery(createORPCClient<TClient>(link, { interceptors }), {
      ...clientOptions,
      queryClient: registry.queryClient,
    }),
    procedures: registry.procedures as TestORPCProcedures<TClient>,
    queryClient: registry.queryClient,
    reset: registry.reset,
  }
}

/** Create lazy error constructors without requiring the procedure's runtime contract. */
function createErrorConstructors(): RuntimeHandlerOptions["errors"] {
  return new Proxy(Object.create(null) as RuntimeHandlerOptions["errors"], {
    get(target, property, receiver) {
      if (typeof property !== "string") return Reflect.get(target, property, receiver)
      target[property] ??= (options?: RuntimeErrorOptions) => {
        const error = new ORPCError(property, options)
        return createORPCErrorFromJson({ ...error.toJSON(), defined: true }, { cause: error.cause })
      }
      return target[property]
    },
  })
}
