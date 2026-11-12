import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { defineEventHandler, getHeader, toWebRequest } from "h3"

import { router } from "~~/server/trpc/router"

export default defineEventHandler(event =>
  fetchRequestHandler({
    endpoint: "/trpc",
    req: toWebRequest(event),
    router,
    createContext: async () => ({ cookie: getHeader(event, "cookie") ?? "none" }),
  }),
)
