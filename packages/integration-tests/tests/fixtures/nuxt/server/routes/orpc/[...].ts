import { RPCHandler } from "@orpc/server/fetch"
import { defineEventHandler, getHeader, toWebRequest } from "h3"

import { router } from "~~/server/orpc/router"

const handler = new RPCHandler(router)

export default defineEventHandler(async event => {
  const { response } = await handler.handle(toWebRequest(event), {
    prefix: "/orpc",
    context: { cookie: getHeader(event, "cookie") ?? "none" },
  })
  return response
})
