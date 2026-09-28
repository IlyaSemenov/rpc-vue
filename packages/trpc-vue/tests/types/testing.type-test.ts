import { initTRPC } from "@trpc/server"
import { createTestTRPCClient } from "trpc-vue/testing"
import * as z from "zod"

const t = initTRPC.create()
const router = t.router({
  admin: t.router({
    posts: t.router({
      get: t.procedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => ({ id: input.id, title: "Post", date: new Date() })),
      events: t.procedure.subscription(async function* () {
        yield "event"
      }),
    }),
  }),
})

const { client, procedures } = createTestTRPCClient<typeof router>()

procedures.admin.posts.get.handle(async (input) => {
  input.id satisfies number
  // @ts-expect-error The handler input retains the procedure input type.
  input.id satisfies string
  return { id: input.id, title: "Post", date: "2026-01-01T00:00:00.000Z" }
})
procedures.admin.posts.get.handle(() => ({ id: 1, title: "Post", date: "" }), {
  copyInput: (input) => {
    input.id satisfies number
    // @ts-expect-error The copy receives the procedure input type.
    input.id satisfies string
    return { ...input }
  },
})
procedures.admin.posts.get.handle(() => ({ id: 1, title: "Post", date: "" }), {
  // @ts-expect-error The copy must return the procedure input type.
  copyInput: (input) => ({ id: String(input.id) }),
})
procedures.admin.posts.get.handle(() => ({ id: 1, title: "Post", date: "" }), { copyInput: false })
// @ts-expect-error Handlers return client output, where JSON transport turns dates into strings.
procedures.admin.posts.get.handle(() => ({ id: 1, title: "Post", date: new Date() }))
// @ts-expect-error The handler result must match the procedure output.
procedures.admin.posts.get.handle(() => ({ id: 1, title: 2, date: "" }))
// @ts-expect-error Router branches are not procedure leaves.
procedures.admin.posts.handle(() => ({ id: 1, title: "Post", date: "" }))
// @ts-expect-error Unknown procedure paths must not be accepted.
procedures.admin.posts.missing.handle(() => ({ id: 1, title: "Post", date: "" }))
// @ts-expect-error Subscriptions are not mocked.
procedures.admin.posts.events.handle(() => "event")

const query = client.admin.posts.get.useQuery({ id: 1 })
query.data.value?.date satisfies string | undefined
// @ts-expect-error Input remains required on the decorated fake client.
client.admin.posts.get.useQuery()
