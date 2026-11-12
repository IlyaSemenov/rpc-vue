import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { defineEventHandler, getHeader, getQuery, toWebRequest } from "h3"

import { router } from "~~/server/trpc/router"

export default defineEventHandler(event =>
  fetchRequestHandler({
    endpoint: "/trpc",
    req: toWebRequest(event),
    router,
    // Supply viewer context separately for each request.
    createContext: async () => ({
      name: getHeader(event, "x-viewer") ?? "visitor",
      cookie: getHeader(event, "cookie") ?? "",
      authorization: getHeader(event, "authorization") ?? "",
      transport: String(getQuery(event).transport ?? ""),
    }),
  }),
)
