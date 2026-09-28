import type { Client, ORPCError } from "@orpc/client"
import { createTestORPCClient } from "orpc-vue/testing"

type AppClient = {
  admin: {
    posts: {
      get: Client<
        { token: string },
        { id: number },
        { id: number; title: string },
        ORPCError<"MISSING", { id: number }> | Error
      >
    }
  }
}

const { client, procedures } = createTestORPCClient<AppClient>({
  onUnexpectedError(error, context) {
    error satisfies unknown
    context.source satisfies "call" | "callCatching" | "query" | "mutation"
    context.path satisfies readonly string[]
    context.input satisfies unknown
    // @ts-expect-error A global hook cannot assume any procedure's input type.
    context.input.id
  },
})

procedures.admin.posts.get.handle(async (input, { errors }) => {
  input.id satisfies number
  // @ts-expect-error The handler input retains the procedure input type.
  input.id satisfies string
  const missing = errors.MISSING({ data: { id: input.id } })
  missing.code satisfies "MISSING"
  missing.data.id satisfies number
  // @ts-expect-error The procedure does not declare this error code.
  errors.CONFLICT()
  // @ts-expect-error Data is required by the declared error.
  errors.MISSING()
  // @ts-expect-error Error data retains its declared shape.
  errors.MISSING({ data: { id: "wrong" } })
  return { id: input.id, title: "Post" }
})
procedures.admin.posts.get.handle(() => ({ id: 1, title: "Post" }), {
  copyInput: (input) => {
    input.id satisfies number
    // @ts-expect-error The copy receives the procedure input type.
    input.id satisfies string
    return { ...input }
  },
})
procedures.admin.posts.get.handle(() => ({ id: 1, title: "Post" }), {
  // @ts-expect-error The copy must return the procedure input type.
  copyInput: (input) => ({ id: String(input.id) }),
})
procedures.admin.posts.get.handle(() => ({ id: 1, title: "Post" }), { copyInput: false })
// @ts-expect-error The handler result must match the awaited procedure output.
procedures.admin.posts.get.handle(() => ({ id: 1, title: 2 }))
// @ts-expect-error Router branches are not procedure leaves.
procedures.admin.posts.handle(() => ({ id: 1, title: "Post" }))
// @ts-expect-error Unknown procedure paths must not be accepted.
procedures.admin.posts.missing.handle(() => ({ id: 1, title: "Post" }))

const query = client.admin.posts.get.useQuery({ id: 1 }, { context: { token: "secret" } })
query.error.value satisfies ORPCError<"MISSING", { id: number }> | Error | null
// @ts-expect-error Client context remains required on the decorated fake client.
client.admin.posts.get.useQuery({ id: 1 })
