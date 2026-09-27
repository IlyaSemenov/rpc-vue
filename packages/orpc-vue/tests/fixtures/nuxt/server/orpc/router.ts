import { os } from "@orpc/server"
import * as z from "zod"

const posts = {
  fail: os.handler(() => {
    throw new Error("Failed query")
  }),
  get: os
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .handler(({ input }) => {
      return {
        id: input.id,
        details: { title: `post ${input.id}` },
      }
    }),
  update: os
    .errors({
      CONFLICT: {
        data: z.object({ field: z.string() }),
      },
      NOT_FOUND: {},
    })
    .input(
      z.object({
        id: z.number(),
        title: z.string(),
      }),
    )
    .handler(({ input, errors }) => {
      if (input.id < 0) throw errors.NOT_FOUND()
      return {
        id: input.id,
        details: { title: input.title },
      }
    }),
  list: os.handler(() => {
    return [{ id: 1, title: "post 1" }]
  }),
  ping: os.handler(() => "pong"),
  stream: os.handler(async function* () {
    yield "event"
  }),
}

const requestContext = os.$context<{
  name: string
  cookie: string
  authorization: string
  transport: string
}>()

/** Exercise request-specific context and Date preservation across RPC and SSR payload transfer. */
export const router = {
  hello: requestContext.handler(({ context }) => {
    return {
      ...context,
      date: new Date("2026-01-01T00:00:00Z"),
    }
  }),
  transport: requestContext.handler(({ context }) => context.transport),
  blog: {
    posts,
    admin: {
      comments: {
        get: posts.get,
      },
    },
    users: {
      get: os.handler(() => {
        return { name: "Ada" }
      }),
    },
    useQuery: { nested: posts.ping },
    useMutation: posts.ping,
    queryOptions: { nested: posts.ping },
  },
}
